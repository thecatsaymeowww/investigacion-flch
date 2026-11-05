/**
 * Separación de roles y conexiones (subfase 3b), sin conectarse a ninguna base ni leer `.env`:
 * - La aplicación (app/, lib/, payload/, components/, payload.config.ts) solo conoce DATABASE_URI: ni la conexión del
 *   propietario (DATABASE_URI_MIGRACIONES) ni la del superusuario (POSTGRES_*) ni el nombre del rol propietario.
 * - payload.config.ts conecta con DATABASE_URI y su onInit empieza por exigirConexionDeAplicacion.
 * - scripts/migrar.mjs toma la conexión del propietario del entorno o de .env.migraciones, nunca de .env.
 * - .env.example: DATABASE_URI con plataforma_app y sin DATABASE_URI_MIGRACIONES activa.
 * - deploy/postgres/roles.sql: atributos mínimos de los dos roles, app sin membresía del dueño, sin CREATE en el
 *   esquema, solo DML (sin TRUNCATE/REFERENCES/TRIGGER ni GRANT ALL), y payload_migrations / registro_cambios restringidas.
 * La comprobación con la base (privilegios efectivos) está en `pnpm test:seguridad`, sección `privilegios`, y en la
 * guardia de arranque (scripts/guardia-conexion.ts).
 */
import path from 'node:path'
import { APROBADO, FALLIDO, RAIZ, relativa, siEsPrincipal } from './comun.mjs'
import { archivosPropios, leer } from './fuente.mjs'

const APLICACION = ['app/', 'lib/', 'payload/', 'components/', 'payload.config.ts']
const AJENAS = /DATABASE_URI_MIGRACIONES|POSTGRES_(PASSWORD|USER|DB)|plataforma_owner/

export function comprobarRoles() {
  const problemas = []
  for (const ruta of archivosPropios()) {
    const rel = relativa(ruta)
    if (!APLICACION.some((p) => rel === p || rel.startsWith(p))) continue
    const m = leer(ruta).match(AJENAS)
    if (m) problemas.push(`${rel}: la aplicación menciona ${m[0]} (solo debe conocer DATABASE_URI)`)
  }

  const configuracion = leer(path.join(RAIZ, 'payload.config.ts'))
  if (!/connectionString:\s*process\.env\.DATABASE_URI\b(?!_)/.test(configuracion))
    problemas.push('payload.config.ts: el adaptador no conecta con DATABASE_URI')
  if (!/onInit:\s*async\s*\(payload\)\s*=>\s*\{\s*await exigirConexionDeAplicacion\(payload\)/.test(configuracion))
    problemas.push('payload.config.ts: onInit no empieza por exigirConexionDeAplicacion')

  const migrar = leer(path.join(RAIZ, 'scripts/migrar.mjs'))
  if (!/process\.env\.DATABASE_URI_MIGRACIONES \|\| variable\('DATABASE_URI_MIGRACIONES', \['\.env\.migraciones'\]\)/.test(migrar))
    problemas.push('scripts/migrar.mjs: no toma la conexión del propietario solo del entorno o de .env.migraciones')

  const ejemplo = leer(path.join(RAIZ, '.env.example'))
  const uriApp = ejemplo.match(/^DATABASE_URI=postgres:\/\/([^:]+):/m)?.[1]
  if (uriApp !== 'plataforma_app') problemas.push(`.env.example: DATABASE_URI no usa plataforma_app (${uriApp ?? 'sin definir'})`)
  if (/^\s*DATABASE_URI_MIGRACIONES\s*=/m.test(ejemplo)) problemas.push('.env.example: DATABASE_URI_MIGRACIONES activa (va en .env.migraciones)')

  const roles = leer(path.join(RAIZ, 'deploy/postgres/roles.sql'))
  const exigir = (patron, motivo) => {
    if (!patron.test(roles)) problemas.push(`roles.sql: ${motivo}`)
  }
  exigir(
    /ALTER ROLE plataforma_app WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS NOINHERIT;/,
    'faltan los atributos mínimos de plataforma_app',
  )
  exigir(
    /ALTER ROLE plataforma_owner WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;/,
    'faltan los atributos mínimos de plataforma_owner',
  )
  exigir(/REVOKE plataforma_owner FROM plataforma_app/, 'no retira a la app la membresía del dueño')
  exigir(/REVOKE ALL ON SCHEMA public FROM plataforma_app;\s*GRANT USAGE ON SCHEMA public TO plataforma_app;/, 'la app no queda solo con USAGE en el esquema')
  exigir(/REVOKE INSERT, UPDATE, DELETE ON public\.payload_migrations FROM plataforma_app/, 'payload_migrations no queda de solo lectura para la app')
  exigir(/REVOKE UPDATE, DELETE ON public\.registro_cambios FROM plataforma_app/, 'registro_cambios no queda de solo inserción para la app')
  for (const linea of roles.split(/\r?\n/).filter((l) => /^\s*(GRANT|ALTER DEFAULT PRIVILEGES|\s+GRANT)\b/.test(l) && /plataforma_app/.test(l))) {
    if (/\b(ALL|CREATE|TRUNCATE|REFERENCES|TRIGGER|TEMP|TEMPORARY)\b/.test(linea.replace(/ON ALL (TABLES|SEQUENCES) IN SCHEMA/, '')))
      problemas.push(`roles.sql: concesión excesiva a la app: «${linea.trim()}»`)
  }

  for (const p of problemas) console.log(`  ✗ ${p}`)
  return problemas.length
    ? { estado: FALLIDO, detalle: `${problemas.length} problema(s) de separación de roles` }
    : { estado: APROBADO, detalle: 'la app solo conoce DATABASE_URI y se niega a arrancar con privilegios; roles.sql mínimo' }
}

export const comprobar = async () => comprobarRoles()

await siEsPrincipal(import.meta.url, comprobar)
