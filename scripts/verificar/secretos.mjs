/**
 * Secretos en los archivos del proyecto con Gitleaks (binario externo fijado en VERSION; no es dependencia npm).
 * - Escanea el árbol de trabajo (`gitleaks dir`), no el historial: no ejecuta ninguna operación de git.
 * - Recorre cada entrada de la raíz salvo EXCLUIDOS: así los archivos de credenciales ni siquiera se abren.
 * - `--redact` y solo se muestran archivo, línea y regla: nunca el valor encontrado.
 * Binario: el del PATH o el de GITLEAKS_BIN. Uso suelto: pnpm verificar:secretos
 */
import { createHash } from 'node:crypto'
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { APROBADO, FALLIDO, NO_EJECUTADA, RAIZ, ejecutar, relativa, siEsPrincipal } from './comun.mjs'

export const VERSION = '8.30.1'

/** Entradas de la raíz que no se escanean, con su motivo. Todas están fuera del repositorio por .gitignore. */
const EXCLUIDOS = [
  [(n) => n === '.git', 'metadatos de git (se escanea el árbol de trabajo, no el historial)'],
  [(n) => n === 'node_modules', 'dependencias de terceros'],
  [(n) => n === '.next', 'salida del build'],
  [(n) => n === 'media', 'archivos subidos al CMS (contenido, no código)'],
  [(n) => n.endsWith('.tsbuildinfo'), 'caché de TypeScript'],
  [(n) => /^\.env(\..+)?$/.test(n) && n !== '.env.example', 'credenciales locales: contienen secretos por diseño y nunca se leen'],
]

const binario = () => process.env.GITLEAKS_BIN || 'gitleaks'

async function rutaDelBinario() {
  if (process.env.GITLEAKS_BIN) return process.env.GITLEAKS_BIN
  const { codigo, salida } = await ejecutar(process.platform === 'win32' ? 'where.exe' : 'which', ['gitleaks'], { capturar: true })
  return codigo === 0 ? salida.split(/\r?\n/)[0].trim() : null
}

export async function comprobar() {
  const version = await ejecutar(binario(), ['version'], { capturar: true })
  if (version.codigo === null) return { estado: NO_EJECUTADA, detalle: `gitleaks no está instalado (se espera ${VERSION}; ver README)` }
  const instalada = version.salida.trim().replace(/^v/, '')
  if (instalada !== VERSION) return { estado: FALLIDO, detalle: `gitleaks ${instalada} instalado; la versión fijada es ${VERSION}` }
  const ruta = await rutaDelBinario()
  if (ruta) console.log(`  gitleaks ${instalada} · ${ruta} · sha256 ${createHash('sha256').update(readFileSync(ruta)).digest('hex')}`)

  const entradas = readdirSync(RAIZ).sort()
  for (const n of entradas) {
    const excl = EXCLUIDOS.find(([prueba]) => prueba(n))
    if (excl) console.log(`  · sin escanear: ${n} — ${excl[1]}`)
  }
  const aEscanear = entradas.filter((n) => !EXCLUIDOS.some(([prueba]) => prueba(n)))
  const tmp = mkdtempSync(path.join(os.tmpdir(), 'verificar-gitleaks-'))
  const hallazgos = []
  try {
    for (const [i, n] of aEscanear.entries()) {
      const informe = path.join(tmp, `${i}.json`)
      const r = await ejecutar(
        binario(),
        ['dir', path.join(RAIZ, n), '--no-banner', '--redact', '--log-level', 'error', '--exit-code', '0', '--report-format', 'json', '--report-path', informe],
        { capturar: true },
      )
      if (r.codigo !== 0) return { estado: NO_EJECUTADA, detalle: `gitleaks terminó con código ${r.codigo} al escanear ${n}` }
      for (const h of JSON.parse(readFileSync(informe, 'utf8'))) {
        const archivo = path.isAbsolute(h.File) ? relativa(h.File) : h.File.split(path.sep).join('/')
        hallazgos.push(`${archivo}:${h.StartLine} regla ${h.RuleID}`)
      }
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
  for (const h of hallazgos) console.log(`  ✗ ${h}`)
  return hallazgos.length
    ? { estado: FALLIDO, detalle: `${hallazgos.length} posible(s) secreto(s) (valores ocultos)` }
    : { estado: APROBADO, detalle: `${aEscanear.length} entradas de la raíz escaneadas, sin secretos` }
}

await siEsPrincipal(import.meta.url, comprobar)
