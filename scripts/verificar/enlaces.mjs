/**
 * Enlaces del sitio público, recorrido desde la portada (sin dependencias; solo peticiones GET, sin formularios).
 * - Internos (mismo origen): se piden todos: páginas, recursos de /_next/ y archivos de /api/media/file/. Una
 *   respuesta 4xx/5xx o un error de red → FALLIDO. Solo se recorren las páginas del sitio (no /admin ni /api).
 * - Externos: por defecto NO se contactan (ni se envía nada fuera); se listan. Con VERIFICAR_ENLACES_EXTERNOS=1 se
 *   comprueban con HEAD/GET y un fallo es un AVISO: la caída de un sitio ajeno no invalida la verificación local.
 * Necesita el sitio en marcha: `pnpm verificar` arranca el suyo; suelto, VERIFICAR_URL (por defecto
 * http://127.0.0.1:3000) debe responder. Uso suelto: pnpm verificar:enlaces
 */
import { APROBADO, AVISOS, FALLIDO, NO_EJECUTADA, siEsPrincipal } from './comun.mjs'
import { BASE } from './entorno.mjs'

const LIMITE = 1000
const NO_RECORRER = ['/admin', '/api/', '/_next/']
const ATRIBUTO = /\s(href|src|srcset)\s*=\s*(?:"([^"]*)"|'([^']*)')/gi
const ENTIDADES = { '&amp;': '&', '&quot;': '"', '&#x27;': "'", '&#39;': "'", '&lt;': '<', '&gt;': '>' }
const decodificar = (s) => s.replace(/&(amp|quot|#x27|#39|lt|gt);/g, (e) => ENTIDADES[e])

function enlacesDe(html, pagina) {
  const urls = []
  for (const m of html.matchAll(ATRIBUTO)) {
    const valor = decodificar(m[2] ?? m[3] ?? '').trim()
    const candidatos = m[1].toLowerCase() === 'srcset' ? valor.split(',').map((p) => p.trim().split(/\s+/)[0]) : [valor]
    for (const c of candidatos) {
      if (!c || c.startsWith('#') || /^(mailto|tel|javascript|data|blob):/i.test(c)) continue
      try {
        const u = new URL(c, pagina)
        u.hash = ''
        if (u.protocol === 'http:' || u.protocol === 'https:') urls.push(u.href)
      } catch {
        // href inválido: se informa como roto
        urls.push(`inválido:${c}`)
      }
    }
  }
  return urls
}

async function estadoExterno(url) {
  for (const method of ['HEAD', 'GET']) {
    try {
      const r = await fetch(url, { method, redirect: 'follow', signal: AbortSignal.timeout(10000) })
      if (method === 'HEAD' && [403, 405, 501].includes(r.status)) continue
      return r.status
    } catch (e) {
      if (method === 'GET') return e.name === 'TimeoutError' ? 'tiempo agotado' : 'error de red'
    }
  }
  return 'sin respuesta'
}

export async function comprobar(base = process.env.VERIFICAR_URL || BASE) {
  const origen = new URL(base).origin
  try {
    await fetch(`${origen}/`, { signal: AbortSignal.timeout(10000) })
  } catch {
    return { estado: NO_EJECUTADA, detalle: `el sitio no responde en ${origen}` }
  }
  const visitados = new Map() // url interna → estado
  const referencias = new Map() // url → páginas que la enlazan
  const externos = new Set()
  const pendientes = [`${origen}/`]
  const anotar = (url, desde) => {
    if (!referencias.has(url)) referencias.set(url, new Set())
    referencias.get(url).add(desde)
  }
  while (pendientes.length && visitados.size < LIMITE) {
    const url = pendientes.shift()
    if (visitados.has(url)) continue
    let estado
    let html = null
    try {
      const r = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(30000) })
      estado = r.status
      const ruta = new URL(r.url).pathname
      if (r.ok && (r.headers.get('content-type') ?? '').includes('text/html') && !NO_RECORRER.some((p) => ruta.startsWith(p))) html = await r.text()
      else await r.arrayBuffer()
    } catch (e) {
      estado = e.name === 'TimeoutError' ? 'tiempo agotado' : 'error de red'
    }
    visitados.set(url, estado)
    if (!html) continue
    for (const destino of enlacesDe(html, url)) {
      anotar(destino, new URL(url).pathname)
      if (destino.startsWith('inválido:')) visitados.set(destino, 'href inválido')
      else if (new URL(destino).origin === origen) {
        if (!visitados.has(destino)) pendientes.push(destino)
      } else externos.add(destino)
    }
  }

  const rotos = [...visitados].filter(([, e]) => typeof e !== 'number' || e >= 400)
  const paginas = [...visitados.keys()].filter((u) => !NO_RECORRER.some((p) => u.startsWith(origen + p)))
  console.log(`  internos: ${visitados.size} URL comprobadas (${paginas.length} páginas del sitio)`)
  for (const [url, e] of rotos) console.log(`  ✗ ${e} ${url.replace(origen, '')} ← ${[...(referencias.get(url) ?? ['(inicio)'])].slice(0, 3).join(', ')}`)

  const fallosExternos = []
  if (process.env.VERIFICAR_ENLACES_EXTERNOS === '1') {
    for (const url of externos) {
      const e = await estadoExterno(url)
      if (typeof e !== 'number' || e >= 400) {
        fallosExternos.push(url)
        console.log(`  ! externo ${e} ${url} ← ${[...referencias.get(url)].slice(0, 3).join(', ')}`)
      }
    }
  } else {
    console.log(`  externos: ${externos.size} sin comprobar (no se contacta ningún sitio ajeno; activar con VERIFICAR_ENLACES_EXTERNOS=1)`)
    for (const url of externos) console.log(`    · ${url}`)
  }

  const limite = visitados.size >= LIMITE ? `; se alcanzó el límite de ${LIMITE} URL` : ''
  if (rotos.length || paginas.length === 0) {
    return { estado: FALLIDO, detalle: `${rotos.length} enlace(s) interno(s) roto(s) de ${visitados.size}${limite}` }
  }
  if (fallosExternos.length || limite) {
    return { estado: AVISOS, detalle: `internos OK (${visitados.size}); ${fallosExternos.length} externo(s) con fallo de ${externos.size}${limite}` }
  }
  const resumenExternos = process.env.VERIFICAR_ENLACES_EXTERNOS === '1' ? `${externos.size} externos OK` : `${externos.size} externos sin comprobar`
  return { estado: APROBADO, detalle: `${visitados.size} internos OK; ${resumenExternos}` }
}

await siEsPrincipal(import.meta.url, comprobar)
