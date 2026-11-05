-- Huella del esquema `public`: una descripción normalizada de su estructura y su SHA-256 (solo lectura).
-- Sirve para comprobar que dos bases tienen el mismo esquema, por ejemplo la base local creada con `push`
-- y una base vacía recién migrada (docs/BASE-DE-DATOS.md). La usa baseline-desde-push.sql.
--
-- Incluye: relaciones, columnas (tipo, NOT NULL, valor por defecto), restricciones, índices, enums con sus
-- valores en orden, otros tipos, secuencias, vistas, rutinas, disparadores, RLS y extensiones de la base.
-- Excluye a propósito:
--   - dueños y permisos (roles.sql los cambia sin alterar el esquema);
--   - los datos, incluidas las filas de payload_migrations;
--   - el orden físico de las columnas: la base creada con `push` tiene padre_id, ruta y orden al final de
--     `grupos`, y Drizzle siempre nombra las columnas.
--
-- Uso (como superusuario o como dueño del esquema):
--   psql -X -d <base> -f deploy/postgres/huella-esquema.sql               -> huella y número de líneas
--   psql -X -d <base> -v detalle=1 -f deploy/postgres/huella-esquema.sql  -> además, todas las líneas
-- Deja en variables de psql: huella, huella_lineas (y huella_detalle).

SET search_path = pg_catalog;

WITH rel AS (
  SELECT c.oid, c.relname, c.relkind, c.relrowsecurity
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
),
lineas(linea) AS (
  SELECT format('relacion|%s|%s', relname, relkind) FROM rel WHERE relkind IN ('r', 'p', 'v', 'm', 'S', 'f', 'c')
  UNION ALL
  SELECT format('columna|%s|%s|%s|notnull=%s|default=%s', r.relname, a.attname, format_type(a.atttypid, a.atttypmod),
                a.attnotnull, coalesce(pg_get_expr(d.adbin, d.adrelid), ''))
  FROM rel r
  JOIN pg_attribute a ON a.attrelid = r.oid AND a.attnum > 0 AND NOT a.attisdropped
  LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
  WHERE r.relkind IN ('r', 'p', 'v', 'm', 'f', 'c')
  UNION ALL
  SELECT format('restriccion|%s|%s|%s', r.relname, co.conname, pg_get_constraintdef(co.oid))
  FROM pg_constraint co JOIN rel r ON r.oid = co.conrelid
  UNION ALL
  SELECT format('indice|%s|%s', r.relname, pg_get_indexdef(i.indexrelid))
  FROM pg_index i JOIN rel r ON r.oid = i.indrelid
  UNION ALL
  SELECT format('enum|%s|%s', t.typname, string_agg(e.enumlabel, ',' ORDER BY e.enumsortorder))
  FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace JOIN pg_enum e ON e.enumtypid = t.oid
  WHERE n.nspname = 'public'
  GROUP BY t.typname
  UNION ALL
  SELECT format('tipo|%s|%s|%s', t.typname, t.typtype, format_type(t.typbasetype, t.typtypmod))
  FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
  WHERE n.nspname = 'public' AND t.typtype IN ('d', 'r', 'm')
  UNION ALL
  SELECT format('secuencia|%s|%s|inc=%s|min=%s|max=%s|inicio=%s|ciclo=%s', r.relname, format_type(s.seqtypid, NULL),
                s.seqincrement, s.seqmin, s.seqmax, s.seqstart, s.seqcycle)
  FROM pg_sequence s JOIN rel r ON r.oid = s.seqrelid
  UNION ALL
  SELECT format('vista|%s|%s', r.relname, pg_get_viewdef(r.oid)) FROM rel r WHERE r.relkind IN ('v', 'm')
  UNION ALL
  SELECT format('rutina|%s(%s)|%s', p.proname, pg_get_function_identity_arguments(p.oid), md5(pg_get_functiondef(p.oid)))
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.prokind IN ('f', 'p')
  UNION ALL
  SELECT format('disparador|%s|%s', r.relname, pg_get_triggerdef(tg.oid))
  FROM pg_trigger tg JOIN rel r ON r.oid = tg.tgrelid WHERE NOT tg.tgisinternal
  UNION ALL
  SELECT format('rls|%s', relname) FROM rel WHERE relrowsecurity
  UNION ALL
  SELECT format('extension|%s', extname) FROM pg_extension
)
SELECT encode(sha256(convert_to(string_agg(linea, E'\n' ORDER BY linea COLLATE "C"), 'UTF8')), 'hex') AS huella,
       count(*) AS huella_lineas,
       string_agg(linea, E'\n' ORDER BY linea COLLATE "C") AS huella_detalle
FROM lineas
\gset

RESET search_path;

\if :{?detalle}
\echo :huella_detalle
\endif
\echo huella :huella lineas :huella_lineas
