/**
 * Configuración de seguridad que depende del entorno. Se valida al cargar la configuración de Payload: si falta o es
 * incoherente, la aplicación no arranca (mejor un error claro que un despliegue inseguro). Nunca se imprimen valores.
 */

export const LONGITUD_MINIMA_SECRETO = 32
const SECRETO_DE_EJEMPLO = /change_?me|cambia|ejemplo|example|placeholder|secret|password|contrase/i

/**
 * PAYLOAD_SECRET: firma las sesiones. Al menos 32 caracteres, variado y distinto de los valores de ejemplo
 * (.env.example usa CHANGE_ME_PAYLOAD_SECRET). Generarlo con `Nueva-Clave` (docs/BASE-DE-DATOS.md, 48 caracteres).
 * Cambiarlo invalida todas las sesiones abiertas. Los mensajes de error nunca incluyen el valor.
 */
export function secretoPayload(): string {
  const valor = process.env.PAYLOAD_SECRET ?? ''
  if (valor.length < LONGITUD_MINIMA_SECRETO) throw new Error(`PAYLOAD_SECRET falta o tiene menos de ${LONGITUD_MINIMA_SECRETO} caracteres.`)
  if (SECRETO_DE_EJEMPLO.test(valor)) throw new Error('PAYLOAD_SECRET parece un valor de ejemplo: genere uno aleatorio.')
  if (new Set(valor).size < 10) throw new Error('PAYLOAD_SECRET es demasiado repetitivo: genere uno aleatorio.')
  return valor
}

/**
 * URL pública del sitio (NEXT_PUBLIC_SITE_URL): origen exacto con el que se abre el navegador, sin ruta.
 * Es el `serverURL` de Payload y el ÚNICO origen admitido para las peticiones autenticadas con cookie (csrf).
 * En local debe coincidir con la dirección que se escribe en el navegador (http://127.0.0.1:3000 o http://localhost:3000).
 */
export function urlDelSitio(): string {
  const valor = process.env.NEXT_PUBLIC_SITE_URL?.trim()
  if (!valor) throw new Error('Falta NEXT_PUBLIC_SITE_URL (URL pública del sitio). Ver .env.example.')
  let url: URL
  try {
    url = new URL(valor)
  } catch {
    throw new Error('NEXT_PUBLIC_SITE_URL no es una URL válida. Ver .env.example.')
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.pathname !== '/' || url.search || url.hash || url.username || url.password) {
    throw new Error('NEXT_PUBLIC_SITE_URL debe ser solo un origen http(s), sin ruta, consulta ni credenciales. Ver .env.example.')
  }
  return url.origin
}

/**
 * Proxy de confianza (CONFIAR_EN_PROXY, subfase 4b; punto 4.4 del plan). Con `1`, la IP del cliente para el límite de
 * envíos sale de `X-Real-IP`, que el proxy (Nginx, deploy/nginx/) SOBRESCRIBE con `$remote_addr`: la plantilla nunca
 * deja pasar la que envía el cliente. Eso solo es cierto si la aplicación únicamente es accesible a través de ese proxy,
 * es decir, si escucha en 127.0.0.1 (`next start -H 127.0.0.1`) en la misma máquina que Nginx.
 * Sin la variable, o con `0`, no se confía en ninguna cabecera. Cualquier otro valor es un error. Un sitio HTTPS (el de
 * producción, detrás de Nginx) exige `1`: sin él, todos los visitantes compartirían un único cubo del límite.
 */
export function confiarEnProxy(): boolean {
  const valor = process.env.CONFIAR_EN_PROXY?.trim()
  if (valor !== undefined && valor !== '' && valor !== '0' && valor !== '1') throw new Error('CONFIAR_EN_PROXY debe ser "1" o "0". Ver .env.example.')
  const confiar = valor === '1'
  if (!confiar && urlDelSitio().startsWith('https://')) throw new Error('Un sitio HTTPS (detrás del proxy) exige CONFIAR_EN_PROXY=1. Ver .env.example.')
  return confiar
}

/**
 * Atributo `Secure` de la cookie de sesión (PAYLOAD_COOKIE_SECURE). Por defecto SÍ: solo un `false` explícito lo
 * desactiva, para pruebas locales por HTTP. Con un sitio HTTPS no se admite desactivarlo.
 */
export function cookieSegura(): boolean {
  const valor = process.env.PAYLOAD_COOKIE_SECURE?.trim().toLowerCase()
  if (valor !== undefined && valor !== '' && valor !== 'true' && valor !== 'false') {
    throw new Error('PAYLOAD_COOKIE_SECURE debe ser "true" o "false". Ver .env.example.')
  }
  const segura = valor !== 'false'
  if (!segura && urlDelSitio().startsWith('https://')) {
    throw new Error('PAYLOAD_COOKIE_SECURE=false no se admite con un sitio HTTPS.')
  }
  return segura
}
