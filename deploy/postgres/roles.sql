-- Roles y privilegios mínimos de PostgreSQL para la plataforma (hallazgo H-06 de la auditoría).
--
--   plataforma_owner  dueño del esquema `public` y de sus objetos. Solo lo usan las migraciones.
--   plataforma_app    rol de Next.js + Payload en ejecución: lee y escribe filas, nada más.
--
-- Ejecutar como superusuario del clúster, conectado a la base de la plataforma (en una base existente,
-- después de registrar la línea base). Ver docs/BASE-DE-DATOS.md.
--
-- Las contraseñas NUNCA van en la línea de comandos (`-v`), donde las verían la lista de procesos y el
-- historial: se entregan por la entrada estándar de psql, en dos líneas `\set` seguidas de `\i` de este
-- archivo, generadas en memoria por PowerShell (procedimiento en docs/BASE-DE-DATOS.md):
--
--   \set owner_password '<hex>'
--   \set app_password '<hex>'
--   \i /ruta/a/roles.sql
--
-- Sin las dos contraseñas (subfase 3b), REPARA atributos y permisos sin cambiar contraseñas: los dos roles deben
-- existir ya. Con una sola, se detiene.
--
-- Idempotente: se puede repetir. No borra roles, datos ni objetos, y no toca otras bases del clúster.
-- Las contraseñas nunca se escriben en este archivo.

\set ON_ERROR_STOP on
-- Un error no repite la sentencia (con la contraseña ya interpolada) en la salida de psql.
\set VERBOSITY terse
\set ECHO none

\if :{?owner_password}
  \if :{?app_password}
    \set con_claves 1
  \else
    DO $$ BEGIN RAISE EXCEPTION 'Falta \set app_password (o ninguna de las dos para reparar sin cambiar contrasenas)'; END $$;
  \endif
\else
  \if :{?app_password}
    DO $$ BEGIN RAISE EXCEPTION 'Falta \set owner_password (o ninguna de las dos para reparar sin cambiar contrasenas)'; END $$;
  \endif
  DO $$ BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'plataforma_owner') OR NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'plataforma_app') THEN
      RAISE EXCEPTION 'Sin contrasenas solo se reparan roles existentes: para crearlos, \set owner_password y app_password';
    END IF;
  END $$;
\endif

-- Solo para esta sesión: que el servidor no escriba en su log el texto de las sentencias, ni siquiera si
-- una falla (por defecto, un ALTER ROLE fallido se registra con su contraseña en la línea STATEMENT).
SET log_statement = 'none';
SET log_min_error_statement = 'panic';
SET log_min_duration_statement = -1;
SET log_min_duration_sample = -1;
SET password_encryption = 'scram-sha-256';

BEGIN;

-- 1. Roles (se crean si faltan; los atributos se fijan siempre).
SELECT 'CREATE ROLE plataforma_owner' WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'plataforma_owner') \gexec
SELECT 'CREATE ROLE plataforma_app' WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'plataforma_app') \gexec

ALTER ROLE plataforma_owner WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
ALTER ROLE plataforma_app WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS NOINHERIT;
\if :{?con_claves}
ALTER ROLE plataforma_owner PASSWORD :'owner_password';
ALTER ROLE plataforma_app PASSWORD :'app_password';
\unset owner_password
\unset app_password
\endif

-- La app nunca hereda los permisos del dueño.
SELECT 'REVOKE plataforma_owner FROM plataforma_app'
WHERE pg_has_role('plataforma_app', 'plataforma_owner', 'MEMBER') \gexec

-- 2. Base de datos: solo estos dos roles (y el superusuario) pueden conectarse.
SELECT current_database() AS base \gset
REVOKE ALL ON DATABASE :"base" FROM PUBLIC;
GRANT CONNECT ON DATABASE :"base" TO plataforma_owner, plataforma_app;

-- 3. Esquema: el dueño crea objetos; la app solo los usa.
ALTER SCHEMA public OWNER TO plataforma_owner;
REVOKE ALL ON SCHEMA public FROM PUBLIC;
REVOKE ALL ON SCHEMA public FROM plataforma_app;
GRANT USAGE ON SCHEMA public TO plataforma_app;

-- 4. Objetos existentes del esquema → plataforma_owner (tablas con sus secuencias SERIAL, secuencias
--    sueltas, enums, dominios, vistas y funciones). Solo los que aún no son suyos.
SELECT format('ALTER TABLE public.%I OWNER TO plataforma_owner', tablename)
FROM pg_tables WHERE schemaname = 'public' AND tableowner <> 'plataforma_owner' \gexec

SELECT format('ALTER SEQUENCE public.%I OWNER TO plataforma_owner', sequencename)
FROM pg_sequences WHERE schemaname = 'public' AND sequenceowner <> 'plataforma_owner' \gexec

SELECT format('ALTER TYPE public.%I OWNER TO plataforma_owner', t.typname)
FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
WHERE n.nspname = 'public' AND t.typtype IN ('e', 'd') AND pg_get_userbyid(t.typowner) <> 'plataforma_owner' \gexec

SELECT format('ALTER %s public.%I OWNER TO plataforma_owner', CASE c.relkind WHEN 'm' THEN 'MATERIALIZED VIEW' ELSE 'VIEW' END, c.relname)
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind IN ('v', 'm') AND pg_get_userbyid(c.relowner) <> 'plataforma_owner' \gexec

SELECT format('ALTER ROUTINE public.%I(%s) OWNER TO plataforma_owner', p.proname, pg_get_function_identity_arguments(p.oid))
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND pg_get_userbyid(p.proowner) <> 'plataforma_owner' \gexec

-- 5. Permisos de la app sobre lo que ya existe: se normalizan (primero se quita todo).
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM plataforma_app;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM plataforma_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO plataforma_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO plataforma_app;

-- 5b. Tablas que la app no modifica (subfase 3b), solo si ya existen (antes de la primera migración no están):
--   payload_migrations  la escriben solo las migraciones (dueño); la app solo la lee.
--   registro_cambios    registro de auditoría: la app solo añade entradas, no las cambia ni las borra. Su clave
--                       foránea a grupos (ON DELETE SET NULL) la aplica Postgres como dueño de la tabla.
SELECT 'REVOKE INSERT, UPDATE, DELETE ON public.payload_migrations FROM plataforma_app'
WHERE to_regclass('public.payload_migrations') IS NOT NULL \gexec
SELECT 'REVOKE UPDATE, DELETE ON public.registro_cambios FROM plataforma_app'
WHERE to_regclass('public.registro_cambios') IS NOT NULL \gexec

-- 6. Objetos que creen futuras migraciones (siempre como plataforma_owner): mismos permisos.
ALTER DEFAULT PRIVILEGES FOR ROLE plataforma_owner IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO plataforma_app;
ALTER DEFAULT PRIVILEGES FOR ROLE plataforma_owner IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO plataforma_app;

COMMIT;

-- Resumen (sin credenciales).
SELECT rolname, rolsuper, rolcreaterole, rolcreatedb, rolbypassrls, rolcanlogin, rolinherit
FROM pg_roles WHERE rolname IN ('plataforma_owner', 'plataforma_app') ORDER BY rolname;
\unset con_claves
