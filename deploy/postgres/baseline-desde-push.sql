-- Línea base para una base creada con el `push` de desarrollo (anterior a las migraciones):
-- registra la migración inicial como YA APLICADA, sin ejecutarla, porque su esquema ya existe.
--
-- Solo registra si la huella del esquema de ESTA base (huella-esquema.sql, en este mismo directorio)
-- coincide con la de una base vacía recién migrada con esa migración. La huella esperada se obtiene así
-- (docs/BASE-DE-DATOS.md, «Base existente creada con push»); no se acepta ningún otro valor.
-- Se detiene sin modificar nada si:
--   - falta alguna variable o no existe payload_migrations;
--   - payload_migrations tiene filas distintas de `dev` (batch -1) y de la propia migración inicial;
--   - la huella no coincide (esquema distinto, aunque sea en un índice o un valor por defecto).
--
-- Ejecutar como superusuario, con este directorio accesible para psql (\ir):
--   psql -X -v ON_ERROR_STOP=1 -v migracion=20261022_163428_inicial -v huella_esperada=<sha256> \
--        -d <base> -f deploy/postgres/baseline-desde-push.sql
--
-- Idempotente solo cuando es seguro: si ya está registrada y la huella sigue coincidiendo, no cambia nada.
-- Solo escribe en payload_migrations; ni esquema ni contenido.

\set ON_ERROR_STOP on

\if :{?migracion}
\else
  DO $$ BEGIN RAISE EXCEPTION 'Falta -v migracion=<nombre de la migracion inicial>'; END $$;
\endif
\if :{?huella_esperada}
\else
  DO $$ BEGIN RAISE EXCEPTION 'Falta -v huella_esperada=<sha256 de una base recien migrada>'; END $$;
\endif

BEGIN;

SELECT to_regclass('public.payload_migrations') IS NOT NULL AS hay_registro \gset
\if :hay_registro
\else
  DO $$ BEGIN RAISE EXCEPTION 'No existe public.payload_migrations: no es una base creada con push. No se registra nada.'; END $$;
\endif

-- Nadie puede escribir en el registro ni cambiar el esquema de sus tablas mientras se comprueba.
LOCK TABLE public.payload_migrations IN SHARE ROW EXCLUSIVE MODE;

SELECT count(*) FILTER (WHERE NOT ((name = 'dev' AND batch = -1) OR name = :'migracion')) > 0 AS hay_otras,
       count(*) FILTER (WHERE name = :'migracion') > 0 AS ya_registrada
FROM public.payload_migrations \gset
\if :hay_otras
  \echo 'payload_migrations contiene migraciones distintas de dev y de' :migracion
  DO $$ BEGIN RAISE EXCEPTION 'Estado del registro inesperado: la linea base no aplica. No se registra nada.'; END $$;
\endif

\ir huella-esquema.sql

SELECT :'huella' = :'huella_esperada' AS coincide \gset
\if :coincide
  \echo 'Huella del esquema: coincide con la esperada.'
\else
  \echo 'Huella del esquema:' :huella
  \echo 'Huella esperada:   ' :huella_esperada
  DO $$ BEGIN RAISE EXCEPTION 'El esquema de esta base NO coincide con la migracion inicial. No se registra nada.'; END $$;
\endif

\if :ya_registrada
  \echo 'La migracion ya estaba registrada.'
\endif

-- La fila `dev` (batch -1) la deja el `push`; con ella, `payload migrate` pide confirmación y
-- trataría de recrear las tablas.
DELETE FROM public.payload_migrations WHERE name = 'dev' AND batch = -1;

INSERT INTO public.payload_migrations (name, batch, updated_at, created_at)
SELECT :'migracion', 1, now(), now()
WHERE NOT EXISTS (SELECT FROM public.payload_migrations WHERE name = :'migracion');

COMMIT;

SELECT name, batch FROM public.payload_migrations ORDER BY id;
