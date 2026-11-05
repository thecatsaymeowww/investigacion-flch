import type { BaseDatabaseAdapter, DatabaseAdapterObj } from 'payload'

/**
 * Última capa de protección de las migraciones (subfase 3a), dentro del propio adaptador de Payload: cubre también
 * `pnpm payload migrate…`, que no pasa por scripts/migrar.mjs.
 * - `migrate` solo se ejecuta si la base de destino está autorizada (MIGRAR_BD_DESECHABLE = `host:puerto/base`, solo
 *   del entorno del proceso, y en 127.0.0.1/::1) y lleva la marca de base desechable en su comentario
 *   (`COMMENT ON DATABASE … IS 'plataforma:desechable'`). La base real no la tiene: queda fuera de alcance.
 * - `migrate:down`, `:fresh`, `:refresh` y `:reset` se rechazan siempre: borran tablas o datos y no hay reversión
 *   automática fiable. La recuperación es por respaldo y migración correctiva (docs/BASE-DE-DATOS.md).
 * No hay ninguna variable que desactive estas comprobaciones.
 */
export const MARCA_DESECHABLE = 'plataforma:desechable'
const LOCALES = new Set(['127.0.0.1', '[::1]', '::1'])
const DESTRUCTIVOS = ['migrateDown', 'migrateFresh', 'migrateRefresh', 'migrateReset'] as const

/** `host:puerto/base` de una URI de Postgres, sin usuario ni contraseña; null si no es válida. */
export function destinoDe(uri: string | undefined): string | null {
  if (!uri) return null
  try {
    const u = new URL(uri)
    return `${u.hostname}:${u.port || '5432'}${u.pathname}`
  } catch {
    return null
  }
}

type Adaptador = {
  poolOptions?: { connectionString?: string }
  pool?: { query: (sql: string) => Promise<{ rows: { comentario: string | null }[] }> }
}

async function exigirDestinoAutorizado(adaptador: Adaptador) {
  const destino = destinoDe(adaptador.poolOptions?.connectionString)
  const autorizado = process.env.MIGRAR_BD_DESECHABLE
  if (!destino) throw new Error('[guardia-migraciones] La conexión de la base no es una URI válida: no se migra.')
  if (!LOCALES.has(new URL(`postgres://${destino}`).hostname))
    throw new Error(`[guardia-migraciones] ${destino} no es una base local (127.0.0.1 o ::1): no se migra.`)
  if (autorizado !== destino)
    throw new Error(`[guardia-migraciones] ${destino} no está autorizada: MIGRAR_BD_DESECHABLE debe ser exactamente ese destino. No se migra.`)
  const { rows } = await adaptador.pool!.query(`SELECT shobj_description(oid, 'pg_database') AS comentario FROM pg_database WHERE datname = current_database()`)
  if (rows[0]?.comentario !== MARCA_DESECHABLE) throw new Error(`[guardia-migraciones] ${destino} no lleva la marca de base desechable: no se migra.`)
}

export function protegerMigraciones<T extends BaseDatabaseAdapter>(resultado: DatabaseAdapterObj<T>): DatabaseAdapterObj<T> {
  return {
    ...resultado,
    init: (args) => {
      const adaptador = resultado.init(args)
      const migrar = adaptador.migrate
      adaptador.migrate = async function (this: T, args) {
        await exigirDestinoAutorizado(this as unknown as Adaptador)
        return migrar.call(this, args)
      }
      for (const m of DESTRUCTIVOS) {
        adaptador[m] = async () => {
          throw new Error(`[guardia-migraciones] ${m} no está permitido: borra tablas o datos. Ver «Recuperación» en docs/BASE-DE-DATOS.md.`)
        }
      }
      return adaptador
    },
  }
}
