/**
 * Reprocesa las imágenes ya subidas para que tengan sus tamaños derivados y el original acotado a 2400 px sin metadatos
 * (subfase 5b, punto 8.1 del plan; configuración en lib/archivos.ts).
 *   pnpm payload run scripts/reprocesar-imagenes.ts <inventario.json>
 *       Solo lectura: inventario de `media` (cada documento, su archivo y sus tamaños, con SHA-256).
 *   pnpm payload run scripts/reprocesar-imagenes.ts <inventario.json> aplicar <host:puerto/base>
 *       Reprocesa las imágenes y escribe después el inventario. ESCRIBE en la base y en media/.
 * Argumentos posicionales: `payload run` solo reenvía al script los que no empiezan por `--`.
 * Solo con respaldo previo (pg_dump y copia de media/) y una reversión ensayada: docs/BASE-DE-DATOS.md, «Reprocesar las
 * imágenes». En la base de trabajo, solo con autorización expresa.
 * - Destino: solo una base local (127.0.0.1 o ::1), y la confirmación debe coincidir exactamente con la de DATABASE_URI.
 * - Cada imagen se vuelve a subir con su mismo nombre (overwriteExistingFiles): las URL de los originales no cambian.
 * - Respeta los límites de la 5a: una imagen que los supere no se toca y se informa.
 * - Payload borra el archivo anterior antes de validar el nuevo; si la actualización falla, el original se vuelve a
 *   escribir desde la copia en memoria.
 * - Los PDF no se tocan. No imprime datos personales: solo ids, nombres de archivo y medidas.
 */
import config from '@payload-config'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { getPayload } from 'payload'
import { errorDeTamano, tipoParaLimite } from '../lib/archivos'
import type { Media } from '../payload-types'

const [salida, orden, confirmacion] = process.argv.slice(2)
const aplicar = orden === 'aplicar'
if (!salida || (orden !== undefined && !aplicar)) {
  console.error('[reprocesar] Uso: <inventario.json> [aplicar <host:puerto/base>]')
  process.exit(1)
}

let destino = ''
try {
  const u = new URL(process.env.DATABASE_URI ?? '')
  destino = `${u.hostname}:${u.port || '5432'}${u.pathname}`
} catch {
  console.error('[reprocesar] DATABASE_URI no es una URI válida.')
  process.exit(1)
}
console.log(`[reprocesar] Destino: ${destino}${aplicar ? '' : ' (solo lectura)'}`)
if (aplicar) {
  if (!['127.0.0.1', '[::1]', '::1'].includes(new URL(`postgres://${destino}`).hostname)) {
    console.error(`[reprocesar] ${destino} no es una base local. No se reprocesa.`)
    process.exit(2)
  }
  if (confirmacion !== destino) {
    console.error(`[reprocesar] Falta o no coincide la confirmación: … aplicar ${destino}. No se reprocesa.`)
    process.exit(2)
  }
}

const payload = await getPayload({ config })
const dir = path.resolve(process.cwd(), payload.collections.media.config.upload.staticDir ?? 'media')
const sha = (archivo: string) => (existsSync(archivo) ? createHash('sha256').update(readFileSync(archivo)).digest('hex') : null)
const todos = async () => (await payload.find({ collection: 'media', overrideAccess: true, depth: 0, limit: 0, pagination: false, sort: 'id' })).docs as Media[]

function inventario(docs: Media[]) {
  return docs.map((d) => ({
    id: d.id,
    filename: d.filename,
    mimeType: d.mimeType,
    filesize: d.filesize,
    width: d.width,
    height: d.height,
    sha256: d.filename ? sha(path.join(dir, d.filename)) : null,
    sizes: Object.fromEntries(
      Object.entries(d.sizes ?? {}).map(([n, t]) => [
        n,
        t?.filename ? { filename: t.filename, width: t.width, height: t.height, filesize: t.filesize, sha256: sha(path.join(dir, t.filename)) } : null,
      ]),
    ),
  }))
}

if (aplicar) {
  const r = { reprocesadas: 0, omitidas: 0, errores: 0 }
  for (const d of await todos()) {
    if (!d.mimeType?.startsWith('image/') || !d.filename) continue
    const ruta = path.join(dir, d.filename)
    if (!existsSync(ruta)) {
      console.log(`  · ${d.id} ${d.filename}: el archivo no está en media/, se omite`)
      r.omitidas++
      continue
    }
    const datos = readFileSync(ruta)
    const limite = errorDeTamano(tipoParaLimite(datos), datos.length)
    if (limite) {
      console.log(`  · ${d.id} ${d.filename}: ${limite} Se omite.`)
      r.omitidas++
      continue
    }
    try {
      const nuevo = await payload.update({
        collection: 'media',
        id: d.id,
        overrideAccess: true,
        depth: 0,
        data: {},
        file: { data: datos, name: d.filename, mimetype: d.mimeType, size: datos.length },
        overwriteExistingFiles: true,
      })
      const tamanos = Object.entries(nuevo.sizes ?? {})
        .filter(([, t]) => t?.filename)
        .map(([n, t]) => `${n} ${t?.width}×${t?.height}`)
      console.log(
        `  ✓ ${d.id} ${d.filename}: ${d.width}×${d.height} → ${nuevo.width}×${nuevo.height}; tamaños: ${tamanos.join(', ') || 'ninguno (imagen pequeña)'}`,
      )
      if (nuevo.filename !== d.filename) console.log(`    ⚠ el nombre cambió a ${nuevo.filename}`)
      r.reprocesadas++
    } catch (e) {
      // Payload pudo borrar el original antes de fallar: se vuelve a escribir desde la copia en memoria.
      const restaurado = !existsSync(ruta)
      if (restaurado) writeFileSync(ruta, datos)
      console.log(`  ✗ ${d.id} ${d.filename}: ${(e as Error).message}${restaurado ? ' (original restaurado en disco)' : ''}`)
      r.errores++
    }
  }
  console.log(`[reprocesar] reprocesadas ${r.reprocesadas}, omitidas ${r.omitidas}, con error ${r.errores}`)
}

writeFileSync(salida, `${JSON.stringify(inventario(await todos()), null, 2)}\n`)
console.log(`[reprocesar] inventario escrito en ${salida}`)
process.exit(0)
