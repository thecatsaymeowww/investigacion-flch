/**
 * Utilidades comunes de `pnpm verificar`: estados, ejecución de comandos y lectura de variables de entorno.
 * Cada módulo de scripts/verificar/ exporta `comprobar()`, que devuelve `{ estado, detalle }`, y se puede lanzar
 * suelto con `node scripts/verificar/<módulo>.mjs` (código de salida: ver CODIGOS).
 */
import { spawn } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')

export const APROBADO = 'APROBADO'
export const AVISOS = 'AVISOS'
export const FALLIDO = 'FALLIDO'
export const NO_EJECUTADA = 'NO EJECUTADA'

/** Código de salida de cada módulo lanzado suelto. Los avisos documentados no hacen fallar. */
const CODIGOS = { [APROBADO]: 0, [AVISOS]: 0, [FALLIDO]: 1, [NO_EJECUTADA]: 2 }

export const relativa = (ruta) => path.relative(RAIZ, ruta).split(path.sep).join('/')

/**
 * Ejecuta un comando sin shell. Con `capturar`, devuelve la salida en lugar de mostrarla.
 * `codigo` es null si el proceso no se pudo lanzar (`error` dice por qué).
 */
export function ejecutar(cmd, args, { capturar = false, env } = {}) {
  return new Promise((resolve) => {
    let salida = ''
    let hijo
    try {
      hijo = spawn(cmd, args, { cwd: RAIZ, env: env ?? process.env, stdio: capturar ? ['ignore', 'pipe', 'pipe'] : ['ignore', 'inherit', 'inherit'] })
    } catch (error) {
      resolve({ codigo: null, salida, error })
      return
    }
    if (capturar) {
      hijo.stdout.on('data', (d) => (salida += d))
      hijo.stderr.on('data', (d) => (salida += d))
    }
    hijo.on('error', (error) => resolve({ codigo: null, salida, error }))
    hijo.on('close', (codigo) => resolve({ codigo: codigo ?? 1, salida }))
  })
}

/**
 * pnpm con el mismo ejecutable que lanzó el proceso (`npm_execpath` al usar `pnpm verificar`).
 * Sin él, el `pnpm` del PATH (en Windows es un .cmd y necesita la shell; los argumentos son fijos).
 */
export function pnpm(args, opciones) {
  const exec = process.env.npm_execpath
  if (exec && /pnpm/i.test(path.basename(exec))) return ejecutar(process.execPath, [exec, ...args], opciones)
  if (process.platform !== 'win32') return ejecutar('pnpm', args, opciones)
  return ejecutar(process.env.ComSpec ?? 'cmd.exe', ['/d', '/s', '/c', ['pnpm', ...args].join(' ')], opciones)
}

/** Lee UNA variable del entorno o, si falta, de .env.local / .env (mismo orden que Next). No lee nada más. */
export function variable(nombre) {
  if (process.env[nombre]) return process.env[nombre]
  for (const archivo of ['.env.local', '.env']) {
    const ruta = path.join(RAIZ, archivo)
    if (!existsSync(ruta)) continue
    for (const linea of readFileSync(ruta, 'utf8').split(/\r?\n/)) {
      const m = linea.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/)
      if (m?.[1] === nombre && m[2]) return m[2].replace(/^(['"])(.*)\1$/, '$2')
    }
  }
  return undefined
}

/** Lanza `comprobar` si el módulo se ejecuta directamente con node. */
export async function siEsPrincipal(url, comprobar) {
  if (!process.argv[1] || path.resolve(process.argv[1]) !== fileURLToPath(url)) return
  const { estado, detalle } = await comprobar()
  console.log(`\n${estado}${detalle ? ` — ${detalle}` : ''}`)
  process.exitCode = CODIGOS[estado] ?? 1
}
