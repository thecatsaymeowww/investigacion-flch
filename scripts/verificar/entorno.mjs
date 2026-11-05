/**
 * Servicios que necesitan las pruebas con base de datos y la comprobación de enlaces.
 * - Base desechable: test:aislamiento y test:seguridad ESCRIBEN en la base de DATABASE_URI. Solo se ejecutan si
 *   VERIFICAR_BD_DESECHABLE confirma ese mismo destino (`host:puerto/base`); nunca contra la base con contenido real.
 * - Servidor: las pruebas usan http://127.0.0.1:3000 (fijo en ellas). `pnpm verificar` arranca su propio
 *   `next start` con el build recién hecho y la misma configuración, y solo si el puerto está libre: nunca reutiliza un
 *   servidor ajeno, que podría estar conectado a otra base.
 */
import { spawn } from 'node:child_process'
import { openSync } from 'node:fs'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { RAIZ, ejecutar, variable } from './comun.mjs'

export const PUERTO = 3000
export const BASE = `http://127.0.0.1:${PUERTO}`

/** `host:puerto/base` de DATABASE_URI, sin usuario ni contraseña. */
export function destinoBd() {
  const uri = variable('DATABASE_URI')
  if (!uri) return null
  try {
    const u = new URL(uri)
    return `${u.hostname}:${u.port || '5432'}${u.pathname}`
  } catch {
    return null
  }
}

export function bdDesechable() {
  const destino = destinoBd()
  if (!destino) return { ok: false, motivo: 'DATABASE_URI no está definida o no es válida' }
  const confirmado = process.env.VERIFICAR_BD_DESECHABLE
  if (!confirmado) return { ok: false, motivo: `escriben en la base (${destino}); falta VERIFICAR_BD_DESECHABLE (host:puerto/base de una base desechable)` }
  if (confirmado !== destino) return { ok: false, motivo: `VERIFICAR_BD_DESECHABLE (${confirmado}) no coincide con DATABASE_URI (${destino})` }
  return { ok: true, destino }
}

/** true si nada escucha en 127.0.0.1:PUERTO (ni acepta conexiones ni impide abrirlo). */
export async function puertoLibre() {
  const conecta = await new Promise((resolve) => {
    const s = net.connect({ host: '127.0.0.1', port: PUERTO }, () => {
      s.destroy()
      resolve(true)
    })
    s.on('error', () => resolve(false))
  })
  if (conecta) return false
  return new Promise((resolve) => {
    const srv = net.createServer()
    srv.once('error', () => resolve(false))
    srv.listen(PUERTO, '127.0.0.1', () => srv.close(() => resolve(true)))
  })
}

/** Arranca `next start` y espera a que responda. Devuelve `{ detener, log }` o lanza un error con el motivo. */
export async function arrancarServidor() {
  if (!(await puertoLibre())) throw new Error(`el puerto ${PUERTO} está ocupado: detener ese servidor (no se reutiliza uno ajeno)`)
  const log = path.join(os.tmpdir(), `verificar-servidor-${process.pid}.log`)
  const salida = openSync(log, 'w')
  const hijo = spawn(process.execPath, [path.join(RAIZ, 'node_modules/next/dist/bin/next'), 'start', '-H', '127.0.0.1', '-p', String(PUERTO)], {
    cwd: RAIZ,
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
    stdio: ['ignore', salida, salida],
    detached: process.platform !== 'win32',
  })
  let terminado = false
  hijo.on('exit', () => (terminado = true))
  const detener = async () => {
    if (terminado) return
    if (process.platform === 'win32') await ejecutar('taskkill.exe', ['/PID', String(hijo.pid), '/T', '/F'], { capturar: true })
    else process.kill(-hijo.pid, 'SIGTERM')
  }
  for (let i = 0; i < 120 && !terminado; i++) {
    try {
      await fetch(`${BASE}/`, { signal: AbortSignal.timeout(5000) })
      return { detener, log }
    } catch {
      await new Promise((r) => setTimeout(r, 1000))
    }
  }
  await detener()
  throw new Error(`el servidor no respondió en ${BASE} (registro: ${log})`)
}
