import type { Payload } from 'payload'

/**
 * Conexión de la aplicación (subfase 3b). Se ejecuta en onInit: en el servidor, en `payload run` (semilla, pruebas,
 * importación) y en cualquier getPayload, pero NO en `payload migrate`, que Payload arranca con disableOnInit y usa el
 * rol propietario a propósito.
 * 1. Quita del entorno del proceso las credenciales que no son de la aplicación. Next y Payload cargan todo `.env`;
 *    DATABASE_URI_MIGRACIONES va en `.env.migraciones` (scripts/migrar.mjs), y POSTGRES_PASSWORD solo la necesita
 *    Docker Compose.
 * 2. Se niega a arrancar si el rol de DATABASE_URI tiene privilegios de administración o de estructura: superusuario,
 *    CREATEROLE, CREATEDB, BYPASSRLS, REPLICATION, miembro del dueño del esquema, CREATE en el esquema o en la base, o
 *    dueño de alguna tabla. La app debe conectarse con plataforma_app (deploy/postgres/roles.sql).
 * No hay ninguna variable que desactive la comprobación. Está en scripts/ como scripts/guardia-migraciones.ts: es una
 * herramienta de operación con una consulta fija al catálogo, y la regla de SQL de `pnpm verificar` solo la admite aquí.
 */
const AJENAS = ['DATABASE_URI_MIGRACIONES', 'POSTGRES_PASSWORD'] as const

type Fila = Record<string, boolean>

export async function exigirConexionDeAplicacion(payload: Payload) {
  for (const v of AJENAS) delete process.env[v]
  const pool = (payload.db as unknown as { pool?: { query: (sql: string) => Promise<{ rows: Fila[] }> } }).pool
  if (!pool) throw new Error('[guardia-conexion] El adaptador no tiene conexión: no se puede comprobar el rol de la aplicación.')
  const { rows } = await pool.query(`
    SELECT r.rolsuper AS superusuario, r.rolcreaterole AS crea_roles, r.rolcreatedb AS crea_bases,
           r.rolbypassrls AS salta_rls, r.rolreplication AS replicacion,
           pg_has_role(current_user, n.nspowner, 'MEMBER') AS dueno_del_esquema,
           has_schema_privilege(current_user, 'public', 'CREATE') AS crea_en_el_esquema,
           has_database_privilege(current_user, current_database(), 'CREATE') AS crea_en_la_base,
           EXISTS (SELECT FROM pg_class c WHERE c.relnamespace = n.oid AND c.relkind IN ('r', 'p')
                   AND pg_has_role(current_user, c.relowner, 'MEMBER')) AS dueno_de_tablas
    FROM pg_roles r, pg_namespace n
    WHERE r.rolname = current_user AND n.nspname = 'public'`)
  const fila = rows[0]
  if (!fila) throw new Error('[guardia-conexion] No se pudieron leer los privilegios del rol de la aplicación.')
  const excesos = Object.entries(fila)
    .filter(([, v]) => v === true)
    .map(([k]) => k)
  if (excesos.length) {
    throw new Error(
      `[guardia-conexion] DATABASE_URI usa un rol con privilegios que la aplicación no necesita (${excesos.join(', ')}). ` +
        'Debe ser plataforma_app (deploy/postgres/roles.sql); el propietario solo lo usa `pnpm migrate`. No se arranca.',
    )
  }
}
