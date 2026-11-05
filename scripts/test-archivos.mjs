/**
 * Pruebas unitarias de los límites de archivos (subfase 5a): lib/archivos.ts, sin base ni servidor.
 *   pnpm test:archivos
 * Las de punta a punta (subidas por REST y por la Local API, MIME falso, cabeceras servidas) son la sección `archivos`
 * de scripts/test-seguridad.ts.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import {
  cabecerasDeArchivo,
  errorDeTamano,
  LIMITE_GLOBAL_BYTES,
  LIMITES_POR_TIPO,
  ORIGINAL_MAXIMO,
  srcSetDe,
  TAMANOS_DERIVADOS,
  tipoParaLimite,
} from '../lib/archivos.ts'

const MB = 1024 * 1024
const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

describe('errorDeTamano', () => {
  test('imágenes: hasta 5 MB justos; un byte más, no', () => {
    for (const t of ['image/jpeg', 'image/png', 'image/webp', 'image/gif']) {
      assert.equal(errorDeTamano(t, 5 * MB), null, t)
      assert.equal(errorDeTamano(t, 5 * MB + 1), LIMITES_POR_TIPO.imagen.texto, t)
    }
    assert.equal(errorDeTamano('image/png', 6 * MB), LIMITES_POR_TIPO.imagen.texto)
  })
  test('PDF: hasta 20 MB justos; un byte más, no (una imagen de 6 MB no pasa aunque un PDF de 6 MB sí)', () => {
    assert.equal(errorDeTamano('application/pdf', 20 * MB), null)
    assert.equal(errorDeTamano('application/pdf', 20 * MB + 1), LIMITES_POR_TIPO.pdf.texto)
    assert.equal(errorDeTamano('application/pdf', 6 * MB), null)
  })
  test('vacío, negativo, no numérico o sin medir: error', () => {
    for (const b of [0, -1, Number.NaN, Number.POSITIVE_INFINITY, undefined, null]) assert.match(errorDeTamano('image/png', b) ?? '', /vacío/, String(b))
  })
  test('tipos que no son imagen ni PDF: error, aunque sean pequeños', () => {
    for (const t of ['text/html', 'application/x-msdownload', 'application/octet-stream', '', undefined, null, 'image', 'application/pdfx']) {
      assert.equal(errorDeTamano(t, 10), 'Tipo de archivo no admitido.', String(t))
    }
  })
  test('el límite global coincide con el mayor por tipo (20 MB)', () => {
    assert.equal(LIMITE_GLOBAL_BYTES, 20 * MB)
    assert.equal(LIMITE_GLOBAL_BYTES, Math.max(...Object.values(LIMITES_POR_TIPO).map((l) => l.bytes)))
  })
})

describe('tipoParaLimite (por el contenido, no por el nombre ni el MIME declarado)', () => {
  test('solo lo que empieza por %PDF- usa el límite de los PDF', () => {
    assert.equal(tipoParaLimite(Buffer.from('%PDF-1.7\n...')), 'application/pdf')
    for (const c of ['%PDF', ' %PDF-1.4', '%pdf-1.4', '\x89PNG\r\n', '<html>', '']) assert.equal(tipoParaLimite(Buffer.from(c)), 'image/*', JSON.stringify(c))
  })
  test('una imagen de 6 MB sigue limitada a 5 MB aunque se declare como PDF', () => {
    const png = Buffer.concat([Buffer.from('\x89PNG\r\n\x1a\n', 'binary'), Buffer.alloc(16)])
    assert.equal(errorDeTamano(tipoParaLimite(png), 6 * MB), LIMITES_POR_TIPO.imagen.texto)
  })
})

describe('cabecerasDeArchivo', () => {
  test('nosniff en todos los archivos', () => {
    for (const t of ['image/png', 'image/jpeg', 'application/pdf', 'image/svg+xml'])
      assert.equal(cabecerasDeArchivo(new Headers({ 'Content-Type': t })).get('X-Content-Type-Options'), 'nosniff', t)
  })
  test('PDF: Content-Security-Policy: sandbox (también con parámetros o mayúsculas en el tipo)', () => {
    for (const t of ['application/pdf', 'Application/PDF', 'application/pdf; charset=binary'])
      assert.equal(cabecerasDeArchivo(new Headers({ 'Content-Type': t })).get('Content-Security-Policy'), 'sandbox', t)
  })
  test('imágenes: sin sandbox; una CSP que ya pusiera Payload (XML) no se toca', () => {
    assert.equal(cabecerasDeArchivo(new Headers({ 'Content-Type': 'image/png' })).get('Content-Security-Policy'), null)
    const xml = new Headers({ 'Content-Type': 'image/svg+xml', 'Content-Security-Policy': "default-src 'none'" })
    assert.equal(cabecerasDeArchivo(xml).get('Content-Security-Policy'), "default-src 'none'")
  })
})

describe('imágenes derivadas (5b)', () => {
  test('los cuatro tamaños del plan, en WebP de calidad 75, y ninguno más', () => {
    assert.deepEqual(
      TAMANOS_DERIVADOS.map((t) => [t.name, t.width, t.height ?? null, t.formatOptions.format, t.formatOptions.options.quality]),
      [
        ['tarjeta', 480, null, 'webp', 75],
        ['media', 960, null, 'webp', 75],
        ['grande', 1600, null, 'webp', 75],
        ['og', 1200, 630, 'webp', 75],
      ],
    )
    assert.equal(TAMANOS_DERIVADOS.find((t) => t.name === 'og')?.position, 'centre')
  })
  test('el original: máximo 2400 px de lado, sin ampliar', () => {
    assert.deepEqual(ORIGINAL_MAXIMO, { width: 2400, height: 2400, fit: 'inside', withoutEnlargement: true })
  })
  test('srcSetDe: tarjeta, media y grande con su ancho real; nunca og; sin los que faltan', () => {
    const s = (n, w) => ({ url: `/api/media/file/x-${n}.webp`, width: w })
    assert.equal(
      srcSetDe({ tarjeta: s('t', 480), media: s('m', 960), grande: s('g', 1600), og: s('o', 1200) }),
      '/api/media/file/x-t.webp 480w, /api/media/file/x-m.webp 960w, /api/media/file/x-g.webp 1600w',
    )
    assert.equal(srcSetDe({ tarjeta: s('t', 480), media: { url: null, width: null }, grande: undefined }), '/api/media/file/x-t.webp 480w')
    assert.equal(srcSetDe({}), undefined)
    assert.equal(srcSetDe(null), undefined)
    assert.equal(srcSetDe({ og: s('o', 1200) }), undefined)
  })
})

describe('configuración (estática)', () => {
  test('media: tamaños derivados y original acotado desde lib/archivos', () => {
    const c = readFileSync(path.join(raiz, 'payload/collections/plataforma.ts'), 'utf8')
    assert.match(c, /resizeOptions: \{ \.\.\.ORIGINAL_MAXIMO \}/)
    assert.match(c, /imageSizes: TAMANOS_DERIVADOS\.map\(/)
  })
  test('lib/cms: los tamaños solo se exponen tras comprobar que el archivo es público', () => {
    const c = readFileSync(path.join(raiz, 'lib/cms/index.ts'), 'utf8')
    const fn = c.slice(c.indexOf('function imagen('), c.indexOf('\n}\n', c.indexOf('function imagen(')))
    assert.match(fn, /m\.visibilidad !== 'publica'[^\n]*return null[\s\S]*srcSetDe\(m\.sizes\)/)
  })
  test('media: tipos solo por lista blanca, hook de tamaño y modifyResponseHeaders', () => {
    const c = readFileSync(path.join(raiz, 'payload/collections/plataforma.ts'), 'utf8')
    assert.match(c, /mimeTypes: \['image\/jpeg', 'image\/png', 'image\/webp', 'image\/gif', 'application\/pdf'\]/)
    assert.match(c, /errorDeTamano\(data\?\.mimeType, data\?\.filesize\)/)
    // Al sustituir un archivo, el límite va en beforeOperation: Payload borra el anterior antes de beforeValidate.
    assert.match(c, /beforeOperation: \[[\s\S]*?errorDeTamano\(tipoParaLimite\(req\.file\.data\), req\.file\.size\)/)
    assert.match(c, /modifyResponseHeaders: \(\{ headers \}\) => cabecerasDeArchivo\(headers\)/)
    assert.doesNotMatch(c, /allowRestrictedFileTypes/)
  })
  test('next.config.mjs: los archivos servidos llevan la CSP con sandbox, en una regla posterior a la general', () => {
    const n = readFileSync(path.join(raiz, 'next.config.mjs'), 'utf8')
    const general = n.indexOf("{ source: '/:path*'")
    const archivos = n.indexOf("{ source: '/api/media/file/:path*', headers: [{ key: 'Content-Security-Policy', value: `${CSP}; sandbox` }] }")
    assert.ok(general >= 0 && archivos > general)
  })
  test('payload.config.ts: límite global con LIMITE_GLOBAL_BYTES', () => {
    assert.match(readFileSync(path.join(raiz, 'payload.config.ts'), 'utf8'), /upload: \{ limits: \{ fileSize: LIMITE_GLOBAL_BYTES \} \}/)
  })
})
