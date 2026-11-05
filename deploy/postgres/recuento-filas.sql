-- Recuento exacto de filas de cada tabla de `public` (solo lectura). Sirve para comprobar que una
-- restauración conserva los datos: se guarda antes del respaldo y se compara con la copia restaurada.
--   psql -X -At -d <base> -f deploy/postgres/recuento-filas.sql   -> líneas «tabla|filas»
SELECT c.relname AS tabla,
       (xpath('/row/n/text()',
              query_to_xml(format('SELECT count(*) AS n FROM public.%I', c.relname), false, true, '')))[1]::text::bigint AS filas
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
ORDER BY c.relname COLLATE "C";
