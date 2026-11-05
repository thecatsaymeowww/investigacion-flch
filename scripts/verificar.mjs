/**
 * Verificación completa del proyecto, en secuencia (ninguna comprobación compite con otra por recursos).
 *   pnpm verificar              todas; las pruebas con base solo con VERIFICAR_BD_DESECHABLE (scripts/verificar/entorno.mjs)
 *   pnpm verificar:estatico     sin pruebas ni enlaces (no necesita base ni servidor); su resultado lo dice expresamente
 * Termina con «VERIFICACIÓN APROBADA» (código 0) solo si todas las comprobaciones del perfil se ejecutaron y ninguna
 * falló; los avisos documentados no hacen fallar. Una comprobación que no pudo ejecutarse cuenta como fallo.
 * El build va antes de las pruebas y los enlaces porque ambos necesitan un servidor con el código actual.
 */
import * as auditoria from './verificar/auditoria.mjs'
import { APROBADO, AVISOS, FALLIDO, NO_EJECUTADA, pnpm } from './verificar/comun.mjs'
import * as enlaces from './verificar/enlaces.mjs'
import { arrancarServidor, bdDesechable } from './verificar/entorno.mjs'
import * as html from './verificar/html.mjs'
import * as migraciones from './verificar/migraciones.mjs'
import * as roles from './verificar/roles.mjs'
import * as secretos from './verificar/secretos.mjs'
import * as sql from './verificar/sql.mjs'

const ESTATICO = process.argv.includes('--estatico')
const OMITIDA = 'OMITIDA'

/** `script`: script de package.json (aprobado si termina con 0). `modulo`: comprobación de scripts/verificar/. */
const PASOS = [
  { nombre: 'TypeScript', script: 'typecheck' },
  { nombre: 'ESLint', script: 'lint' },
  { nombre: 'Prettier', script: 'formato:comprobar' },
  { nombre: 'Knip', script: 'knip' },
  { nombre: 'Migraciones', modulo: migraciones },
  { nombre: 'Roles y conexiones', modulo: roles },
  { nombre: 'SQL peligroso', modulo: sql },
  { nombre: 'HTML peligroso', modulo: html },
  { nombre: 'Gitleaks', modulo: secretos },
  { nombre: 'Auditoría de dependencias', modulo: auditoria },
  { nombre: 'Pruebas unitarias', script: 'test:unitarias' },
  { nombre: 'Build', script: 'build' },
  { nombre: 'Aislamiento', script: 'test:aislamiento', bd: true, servidor: true },
  { nombre: 'Seguridad', script: 'test:seguridad', bd: true, servidor: true },
  { nombre: 'Enlaces', modulo: enlaces, servidor: true },
]

process.env.NEXT_TELEMETRY_DISABLED = '1'
const resultados = []
let servidor = null
let motivoSinServidor = null

async function prepararServidor() {
  if (servidor || motivoSinServidor) return
  const build = resultados.find((r) => r.nombre === 'Build')
  if (build?.estado !== APROBADO) {
    motivoSinServidor = 'el build no se completó'
    return
  }
  try {
    console.log('  arrancando el servidor de verificación en 127.0.0.1:3000…')
    servidor = await arrancarServidor()
    console.log(`  servidor listo (registro: ${servidor.log})`)
  } catch (e) {
    motivoSinServidor = e.message
  }
}

async function ejecutarPaso(paso) {
  if (ESTATICO && paso.servidor) return { estado: OMITIDA, detalle: 'fuera del perfil estático' }
  if (paso.bd) {
    const bd = bdDesechable()
    if (!bd.ok) return { estado: NO_EJECUTADA, detalle: bd.motivo }
  }
  if (paso.servidor) {
    await prepararServidor()
    if (!servidor) return { estado: NO_EJECUTADA, detalle: `sin servidor: ${motivoSinServidor}` }
  }
  if (paso.modulo) {
    try {
      return await paso.modulo.comprobar()
    } catch (e) {
      return { estado: NO_EJECUTADA, detalle: `error al ejecutar la comprobación: ${e.message}` }
    }
  }
  const { codigo, error } = await pnpm(['run', paso.script])
  if (codigo === null) return { estado: NO_EJECUTADA, detalle: `no se pudo lanzar pnpm run ${paso.script}: ${error?.message}` }
  return codigo === 0
    ? { estado: APROBADO, detalle: `pnpm run ${paso.script}` }
    : { estado: FALLIDO, detalle: `pnpm run ${paso.script} terminó con código ${codigo}` }
}

const detenerServidor = async () => {
  if (servidor) await servidor.detener()
  servidor = null
}
process.on('SIGINT', async () => {
  await detenerServidor()
  process.exit(130)
})

try {
  for (const [i, paso] of PASOS.entries()) {
    console.log(`\n━━ [${i + 1}/${PASOS.length}] ${paso.nombre} ━━`)
    const inicio = Date.now()
    const r = await ejecutarPaso(paso)
    resultados.push({ nombre: paso.nombre, ...r, segundos: Math.round((Date.now() - inicio) / 1000) })
    console.log(`→ ${paso.nombre}: ${r.estado}${r.detalle ? ` — ${r.detalle}` : ''}`)
  }
} finally {
  await detenerServidor()
}

const ancho = Math.max(...resultados.map((r) => r.nombre.length))
console.log(`\n━━ Resumen${ESTATICO ? ' (perfil estático)' : ''} ━━`)
for (const r of resultados) console.log(`${r.nombre.padEnd(ancho)}  ${r.estado.padEnd(12)}  ${String(r.segundos).padStart(4)} s  ${r.detalle ?? ''}`)

const fallidas = resultados.filter((r) => r.estado === FALLIDO || r.estado === NO_EJECUTADA)
const conAvisos = resultados.filter((r) => r.estado === AVISOS)
const omitidas = resultados.filter((r) => r.estado === OMITIDA)
console.log('')
if (fallidas.length) {
  console.log(`VERIFICACIÓN FALLIDA — ${fallidas.map((r) => `${r.nombre} (${r.estado})`).join(', ')}`)
  process.exitCode = 1
} else if (ESTATICO) {
  console.log(`VERIFICACIÓN ESTÁTICA APROBADA — no sustituye a \`pnpm verificar\`: no se ejecutaron ${omitidas.map((r) => r.nombre).join(', ')}`)
} else {
  console.log(`VERIFICACIÓN APROBADA${conAvisos.length ? ` — con avisos documentados en: ${conAvisos.map((r) => r.nombre).join(', ')}` : ''}`)
}
