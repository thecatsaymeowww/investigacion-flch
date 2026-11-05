/**
 * Destino HTTP de las pruebas que escriben (test:aislamiento; test:seguridad tiene la misma variable).
 * PRUEBAS_URL permite otro servidor del entorno desechable (p. ej. el clon en 127.0.0.1:3001), pero SOLO local: las
 * pruebas inician sesión, modifican documentos y envían el formulario de contacto, y en un servidor ajeno dejarían
 * registros. Sin la variable, vacía o con solo espacios: el servidor de `pnpm verificar`.
 * El host se compara ya normalizado por el parser de URL (WHATWG), así que no valen variantes engañosas como
 * `localhost.ejemplo.com`, `localhost.`, credenciales delante del host (`http://localhost@ejemplo.com`) ni caracteres
 * parecidos. Solo http y solo los puertos de los servidores de prueba: 3000 (`pnpm verificar`) y 3001 (otro servidor
 * del entorno desechable); sin puerto explícito (80) tampoco vale. Riesgo residual fuera de alcance: `localhost` lo
 * resuelve el sistema (archivo hosts).
 */
export const DESTINO_PREDETERMINADO = 'http://127.0.0.1:3000'
const HOSTS_LOCALES = new Set(['127.0.0.1', 'localhost', '[::1]'])
const PUERTOS_PERMITIDOS = new Set(['3000', '3001'])

/** Origen (`protocolo://host:puerto`) que deben usar las pruebas. Lanza un Error con el motivo si no está permitido. */
export function destinoDePruebas(valor: string | undefined): string {
  const texto = (valor ?? '').trim()
  if (!texto) return DESTINO_PREDETERMINADO
  let url: URL
  try {
    url = new URL(texto)
  } catch {
    throw new Error('PRUEBAS_URL no es una URL válida')
  }
  // Ningún motivo repite el valor completo: podría llevar credenciales.
  if (url.protocol !== 'http:') throw new Error(`PRUEBAS_URL solo admite http (recibido «${url.protocol}»)`)
  if (url.username || url.password) throw new Error('PRUEBAS_URL no admite usuario ni contraseña en la URL')
  if (!HOSTS_LOCALES.has(url.hostname)) throw new Error(`PRUEBAS_URL solo admite 127.0.0.1, localhost o [::1] (recibido «${url.hostname}»)`)
  // El parser deja `port` vacío si es el predeterminado del protocolo (80): también se rechaza.
  if (!PUERTOS_PERMITIDOS.has(url.port)) throw new Error(`PRUEBAS_URL solo admite los puertos 3000 o 3001 (recibido «${url.port || 'ninguno'}»)`)
  if (url.pathname !== '/' || url.search || url.hash) throw new Error('PRUEBAS_URL debe ser solo un origen, sin ruta, consulta ni fragmento')
  return url.origin
}
