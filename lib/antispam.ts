import { createHmac, timingSafeEqual } from 'node:crypto'
import { secretoPayload } from './entorno'

/**
 * Marca de tiempo firmada del formulario Colaborar (antispam sin servicios externos). La página la genera al
 * servirse (se renderiza en cada petición). El envío se rechaza si la firma falta o no es válida para esa ruta; si
 * llega en menos de TIEMPO_MINIMO_MS (`rapida`) se ACEPTA pero se guarda como «posible spam» (subfase 4c, corrección
 * de la v1 al punto 5.2 del plan: no perder propuestas legítimas); si ha caducado, se pide reenviar conservando el texto.
 * No impide que un robot cargue la página y espere: eso lo acotan los límites de envío (lib/limite-envios.ts).
 */
export const TIEMPO_MINIMO_MS = 2_000
export const VALIDEZ_MS = 24 * 60 * 60_000

/** Clave propia derivada de PAYLOAD_SECRET: la firma de la marca no sirve para nada más. */
const clave = () => createHmac('sha256', secretoPayload()).update('antispam:colaborar').digest()
const firmar = (ruta: string, instante: string) => createHmac('sha256', clave()).update(`${ruta}\n${instante}`).digest('base64url')

export function emitirMarca(ruta: string, ahora = Date.now()): string {
  const instante = String(ahora)
  return `${instante}.${firmar(ruta, instante)}`
}

export function comprobarMarca(marca: unknown, ruta: string, ahora = Date.now()): 'valida' | 'invalida' | 'rapida' | 'caducada' {
  if (typeof marca !== 'string' || marca.length > 100) return 'invalida'
  const [instante, firma] = marca.split('.')
  if (!/^\d{13}$/.test(instante ?? '') || !firma) return 'invalida'
  const esperada = Buffer.from(firmar(ruta, instante))
  const recibida = Buffer.from(firma)
  if (esperada.length !== recibida.length || !timingSafeEqual(esperada, recibida)) return 'invalida'
  const edad = ahora - Number(instante)
  if (edad < TIEMPO_MINIMO_MS) return 'rapida'
  if (edad > VALIDEZ_MS) return 'caducada'
  return 'valida'
}
