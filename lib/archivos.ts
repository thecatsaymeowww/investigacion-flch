/**
 * Límites de los archivos de `media` (subfase 5a; punto 1.8 del plan y su corrección de la v1).
 * - Global, en la configuración de Payload (`upload.limits.fileSize`): 20 MB por archivo. La subida multipart se corta
 *   al pasarlo (413), antes de procesar nada.
 * - Por tipo, con hooks de `media` (payload/collections/plataforma.ts): imágenes hasta 5 MB y PDF hasta 20 MB.
 *   `beforeOperation` mira el archivo recibido (`req.file`: su tamaño real y su contenido, tipoParaLimite) al crear y
 *   al sustituir; `beforeValidate`, al crear, el `filesize` y el `mimeType` que ya ha calculado Payload (cubre también
 *   la subida desde una URL). Nunca lo que declara el navegador. También rigen para la Local API, que no pasa por el
 *   límite global.
 * MB = 1024 × 1024 bytes, como el límite genérico de Payload. Sin importaciones: `node --test` lo prueba tal cual.
 */
const MB = 1024 * 1024

export const LIMITE_GLOBAL_BYTES = 20 * MB

export const LIMITES_POR_TIPO = {
  imagen: { bytes: 5 * MB, texto: 'La imagen supera el tamaño máximo de 5 MB.' },
  pdf: { bytes: 20 * MB, texto: 'El PDF supera el tamaño máximo de 20 MB.' },
} as const

/** Error de tamaño de un archivo según su tipo, o `null` si cabe. Un tipo que no sea imagen ni PDF no se admite. */
export function errorDeTamano(mimeType: string | null | undefined, bytes: number | null | undefined): string | null {
  const tipo = mimeType?.startsWith('image/') ? 'imagen' : mimeType === 'application/pdf' ? 'pdf' : null
  if (!tipo) return 'Tipo de archivo no admitido.'
  if (typeof bytes !== 'number' || !Number.isFinite(bytes) || bytes <= 0) return 'El archivo está vacío o no se pudo medir.'
  return bytes > LIMITES_POR_TIPO[tipo].bytes ? LIMITES_POR_TIPO[tipo].texto : null
}

/**
 * Imágenes derivadas (subfase 5b, punto 8.1 del plan): WebP de calidad 75 en cuatro tamaños. Payload las genera al subir
 * (con sharp), desde el original ya validado, y no amplía: un tamaño mayor que el original no se genera.
 * `og` (1200×630, recortada al centro) es para la vista previa al compartir (7b); no entra en `srcset`.
 */
const WEBP_75 = { format: 'webp', options: { quality: 75 } } as const
export const TAMANOS_DERIVADOS = [
  { name: 'tarjeta', width: 480, formatOptions: WEBP_75 },
  { name: 'media', width: 960, formatOptions: WEBP_75 },
  { name: 'grande', width: 1600, formatOptions: WEBP_75 },
  { name: 'og', width: 1200, height: 630, position: 'centre', formatOptions: WEBP_75 },
] as const

/** El original se guarda acotado a 2400 px de lado, sin ampliar. Al pasar por sharp pierde sus metadatos (EXIF incluido). */
export const ORIGINAL_MAXIMO = { width: 2400, height: 2400, fit: 'inside', withoutEnlargement: true } as const

type Tamano = { url?: string | null; width?: number | null } | null | undefined

/**
 * `srcset` de una imagen a partir de sus tamaños derivados (`tarjeta`, `media`, `grande`; los que existan). Quien llama
 * decide antes si la imagen es pública (lib/cms): esto solo da forma a la lista.
 */
export function srcSetDe(sizes: Partial<Record<'tarjeta' | 'media' | 'grande', Tamano>> | null | undefined): string | undefined {
  const lista = (['tarjeta', 'media', 'grande'] as const)
    .map((n) => sizes?.[n])
    .filter((t): t is { url: string; width: number } => Boolean(t?.url) && typeof t?.width === 'number' && t.width > 0)
    .map((t) => `${t.url} ${t.width}w`)
  return lista.length ? lista.join(', ') : undefined
}

/**
 * Tipo a efectos del límite, por el CONTENIDO del archivo recibido (no por su nombre ni por lo que declara el navegador):
 * solo lo que empieza por `%PDF-` puede usar el límite de los PDF; todo lo demás cuenta como imagen. Que el tipo exacto
 * esté en la lista admitida lo comprueba después Payload (`mimeTypes`, con file-type). Se usa en `beforeOperation`, antes
 * de que Payload haga nada con el archivo: al sustituir uno, Payload borra el anterior ANTES de los hooks
 * `beforeValidate`, y un rechazo ahí dejaba el documento sin su archivo.
 */
export const tipoParaLimite = (datos: Uint8Array): 'application/pdf' | 'image/*' =>
  datos.length >= 5 && String.fromCharCode(...datos.subarray(0, 5)) === '%PDF-' ? 'application/pdf' : 'image/*'

/**
 * Cabeceras de los archivos servidos por /api/media/file/ (`upload.modifyResponseHeaders`): `nosniff` en todos (el
 * navegador no reinterpreta el tipo) y, en los PDF, `Content-Security-Policy: sandbox` (un PDF no ejecuta código con el
 * origen del sitio). Payload fija antes el Content-Type a partir del contenido del archivo, no de su nombre.
 */
export function cabecerasDeArchivo(headers: Headers): Headers {
  headers.set('X-Content-Type-Options', 'nosniff')
  if (headers.get('Content-Type')?.split(';')[0].trim().toLowerCase() === 'application/pdf') headers.set('Content-Security-Policy', 'sandbox')
  return headers
}
