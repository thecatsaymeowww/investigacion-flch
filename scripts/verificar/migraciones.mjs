/**
 * Migraciones versionadas (subfase 3a), sin ejecutar ninguna ni conectarse a ninguna base:
 * - migrations/: nombres `AAAAMMDD_HHMMSS_nombre` únicos y en orden, cada `.ts` con su snapshot `.json` y nada más;
 *   `.ts` no vacíos que exportan `up` y `down`; snapshots de PostgreSQL válidos, sin ids repetidos;
 *   `index.ts` con las mismas migraciones en el mismo orden.
 * - Sentencias destructivas en `up` (DROP, TRUNCATE, DELETE, cambio de tipo): aviso visible con la migración y la sentencia.
 * - Comandos: `migrate` y `migrate:status` pasan por scripts/migrar.mjs; ningún script expone down/fresh/refresh/reset;
 *   payload.config.ts usa `push: false` y `protegerMigraciones`; la marca de base desechable coincide en las dos capas.
 * - Deriva: las colecciones no definen un esquema distinto del último snapshot (scripts/verificar/deriva-esquema.ts),
 *   lanzado con una DATABASE_URI que no lleva a ninguna base.
 * Los errores de sintaxis de las migraciones los detecta TypeScript (paso propio de `pnpm verificar`).
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { APROBADO, AVISOS, FALLIDO, NO_EJECUTADA, RAIZ, pnpm, siEsPrincipal } from './comun.mjs'

const DIR = path.join(RAIZ, 'migrations')
const NOMBRE = /^(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})_[a-z0-9_]+$/
const DESTRUCTIVAS =
  /\b(DROP\s+(TABLE|COLUMN|TYPE|SCHEMA|INDEX|CONSTRAINT|VIEW|SEQUENCE)|TRUNCATE|DELETE\s+FROM)\b|ALTER\s+COLUMN\s+"?[\w]+"?\s+(SET\s+DATA\s+)?TYPE\b/gi
const leer = (ruta) => readFileSync(ruta, 'utf8')

/** Problemas de la carpeta de migraciones (lista vacía si todo está bien) y avisos de sentencias destructivas. */
export function revisarCarpeta(dir = DIR) {
  const problemas = []
  const avisos = []
  if (!existsSync(dir)) return { problemas: [`no existe ${path.basename(dir)}/`], avisos, nombres: [] }
  const archivos = readdirSync(dir).sort()
  const ts = archivos.filter((f) => f.endsWith('.ts') && f !== 'index.ts').map((f) => f.slice(0, -3))
  const json = archivos.filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5))
  for (const f of archivos) {
    if (f === 'index.ts' || f.endsWith('.ts') || f.endsWith('.json')) continue
    problemas.push(`${f}: archivo inesperado (Payload ejecutaría también los .js)`)
  }
  for (const n of ts) {
    if (!NOMBRE.test(n)) problemas.push(`${n}.ts: nombre no válido (AAAAMMDD_HHMMSS_nombre en minúsculas)`)
    else {
      const [, a, m, d, h, mi, s] = n.match(NOMBRE).map(Number)
      const fecha = new Date(Date.UTC(a, m - 1, d, h, mi, s))
      if (fecha.getUTCMonth() !== m - 1 || fecha.getUTCDate() !== d || h > 23 || mi > 59 || s > 59) problemas.push(`${n}.ts: fecha u hora imposibles`)
    }
    if (!json.includes(n)) problemas.push(`${n}.ts: falta su snapshot ${n}.json`)
    const codigo = leer(path.join(dir, `${n}.ts`))
    if (!codigo.trim()) {
      problemas.push(`${n}.ts: vacío`)
      continue
    }
    if (!/export async function up\s*\(/.test(codigo) || !/export async function down\s*\(/.test(codigo)) problemas.push(`${n}.ts: no exporta up y down`)
    const up = codigo.slice(codigo.search(/export async function up\s*\(/), codigo.search(/export async function down\s*\(/))
    for (const m of up.matchAll(DESTRUCTIVAS)) avisos.push(`${n}: «${m[0].replace(/\s+/g, ' ')}» en up`)
  }
  for (const n of json) if (!ts.includes(n)) problemas.push(`${n}.json: snapshot sin migración`)
  // Mismo nombre con otra extensión o en mayúsculas: Payload lo trataría como dos migraciones.
  const bases = archivos.filter((f) => /\.(ts|js)$/.test(f) && !/^index\.(ts|js)$/.test(f)).map((f) => f.split('.')[0].toLowerCase())
  for (const r of new Set(bases.filter((b, i) => bases.indexOf(b) !== i))) problemas.push(`${r}: nombre de migración repetido`)

  // Payload no encadena los snapshots (todos llevan prevId a ceros): cada uno es el esquema completo de su migración.
  const ids = new Set()
  for (const n of json) {
    let s
    try {
      s = JSON.parse(leer(path.join(dir, `${n}.json`)))
    } catch (e) {
      problemas.push(`${n}.json: JSON no válido (${e.message})`)
      continue
    }
    if (!s.id || !s.version || s.dialect !== 'postgresql' || typeof s.tables !== 'object' || typeof s.enums !== 'object')
      problemas.push(`${n}.json: no es un snapshot de PostgreSQL (id, version, dialect, tables, enums)`)
    if (ids.has(s.id)) problemas.push(`${n}.json: id repetido (snapshot copiado)`)
    ids.add(s.id)
  }

  const indice = path.join(dir, 'index.ts')
  if (!existsSync(indice)) problemas.push('falta index.ts (lo genera migrate:create)')
  else {
    const registradas = [...leer(indice).matchAll(/name:\s*'([^']+)'/g)].map((m) => m[1])
    if (JSON.stringify(registradas) !== JSON.stringify(ts))
      problemas.push(`index.ts no lista las mismas migraciones en el mismo orden (${registradas.length} frente a ${ts.length})`)
  }
  return { problemas, avisos, nombres: ts }
}

/** Configuración de los comandos y de las dos capas de protección. */
export function revisarConfiguracion() {
  const problemas = []
  const scripts = JSON.parse(leer(path.join(RAIZ, 'package.json'))).scripts ?? {}
  if (scripts.migrate !== 'node scripts/migrar.mjs migrate') problemas.push('package.json: `migrate` no pasa por scripts/migrar.mjs')
  if (scripts['migrate:status'] !== 'node scripts/migrar.mjs migrate:status') problemas.push('package.json: `migrate:status` no pasa por scripts/migrar.mjs')
  for (const [k, v] of Object.entries(scripts))
    if (/migrate:(down|fresh|refresh|reset)/.test(v)) problemas.push(`package.json: \`${k}\` expone un comando destructivo`)
  const configuracion = leer(path.join(RAIZ, 'payload.config.ts'))
  if (!/push:\s*false/.test(configuracion)) problemas.push('payload.config.ts: falta `push: false`')
  if (!/protegerMigraciones\(/.test(configuracion)) problemas.push('payload.config.ts: el adaptador no usa protegerMigraciones')
  const migrar = leer(path.join(RAIZ, 'scripts/migrar.mjs'))
  const guardia = leer(path.join(RAIZ, 'scripts/guardia-migraciones.ts'))
  const marca = (t) => t.match(/MARCA_DESECHABLE\s*=\s*'([^']+)'/)?.[1]
  if (!marca(migrar) || marca(migrar) !== marca(guardia))
    problemas.push('la marca de base desechable no coincide entre scripts/migrar.mjs y scripts/guardia-migraciones.ts')
  for (const [nombre, t] of [
    ['scripts/migrar.mjs', migrar],
    ['scripts/guardia-migraciones.ts', guardia],
  ])
    if (!/process\.env\.MIGRAR_BD_DESECHABLE/.test(t)) problemas.push(`${nombre}: no exige MIGRAR_BD_DESECHABLE del entorno del proceso`)
  if (/variable\(\s*'DATABASE_URI'\s*\)/.test(migrar)) problemas.push('scripts/migrar.mjs: recurre a DATABASE_URI (la conexión de la app)')
  return problemas
}

export async function comprobar() {
  const carpeta = revisarCarpeta()
  const problemas = [...carpeta.problemas, ...revisarConfiguracion()]
  // Destino inalcanzable a propósito (puerto 1): la deriva no necesita base y así no podría llegar a ninguna.
  const env = { ...process.env, DATABASE_URI: 'postgres://sin-conexion:sin-conexion@127.0.0.1:1/sin-conexion' }
  const deriva = await pnpm(['exec', 'payload', 'run', 'scripts/verificar/deriva-esquema.ts'], { capturar: true, env })
  if (deriva.codigo === null) return { estado: NO_EJECUTADA, detalle: `no se pudo lanzar la comprobación de deriva: ${deriva.error?.message}` }
  const lineas = deriva.salida.split(/\r?\n/).filter((l) => l.startsWith('[deriva]') || l.startsWith('  '))
  if (deriva.codigo !== 0) problemas.push(lineas.length ? lineas.join('\n    ') : `deriva-esquema terminó con código ${deriva.codigo}`)
  for (const p of problemas) console.log(`  ✗ ${p}`)
  for (const a of carpeta.avisos) console.log(`  ! ${a}`)
  if (problemas.length) return { estado: FALLIDO, detalle: `${problemas.length} problema(s) en las migraciones` }
  const resumen = `${carpeta.nombres.length} migraciones válidas, sin deriva respecto a ${carpeta.nombres.at(-1)}`
  if (carpeta.avisos.length) return { estado: AVISOS, detalle: `${resumen}; ${carpeta.avisos.length} sentencia(s) destructiva(s) en up` }
  return { estado: APROBADO, detalle: resumen }
}

await siEsPrincipal(import.meta.url, comprobar)
