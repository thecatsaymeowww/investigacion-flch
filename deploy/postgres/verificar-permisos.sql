-- Inventario de roles, dueños y privilegios efectivos de la plataforma (solo lectura, sin credenciales).
-- Ejecutar como superusuario, conectado a la base:
--   psql -d <base> -f deploy/postgres/verificar-permisos.sql
-- Esperado tras roles.sql: dueños = plataforma_owner; app sin CREATE ni TEMP; los contadores en 0; app sin
-- membresías; payload_migrations solo SELECT y registro_cambios solo INSERT,SELECT para la app;
-- privilegios por defecto r=arwd y S=rU para plataforma_app.
\pset pager off

SELECT rolname, rolsuper, rolcreaterole, rolcreatedb, rolbypassrls, rolcanlogin, rolinherit,
       CASE WHEN rolname <> 'plataforma_app' THEN pg_has_role('plataforma_app', oid, 'MEMBER') END AS app_es_miembro
FROM pg_roles WHERE rolname LIKE 'plataforma%' ORDER BY rolname;

WITH t AS (SELECT c.oid, pg_get_userbyid(c.relowner) AS dueno FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')),
     s AS (SELECT c.oid, pg_get_userbyid(c.relowner) AS dueno FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relkind = 'S')
SELECT 'dueno del esquema public' AS que, (SELECT pg_get_userbyid(nspowner) FROM pg_namespace WHERE nspname = 'public') AS valor
UNION ALL SELECT 'duenos de tablas', (SELECT string_agg(DISTINCT dueno, ',') FROM t)
UNION ALL SELECT 'duenos de secuencias', (SELECT string_agg(DISTINCT dueno, ',') FROM s)
UNION ALL SELECT 'duenos de enums', (SELECT string_agg(DISTINCT pg_get_userbyid(ty.typowner), ',') FROM pg_type ty JOIN pg_namespace n ON n.oid = ty.typnamespace WHERE n.nspname = 'public' AND ty.typtype = 'e')
UNION ALL SELECT 'app: CREATE en public', has_schema_privilege('plataforma_app', 'public', 'CREATE')::text
UNION ALL SELECT 'app: USAGE en public', has_schema_privilege('plataforma_app', 'public', 'USAGE')::text
UNION ALL SELECT 'app: TEMP en la base', has_database_privilege('plataforma_app', current_database(), 'TEMP')::text
UNION ALL SELECT 'app: CONNECT en la base', has_database_privilege('plataforma_app', current_database(), 'CONNECT')::text
UNION ALL SELECT 'tablas sin SELECT/INSERT/UPDATE/DELETE para app', (SELECT count(*) FROM t WHERE NOT (has_table_privilege('plataforma_app', oid, 'SELECT') AND has_table_privilege('plataforma_app', oid, 'INSERT') AND has_table_privilege('plataforma_app', oid, 'UPDATE') AND has_table_privilege('plataforma_app', oid, 'DELETE')))::text
UNION ALL SELECT 'tablas con TRUNCATE/REFERENCES/TRIGGER para app', (SELECT count(*) FROM t WHERE has_table_privilege('plataforma_app', oid, 'TRUNCATE') OR has_table_privilege('plataforma_app', oid, 'REFERENCES') OR has_table_privilege('plataforma_app', oid, 'TRIGGER'))::text
UNION ALL SELECT 'secuencias sin USAGE para app', (SELECT count(*) FROM s WHERE NOT has_sequence_privilege('plataforma_app', oid, 'USAGE'))::text
UNION ALL SELECT 'total tablas / secuencias', (SELECT count(*) FROM t) || ' / ' || (SELECT count(*) FROM s)
-- Subfase 3b. Esperado: 0, f, f, 0, SELECT, INSERT,SELECT.
UNION ALL SELECT 'membresias de roles plataforma*', (SELECT count(*) FROM pg_auth_members a JOIN pg_roles r ON r.oid = a.member OR r.oid = a.roleid WHERE r.rolname LIKE 'plataforma\_%')::text
UNION ALL SELECT 'app: CREATE en la base', has_database_privilege('plataforma_app', current_database(), 'CREATE')::text
UNION ALL SELECT 'app: puede SET ROLE plataforma_owner', pg_has_role('plataforma_app', 'plataforma_owner', 'MEMBER')::text
UNION ALL SELECT 'secuencias con UPDATE (setval) para app', (SELECT count(*) FROM s WHERE has_sequence_privilege('plataforma_app', oid, 'UPDATE'))::text
UNION ALL SELECT 'app en payload_migrations', (SELECT string_agg(p, ',' ORDER BY p) FROM unnest(ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE']) p WHERE to_regclass('public.payload_migrations') IS NOT NULL AND has_table_privilege('plataforma_app', 'public.payload_migrations', p))
UNION ALL SELECT 'app en registro_cambios', (SELECT string_agg(p, ',' ORDER BY p) FROM unnest(ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE']) p WHERE to_regclass('public.registro_cambios') IS NOT NULL AND has_table_privilege('plataforma_app', 'public.registro_cambios', p))
-- Informativo: otras bases del clúster a las que la app puede conectarse (por PUBLIC, salvo que se restrinja).
UNION ALL SELECT 'app: CONNECT en otras bases', (SELECT string_agg(datname, ',' ORDER BY datname) FROM pg_database WHERE datallowconn AND datname <> current_database() AND has_database_privilege('plataforma_app', datname, 'CONNECT'));

SELECT pg_get_userbyid(defaclrole) AS para_objetos_de, defaclobjtype AS tipo, defaclacl AS privilegios
FROM pg_default_acl ORDER BY 1, 2;
