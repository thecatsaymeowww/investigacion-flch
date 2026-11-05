/**
 * Pruebas de las correcciones de seguridad (Local API + HTTP).
 *   pnpm test:seguridad        (con `pnpm start` corriendo en 127.0.0.1:3000)
 *   SECCIONES=deepmerge,mensajes pnpm test:seguridad   (solo esas secciones)
 * Mismas reglas que test:aislamiento: SOLO en un entorno desechable, con los grupos ficticios de la semilla.
 * - Crea un editor temporal en estudios-andinos-demo (contraseña solo en memoria) y sus propios documentos de prueba.
 * - Cada rechazo se comprueba también en la base: el documento no cambia y no aparece ninguna entrada nueva en el
 *   registro de cambios (ninguna escritura llegó a completarse).
 * - Al terminar borra lo que creó, aunque algo falle. Quedan las entradas del registro de cambios de sus escrituras
 *   legítimas, que es de auditoría y no se borra.
 */
import config from '@payload-config'
import { randomBytes } from 'node:crypto'
import { existsSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { getPayload } from 'payload'
import sharp from 'sharp'
import type { Media } from '../payload-types'
import { PROFUNDIDAD_MAXIMA, rechazarClavesPeligrosas } from '../lib/claves-peligrosas'
import { cookieSegura, LONGITUD_MINIMA_SECRETO, secretoPayload, urlDelSitio } from '../lib/entorno'
import { clienteDe, crearLimitador } from '../lib/limite-envios'
import { comprobarMarca, emitirMarca, TIEMPO_MINIMO_MS, VALIDEZ_MS } from '../lib/antispam'

const payload = await getPayload({ config })
// PRUEBAS_URL: otro servidor del entorno desechable (p. ej. en otro puerto); por defecto, el de `pnpm verificar`.
const BASE = process.env.PRUEBAS_URL?.trim() || 'http://127.0.0.1:3000'
const MARCA = `seguridad-${randomBytes(6).toString('hex')}`
const SECCIONES = (process.env.SECCIONES ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)
const seccion = (nombre: string) => SECCIONES.length === 0 || SECCIONES.includes(nombre)
let fallos = 0
const ok = (label: string, cond: boolean, extra = '') => {
  console.log(`${cond ? '  ✓' : '  ✗'} ${label}${extra ? ` (${extra})` : ''}`)
  if (!cond) fallos++
}
const exigir = <T>(valor: T | null | undefined, que: string): T => {
  if (valor == null) throw new Error(`falta ${que}`)
  return valor
}
const json = { 'Content-Type': 'application/json' }
type Coleccion = 'integrantes' | 'media' | 'usuarios' | 'mensajes' | 'grupos' | 'publicaciones' | 'payload-locked-documents'
const temporales: { collection: Coleccion; id: number | string }[] = []
const carpetaMedia = () => {
  const dir = payload.collections.media.config.upload.staticDir ?? 'media'
  return path.isAbsolute(dir) ? dir : path.resolve(process.cwd(), dir)
}
/**
 * Envío del formulario Colaborar SIN JavaScript, como lo haría un navegador con JS desactivado: los campos ocultos de
 * la Server Action salen del HTML de la propia página. Devuelve el HTML de respuesta.
 */
const enviarSinJS = async (
  ruta: string,
  campos: Record<string, string>,
  /** Como objeto o como pares (para repetir una cabecera). */
  cabeceras: Record<string, string> | [string, string][] = {},
  opciones: { quitar?: string[]; sinEsperar?: boolean; enlazada?: string } = {},
) => {
  const servida = Date.now()
  const pagina = await (await fetch(`${BASE}/${ruta}`)).text()
  const inicio = pagina.indexOf('<form', pagina.indexOf('id="colaborar"'))
  const form = pagina.slice(inicio, pagina.indexOf('</form>', inicio))
  const fd = new FormData()
  for (const m of form.matchAll(/<input type="hidden" name="([^"]+)"(?: value="([^"]*)")?/g))
    fd.append(m[1], (m[2] ?? '').replace(/&quot;/g, '"').replace(/&amp;/g, '&'))
  for (const [k, v] of Object.entries(campos)) fd.set(k, v)
  for (const k of opciones.quitar ?? []) fd.delete(k)
  if (opciones.enlazada !== undefined) {
    // Primer argumento enlazado de la acción (la ruta): lo que cambiaría alguien que manipule el formulario.
    const clave = [...fd.keys()].find((k) => /^\$ACTION_\d+:1$/.test(k))
    if (clave) fd.set(clave, JSON.stringify([opciones.enlazada, ...JSON.parse(String(fd.get(clave))).slice(1)]))
  }
  // Como una persona: nadie rellena el formulario en menos del tiempo mínimo del antispam.
  if (!opciones.sinEsperar) await new Promise((res) => setTimeout(res, Math.max(0, TIEMPO_MINIMO_MS + 200 - (Date.now() - servida))))
  const pares = Array.isArray(cabeceras) ? cabeceras : Object.entries(cabeceras)
  const h = new Headers()
  if (!pares.some(([k]) => k.toLowerCase() === 'origin')) h.set('Origin', BASE)
  for (const [k, v] of pares) h.append(k, v)
  const r = await fetch(`${BASE}/${ruta}`, { method: 'POST', body: fd, headers: h })
  return { status: r.status, html: await r.text() }
}
/** Estado comparable de un documento (sin poblar) y número de entradas del registro de cambios. */
const foto = async (collection: 'integrantes' | 'landing' | 'mensajes', id: number) =>
  JSON.stringify(await payload.findByID({ collection, id, depth: 0, draft: true, overrideAccess: true }))
const registros = async () => (await payload.count({ collection: 'registro-cambios', overrideAccess: true })).totalDocs

try {
  const B = exigir(
    (await payload.find({ collection: 'grupos', where: { ruta: { equals: 'estudios-andinos-demo' } }, limit: 1 })).docs[0],
    'el grupo estudios-andinos-demo (pnpm seed)',
  )
  const clave = randomBytes(18).toString('hex')
  const editor = await payload.create({
    collection: 'usuarios',
    data: { email: `${MARCA}@plataforma.local`, password: clave, roles: ['editor'], grupos: [{ grupo: B.id }] },
  })
  temporales.push({ collection: 'usuarios', id: editor.id })
  const login = await fetch(`${BASE}/api/usuarios/login`, { method: 'POST', headers: json, body: JSON.stringify({ email: editor.email, password: clave }) })
  const token = ((await login.json()) as { token?: string }).token
  ok('REST: el editor temporal inicia sesión', login.status === 200 && Boolean(token), `HTTP ${login.status}`)
  const auth = { Authorization: `JWT ${token}` }
  const comoEditor = { user: { ...editor, collection: 'usuarios' as const }, overrideAccess: false, depth: 0 } as const

  if (seccion('deepmerge')) {
    console.log('deepmerge (GHSA-gcqx-w48m-w2h4): rechazo de claves peligrosas antes de la fusión')
    const sinHook = Object.values(payload.collections)
      .filter(({ config: c }) => c.hooks.beforeValidate?.[0] !== rechazarClavesPeligrosas)
      .map(({ config: c }) => c.slug)
    ok(
      'el rechazo es el primer beforeValidate de todas las colecciones, internas incluidas',
      sinHook.length === 0,
      sinHook.join(', ') || `${Object.keys(payload.collections).length} colecciones`,
    )

    const integrante = await payload.create({ collection: 'integrantes', data: { nombre: `${MARCA} integrante`, rol: 'Doctor', grupo: B.id }, ...comoEditor })
    temporales.push({ collection: 'integrantes', id: integrante.id })
    const landing = exigir(
      (await payload.find({ collection: 'landing', where: { grupo: { equals: B.id } }, draft: true, limit: 1, depth: 0 })).docs[0],
      'la landing del demo (pnpm seed)',
    )

    /** Un intento debe rechazarse con 400 sin cambiar el documento ni el registro de cambios. */
    const rechazaREST = async (
      nombre: string,
      metodo: string,
      ruta: string,
      cuerpo: BodyInit,
      cabeceras: Record<string, string>,
      doc?: ['integrantes' | 'landing', number],
    ) => {
      const antes = doc ? await foto(...doc) : ''
      const nReg = await registros()
      const r = await fetch(`${BASE}${ruta}`, { method: metodo, headers: { ...auth, ...cabeceras }, body: cuerpo })
      const texto = await r.text()
      const igual = doc ? (await foto(...doc)) === antes : true
      ok(
        `REST rechaza ${nombre}`,
        r.status === 400 && igual && (await registros()) === nReg,
        `HTTP ${r.status}; documento sin cambios: ${igual}; ${texto.slice(0, 90).replace(/\s+/g, ' ')}`,
      )
    }
    const pInt = `/api/integrantes/${integrante.id}?draft=true`
    await rechazaREST('__proto__ en la raíz', 'PATCH', pInt, '{"rol":"Cambio","__proto__":{"rol":"INYECTADO"}}', json, ['integrantes', integrante.id])
    await rechazaREST('__proto__ dentro de un campo de texto (objeto en vez de cadena)', 'PATCH', pInt, '{"rol":{"__proto__":{"x":1}}}', json, [
      'integrantes',
      integrante.id,
    ])
    await rechazaREST('constructor.prototype', 'PATCH', pInt, '{"constructor":{"prototype":{"rol":"INYECTADO"}}}', json, ['integrantes', integrante.id])
    await rechazaREST('prototype anidado en objetos y arrays', 'PATCH', pInt, '{"bio":"x","extra":{"a":[{"b":{"prototype":1}}]}}', json, [
      'integrantes',
      integrante.id,
    ])
    await rechazaREST(
      '__proto__ dentro de una fila de array (landing)',
      'PATCH',
      `/api/landing/${landing.id}?draft=true`,
      '{"aliados":[{"nombre":"Aliado","__proto__":{"url":"javascript:alert(1)"}}]}',
      json,
      ['landing', landing.id],
    )
    let profundo: unknown = 'fondo'
    for (let i = 0; i < PROFUNDIDAD_MAXIMA + 5; i++) profundo = { n: profundo }
    await rechazaREST(`estructura de más de ${PROFUNDIDAD_MAXIMA} niveles`, 'PATCH', pInt, JSON.stringify({ rol: profundo }), json, [
      'integrantes',
      integrante.id,
    ])
    const nIntegrantes = (await payload.count({ collection: 'integrantes', overrideAccess: true })).totalDocs
    await rechazaREST('creación con __proto__', 'POST', '/api/integrantes', `{"nombre":"${MARCA} rechazado","grupo":${B.id},"__proto__":{"orden":1}}`, json)
    ok('la creación rechazada no deja documento', (await payload.count({ collection: 'integrantes', overrideAccess: true })).totalDocs === nIntegrantes)

    const png = await sharp({ create: { width: 8, height: 8, channels: 3, background: { r: 20, g: 90, b: 40 } } })
      .png()
      .toBuffer()
    const multipart = (alt: string, extra: string) => {
      const fd = new FormData()
      fd.append('file', new Blob([new Uint8Array(png)], { type: 'image/png' }), `${MARCA}-${alt}.png`)
      fd.append('_payload', `{"alt":"${alt}","grupo":${B.id}${extra}}`)
      return fd
    }
    const nMedia = (await payload.count({ collection: 'media', overrideAccess: true })).totalDocs
    const archivosAntes = existsSync(carpetaMedia()) ? readdirSync(carpetaMedia()).length : 0
    await rechazaREST('multipart con __proto__ en _payload', 'POST', '/api/media', multipart('rechazado', ',"__proto__":{"alt":"x"}'), {})
    ok(
      'la subida rechazada no deja registro ni archivo',
      (await payload.count({ collection: 'media', overrideAccess: true })).totalDocs === nMedia &&
        (existsSync(carpetaMedia()) ? readdirSync(carpetaMedia()).length : 0) === archivosAntes,
    )
    await rechazaREST(
      'colección interna (payload-preferences) con __proto__ anidado',
      'POST',
      '/api/payload-preferences',
      `{"key":"${MARCA}","value":{"a":{"__proto__":{"b":1}}}}`,
      json,
    )
    // Desde la 2c un editor no crea bloqueos por la API (403 antes de validar): el rechazo de la clave se comprueba con
    // un superadmin temporal, que sí puede escribir en esa colección.
    const claveDM = randomBytes(18).toString('hex')
    const saDM = await payload.create({ collection: 'usuarios', data: { email: `${MARCA}-dm-sa@plataforma.local`, password: claveDM, roles: ['superadmin'] } })
    temporales.push({ collection: 'usuarios', id: saDM.id })
    const tokenDM = (
      (await (
        await fetch(`${BASE}/api/usuarios/login`, { method: 'POST', headers: json, body: JSON.stringify({ email: saDM.email, password: claveDM }) })
      ).json()) as { token?: string }
    ).token
    await rechazaREST(
      'colección interna (payload-locked-documents) con __proto__',
      'POST',
      '/api/payload-locked-documents',
      '{"globalSlug":{"__proto__":{"x":1}}}',
      {
        ...json,
        Authorization: `JWT ${tokenDM}`,
      },
    )

    const antesLocal = await foto('integrantes', integrante.id)
    const nRegLocal = await registros()
    const local = await payload.update({ collection: 'integrantes', id: integrante.id, data: JSON.parse('{"rol":{"__proto__":{"x":1}}}'), ...comoEditor }).then(
      () => null,
      (e: { status?: number }) => e,
    )
    ok(
      'Local API rechaza __proto__ (400)',
      local?.status === 400 && (await foto('integrantes', integrante.id)) === antesLocal && (await registros()) === nRegLocal,
      `status ${local?.status}`,
    )

    // Positivos: palabras peligrosas como VALORES, edición de arrays de la landing y subida legítima.
    const textos = { nombre: `${MARCA} constructor`, rol: 'prototype', bio: '__proto__ proto constructor.prototype' }
    const r1 = await fetch(`${BASE}/api/integrantes`, { method: 'POST', headers: { ...auth, ...json }, body: JSON.stringify({ ...textos, grupo: B.id }) })
    const c1 = ((await r1.json()) as { doc?: { id: number } }).doc
    if (c1) temporales.push({ collection: 'integrantes', id: c1.id })
    const g1 = c1 ? await payload.findByID({ collection: 'integrantes', id: c1.id, depth: 0, draft: true, overrideAccess: true }) : null
    ok(
      'acepta textos con constructor, prototype, __proto__ y proto como valores',
      r1.status === 201 && g1?.nombre === textos.nombre && g1?.rol === textos.rol && g1?.bio === textos.bio,
      `HTTP ${r1.status}`,
    )
    const aliadosAntes = (landing.aliados ?? []).map((a) => ({ nombre: a.nombre, url: a.url, logo: a.logo }))
    const r2 = await fetch(`${BASE}/api/landing/${landing.id}?draft=true`, {
      method: 'PATCH',
      headers: { ...auth, ...json },
      body: JSON.stringify({ aliados: [...aliadosAntes, { nombre: `${MARCA} aliado`, url: 'https://ejemplo.invalid' }] }),
    })
    const l2 = await payload.findByID({ collection: 'landing', id: landing.id, depth: 0, draft: true, overrideAccess: true })
    ok('edición legítima de un array de la landing', r2.status === 200 && (l2.aliados ?? []).some((a) => a.nombre === `${MARCA} aliado`), `HTTP ${r2.status}`)
    await payload.update({ collection: 'landing', id: landing.id, draft: true, data: { aliados: aliadosAntes }, overrideAccess: true })
    const r3 = await fetch(`${BASE}/api/media`, { method: 'POST', headers: auth, body: multipart('legitimo', '') })
    const m3 = ((await r3.json()) as { doc?: { id: number } }).doc
    if (m3) temporales.push({ collection: 'media', id: m3.id })
    ok('subida multipart legítima', r3.status === 201, `HTTP ${r3.status}`)
    const r4 = await fetch(`${BASE}/api/integrantes/${integrante.id}?draft=true`, {
      method: 'PATCH',
      headers: { ...auth, ...json },
      body: JSON.stringify({ rol: 'Magíster', orden: 7 }),
    })
    ok(
      'actualización legítima por REST',
      r4.status === 200 &&
        (await payload.findByID({ collection: 'integrantes', id: integrante.id, depth: 0, draft: true, overrideAccess: true })).rol === 'Magíster',
      `HTTP ${r4.status}`,
    )
  }

  if (seccion('entorno')) {
    console.log('Configuración de entorno (lib/entorno.ts)')
    const guardado = { url: process.env.NEXT_PUBLIC_SITE_URL, cookie: process.env.PAYLOAD_COOKIE_SECURE }
    const con = <T>(url: string | undefined, cookie: string | undefined, fn: () => T): T | 'error' => {
      process.env.NEXT_PUBLIC_SITE_URL = url
      if (cookie === undefined) delete process.env.PAYLOAD_COOKIE_SECURE
      else process.env.PAYLOAD_COOKIE_SECURE = cookie
      if (url === undefined) delete process.env.NEXT_PUBLIC_SITE_URL
      try {
        return fn()
      } catch {
        return 'error'
      }
    }
    ok('urlDelSitio: devuelve el origen', con('https://sitio.ejemplo.invalid', 'true', urlDelSitio) === 'https://sitio.ejemplo.invalid')
    ok(
      'urlDelSitio: rechaza ausente, con ruta, con credenciales o no http(s)',
      [undefined, 'https://a.invalid/ruta', 'https://u:p@a.invalid', 'ftp://a.invalid', 'no-es-url'].every((u) => con(u, 'true', urlDelSitio) === 'error'),
    )
    ok(
      'cookieSegura: true por defecto (variable ausente o vacía)',
      con('http://127.0.0.1:3000', undefined, cookieSegura) === true && con('http://127.0.0.1:3000', '', cookieSegura) === true,
    )
    ok('cookieSegura: false solo con "false" explícito y sitio http', con('http://127.0.0.1:3000', 'false', cookieSegura) === false)
    ok(
      'cookieSegura: rechaza false con sitio https y valores ambiguos',
      con('https://a.invalid', 'false', cookieSegura) === 'error' && con('http://127.0.0.1:3000', 'si', cookieSegura) === 'error',
    )
    con(guardado.url, guardado.cookie, () => null)

    const secretoGuardado = process.env.PAYLOAD_SECRET
    const probarSecreto = (valor: string | undefined) => {
      if (valor === undefined) delete process.env.PAYLOAD_SECRET
      else process.env.PAYLOAD_SECRET = valor
      try {
        secretoPayload()
        return 'aceptado'
      } catch (e) {
        // El mensaje de error nunca debe contener el valor.
        return valor && (e as Error).message.includes(valor) ? 'filtra el valor' : 'rechazado'
      }
    }
    const aleatorio = randomBytes(24).toString('hex')
    ok(
      `PAYLOAD_SECRET: rechaza ausente, vacío y de menos de ${LONGITUD_MINIMA_SECRETO} caracteres`,
      [undefined, '', aleatorio.slice(0, LONGITUD_MINIMA_SECRETO - 1)].every((v) => probarSecreto(v) === 'rechazado'),
    )
    ok(
      'PAYLOAD_SECRET: rechaza valores de ejemplo aunque sean largos',
      ['CHANGE_ME_PAYLOAD_SECRET_0123456789abcdef', `cambia-esto-${aleatorio}`, `example${aleatorio}`].every((v) => probarSecreto(v) === 'rechazado'),
    )
    ok('PAYLOAD_SECRET: rechaza valores repetitivos', probarSecreto('ab'.repeat(30)) === 'rechazado')
    ok('PAYLOAD_SECRET: acepta uno aleatorio de 48 caracteres (Nueva-Clave)', probarSecreto(aleatorio) === 'aceptado')
    process.env.PAYLOAD_SECRET = secretoGuardado
    ok('PAYLOAD_SECRET de este entorno: válido', probarSecreto(secretoGuardado) === 'aceptado')
    process.env.PAYLOAD_SECRET = secretoGuardado
  }

  if (seccion('cookies')) {
    console.log('Cookie de sesión y origen permitido (csrf)')
    const origen = urlDelSitio()
    // Payload añade serverURL a csrf por su cuenta: la lista puede repetirlo, pero no debe admitir ningún otro origen.
    ok(
      'serverURL = NEXT_PUBLIC_SITE_URL y csrf solo admite ese origen',
      payload.config.serverURL === origen && JSON.stringify([...new Set(payload.config.csrf)]) === JSON.stringify([origen]),
      `${payload.config.serverURL}; csrf=${JSON.stringify(payload.config.csrf)}`,
    )
    const r = await fetch(`${BASE}/api/usuarios/login`, { method: 'POST', headers: json, body: JSON.stringify({ email: editor.email, password: clave }) })
    const setCookie = r.headers.get('set-cookie') ?? ''
    const cookie = setCookie.split(';')[0]
    const atributos = setCookie
      .split(';')
      .slice(1)
      .map((a) => a.trim().split('=')[0].toLowerCase())
    const esperaSecure = cookieSegura()
    ok('cookie HttpOnly y SameSite=Lax', atributos.includes('httponly') && /samesite=lax/i.test(setCookie))
    ok(
      `atributo Secure según PAYLOAD_COOKIE_SECURE (esperado: ${esperaSecure ? 'sí' : 'no'})`,
      atributos.includes('secure') === esperaSecure,
      atributos.join(', '),
    )
    const yo = async (cabeceras: Record<string, string>) => {
      const res = await fetch(`${BASE}/api/usuarios/me`, { headers: { Cookie: cookie, ...cabeceras } })
      return Boolean(((await res.json()) as { user?: unknown }).user)
    }
    ok('cookie aceptada con Origin del sitio', await yo({ Origin: origen }))
    ok('cookie ignorada con Origin ajeno', !(await yo({ Origin: 'https://atacante.example' })))
    ok('cookie ignorada sin Origin ni Sec-Fetch-Site (cliente no navegador)', !(await yo({})))
    ok('cookie aceptada sin Origin con Sec-Fetch-Site same-origin (navegación)', await yo({ 'Sec-Fetch-Site': 'same-origin' }))
    ok('cookie ignorada con Sec-Fetch-Site cross-site', !(await yo({ 'Sec-Fetch-Site': 'cross-site' })))
    const victima = await payload.create({ collection: 'integrantes', data: { nombre: `${MARCA} csrf`, rol: 'Original', grupo: B.id }, ...comoEditor })
    temporales.push({ collection: 'integrantes', id: victima.id })
    const antes = await foto('integrantes', victima.id)
    const ajeno = await fetch(`${BASE}/api/integrantes/${victima.id}`, {
      method: 'PATCH',
      headers: { Cookie: cookie, Origin: 'https://atacante.example', ...json },
      body: '{"rol":"CSRF"}',
    })
    ok(
      'escritura con cookie y Origin ajeno: rechazada y sin cambios',
      ajeno.status >= 400 && ajeno.status < 500 && (await foto('integrantes', victima.id)) === antes,
      `HTTP ${ajeno.status}`,
    )
    const propio = await fetch(`${BASE}/api/integrantes/${victima.id}`, {
      method: 'PATCH',
      headers: { Cookie: cookie, Origin: origen, ...json },
      body: '{"rol":"Desde el sitio"}',
    })
    ok(
      'escritura con cookie y Origin del sitio: aceptada',
      propio.status === 200 &&
        (await payload.findByID({ collection: 'integrantes', id: victima.id, depth: 0, draft: true, overrideAccess: true })).rol === 'Desde el sitio',
      `HTTP ${propio.status}`,
    )
    const jwt = await fetch(`${BASE}/api/usuarios/me`, { headers: { ...auth, Origin: 'https://atacante.example' } })
    ok('cabecera JWT (no la envía un navegador por sí solo): sigue funcionando', Boolean(((await jwt.json()) as { user?: unknown }).user))
  }
  if (seccion('tipos')) {
    console.log('Campos de texto: solo cadenas (lib/tipos-texto.ts), también en borradores')
    const doc = await payload.create({
      collection: 'integrantes',
      data: { nombre: `${MARCA} tipos`, rol: 'Doctor', bio: 'Bio original', grupo: B.id },
      ...comoEditor,
    })
    temporales.push({ collection: 'integrantes', id: doc.id })
    const landing = exigir(
      (await payload.find({ collection: 'landing', where: { grupo: { equals: B.id } }, draft: true, limit: 1, depth: 0 })).docs[0],
      'la landing del demo',
    )
    const rechaza = async (nombre: string, ruta: string, cuerpo: unknown, d: ['integrantes' | 'landing', number], campo: string) => {
      const antes = await foto(...d)
      const r = await fetch(`${BASE}${ruta}`, { method: 'PATCH', headers: { ...auth, ...json }, body: JSON.stringify(cuerpo) })
      const t = await r.text()
      ok(`REST rechaza ${nombre}`, r.status === 400 && t.includes(campo) && (await foto(...d)) === antes, `HTTP ${r.status}; ${t.slice(0, 80)}`)
    }
    const pInt = `/api/integrantes/${doc.id}`
    await rechaza('un objeto en un campo text', pInt, { rol: { a: 1 } }, ['integrantes', doc.id], 'rol')
    await rechaza('un array en un campo text', pInt, { rol: ['Doctor'] }, ['integrantes', doc.id], 'rol')
    await rechaza('un número en un campo text', pInt, { rol: 7 }, ['integrantes', doc.id], 'rol')
    await rechaza('un booleano en un textarea', pInt, { bio: true }, ['integrantes', doc.id], 'bio')
    await rechaza('un objeto al guardar un BORRADOR', `${pInt}?draft=true`, { rol: { a: 1 } }, ['integrantes', doc.id], 'rol')
    await rechaza(
      'un objeto en un text dentro de una fila de array (landing)',
      `/api/landing/${landing.id}?draft=true`,
      { aliados: [{ nombre: { x: 1 } }] },
      ['landing', landing.id],
      'aliados.0.nombre',
    )
    const email = await fetch(`${BASE}/api/usuarios/${editor.id}`, {
      method: 'PATCH',
      headers: { ...auth, ...json },
      body: JSON.stringify({ email: { a: 1 } }),
    })
    ok(
      'REST rechaza un objeto en un campo email (usuarios)',
      email.status === 400 && (await payload.findByID({ collection: 'usuarios', id: editor.id, depth: 0 })).email === editor.email,
      `HTTP ${email.status}`,
    )
    const local = await payload
      .update({ collection: 'integrantes', id: doc.id, draft: true, data: { rol: { a: 1 } as unknown as string }, ...comoEditor })
      .then(
        () => null,
        (e: { status?: number }) => e,
      )
    ok('Local API rechaza un objeto en un campo text (borrador)', local?.status === 400)
    const textos = { rol: 'constructor prototype proto', bio: '__proto__ y "constructor": {}' }
    const r1 = await fetch(`${BASE}${pInt}`, { method: 'PATCH', headers: { ...auth, ...json }, body: JSON.stringify(textos) })
    const g1 = await payload.findByID({ collection: 'integrantes', id: doc.id, depth: 0, draft: true, overrideAccess: true })
    ok('acepta textos con constructor, prototype y proto', r1.status === 200 && g1.rol === textos.rol && g1.bio === textos.bio, `HTTP ${r1.status}`)
    const r2 = await fetch(`${BASE}${pInt}`, { method: 'PATCH', headers: { ...auth, ...json }, body: JSON.stringify({ rol: null, bio: '' }) })
    ok('acepta null y cadena vacía en campos opcionales', r2.status === 200, `HTTP ${r2.status}`)
    // Datos existentes: todos los campos de texto de todas las colecciones del proyecto ya son cadenas o null.
    const { exigirTextoEnCamposDeTexto } = await import('../lib/tipos-texto')
    let revisados = 0
    const malos: string[] = []
    for (const slug of [
      'landing',
      'integrantes',
      'publicaciones',
      'actividades',
      'eventos',
      'media',
      'mensajes',
      'grupos',
      'usuarios',
      'registro-cambios',
    ] as const) {
      const c = payload.collections[slug].config
      for (const d of (await payload.find({ collection: slug, limit: 0, depth: 0, draft: true, overrideAccess: true, pagination: false })).docs) {
        revisados++
        try {
          await exigirTextoEnCamposDeTexto({ collection: c, data: d, req: { t: (k: string) => k } } as never)
        } catch {
          malos.push(`${slug}#${(d as { id: number }).id}`)
        }
      }
    }
    ok(
      'los datos existentes pasan la comprobación (no hay que migrar nada)',
      malos.length === 0,
      `${revisados} documentos revisados${malos.length ? `; no pasan: ${malos.join(', ')}` : ''}`,
    )
  }

  if (seccion('borradores')) {
    // Payload no valida al guardar un borrador; al publicar valida el documento completo (lo guardado + lo enviado).
    console.log('Borradores frente a publicación (publicaciones: url, año 1800-2100 y obligatorios)')
    const pub = (id: number, cuerpo: unknown) =>
      fetch(`${BASE}/api/publicaciones/${id}`, { method: 'PATCH', headers: { ...auth, ...json }, body: JSON.stringify(cuerpo) })
    const leer = (id: number, draft: boolean) => payload.findByID({ collection: 'publicaciones', id, depth: 0, draft, overrideAccess: true })
    const borrarPorREST = async (id: number) => {
      // Dentro de Next: invalida la caché de la landing, que si no podría mostrar el documento hasta 5 minutos.
      if ((await fetch(`${BASE}/api/publicaciones/${id}`, { method: 'DELETE', headers: auth })).status === 200) return
      temporales.push({ collection: 'publicaciones' as Coleccion, id })
    }
    const a = await fetch(`${BASE}/api/publicaciones?draft=true`, {
      method: 'POST',
      headers: { ...auth, ...json },
      body: JSON.stringify({ autoria: MARCA, url: 'javascript:alert(1)', anio: 5, grupo: B.id }),
    })
    const idA = ((await a.json()) as { doc?: { id: number } }).doc?.id ?? 0
    ok(
      'un borrador nuevo se guarda sin título y con url y año inválidos (comportamiento de Payload)',
      a.status === 201 && (await leer(idA, true)).url === 'javascript:alert(1)',
      `HTTP ${a.status}`,
    )
    const r1 = await pub(idA, { _status: 'published' })
    const r2 = await pub(idA, { _status: 'published', titulo: `${MARCA} A`, tipo: 'Libro' })
    const tras = await leer(idA, false)
    ok(
      'REST: publicarlo se rechaza, también completando solo los obligatorios (año y url guardados se validan)',
      r1.status === 400 && r2.status === 400 && tras._status === 'draft',
      `HTTP ${r1.status} / ${r2.status}`,
    )
    const lp = await payload
      .update({ collection: 'publicaciones', id: idA, data: { _status: 'published', titulo: `${MARCA} A`, tipo: 'Libro' }, ...comoEditor })
      .then(
        () => null,
        (e: { status?: number }) => e,
      )
    ok('Local API: publicarlo también se rechaza', lp?.status === 400 && (await leer(idA, false))._status === 'draft')
    const r3 = await pub(idA, { _status: 'published', titulo: `${MARCA} A`, tipo: 'Libro', anio: 2021, url: 'https://ejemplo.invalid/libro' })
    ok('REST: corregido, sí se publica', r3.status === 200 && (await leer(idA, false))._status === 'published', `HTTP ${r3.status}`)
    await borrarPorREST(idA)

    const b = await fetch(`${BASE}/api/publicaciones`, {
      method: 'POST',
      headers: { ...auth, ...json },
      body: JSON.stringify({ titulo: `${MARCA} B`, autoria: MARCA, tipo: 'Libro', anio: 2020, grupo: B.id, _status: 'published' }),
    })
    const idB = ((await b.json()) as { doc?: { id: number } }).doc?.id ?? 0
    const r4 = await fetch(`${BASE}/api/publicaciones/${idB}?draft=true`, {
      method: 'PATCH',
      headers: { ...auth, ...json },
      body: JSON.stringify({ url: 'javascript:alert(1)' }),
    })
    const r5 = await pub(idB, { _status: 'published' })
    ok(
      'borrador inválido sobre una publicación válida: se guarda como borrador, pero no se publica',
      b.status === 201 &&
        r4.status === 200 &&
        r5.status === 400 &&
        (await leer(idB, false)).url == null &&
        (await leer(idB, true)).url === 'javascript:alert(1)',
      `HTTP ${r4.status} / ${r5.status}`,
    )
    const html = await (await fetch(`${BASE}/estudios-andinos-demo`)).text()
    ok('el sitio público muestra la versión publicada y nada del borrador', html.includes(`${MARCA} B`) && !html.includes('javascript:alert'))
    await borrarPorREST(idB)
  }

  if (seccion('cabeceras')) {
    console.log('Cabeceras de seguridad (next.config.mjs)')
    const esperadas: [string, RegExp][] = [
      ['content-security-policy', /frame-ancestors 'none'.*base-uri 'self'.*form-action 'self'.*object-src 'none'/],
      ['x-frame-options', /^DENY$/],
      ['x-content-type-options', /^nosniff$/],
      ['referrer-policy', /^strict-origin-when-cross-origin$/],
      ['permissions-policy', /camera=\(\)/],
    ]
    const rutas: [string, Record<string, string>][] = [
      ['/', {}],
      ['/estudios-andinos-demo', {}],
      [`/${MARCA}-no-existe`, {}],
      ['/admin/login', {}],
      ['/admin', { ...auth }],
      ['/api/grupos?limit=1', {}],
      ['/api/usuarios/me', { ...auth }],
      ['/api/media/file/no-existe.png', {}],
    ]
    for (const [ruta, cab] of rutas) {
      const r = await fetch(BASE + ruta, { headers: cab, redirect: 'manual' })
      const faltan = esperadas.filter(([k, re]) => !re.test(r.headers.get(k) ?? '')).map(([k]) => k)
      ok(
        `${ruta} (HTTP ${r.status}): todas las cabeceras y sin X-Powered-By`,
        faltan.length === 0 && !r.headers.has('x-powered-by'),
        faltan.length ? `faltan: ${faltan.join(', ')}` : (r.headers.get('x-powered-by') ?? ''),
      )
    }
  }

  if (seccion('rest')) {
    console.log('REST por canal (subfase 2b): un anónimo solo recibe archivos públicos; la Local API del sitio no cambia')
    // Grupo A: el de cualquier integrante publicado de la semilla que no sea de B (en la semilla, el subgrupo demo).
    const intL = exigir(
      (
        await payload.find({
          collection: 'integrantes',
          where: { and: [{ grupo: { not_equals: B.id } }, { _status: { equals: 'published' } }] },
          limit: 1,
          depth: 0,
        })
      ).docs[0],
      'un integrante publicado de otro grupo (pnpm seed)',
    )
    const L = { id: exigir(typeof intL.grupo === 'object' ? intL.grupo?.id : intL.grupo, 'el grupo del integrante') }
    const png = await sharp({ create: { width: 8, height: 8, channels: 3, background: { r: 40, g: 40, b: 120 } } })
      .png()
      .toBuffer()
    const subir = async (grupo: number, sufijo: string) => {
      const m = await payload.create({
        collection: 'media',
        data: { alt: `${MARCA} ${sufijo}`, grupo },
        file: { data: png, mimetype: 'image/png', name: `${MARCA}-${sufijo}.png`, size: png.length },
      })
      temporales.push({ collection: 'media', id: m.id })
      return m
    }
    // Grupo B (activo): un integrante publicado con retrato (archivo que pasa a público) y un archivo sin usar (privado).
    // Grupo INACTIVO: un integrante publicado; el sitio no lo muestra y la REST tampoco debe.
    const fotoB = await subir(B.id, 'publico')
    const privB = await subir(B.id, 'privado')
    const intB = await payload.create({
      collection: 'integrantes',
      data: { grupo: B.id, nombre: `${MARCA} Publicado B`, foto: fotoB.id, _status: 'published' },
    })
    temporales.push({ collection: 'integrantes', id: intB.id })
    const gI = await payload.create({ collection: 'grupos', data: { nombre: `${MARCA} grupo inactivo (rest)`, slug: `${MARCA}-rest-inactivo`, activo: false } })
    temporales.push({ collection: 'grupos', id: gI.id })
    const fotoI = await subir(gI.id, 'inactivo')
    const intI = await payload.create({ collection: 'integrantes', data: { grupo: gI.id, nombre: `${MARCA} Inactivo`, foto: fotoI.id, _status: 'published' } })
    temporales.push({ collection: 'integrantes', id: intI.id })
    const visibilidad = async (id: number) => (await payload.findByID({ collection: 'media', id, depth: 0, overrideAccess: true })).visibilidad
    ok(
      'preparación: el retrato usado es público y el archivo sin usar, privado',
      (await visibilidad(fotoB.id)) === 'publica' && (await visibilidad(privB.id)) === 'privada',
    )

    const sinSesion = async (metodo: string, ruta: string, cuerpo?: unknown) => {
      const r = await fetch(`${BASE}${ruta}`, {
        method: metodo,
        headers: cuerpo === undefined ? {} : json,
        body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
      })
      return { status: r.status, texto: await r.text() }
    }
    /** 403 y sin datos: ni documentos ni nada de lo creado por esta prueba. */
    const sinDatos = (r: { status: number; texto: string }) => r.status === 403 && !r.texto.includes(MARCA) && !r.texto.includes('"docs"')

    // 1. Lectura anónima por REST: denegada en todas las colecciones de contenido, con cualquier parámetro.
    const variantes = (c: string) => [
      `/api/${c}`,
      `/api/${c}/count`,
      `/api/${c}?depth=5&limit=500&draft=true`,
      `/api/${c}?where[grupo][equals]=${B.id}&pagination=false`,
      `/api/${c}?where[grupo.activo][equals]=false&select[id]=true`,
      `/api/${c}?locale=all&sort=-createdAt&page=1&limit=0`,
    ]
    for (const c of ['landing', 'integrantes', 'publicaciones', 'actividades', 'eventos', 'grupos', 'media']) {
      const malas = []
      for (const ruta of variantes(c)) {
        const r = await sinSesion('GET', ruta)
        if (!sinDatos(r)) malas.push(`${ruta} → ${r.status}`)
      }
      ok(`anónimo, REST: ${c} (lista, count, depth, where, select, draft) → 403 sin datos`, malas.length === 0, malas.join('; '))
    }
    const porId: [string, number][] = [
      ['integrantes', intB.id],
      ['integrantes', intI.id],
      ['integrantes', intL.id],
      ['grupos', B.id],
      ['grupos', gI.id],
      ['media', fotoB.id],
      ['media', privB.id],
    ]
    const malasId = []
    for (const [c, id] of porId) {
      const r = await sinSesion('GET', `/api/${c}/${id}?depth=3`)
      if (!sinDatos(r)) malasId.push(`${c}/${id} → ${r.status}`)
    }
    ok('anónimo, REST: documentos por id conocido (de B, del grupo inactivo y de A) → 403 sin datos', malasId.length === 0, malasId.join('; '))
    const internas = []
    for (const c of ['usuarios', 'mensajes', 'registro-cambios', 'payload-locked-documents', 'payload-kv', 'payload-preferences']) {
      const r = await sinSesion('GET', `/api/${c}?limit=500`)
      if (!sinDatos(r)) internas.push(`${c} → ${r.status}`)
    }
    ok('anónimo, REST: cuentas, mensajes, registro y colecciones internas → 403', internas.length === 0, internas.join('; '))
    // Payload omite las colecciones sin ningún permiso (o la deja sin `read`): solo cuenta un `read` concedido.
    const acceso =
      (JSON.parse((await sinSesion('GET', '/api/access')).texto) as { collections?: Record<string, { read?: boolean | { permission?: boolean } }> })
        .collections ?? {}
    const leibles = Object.entries(acceso)
      .filter(([, p]) => p.read === true || (typeof p.read === 'object' && p.read.permission === true))
      .map(([c]) => c)
    ok('anónimo: /api/access no concede lectura de ninguna colección (coherente con lo anterior)', leibles.length === 0, leibles.join(', '))
    const me = JSON.parse((await sinSesion('GET', '/api/usuarios/me')).texto) as { user?: unknown }
    ok('anónimo: /api/usuarios/me → sin usuario', me.user === null)

    // 2. Escrituras anónimas: rechazadas y sin efecto en la base.
    const cuenta = async () =>
      JSON.stringify(
        await Promise.all(
          (['integrantes', 'grupos', 'usuarios', 'media', 'landing'] as const).map(
            async (c) => (await payload.count({ collection: c, overrideAccess: true })).totalDocs,
          ),
        ),
      )
    const antes = { n: await cuenta(), intB: await foto('integrantes', intB.id), reg: await registros() }
    const escrituras: [string, string, unknown?][] = [
      ['POST', '/api/integrantes', { nombre: `${MARCA} intruso`, grupo: B.id, _status: 'published' }],
      ['PATCH', `/api/integrantes/${intB.id}`, { nombre: 'Cambiado por un anónimo' }],
      ['PATCH', `/api/integrantes?where[grupo][equals]=${B.id}`, { nombre: 'Cambio masivo' }],
      ['DELETE', `/api/integrantes/${intB.id}`],
      ['DELETE', `/api/integrantes?where[id][equals]=${intB.id}`],
      ['POST', '/api/grupos', { nombre: `${MARCA} intruso`, slug: `${MARCA}-intruso` }],
      ['PATCH', `/api/grupos/${B.id}`, { activo: false }],
      ['DELETE', `/api/grupos/${gI.id}`],
      ['POST', '/api/landing', { grupo: B.id, nombre: 'x' }],
      ['PATCH', `/api/media/${fotoB.id}`, { alt: 'Cambiado' }],
      ['POST', '/api/usuarios', { email: `${MARCA}-intruso@plataforma.local`, password: 'x'.repeat(20), roles: ['superadmin'] }],
      ['PATCH', `/api/usuarios/${editor.id}`, { roles: ['superadmin'] }],
      ['POST', `/api/integrantes/${intB.id}/duplicate`, {}],
    ]
    const malasW = []
    for (const [metodo, ruta, cuerpo] of escrituras) {
      const r = await sinSesion(metodo, ruta, cuerpo)
      if (r.status < 400 || r.status >= 500) malasW.push(`${metodo} ${ruta} → ${r.status}`)
    }
    ok('anónimo, REST: crear, editar, borrar, duplicar y cambiar roles → 4xx', malasW.length === 0, malasW.join('; '))
    const roles = (await payload.findByID({ collection: 'usuarios', id: editor.id, depth: 0, overrideAccess: true })).roles
    ok(
      'anónimo, REST: la base no cambió (recuentos, documento, registro de cambios y rol del editor)',
      (await cuenta()) === antes.n &&
        (await foto('integrantes', intB.id)) === antes.intB &&
        (await registros()) === antes.reg &&
        JSON.stringify(roles) === '["editor"]',
    )

    // 3. La Local API del sitio (lib/cms: anónima, overrideAccess false) sigue leyendo lo publicado, y nada más.
    const local = (
      await payload.find({ collection: 'integrantes', overrideAccess: false, draft: true, where: { grupo: { equals: B.id } }, limit: 500, depth: 1 })
    ).docs
    ok(
      'Local API anónima: lee los integrantes publicados de B (control positivo), sin borradores',
      local.some((d) => d.id === intB.id) && local.every((d) => d._status === 'published'),
    )
    const gruposLocal = (await payload.find({ collection: 'grupos', overrideAccess: false, limit: 1000, depth: 0 })).docs
    ok('Local API anónima: grupos activos sí, el inactivo no', gruposLocal.some((g) => g.id === B.id) && !gruposLocal.some((g) => g.id === gI.id))
    const mediaLocal = (await payload.find({ collection: 'media', overrideAccess: false, limit: 1000, depth: 0 })).docs
    ok(
      'Local API anónima: el archivo público sí; el privado y el del grupo inactivo, no',
      mediaLocal.some((m) => m.id === fotoB.id) && !mediaLocal.some((m) => m.id === privB.id || m.id === fotoI.id),
    )
    const retrato = local.find((d) => d.id === intB.id)?.foto
    ok('Local API anónima: el retrato público llega poblado (la página puede pintarlo)', typeof retrato === 'object' && retrato?.visibilidad === 'publica')

    // 4. Archivos servidos por /api/media/file/.
    const archivo = async (nombre: string, cab: Record<string, string> = {}) => {
      const r = await fetch(`${BASE}/api/media/file/${nombre}`, { headers: cab })
      return { status: r.status, tipo: r.headers.get('content-type') ?? '', cuerpo: await r.text() }
    }
    const pub = await archivo(encodeURIComponent(exigir(fotoB.filename, 'el nombre del archivo público')))
    ok(
      'archivo público (lo usa contenido publicado): 200 como imagen, sin sesión',
      pub.status === 200 && pub.tipo.startsWith('image/png'),
      `HTTP ${pub.status} ${pub.tipo}`,
    )
    const priv = await archivo(encodeURIComponent(exigir(privB.filename, 'el nombre del archivo privado')))
    ok('archivo privado: no se sirve a un anónimo', priv.status === 403 || priv.status === 404, `HTTP ${priv.status}`)
    const privConSesion = await archivo(encodeURIComponent(exigir(privB.filename, 'el nombre del archivo privado')), auth)
    ok('archivo privado: el editor de su grupo sí lo ve (control positivo)', privConSesion.status === 200, `HTTP ${privConSesion.status}`)
    const huerfano = `${MARCA}-huerfano.png`
    writeFileSync(path.join(carpetaMedia(), huerfano), png)
    const sinRegistro = await archivo(huerfano)
    ok(
      'archivo en disco sin registro en la base: no se sirve a un anónimo',
      sinRegistro.status === 403 || sinRegistro.status === 404,
      `HTTP ${sinRegistro.status}`,
    )
    const manipuladas = [
      `${MARCA}-no-existe.png`,
      '..%2F..%2Fpackage.json',
      '..%5C..%5Cpackage.json',
      '%2e%2e%2f%2e%2e%2fpackage.json',
      `${encodeURIComponent(exigir(privB.filename, 'el nombre'))}%00.png`,
      encodeURIComponent(exigir(privB.filename, 'el nombre').toUpperCase()),
    ]
    const malasF = []
    for (const n of manipuladas) {
      const r = await archivo(n)
      if (r.status < 400 || r.status >= 500 || r.cuerpo.includes('plataforma-landings') || r.tipo.startsWith('image/')) malasF.push(`${n} → ${r.status}`)
    }
    ok('archivos: inexistente, traversal (../, ..\\, codificado), byte nulo y mayúsculas → 4xx sin contenido', malasF.length === 0, malasF.join('; '))
    const nuloConSesion = await archivo(`${encodeURIComponent(exigir(privB.filename, 'el nombre'))}%00.png`, auth)
    ok('archivos: byte nulo con sesión → 4xx (no 500)', nuloConSesion.status >= 400 && nuloConSesion.status < 500, `HTTP ${nuloConSesion.status}`)
    const inactivo = await archivo(encodeURIComponent(exigir(fotoI.filename, 'el nombre')))
    ok(
      'archivo público de un grupo INACTIVO: no se sirve a un anónimo aunque se conozca el nombre',
      (inactivo.status === 403 || inactivo.status === 404) && (await visibilidad(fotoI.id)) === 'publica',
      `HTTP ${inactivo.status}`,
    )
    const inactivoSesion = await archivo(encodeURIComponent(exigir(fotoI.filename, 'el nombre')), auth)
    ok(
      'archivo de un grupo inactivo ajeno: tampoco para el editor de B',
      inactivoSesion.status === 403 || inactivoSesion.status === 404,
      `HTTP ${inactivoSesion.status}`,
    )

    // 5. El sitio no depende de la REST: páginas e imágenes siguen funcionando para un anónimo.
    const paginaB = await fetch(`${BASE}/estudios-andinos-demo`)
    const htmlB = await paginaB.text()
    const imagenes = [...new Set([...htmlB.matchAll(/src="(\/api\/media\/file\/[^"]+)"/g)].map((m) => m[1].replace(/&amp;/g, '&')))]
    const rotas = []
    for (const src of imagenes) if ((await fetch(BASE + src)).status !== 200) rotas.push(src)
    ok(
      'sitio: la landing de B carga y todas sus imágenes responden 200 sin sesión',
      paginaB.status === 200 && rotas.length === 0,
      `HTTP ${paginaB.status}; ${imagenes.length} imágenes${rotas.length ? `; rotas: ${rotas.join(', ')}` : ''}`,
    )
    ok('sitio: el directorio carga', (await fetch(`${BASE}/`)).status === 200)
    ok('sitio: el grupo inactivo no tiene página (404)', (await fetch(`${BASE}/${gI.ruta}`)).status === 404)

    // 6. Con sesión: el editor de B solo ve y toca lo de B, aunque manipule parámetros.
    const deB = (d: { grupo?: unknown }) => (typeof d.grupo === 'object' && d.grupo ? (d.grupo as { id: number }).id : d.grupo) === B.id
    const lista = (await (await fetch(`${BASE}/api/integrantes?depth=3&limit=500&draft=true`, { headers: auth })).json()) as { docs?: { grupo?: unknown }[] }
    ok(
      'editor, REST: con depth=3 y draft solo recibe integrantes de B',
      Array.isArray(lista.docs) && lista.docs.length > 0 && lista.docs.every(deB),
      `${lista.docs?.length ?? 0} docs`,
    )
    const ajenos = (await (await fetch(`${BASE}/api/integrantes?where[grupo][equals]=${L.id}&draft=true`, { headers: auth })).json()) as { totalDocs?: number }
    ok('editor, REST: where[grupo]=A → 0 documentos', ajenos.totalDocs === 0, `totalDocs ${ajenos.totalDocs}`)
    const porIdA = await fetch(`${BASE}/api/integrantes/${intL.id}`, { headers: auth })
    ok('editor, REST: integrante de A por id → 403/404', porIdA.status === 403 || porIdA.status === 404, `HTTP ${porIdA.status}`)
    const gruposEd = (await (await fetch(`${BASE}/api/grupos?limit=1000&depth=0`, { headers: auth })).json()) as { docs?: { id: number }[] }
    ok(
      'editor, REST: en grupos solo ve el suyo (ni A ni el inactivo)',
      Array.isArray(gruposEd.docs) && gruposEd.docs.length > 0 && gruposEd.docs.every((g) => g.id === B.id),
      (gruposEd.docs ?? []).map((g) => g.id).join(','),
    )
    await fetch(`${BASE}/api/usuarios/${editor.id}`, {
      method: 'PATCH',
      headers: { ...auth, ...json },
      body: JSON.stringify({ roles: ['superadmin'], grupos: [{ grupo: B.id }, { grupo: L.id }] }),
    })
    const yo = await payload.findByID({ collection: 'usuarios', id: editor.id, depth: 0, overrideAccess: true })
    const susGrupos = (yo.grupos ?? []).map((g) => (typeof g.grupo === 'object' ? g.grupo?.id : g.grupo))
    ok(
      'editor, REST: no se da rol de superadmin ni se añade otro grupo',
      JSON.stringify(yo.roles) === '["editor"]' && JSON.stringify(susGrupos) === JSON.stringify([B.id]),
      `${JSON.stringify(yo.roles)} ${JSON.stringify(susGrupos)}`,
    )
    const adminEd = []
    for (const [metodo, ruta, cuerpo] of [
      ['GET', '/api/registro-cambios?limit=1', undefined],
      ['POST', '/api/grupos', { nombre: `${MARCA} x`, slug: `${MARCA}-x` }],
      ['PATCH', `/api/grupos/${B.id}`, { activo: false }],
      ['POST', '/api/usuarios', { email: `${MARCA}-otro@plataforma.local`, password: 'x'.repeat(20) }],
      ['DELETE', `/api/mensajes?where[grupo][equals]=${B.id}`, undefined],
    ] as const) {
      const r = await fetch(`${BASE}${ruta}`, { method: metodo, headers: { ...auth, ...json }, body: cuerpo ? JSON.stringify(cuerpo) : undefined })
      const t = await r.text()
      const vacio = metodo === 'DELETE' && r.status === 200 && (JSON.parse(t) as { docs?: unknown[] }).docs?.length === 0
      if (r.status !== 403 && !vacio) adminEd.push(`${metodo} ${ruta} → ${r.status}`)
    }
    ok('editor, REST: registro, alta y cambio de grupos, alta de usuarios y borrado de mensajes → denegados', adminEd.length === 0, adminEd.join('; '))
    ok('editor, REST: B sigue activo', (await payload.findByID({ collection: 'grupos', id: B.id, depth: 0, overrideAccess: true })).activo === true)

    // 7. Superadmin (temporal) y cuenta sin grupos.
    const claveSA = randomBytes(18).toString('hex')
    const sa = await payload.create({ collection: 'usuarios', data: { email: `${MARCA}-sa@plataforma.local`, password: claveSA, roles: ['superadmin'] } })
    temporales.push({ collection: 'usuarios', id: sa.id })
    const tokenSA = (
      (await (
        await fetch(`${BASE}/api/usuarios/login`, { method: 'POST', headers: json, body: JSON.stringify({ email: sa.email, password: claveSA }) })
      ).json()) as { token?: string }
    ).token
    const authSA = { Authorization: `JWT ${tokenSA}` }
    const inactivoSA = (await (await fetch(`${BASE}/api/grupos?where[id][equals]=${gI.id}`, { headers: authSA })).json()) as { totalDocs?: number }
    const regSA = await fetch(`${BASE}/api/registro-cambios?limit=1`, { headers: authSA })
    ok('superadmin, REST: ve el grupo inactivo y el registro de cambios', inactivoSA.totalDocs === 1 && regSA.status === 200, `registro HTTP ${regSA.status}`)
    const claveSG = randomBytes(18).toString('hex')
    const sg = await payload.create({
      collection: 'usuarios',
      data: { email: `${MARCA}-sg@plataforma.local`, password: claveSG, roles: ['editor'], grupos: [] },
    })
    temporales.push({ collection: 'usuarios', id: sg.id })
    const tokenSG = (
      (await (
        await fetch(`${BASE}/api/usuarios/login`, { method: 'POST', headers: json, body: JSON.stringify({ email: sg.email, password: claveSG }) })
      ).json()) as { token?: string }
    ).token
    const authSG = { Authorization: `JWT ${tokenSG}`, ...json }
    const verSG = await fetch(`${BASE}/api/integrantes?draft=true&limit=500`, { headers: authSG })
    const verSGjson = (await verSG.json()) as { docs?: unknown[] }
    const crearSG = await fetch(`${BASE}/api/integrantes`, {
      method: 'POST',
      headers: authSG,
      body: JSON.stringify({ nombre: `${MARCA} sin grupo`, grupo: B.id }),
    })
    ok(
      'cuenta sin grupos, REST: no lee ni crea contenido',
      (verSG.status === 403 || (verSG.status === 200 && verSGjson.docs?.length === 0)) && crearSG.status === 403,
      `leer ${verSG.status}, crear ${crearSG.status}`,
    )

    // 8. Autenticación: sin diferencias que permitan enumerar cuentas; el cierre de sesión invalida el token.
    const intento = async (ruta: string, cuerpo: unknown) => {
      const r = await fetch(`${BASE}/api/usuarios/${ruta}`, { method: 'POST', headers: json, body: JSON.stringify(cuerpo) })
      return `${r.status} ${(await r.text()).replace(new RegExp(`${MARCA}[^"]*`, 'g'), '«correo»')}`
    }
    const incorrecta = randomBytes(12).toString('hex')
    const loginExiste = await intento('login', { email: sg.email, password: incorrecta })
    const loginNoExiste = await intento('login', { email: `${MARCA}-nadie@plataforma.local`, password: incorrecta })
    ok('login fallido: misma respuesta con correo existente e inexistente', loginExiste === loginNoExiste, loginExiste.slice(0, 80))
    const olvidoExiste = await intento('forgot-password', { email: sg.email })
    const olvidoNoExiste = await intento('forgot-password', { email: `${MARCA}-nadie@plataforma.local` })
    ok('recuperar contraseña: misma respuesta con correo existente e inexistente', olvidoExiste === olvidoNoExiste, olvidoExiste.slice(0, 80))
    const salir = await fetch(`${BASE}/api/usuarios/logout`, { method: 'POST', headers: authSG })
    const tras = (await (await fetch(`${BASE}/api/usuarios/me`, { headers: authSG })).json()) as { user?: unknown }
    ok('logout: 200 y el token deja de valer', salir.status === 200 && tras.user === null, `HTTP ${salir.status}`)
  }

  if (seccion('usuarios')) {
    console.log('Cuentas y mensajes (subfase 2c): un editor solo ve su cuenta y los mensajes de sus grupos; el superadmin, todo')
    // Datos sintéticos propios: dos grupos nuevos (A y B), siete cuentas y tres mensajes. Nada de la semilla.
    const nuevoGrupo = async (sufijo: string) => {
      const g = await payload.create({ collection: 'grupos', data: { nombre: `${MARCA} grupo ${sufijo} (usuarios)`, slug: `${MARCA}-usr-${sufijo}` } })
      temporales.push({ collection: 'grupos', id: g.id })
      return g
    }
    const GA = await nuevoGrupo('a')
    const GB = await nuevoGrupo('b')
    const claves = new Map<number, string>()
    const nuevaCuenta = async (sufijo: string, roles: ('editor' | 'superadmin')[], grupos: number[]) => {
      const clave = randomBytes(18).toString('hex')
      const u = await payload.create({
        collection: 'usuarios',
        data: { email: `${MARCA}-usr-${sufijo}@plataforma.local`, password: clave, roles, grupos: grupos.map((grupo) => ({ grupo })) },
      })
      temporales.push({ collection: 'usuarios', id: u.id })
      claves.set(u.id, clave)
      return u
    }
    const a1 = await nuevaCuenta('a1', ['editor'], [GA.id])
    const a2 = await nuevaCuenta('a2', ['editor'], [GA.id])
    const b1 = await nuevaCuenta('b1', ['editor'], [GB.id])
    const ab = await nuevaCuenta('ab', ['editor'], [GA.id, GB.id])
    const sinGrupos = await nuevaCuenta('sin-grupos', ['editor'], [])
    const bloqueada = await nuevaCuenta('bloqueada', ['editor'], [GA.id])
    // Superadmin CON un grupo asignado: antes de la 2c, los editores de ese grupo leían su cuenta (H16).
    const sa = await nuevaCuenta('sa', ['superadmin'], [GA.id])
    const cuentas = [a1, a2, b1, ab, sinGrupos, bloqueada, sa]
    const correos = cuentas.map((u) => u.email)
    const nuevoMensaje = async (grupo: number, estado: 'nuevo' | 'atendido', sufijo: string) => {
      const m = await payload.create({
        collection: 'mensajes',
        data: {
          grupo,
          estado,
          nombre: `${MARCA} Remitente ${sufijo}`,
          correo: `remitente-${sufijo}@ejemplo.invalid`,
          institucion: 'Institución ficticia',
          tipo: 'Consulta',
          mensaje: `Mensaje ficticio ${sufijo}`,
        },
      })
      temporales.push({ collection: 'mensajes', id: m.id })
      return m
    }
    const mA1 = await nuevoMensaje(GA.id, 'nuevo', 'a1')
    const mA2 = await nuevoMensaje(GA.id, 'atendido', 'a2')
    const mB1 = await nuevoMensaje(GB.id, 'nuevo', 'b1')
    // Bloqueos de edición del panel (payload-locked-documents): guardan una relación con la cuenta que edita.
    const nuevoBloqueo = async (grupo: number, usuario: number, sufijo: string) => {
      const i = await payload.create({ collection: 'integrantes', data: { grupo, nombre: `${MARCA} Integrante ${sufijo}` }, draft: true })
      temporales.push({ collection: 'integrantes', id: i.id })
      const l = await payload.create({
        collection: 'payload-locked-documents',
        data: { document: { relationTo: 'integrantes', value: i.id }, user: { relationTo: 'usuarios', value: usuario } },
      })
      temporales.push({ collection: 'payload-locked-documents', id: l.id })
      return l
    }
    const lockA = await nuevoBloqueo(GA.id, a2.id, 'a')
    const lockB = await nuevoBloqueo(GB.id, b1.id, 'b')

    type Cab = Record<string, string>
    type Respuesta = { status: number; texto: string; datos: { docs?: { id: number }[]; totalDocs?: number; user?: { id?: number } | null } | null }
    const pedir = async (cab: Cab | null, metodo: string, ruta: string, cuerpo?: unknown): Promise<Respuesta> => {
      const r = await fetch(`${BASE}${ruta}`, {
        method: metodo,
        headers: { ...(cab ?? {}), ...(cuerpo === undefined ? {} : json) },
        body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
      })
      const texto = await r.text()
      let datos: Respuesta['datos'] = null
      try {
        datos = JSON.parse(texto) as Respuesta['datos']
      } catch {
        // respuesta no JSON (p. ej. 404 de Next)
      }
      return { status: r.status, texto, datos }
    }
    const ids = (r: Respuesta) => (r.datos?.docs ?? []).map((d) => d.id)
    const idDe = (v: unknown) => (v && typeof v === 'object' ? (v as { id: number }).id : ((v as number | null | undefined) ?? null))
    const denegada = (r: Respuesta) => r.status === 403 || r.status === 404 || r.status === 401
    /** Ningún correo de las cuentas de prueba salvo, si se indica, el de quien pregunta. */
    const sinCorreosAjenos = (texto: string, propio?: string) => correos.every((c) => c === propio || !texto.includes(c))
    const OCULTOS = ['hash', 'salt', 'resetPasswordToken', 'resetPasswordExpiration', 'loginAttempts', 'lockUntil', 'apiKey', 'enableAPIKey']
    const sinOcultos = (texto: string) => OCULTOS.every((k) => !texto.includes(`"${k}"`))
    const entrar = async (u: { id: number; email: string }, clave = claves.get(u.id)) => {
      const r = await fetch(`${BASE}/api/usuarios/login`, { method: 'POST', headers: json, body: JSON.stringify({ email: u.email, password: clave }) })
      return { status: r.status, token: ((await r.json()) as { token?: string }).token }
    }
    const sesion = async (u: { id: number; email: string }) => ({ Authorization: `JWT ${exigir((await entrar(u)).token, `la sesión de la cuenta ${u.id}`)}` })
    const fotoCuentas = async () =>
      JSON.stringify(
        await Promise.all(
          cuentas.map(async (u) => {
            const d = (await payload.findByID({
              collection: 'usuarios',
              id: u.id,
              depth: 0,
              overrideAccess: true,
              showHiddenFields: true,
            })) as unknown as Record<string, unknown>
            const grupos = ((d.grupos ?? []) as { grupo: unknown }[]).map((g) => (typeof g.grupo === 'object' ? (g.grupo as { id: number }).id : g.grupo))
            return [d.email, d.roles, grupos, d.hash, d.salt, d.loginAttempts, d.lockUntil, d.resetPasswordToken]
          }),
        ),
      )
    // Sin `updatedAt`: un PATCH del editor sobre un mensaje de su grupo es una actualización permitida y Payload la sella,
    // aunque descarte los campos protegidos. Lo que importa es el resto.
    const fotoMensajes = async () =>
      JSON.stringify(await Promise.all([mA1, mA2, mB1].map(async (m) => JSON.stringify({ ...JSON.parse(await foto('mensajes', m.id)), updatedAt: undefined }))))
    /** Campos que difieren entre dos fotos de los mensajes (para explicar un fallo). */
    const difieren = (a: string, b: string) => {
      const [x, y] = [a, b].map((f) => (JSON.parse(f) as string[]).map((d) => JSON.parse(d) as Record<string, unknown>))
      return x
        .flatMap((d, i) =>
          Object.keys(d)
            .filter((k) => JSON.stringify(d[k]) !== JSON.stringify(y[i]?.[k]))
            .map((k) => `${i}.${k}`),
        )
        .join(',')
    }
    const estaBloqueada = async () => {
      const d = (await payload.findByID({ collection: 'usuarios', id: bloqueada.id, depth: 0, overrideAccess: true, showHiddenFields: true })) as {
        lockUntil?: string | null
      }
      return Boolean(d.lockUntil && new Date(d.lockUntil) > new Date())
    }
    const incorrecta = randomBytes(12).toString('hex')
    for (let i = 0; i < 5; i++) await entrar(bloqueada, incorrecta)
    ok(
      'preparación: la cuenta «bloqueada» quedó bloqueada tras 5 intentos fallidos y no entra ni con su clave',
      (await estaBloqueada()) && (await entrar(bloqueada)).status !== 200,
    )

    // 1. Anónimo: nada de cuentas ni mensajes, por ninguna vía.
    const malasAnon = []
    for (const ruta of [
      `/api/usuarios/${a1.id}`,
      `/api/usuarios/${sa.id}?depth=2`,
      `/api/usuarios?where[email][like]=${MARCA}`,
      `/api/usuarios?where[roles][equals]=superadmin&limit=0`,
      `/api/usuarios?where[grupos.grupo][equals]=${GA.id}&select[email]=true&select[roles]=true`,
      `/api/usuarios/count`,
      `/api/mensajes/${mA1.id}?depth=2`,
      `/api/mensajes?where[grupo][equals]=${GA.id}&depth=2`,
      `/api/mensajes?where[estado][equals]=nuevo&select[correo]=true`,
      `/api/mensajes/count`,
      `/api/payload-locked-documents?depth=1`,
      `/api/payload-locked-documents/${lockA.id}?depth=1`,
      `/api/grupos/populate-tenant-options`,
    ]) {
      const r = await pedir(null, 'GET', ruta)
      if (!denegada(r) || !sinCorreosAjenos(r.texto) || r.texto.includes(MARCA)) malasAnon.push(`${ruta} → ${r.status}`)
    }
    ok(
      'anónimo, REST: cuentas, mensajes, bloqueos y grupos asignables (por id, filtros, select, depth, count) → denegado sin datos',
      malasAnon.length === 0,
      malasAnon.join('; '),
    )
    const init = await pedir(null, 'GET', '/api/usuarios/init')
    ok(
      'anónimo: /api/usuarios/init solo dice si existe alguna cuenta (sin datos de cuentas)',
      init.status === 200 && JSON.stringify(Object.keys((init.datos ?? {}) as object)) === '["initialized"]',
      init.texto.slice(0, 60),
    )
    const antesAnon = { c: await fotoCuentas(), m: await fotoMensajes(), n: (await payload.count({ collection: 'usuarios', overrideAccess: true })).totalDocs }
    const malasAnonW = []
    for (const [metodo, ruta, cuerpo] of [
      ['POST', '/api/usuarios/first-register', { email: `${MARCA}-primera@plataforma.local`, password: 'x'.repeat(20) }],
      ['PATCH', `/api/usuarios/${a1.id}`, { email: `${MARCA}-cambiado@plataforma.local` }],
      ['PATCH', `/api/usuarios?where[id][equals]=${a1.id}`, { roles: ['superadmin'] }],
      ['DELETE', `/api/usuarios/${a2.id}`, undefined],
      ['POST', '/api/usuarios/unlock', { email: bloqueada.email }],
      ['POST', '/api/mensajes', { grupo: GA.id, nombre: 'x', correo: 'x@ejemplo.invalid', mensaje: 'x' }],
      ['PATCH', `/api/mensajes/${mA1.id}`, { estado: 'atendido' }],
      ['PATCH', `/api/mensajes?where[grupo][equals]=${GA.id}`, { estado: 'atendido' }],
      ['DELETE', `/api/mensajes/${mB1.id}`, undefined],
      ['DELETE', `/api/payload-locked-documents/${lockA.id}`, undefined],
    ] as const) {
      const r = await pedir(null, metodo, ruta, cuerpo)
      if (r.status < 400 || r.status >= 500) malasAnonW.push(`${metodo} ${ruta} → ${r.status}`)
    }
    ok('anónimo, REST: primera cuenta, editar, borrar, desbloquear, crear y cambiar mensajes → 4xx', malasAnonW.length === 0, malasAnonW.join('; '))
    ok(
      'anónimo, REST: cuentas, mensajes y bloqueo intactos',
      (await fotoCuentas()) === antesAnon.c &&
        (await fotoMensajes()) === antesAnon.m &&
        (await payload.count({ collection: 'usuarios', overrideAccess: true })).totalDocs === antesAnon.n &&
        (await estaBloqueada()),
    )

    // 2. Editores: su cuenta y los mensajes de sus grupos, nada más (también con parámetros manipulados).
    const cab = new Map<number, Cab>()
    for (const u of [a1, a2, b1, ab, sinGrupos, sa]) cab.set(u.id, await sesion(u))
    const comprobarEditor = async (et: string, u: (typeof cuentas)[number], suyos: number[], ajenos: number[], grupoAjeno: number | null) => {
      const c = exigir(cab.get(u.id), 'la sesión')
      const lista = await pedir(c, 'GET', '/api/usuarios?depth=3&limit=500')
      ok(
        `${et}, REST: la lista de cuentas (depth=3) solo trae la suya`,
        lista.status === 200 && JSON.stringify(ids(lista)) === JSON.stringify([u.id]) && sinCorreosAjenos(lista.texto, u.email),
        `ids ${ids(lista).join(',')}`,
      )
      const n = await pedir(c, 'GET', '/api/usuarios/count')
      ok(`${et}, REST: /api/usuarios/count → 1`, n.datos?.totalDocs === 1, `totalDocs ${n.datos?.totalDocs}`)
      const malasF = []
      for (const q of [
        `where[email][like]=${MARCA}`,
        'where[roles][equals]=superadmin',
        `where[grupos.grupo][in]=${GA.id},${GB.id}&select[email]=true&select[roles]=true&select[grupos]=true`,
        `where[or][0][id][exists]=true&where[or][1][email][exists]=true&sort=-createdAt&limit=0`,
        `where[id][in]=${cuentas.map((x) => x.id).join(',')}&depth=2`,
      ]) {
        const r = await pedir(c, 'GET', `/api/usuarios?${q}`)
        if (r.status !== 200 || ids(r).some((id) => id !== u.id) || !sinCorreosAjenos(r.texto, u.email)) malasF.push(`${q} → ${r.status} ${ids(r).join(',')}`)
      }
      ok(`${et}, REST: filtros (correo, rol, grupos, or, ids conocidos) con select y depth → solo su cuenta`, malasF.length === 0, malasF.join('; '))
      const malasId = []
      for (const otra of cuentas.filter((x) => x.id !== u.id)) {
        const r = await pedir(c, 'GET', `/api/usuarios/${otra.id}?depth=2`)
        if (!denegada(r) || !sinCorreosAjenos(r.texto, u.email)) malasId.push(`${otra.email.slice(MARCA.length + 1)} → ${r.status}`)
      }
      ok(`${et}, REST: cada cuenta ajena por id (compañeros, otro grupo, superadmin) → denegada sin datos`, malasId.length === 0, malasId.join('; '))
      const propia = await pedir(c, 'GET', `/api/usuarios/${u.id}?depth=2`)
      const me = await pedir(c, 'GET', '/api/usuarios/me')
      ok(
        `${et}: su cuenta y /me responden, sin campos de autenticación (hash, salt, tokens, intentos, bloqueo)`,
        propia.status === 200 && me.datos?.user?.id === u.id && sinOcultos(propia.texto) && sinOcultos(me.texto),
        `HTTP ${propia.status}`,
      )
      const msj = await pedir(c, 'GET', '/api/mensajes?depth=3&limit=500')
      const vistos = ids(msj)
      ok(
        `${et}, REST: mensajes (depth=3) → los de sus grupos, ninguno ajeno`,
        (suyos.length === 0 ? denegada(msj) || (msj.status === 200 && vistos.length === 0) : msj.status === 200) &&
          suyos.every((id) => vistos.includes(id)) &&
          !ajenos.some((id) => vistos.includes(id)) &&
          sinCorreosAjenos(msj.texto),
        `HTTP ${msj.status}; ${vistos.length} mensajes`,
      )
      if (grupoAjeno !== null) {
        const filtro = await pedir(c, 'GET', `/api/mensajes?where[grupo][equals]=${grupoAjeno}&where[estado][exists]=true`)
        ok(`${et}, REST: where[grupo]=grupo ajeno → 0 mensajes`, ids(filtro).length === 0, `HTTP ${filtro.status}`)
      }
      const malasM = []
      for (const id of ajenos) {
        const r = await pedir(c, 'GET', `/api/mensajes/${id}?depth=2`)
        if (!denegada(r) || r.texto.includes(MARCA)) malasM.push(`${id} → ${r.status}`)
      }
      ok(`${et}, REST: mensajes ajenos por id → denegados`, malasM.length === 0, malasM.join('; '))
      const bloqueos = await pedir(c, 'GET', '/api/payload-locked-documents?depth=1&limit=500')
      ok(
        `${et}, REST: los bloqueos de edición (depth=1) no revelan correos de otras cuentas`,
        sinCorreosAjenos(bloqueos.texto, u.email),
        `HTTP ${bloqueos.status}`,
      )
      return { bloqueos: ids(bloqueos), status: bloqueos.status }
    }
    const vistaA1 = await comprobarEditor('editor A', a1, [mA1.id, mA2.id], [mB1.id], GB.id)
    const vistaB1 = await comprobarEditor('editor B', b1, [mB1.id], [mA1.id, mA2.id], GA.id)
    const vistaAB = await comprobarEditor('editor A+B', ab, [mA1.id, mA2.id, mB1.id], [], null)
    const vistaSG = await comprobarEditor('cuenta sin grupos', sinGrupos, [], [mA1.id, mA2.id, mB1.id], GA.id)

    // Bloqueos de edición: cada editor, solo los de documentos de sus grupos (el panel los necesita para avisar de que
    // otra persona edita el documento); los de otros grupos, ni verlos ni tocarlos.
    ok(
      'bloqueos, REST: el editor A ve el de A y no el de B; el B, al revés; el de A+B, ambos; sin grupos, ninguno (200, no 403)',
      vistaA1.bloqueos.includes(lockA.id) &&
        !vistaA1.bloqueos.includes(lockB.id) &&
        vistaB1.bloqueos.includes(lockB.id) &&
        !vistaB1.bloqueos.includes(lockA.id) &&
        vistaAB.bloqueos.includes(lockA.id) &&
        vistaAB.bloqueos.includes(lockB.id) &&
        vistaSG.status === 200 &&
        vistaSG.bloqueos.length === 0,
      `A: ${vistaA1.bloqueos.join(',')}; B: ${vistaB1.bloqueos.join(',')}; sin grupos HTTP ${vistaSG.status}`,
    )
    const dueno = async (id: number) => {
      const l = await payload.findByID({ collection: 'payload-locked-documents', id, depth: 0, overrideAccess: true }).catch(() => null)
      return l ? idDe(l.user?.value) : null
    }
    const docDe = async (id: number) =>
      idDe((await payload.findByID({ collection: 'payload-locked-documents', id, depth: 0, overrideAccess: true }).catch(() => null))?.document?.value)
    const cA = exigir(cab.get(a1.id), 'la sesión')
    const yoA1 = { user: { relationTo: 'usuarios', value: a1.id } }
    const docB = await docDe(lockB.id)
    const tomarB = await pedir(cA, 'PATCH', `/api/payload-locked-documents/${lockB.id}`, yoA1)
    const crearB = await pedir(cA, 'POST', '/api/payload-locked-documents', { document: { relationTo: 'integrantes', value: docB }, ...yoA1 })
    const creado = (crearB.datos as { doc?: { id?: number } } | null)?.doc?.id
    if (creado) temporales.push({ collection: 'payload-locked-documents', id: creado })
    const borrarB = await pedir(cA, 'DELETE', `/api/payload-locked-documents/${lockB.id}`)
    const masivo = await pedir(cA, 'PATCH', '/api/payload-locked-documents?where[id][exists]=true', yoA1)
    ok(
      'bloqueos, REST: el editor A no toma, no crea, no borra ni cambia en masa el bloqueo de un documento de B',
      denegada(tomarB) && crearB.status === 403 && !creado && denegada(borrarB) && (await dueno(lockB.id)) === b1.id,
      `tomar ${tomarB.status}, crear ${crearB.status}, borrar ${borrarB.status}, masivo ${masivo.status}`,
    )
    // (El PATCH masivo sí pudo tomar el bloqueo de A, que es de su grupo: se compara con el dueño que tenga ahora.)
    const duenoA = await dueno(lockA.id)
    const cederA = await pedir(cA, 'PATCH', `/api/payload-locked-documents/${lockA.id}`, { user: { relationTo: 'usuarios', value: b1.id } })
    const moverA = await pedir(cA, 'PATCH', `/api/payload-locked-documents/${lockA.id}`, {
      document: { relationTo: 'integrantes', value: docB },
    })
    ok(
      'bloqueos, REST: el editor A no asigna un bloqueo a otra cuenta ni lo mueve a otro documento',
      cederA.status === 403 && moverA.status === 403 && (await dueno(lockA.id)) === duenoA && (await docDe(lockA.id)) !== docB,
      `ceder ${cederA.status}, mover ${moverA.status}`,
    )
    // Lo que hace el panel con «Tomar el control» y al salir del documento: PATCH con su usuario y DELETE.
    const tomarA = await pedir(cA, 'PATCH', `/api/payload-locked-documents/${lockA.id}`, yoA1)
    const tomado = (await dueno(lockA.id)) === a1.id
    const liberarA = await pedir(cA, 'DELETE', `/api/payload-locked-documents/${lockA.id}`)
    const liberado = (await dueno(lockA.id)) === null
    if (liberado)
      temporales.splice(
        temporales.findIndex((t) => t.collection === 'payload-locked-documents' && t.id === lockA.id),
        1,
      )
    ok(
      'bloqueos, REST: el editor A toma el bloqueo de un compañero de A y lo libera (flujo del panel)',
      tomarA.status === 200 && tomado && liberarA.status === 200 && liberado,
      `tomar ${tomarA.status}, liberar ${liberarA.status}`,
    )
    const bloqueosSA = await pedir(exigir(cab.get(sa.id), 'la sesión'), 'GET', '/api/payload-locked-documents?limit=500')
    ok('bloqueos, REST: el superadmin ve los de todos los grupos', ids(bloqueosSA).includes(lockB.id), `HTTP ${bloqueosSA.status}`)
    const opciones = async (u: { id: number }) =>
      (((await pedir(exigir(cab.get(u.id), 'la sesión'), 'GET', '/api/grupos/populate-tenant-options')).datos ?? {}) as { tenantOptions?: { value: number }[] })
        .tenantOptions ?? []
    const opA1 = (await opciones(a1)).map((o) => o.value)
    const opSG = await opciones(sinGrupos)
    const opSA = (await opciones(sa)).map((o) => o.value)
    ok(
      'selector de grupo: el editor A solo puede elegir A; la cuenta sin grupos, ninguno; el superadmin, A y B',
      JSON.stringify(opA1) === JSON.stringify([GA.id]) && opSG.length === 0 && opSA.includes(GA.id) && opSA.includes(GB.id),
      `A: ${opA1.join(',')}; sin grupos: ${opSG.length}`,
    )

    // 3. Escrituras de un editor sobre cuentas y mensajes: ninguna cambia nada que no le toque.
    const cA1 = exigir(cab.get(a1.id), 'la sesión')
    const antesEd = { c: await fotoCuentas(), m: await fotoMensajes(), n: (await payload.count({ collection: 'usuarios', overrideAccess: true })).totalDocs }
    const malasEd = []
    for (const [metodo, ruta, cuerpo] of [
      ['PATCH', `/api/usuarios/${a1.id}`, { roles: ['superadmin'] }],
      ['PATCH', `/api/usuarios/${a1.id}`, { grupos: [{ grupo: GA.id }, { grupo: GB.id }] }],
      ['PATCH', `/api/usuarios/${a1.id}`, { grupos: [] }],
      ['PATCH', `/api/usuarios/${a1.id}`, { grupos: [{ grupo: GB.id }] }],
      ['PATCH', `/api/usuarios/${a1.id}`, { loginAttempts: 99, lockUntil: '2100-01-01T00:00:00.000Z', hash: 'x', salt: 'x', resetPasswordToken: 'x' }],
      ['PUT', `/api/usuarios/${a1.id}`, { roles: ['superadmin'] }],
      ['PATCH', `/api/usuarios/${a2.id}`, { email: `${MARCA}-robada@plataforma.local`, roles: ['superadmin'] }],
      ['PATCH', `/api/usuarios/${a2.id}`, { password: randomBytes(12).toString('hex') }],
      ['PATCH', `/api/usuarios/${b1.id}`, { grupos: [{ grupo: GA.id }] }],
      ['PATCH', `/api/usuarios/${sa.id}`, { roles: ['editor'] }],
      ['PATCH', `/api/usuarios?where[id][in]=${a2.id},${b1.id},${sa.id}`, { roles: ['editor'], grupos: [] }],
      ['PATCH', `/api/usuarios?where[email][like]=${MARCA}`, { roles: ['superadmin'] }],
      ['DELETE', `/api/usuarios/${a2.id}`, undefined],
      ['DELETE', `/api/usuarios?where[email][like]=${MARCA}`, undefined],
      ['POST', '/api/usuarios', { email: `${MARCA}-nueva@plataforma.local`, password: 'x'.repeat(20), roles: ['editor'], grupos: [{ grupo: GA.id }] }],
      ['POST', '/api/usuarios/unlock', { email: bloqueada.email }],
      ['POST', `/api/usuarios/${a2.id}/api-key/reveal`, {}],
      ['PATCH', `/api/mensajes/${mB1.id}`, { estado: 'atendido' }],
      ['PATCH', `/api/mensajes?where[grupo][equals]=${GB.id}`, { estado: 'atendido' }],
      ['PATCH', `/api/mensajes?where[id][in]=${mA1.id},${mB1.id}`, { grupo: GB.id }],
      ['PATCH', `/api/mensajes/${mA1.id}`, { grupo: GB.id }],
      ['PATCH', `/api/mensajes/${mA1.id}`, { correo: 'otro@ejemplo.invalid', createdAt: '2000-01-01T00:00:00.000Z' }],
      ['DELETE', `/api/mensajes/${mB1.id}`, undefined],
      ['DELETE', `/api/mensajes/${mA1.id}`, undefined],
      ['DELETE', `/api/mensajes?where[grupo][in]=${GA.id},${GB.id}`, undefined],
      ['POST', '/api/mensajes', { grupo: GA.id, nombre: 'x', correo: 'x@ejemplo.invalid', mensaje: 'x' }],
      ['POST', `/api/mensajes/${mA1.id}/duplicate`, {}],
    ] as const) {
      const r = await pedir(cA1, metodo, ruta, cuerpo)
      if (r.status >= 500 || !sinCorreosAjenos(r.texto, a1.email)) malasEd.push(`${metodo} ${ruta.replace(MARCA, '…')} → ${r.status}`)
    }
    ok('editor A, REST: 27 escrituras sobre cuentas y mensajes → sin errores 5xx ni correos ajenos en la respuesta', malasEd.length === 0, malasEd.join('; '))
    const despuesC = await fotoCuentas()
    const despuesM = await fotoMensajes()
    ok(
      'editor A, REST: ninguna cuenta cambió (rol, grupos, correo, hash, sal, intentos, bloqueo, token) y no hay cuentas nuevas',
      despuesC === antesEd.c && (await payload.count({ collection: 'usuarios', overrideAccess: true })).totalDocs === antesEd.n,
    )
    ok(
      'editor A, REST: ningún mensaje cambió ni desapareció (grupo, estado, datos del remitente, fecha)',
      despuesM === antesEd.m,
      difieren(antesEd.m, despuesM),
    )
    ok('editor A, REST: no desbloquea la cuenta bloqueada de su grupo', await estaBloqueada())

    // 4. Lo que el editor sí puede hacer: atender un mensaje de su grupo y cambiar su propia contraseña.
    const atender = await pedir(cA1, 'PATCH', `/api/mensajes/${mA1.id}`, { estado: 'atendido' })
    ok(
      'editor A, REST: marca como atendido un mensaje de su grupo (solo cambia el estado)',
      atender.status === 200 && (await payload.findByID({ collection: 'mensajes', id: mA1.id, depth: 0, overrideAccess: true })).estado === 'atendido',
      `HTTP ${atender.status}`,
    )
    const nueva = randomBytes(18).toString('hex')
    const cambio = await pedir(cA1, 'PATCH', `/api/usuarios/${a1.id}`, { password: nueva })
    ok(
      'editor A, REST: cambia su propia contraseña y entra con la nueva (no con la anterior)',
      cambio.status === 200 && (await entrar(a1, nueva)).status === 200 && (await entrar(a1)).status !== 200,
      `HTTP ${cambio.status}`,
    )
    claves.set(a1.id, nueva)

    // 5. Superadmin: administra cuentas, grupos y mensajes de todos.
    const cSA = exigir(cab.get(sa.id), 'la sesión')
    const todasSA = await pedir(cSA, 'GET', `/api/usuarios?where[email][like]=${MARCA}&limit=500&depth=1`)
    ok(
      'superadmin, REST: ve todas las cuentas de prueba (de A, de B, sin grupos) sin campos de autenticación',
      cuentas.every((u) => ids(todasSA).includes(u.id)) && sinOcultos(todasSA.texto),
      `${ids(todasSA).length} cuentas`,
    )
    const reasignar = await pedir(cSA, 'PATCH', `/api/usuarios/${b1.id}`, { roles: ['editor'], grupos: [{ grupo: GA.id }, { grupo: GB.id }] })
    const b1tras = await payload.findByID({ collection: 'usuarios', id: b1.id, depth: 0, overrideAccess: true })
    ok(
      'superadmin, REST: cambia los grupos de una cuenta',
      reasignar.status === 200 &&
        JSON.stringify((b1tras.grupos ?? []).map((g) => (typeof g.grupo === 'object' ? g.grupo?.id : g.grupo))) === JSON.stringify([GA.id, GB.id]),
      `HTTP ${reasignar.status}`,
    )
    const ascender = await pedir(cSA, 'PATCH', `/api/usuarios/${a2.id}`, { roles: ['superadmin'] })
    const devolver = await pedir(cSA, 'PATCH', `/api/usuarios/${a2.id}`, { roles: ['editor'] })
    ok(
      'superadmin, REST: cambia el rol de una cuenta (y lo devuelve)',
      ascender.status === 200 &&
        devolver.status === 200 &&
        JSON.stringify((await payload.findByID({ collection: 'usuarios', id: a2.id, depth: 0, overrideAccess: true })).roles) === '["editor"]',
    )
    const msjSA = await pedir(cSA, 'GET', `/api/mensajes?where[grupo][in]=${GA.id},${GB.id}&limit=500`)
    const atenderSA = await pedir(cSA, 'PATCH', `/api/mensajes/${mB1.id}`, { estado: 'atendido' })
    ok(
      'superadmin, REST: ve los mensajes de A y B y atiende uno de B',
      [mA1.id, mA2.id, mB1.id].every((id) => ids(msjSA).includes(id)) &&
        atenderSA.status === 200 &&
        (await payload.findByID({ collection: 'mensajes', id: mB1.id, depth: 0, overrideAccess: true })).estado === 'atendido',
    )
    const desbloquear = await pedir(cSA, 'POST', '/api/usuarios/unlock', { email: bloqueada.email })
    ok(
      'superadmin, REST: desbloquea la cuenta y esta vuelve a entrar con su clave',
      desbloquear.status === 200 && !(await estaBloqueada()) && (await entrar(bloqueada)).status === 200,
      `HTTP ${desbloquear.status}`,
    )

    // 6. Autenticación: un token de recuperación inventado no sirve; la sesión propia se cierra.
    const reset = await pedir(null, 'POST', '/api/usuarios/reset-password', {
      token: randomBytes(20).toString('hex'),
      password: randomBytes(12).toString('hex'),
    })
    ok('restablecer contraseña con un token inventado → 4xx', reset.status >= 400 && reset.status < 500, `HTTP ${reset.status}`)
    const cB1 = exigir(cab.get(b1.id), 'la sesión')
    const salir = await pedir(cB1, 'POST', '/api/usuarios/logout')
    const tras = await pedir(cB1, 'GET', '/api/usuarios/me')
    ok('editor B: logout → 200 y /me deja de reconocer el token', salir.status === 200 && tras.datos?.user == null, `HTTP ${salir.status}`)
  }

  if (seccion('privilegios')) {
    console.log('Rol de la aplicación (subfase 3b): lee y escribe filas; ni estructura, ni administración, ni otros roles')
    type Cliente = { query: (sql: string) => Promise<{ rows: Record<string, unknown>[] }>; release: () => void }
    const pool = (payload.db as unknown as { pool: { connect: () => Promise<Cliente> } }).pool
    const cliente = await pool.connect()
    /** Ejecuta una sentencia dentro de una transacción que se deshace SIEMPRE; devuelve el código de error o 'ACEPTADA'. */
    const intento = async (sentencia: () => Promise<unknown>) => {
      await cliente.query('BEGIN')
      try {
        await sentencia()
        return 'ACEPTADA'
      } catch (e) {
        return String((e as { code?: string }).code ?? 'sin código')
      } finally {
        await cliente.query('ROLLBACK')
      }
    }
    try {
      const yo = (
        await cliente.query(
          'SELECT current_user AS rol, rolsuper, rolcreaterole, rolcreatedb, rolbypassrls, rolreplication, rolinherit FROM pg_roles WHERE rolname = current_user',
        )
      ).rows[0]
      ok(
        'la app se conecta como plataforma_app, sin SUPERUSER, CREATEROLE, CREATEDB, BYPASSRLS ni REPLICATION, y con NOINHERIT',
        yo?.rol === 'plataforma_app' &&
          [yo.rolsuper, yo.rolcreaterole, yo.rolcreatedb, yo.rolbypassrls, yo.rolreplication, yo.rolinherit].every((v) => v === false),
        String(yo?.rol),
      )
      const prohibidas: [string, () => Promise<unknown>][] = [
        ['CREATE TABLE', () => cliente.query('CREATE TABLE "prueba_3b_app" ("id" integer)')],
        ['ALTER TABLE (añadir columna)', () => cliente.query('ALTER TABLE "grupos" ADD COLUMN "prueba_3b" integer')],
        ['CREATE INDEX', () => cliente.query('CREATE INDEX "prueba_3b_idx" ON "grupos" ("nombre")')],
        ['DROP TABLE', () => cliente.query('DROP TABLE "payload_kv"')],
        ['TRUNCATE', () => cliente.query('TRUNCATE "mensajes"')],
        ['CREATE SCHEMA', () => cliente.query('CREATE SCHEMA "prueba_3b"')],
        ['CREATE TEMP TABLE', () => cliente.query('CREATE TEMP TABLE "prueba_3b_temp" ("id" integer)')],
        ['ALTER TABLE … OWNER TO', () => cliente.query('ALTER TABLE "grupos" OWNER TO plataforma_app')],
        ['CREATE ROLE', () => cliente.query('CREATE ROLE "prueba_3b_rol"')],
        ['ALTER ROLE (darse CREATEDB)', () => cliente.query('ALTER ROLE plataforma_app CREATEDB')],
        ['GRANT plataforma_owner (hacerse miembro del dueño)', () => cliente.query('GRANT plataforma_owner TO plataforma_app')],
        ['SET ROLE plataforma_owner', () => cliente.query('SET ROLE plataforma_owner')],
        ['setval en una secuencia', () => cliente.query(`SELECT setval('grupos_id_seq', 1)`)],
        ['INSERT en payload_migrations', () => cliente.query(`INSERT INTO "payload_migrations" ("name", "batch") VALUES ('prueba_3b', 99)`)],
        ['UPDATE en registro_cambios', () => cliente.query(`UPDATE "registro_cambios" SET "actor" = 'prueba_3b' WHERE false`)],
        ['DELETE en registro_cambios', () => cliente.query('DELETE FROM "registro_cambios" WHERE false')],
      ]
      const aceptadas = []
      for (const [nombre, sentencia] of prohibidas) {
        const r = await intento(sentencia)
        if (r !== '42501') aceptadas.push(`${nombre}: ${r}`)
      }
      // CREATE DATABASE no admite transacción: se intenta tal cual (en una base desechable).
      const base = await cliente.query('CREATE DATABASE "prueba_3b"').then(
        () => 'ACEPTADA',
        (e: { code?: string }) => String(e.code),
      )
      if (base !== '42501') aceptadas.push(`crear una base: ${base}`)
      ok(
        `la app no puede: ${prohibidas.length + 1} operaciones de estructura y administración → permiso denegado (42501)`,
        aceptadas.length === 0,
        aceptadas.join('; '),
      )
      const permitidas = [
        await intento(() => cliente.query('SELECT count(*) FROM "payload_migrations"')),
        await intento(() =>
          cliente.query(
            `INSERT INTO "registro_cambios" ("coleccion", "documento", "operacion", "actor", "updated_at", "created_at") VALUES ('prueba_3b', '0', 'prueba', 'prueba_3b', now(), now())`,
          ),
        ),
        await intento(() => cliente.query(`SELECT nextval('grupos_id_seq')`)),
      ]
      ok(
        'la app sí puede: leer payload_migrations, añadir al registro de cambios y usar secuencias (control positivo, deshecho)',
        permitidas.every((r) => r === 'ACEPTADA'),
        permitidas.join(', '),
      )
    } finally {
      cliente.release()
    }
  }

  if (seccion('archivos')) {
    console.log('Límites de archivos (5a): tamaño por tipo, MIME falso, Local API y cabeceras servidas')
    const MB = 1024 * 1024
    // Grupo y editor temporales propios: las subidas por REST invalidan la caché de su grupo en el servidor, y la del
    // grupo demo debe quedar como la dejan las demás secciones (la limpieza, por la Local API, no puede invalidarla).
    const gA = await payload.create({
      collection: 'grupos',
      data: { nombre: `${MARCA} archivos`, slug: `${MARCA}-archivos`, activo: true },
      overrideAccess: true,
    })
    temporales.push({ collection: 'grupos', id: gA.id })
    const claveA = randomBytes(18).toString('hex')
    const editorA = await payload.create({
      collection: 'usuarios',
      data: { email: `${MARCA}-archivos@plataforma.local`, password: claveA, roles: ['editor'], grupos: [{ grupo: gA.id }] },
    })
    temporales.push({ collection: 'usuarios', id: editorA.id })
    const loginA = await fetch(`${BASE}/api/usuarios/login`, {
      method: 'POST',
      headers: json,
      body: JSON.stringify({ email: editorA.email, password: claveA }),
    })
    const authA = { Authorization: `JWT ${exigir(((await loginA.json()) as { token?: string }).token, 'la sesión del editor de archivos')}` }
    const enMedia = () => (existsSync(carpetaMedia()) ? readdirSync(carpetaMedia()).filter((n) => n.startsWith(`${MARCA}-5a`)) : [])
    // PNG de ruido sin comprimir: el tamaño en bytes queda fijado.
    const pngDe = async (bytes: number) => {
      const lado = Math.ceil(Math.sqrt(bytes / 3))
      return sharp(randomBytes(lado * lado * 3), { raw: { width: lado, height: lado, channels: 3 } })
        .png({ compressionLevel: 0 })
        .toBuffer()
    }
    // PDF mínimo y válido, con relleno en un comentario para llegar al tamaño pedido.
    const pdfDe = (bytes = 0) => {
      const cuerpo =
        '1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj 3 0 obj<</Type/Page/MediaBox[0 0 10 10]/Parent 2 0 R>>endobj\nxref\n0 4\n0000000000 65535 f \ntrailer<</Size 4/Root 1 0 R>>\nstartxref\n0\n%%EOF\n'
      const relleno = Math.max(0, bytes - 12 - cuerpo.length)
      return Buffer.from(`%PDF-1.4\n%${'x'.repeat(relleno)}\n${cuerpo}`)
    }
    const subirREST = async (archivo: Buffer, nombre: string, tipo: string, cab: Record<string, string> = authA, grupo: number = gA.id) => {
      const fd = new FormData()
      fd.append('file', new Blob([new Uint8Array(archivo)], { type: tipo }), nombre)
      fd.append('_payload', JSON.stringify({ alt: `${MARCA} ${nombre}`, grupo }))
      try {
        const r = await fetch(`${BASE}/api/media`, { method: 'POST', headers: cab, body: fd })
        const j = (await r.json().catch(() => ({}))) as {
          doc?: { id: number; filename?: string; grupo?: unknown; sizes?: Record<string, { filename?: string | null } | null> }
          errors?: { message?: string; data?: { errors?: { message?: string }[] } }[]
        }
        if (j.doc?.id) temporales.push({ collection: 'media', id: j.doc.id })
        // Todo el error (el motivo concreto va anidado; la forma puede variar entre REST y Local API).
        const mensaje = j.errors ? JSON.stringify(j.errors) : ''
        return { status: r.status, doc: j.doc, mensaje }
      } catch (e) {
        // El servidor corta la subida al pasar el límite global: el cliente puede ver la conexión cerrada.
        return { status: 0, doc: undefined, mensaje: `conexión cortada: ${(e as Error).message}` }
      }
    }
    const antesMedia = enMedia().length

    // 1. Tamaño por tipo, por REST (editor del grupo demo).
    const r1 = await subirREST(await pngDe(5 * MB - 64 * 1024), `${MARCA}-5a-casi5mb.png`, 'image/png')
    ok('imagen de algo menos de 5 MB: aceptada', r1.status === 201 && Boolean(r1.doc), `HTTP ${r1.status} ${r1.mensaje}`)
    const r2 = await subirREST(await pngDe(6 * MB), `${MARCA}-5a-6mb.png`, 'image/png')
    ok(
      'imagen de 6 MB: rechazada con el límite de imágenes, sin archivo en disco',
      r2.status === 400 && /5 MB/.test(r2.mensaje) && !r2.doc,
      `HTTP ${r2.status} ${r2.mensaje}`,
    )
    const r3 = await subirREST(pdfDe(6 * MB), `${MARCA}-5a-6mb.pdf`, 'application/pdf')
    ok('PDF de 6 MB: aceptado (su límite es 20 MB)', r3.status === 201 && Boolean(r3.doc), `HTTP ${r3.status} ${r3.mensaje}`)
    const r4 = await subirREST(pdfDe(20 * MB + 1024), `${MARCA}-5a-20mb.pdf`, 'application/pdf')
    ok(
      'PDF de más de 20 MB por REST: cortado por el límite global (413), sin documento',
      [0, 413].includes(r4.status) && !r4.doc,
      `HTTP ${r4.status} ${r4.mensaje}`,
    )
    const r5 = await subirREST(await pngDe(6 * MB), `${MARCA}-5a-6mb-declarado.pdf`, 'application/pdf')
    ok(
      'imagen de 6 MB declarada como PDF (para usar el límite de 20 MB): rechazada como imagen',
      r5.status === 400 && /imagen/.test(r5.mensaje) && !r5.doc,
      `HTTP ${r5.status} ${r5.mensaje}`,
    )

    // 2. Tipo por el contenido: MIME falso, extensión no admitida, truncados y vacío.
    const exe = Buffer.concat([Buffer.from('MZ'), Buffer.alloc(62), Buffer.from('PE\0\0'), Buffer.alloc(200)])
    const jpg = await sharp({ create: { width: 64, height: 64, channels: 3, background: '#aa3300' } })
      .jpeg()
      .toBuffer()
    const malos: [string, Buffer, string, string][] = [
      ['.exe renombrado a .jpg', exe, `${MARCA}-5a-exe.jpg`, 'image/jpeg'],
      ['HTML declarado como image/png', Buffer.from('<html><script>alert(1)</script></html>'), `${MARCA}-5a-html.png`, 'image/png'],
      ['texto con extensión .pdf', Buffer.from('no es un pdf'), `${MARCA}-5a-texto.pdf`, 'application/pdf'],
      ['extensión .html', Buffer.from('<html></html>'), `${MARCA}-5a-pagina.html`, 'text/html'],
      ['SVG', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'), `${MARCA}-5a-x.svg`, 'image/svg+xml'],
      ['JPEG truncado', jpg.subarray(0, jpg.length >> 1), `${MARCA}-5a-trunc.jpg`, 'image/jpeg'],
      ['PDF truncado', pdfDe().subarray(0, 60), `${MARCA}-5a-trunc.pdf`, 'application/pdf'],
      ['archivo vacío', Buffer.alloc(0), `${MARCA}-5a-vacio.png`, 'image/png'],
    ]
    const resMalos: string[] = []
    for (const [caso, datos, nombre, tipo] of malos) {
      const r = await subirREST(datos, nombre, tipo)
      if (r.status !== 400 || r.doc) resMalos.push(`${caso}: HTTP ${r.status}`)
      if (r.mensaje.includes(carpetaMedia()) || /[A-Z]:\\|\/home\/|\/tmp\//.test(r.mensaje)) resMalos.push(`${caso}: el error muestra una ruta interna`)
    }
    ok('MIME falso, extensión no admitida, truncados y vacío: 400, sin documento ni rutas internas en el error', resMalos.length === 0, resMalos.join('; '))

    // 3. Nombre con rutas y caracteres especiales: se guarda saneado dentro de media/.
    const r6 = await subirREST(await pngDe(1024), `../../${MARCA}-5a-ruta<x>"|?*.png`, 'image/png')
    ok(
      'nombre con ../ y caracteres especiales: guardado saneado en media/, sin nada fuera',
      r6.status === 201 &&
        Boolean(r6.doc?.filename) &&
        !/[\\/<>"|?*]|\.\./.test(r6.doc?.filename ?? '') &&
        !existsSync(path.resolve(carpetaMedia(), '..', '..', `${MARCA}-5a-ruta.png`)),
      r6.doc?.filename ?? `HTTP ${r6.status}`,
    )

    // 4. Otras vías: sustituir el archivo (PATCH), la Local API (sin el límite global) y sin sesión.
    const base = exigir(r1.doc, 'la imagen aceptada')
    const antesPatch = JSON.stringify(await payload.findByID({ collection: 'media', id: base.id, depth: 0, overrideAccess: true }))
    const fdP = new FormData()
    fdP.append('file', new Blob([new Uint8Array(await pngDe(6 * MB))], { type: 'image/png' }), `${MARCA}-5a-patch.png`)
    const patch = await fetch(`${BASE}/api/media/${base.id}`, { method: 'PATCH', headers: authA, body: fdP })
    const motivoPatch = await patch.text()
    // Payload borra el archivo anterior antes de los hooks beforeValidate: el rechazo debe llegar antes (beforeOperation).
    const sigue = await fetch(`${BASE}/api/media/file/${encodeURIComponent(base.filename ?? '')}`, { headers: authA })
    await sigue.arrayBuffer()
    ok(
      'sustituir el archivo por una imagen de 6 MB (PATCH): rechazado; el documento no cambia y su archivo sigue en disco',
      patch.status === 400 &&
        motivoPatch.includes('5 MB') &&
        JSON.stringify(await payload.findByID({ collection: 'media', id: base.id, depth: 0, overrideAccess: true })) === antesPatch &&
        sigue.status === 200 &&
        existsSync(path.join(carpetaMedia(), base.filename ?? '')),
      `HTTP ${patch.status}; archivo anterior servido: ${sigue.status}`,
    )
    const localApi = async (datos: Buffer, nombre: string, tipo: string) => {
      try {
        const d = await payload.create({
          collection: 'media',
          overrideAccess: true,
          data: { alt: `${MARCA} ${nombre}`, grupo: gA.id },
          file: { data: datos, name: nombre, mimetype: tipo, size: datos.length },
        })
        temporales.push({ collection: 'media', id: d.id })
        return 'aceptado'
      } catch (e) {
        return (e as Error).message
      }
    }
    const la1 = await localApi(await pngDe(6 * MB), `${MARCA}-5a-local-6mb.png`, 'image/png')
    const la2 = await localApi(pdfDe(21 * MB), `${MARCA}-5a-local-21mb.pdf`, 'application/pdf')
    ok('Local API (no pasa por el límite global): imagen de 6 MB y PDF de 21 MB rechazados igual', la1 !== 'aceptado' && la2 !== 'aceptado', `${la1} | ${la2}`)
    const anonimo = await subirREST(await pngDe(1024), `${MARCA}-5a-anonimo.png`, 'image/png', {})
    ok('subida sin sesión: 403 y sin documento', anonimo.status === 403 && !anonimo.doc, `HTTP ${anonimo.status}`)
    const otroGrupo = exigir(
      (await payload.find({ collection: 'grupos', where: { ruta: { equals: 'litartmo' } }, limit: 1, depth: 0 })).docs[0],
      'el grupo litartmo',
    )
    const ajeno = await subirREST(await pngDe(1024), `${MARCA}-5a-ajeno.png`, 'image/png', authA, otroGrupo.id)
    const grupoAjeno = ajeno.doc ? (await payload.findByID({ collection: 'media', id: ajeno.doc.id, depth: 0, overrideAccess: true })).grupo : null
    ok(
      'el editor no puede subir un archivo a otro grupo',
      !ajeno.doc || grupoAjeno === gA.id,
      `HTTP ${ajeno.status}${ajeno.doc ? `, guardado en el grupo ${String(grupoAjeno)}` : ''}`,
    )

    // 5. Cabeceras servidas por /api/media/file/ (con la sesión del editor: los archivos nuevos son privados).
    const servir = async (nombre: string, cab: Record<string, string> = authA) =>
      fetch(`${BASE}/api/media/file/${encodeURIComponent(nombre)}`, { headers: cab })
    // La CSP de los archivos es la general del sitio más `sandbox` (next.config.mjs): se comprueban las dos partes.
    const conSandbox = (r: Response) => {
      const csp = (r.headers.get('content-security-policy') ?? '').split(';').map((d) => d.trim())
      return csp.includes('sandbox') && csp.includes("frame-ancestors 'none'")
    }
    const pdfServido = await servir(exigir(r3.doc?.filename, 'el PDF subido'))
    ok(
      'PDF servido: application/pdf, nosniff y una CSP con sandbox',
      pdfServido.status === 200 &&
        pdfServido.headers.get('content-type') === 'application/pdf' &&
        pdfServido.headers.get('x-content-type-options') === 'nosniff' &&
        conSandbox(pdfServido),
      `${pdfServido.status} ${pdfServido.headers.get('content-type')} · ${pdfServido.headers.get('x-content-type-options')} · ${pdfServido.headers.get('content-security-policy')}`,
    )
    await pdfServido.arrayBuffer()
    const imgServida = await servir(exigir(r6.doc?.filename, 'la imagen subida'))
    ok(
      'imagen servida: image/png con nosniff (y la CSP con sandbox de todos los archivos)',
      imgServida.status === 200 &&
        imgServida.headers.get('content-type') === 'image/png' &&
        imgServida.headers.get('x-content-type-options') === 'nosniff' &&
        conSandbox(imgServida),
      `${imgServida.status} ${imgServida.headers.get('content-type')}`,
    )
    await imgServida.arrayBuffer()
    const rango = await fetch(`${BASE}/api/media/file/${encodeURIComponent(r3.doc?.filename ?? '')}`, { headers: { ...authA, Range: 'bytes=0-9' } })
    ok(
      'una petición parcial (Range) del PDF también lleva nosniff y sandbox',
      rango.status === 206 && conSandbox(rango) && rango.headers.get('x-content-type-options') === 'nosniff',
      `HTTP ${rango.status}`,
    )
    // La portada, no una landing: las pruebas no pueden invalidar la caché de las landings de Next (corren fuera de él).
    const pagina = await fetch(`${BASE}/`)
    await pagina.arrayBuffer()
    ok(
      'las páginas del sitio siguen con su CSP, sin sandbox',
      !(pagina.headers.get('content-security-policy') ?? '').includes('sandbox'),
      pagina.headers.get('content-security-policy') ?? '',
    )
    await rango.arrayBuffer()
    const anonimoPrivado = await servir(r3.doc?.filename ?? '', {})
    ok('el PDF recién subido es privado: sin sesión, 403', anonimoPrivado.status === 403, `HTTP ${anonimoPrivado.status}`)
    await anonimoPrivado.arrayBuffer()
    ok(
      'en media/ solo quedan los archivos aceptados (con sus tamaños derivados, 5b)',
      enMedia().length - antesMedia ===
        [r1, r3, r6, ajeno].flatMap((r) => (r.doc ? [r.doc.filename, ...Object.values(r.doc.sizes ?? {}).map((t) => t?.filename)] : [])).filter(Boolean).length,
      `${enMedia().length - antesMedia} nuevos`,
    )
  }

  if (seccion('imagenes')) {
    console.log('Imágenes derivadas (5b): tamaños, formato, original acotado y acceso a los derivados')
    // Grupo y editor temporales propios (como en `archivos`): no se toca la caché de las landings de la semilla.
    const gI = await payload.create({
      collection: 'grupos',
      data: { nombre: `${MARCA} imagenes`, slug: `${MARCA}-imagenes`, activo: true },
      overrideAccess: true,
    })
    temporales.push({ collection: 'grupos', id: gI.id })
    const claveI = randomBytes(18).toString('hex')
    const editorI = await payload.create({
      collection: 'usuarios',
      data: { email: `${MARCA}-imagenes@plataforma.local`, password: claveI, roles: ['editor'], grupos: [{ grupo: gI.id }] },
    })
    temporales.push({ collection: 'usuarios', id: editorI.id })
    const loginI = await fetch(`${BASE}/api/usuarios/login`, {
      method: 'POST',
      headers: json,
      body: JSON.stringify({ email: editorI.email, password: claveI }),
    })
    const authI = { Authorization: `JWT ${exigir(((await loginI.json()) as { token?: string }).token, 'la sesión del editor de imágenes')}` }
    const archivosDe = (prefijo: string) => (existsSync(carpetaMedia()) ? readdirSync(carpetaMedia()).filter((n) => n.startsWith(prefijo)) : [])
    const subir = async (archivo: Buffer, nombre: string, tipo: string) => {
      const fd = new FormData()
      fd.append('file', new Blob([new Uint8Array(archivo)], { type: tipo }), nombre)
      fd.append('_payload', JSON.stringify({ alt: `${MARCA} ${nombre}`, grupo: gI.id }))
      const r = await fetch(`${BASE}/api/media`, { method: 'POST', headers: authI, body: fd })
      const j = (await r.json().catch(() => ({}))) as { doc?: Media }
      if (j.doc?.id) temporales.push({ collection: 'media', id: j.doc.id })
      return { status: r.status, doc: j.doc }
    }
    const lienzo = (w: number, h: number) => sharp({ create: { width: w, height: h, channels: 3, background: '#4a6b8a' } })
    const formatos: [string, Buffer, string][] = [
      ['jpg', await lienzo(2000, 1500).jpeg().toBuffer(), 'image/jpeg'],
      ['png', await lienzo(2000, 1500).png().toBuffer(), 'image/png'],
      ['webp', await lienzo(2000, 1500).webp().toBuffer(), 'image/webp'],
      ['gif', await lienzo(2000, 1500).gif().toBuffer(), 'image/gif'],
    ]
    const esperados: Record<string, [number, number]> = { tarjeta: [480, 360], media: [960, 720], grande: [1600, 1200], og: [1200, 630] }
    const malos: string[] = []
    let primero: Media | undefined
    for (const [ext, datos, tipo] of formatos) {
      const { status, doc } = await subir(datos, `${MARCA}-5b-${ext}.${ext}`, tipo)
      if (status !== 201 || !doc) {
        malos.push(`${ext}: HTTP ${status}`)
        continue
      }
      primero ??= doc
      if (doc.mimeType !== tipo || doc.width !== 2000 || doc.height !== 1500) malos.push(`${ext}: original ${doc.mimeType} ${doc.width}×${doc.height}`)
      if (!doc.filename || !existsSync(path.join(carpetaMedia(), doc.filename))) malos.push(`${ext}: original no conservado`)
      const nombres = Object.keys(doc.sizes ?? {}).sort()
      if (nombres.join() !== 'grande,media,og,tarjeta') malos.push(`${ext}: tamaños ${nombres.join()}`)
      for (const [n, [w, h]] of Object.entries(esperados)) {
        const t = doc.sizes?.[n as keyof NonNullable<Media['sizes']>]
        const archivo = t?.filename ? path.join(carpetaMedia(), t.filename) : ''
        const meta = archivo && existsSync(archivo) ? await sharp(readFileSync(archivo)).metadata() : null
        if (t?.width !== w || t?.height !== h || t?.mimeType !== 'image/webp' || meta?.format !== 'webp' || meta.width !== w || meta.height !== h) {
          malos.push(`${ext}/${n}: ${t?.width}×${t?.height} ${t?.mimeType} (disco: ${meta?.format} ${meta?.width}×${meta?.height})`)
        }
      }
    }
    ok('JPEG, PNG, WebP y GIF: original conservado y los 4 tamaños en WebP con sus dimensiones, ni uno más', malos.length === 0, malos.join('; '))

    const conExif = await lienzo(3000, 2000)
      .jpeg()
      .withMetadata({ exif: { IFD0: { Copyright: 'prueba 5b', Artist: 'prueba' } } })
      .toBuffer()
    ok('la imagen de prueba lleva EXIF', Boolean((await sharp(conExif).metadata()).exif))
    const grande = await subir(conExif, `${MARCA}-5b-exif.jpg`, 'image/jpeg')
    const metaOriginal = grande.doc?.filename ? await sharp(readFileSync(path.join(carpetaMedia(), grande.doc.filename))).metadata() : null
    ok(
      'original de 3000×2000 con EXIF: guardado a 2400×1600 y sin EXIF; sigue siendo JPEG',
      grande.status === 201 && grande.doc?.width === 2400 && grande.doc.height === 1600 && metaOriginal?.format === 'jpeg' && !metaOriginal.exif,
      `HTTP ${grande.status} ${grande.doc?.width}×${grande.doc?.height} exif=${Boolean(metaOriginal?.exif)}`,
    )
    const pequena = await subir(await lienzo(300, 200).png().toBuffer(), `${MARCA}-5b-pequena.png`, 'image/png')
    const generadas = Object.values(pequena.doc?.sizes ?? {}).filter((t) => t?.filename)
    ok(
      'imagen de 300×200: no se amplía (ningún tamaño generado, original intacto)',
      pequena.status === 201 && generadas.length === 0 && pequena.doc?.width === 300 && archivosDe(`${MARCA}-5b-pequena`).length === 1,
      `${generadas.length} tamaños; archivos ${archivosDe(`${MARCA}-5b-pequena`).join(', ')}`,
    )

    // Errores: lo que 5a rechaza no deja derivados ni original.
    const jpg = await lienzo(800, 600).jpeg().toBuffer()
    const rotos: [string, Buffer, string][] = [
      ['truncada', jpg.subarray(0, jpg.length >> 1), 'image/jpeg'],
      ['no-decodificable', Buffer.concat([jpg.subarray(0, 200), randomBytes(2000)]), 'image/jpeg'],
      ['svg', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'), 'image/svg+xml'],
    ]
    const resRotos: string[] = []
    for (const [n, datos, tipo] of rotos) {
      const r = await subir(datos, `${MARCA}-5b-roto-${n}.jpg`, tipo)
      if (r.status !== 400 || r.doc) resRotos.push(`${n}: HTTP ${r.status}`)
    }
    ok(
      'imágenes truncadas, no decodificables o SVG: 400, sin documento ni archivos en media/',
      resRotos.length === 0 && archivosDe(`${MARCA}-5b-roto`).length === 0,
      [...resRotos, ...archivosDe(`${MARCA}-5b-roto`)].join('; '),
    )

    // Regenerar: sustituir el archivo crea tamaños nuevos y borra los anteriores (sin huérfanos).
    const base = exigir(primero, 'la imagen JPEG')
    const antes = Object.values(base.sizes ?? {})
      .map((t) => t?.filename)
      .filter((f): f is string => Boolean(f))
    const fd = new FormData()
    fd.append('file', new Blob([new Uint8Array(await lienzo(1800, 1200).png().toBuffer())], { type: 'image/png' }), `${MARCA}-5b-otra.png`)
    const sustituida = await fetch(`${BASE}/api/media/${base.id}`, { method: 'PATCH', headers: authI, body: fd })
    const nuevo = (await sustituida.json().catch(() => ({}))) as { doc?: Media }
    const ahora = Object.values(nuevo.doc?.sizes ?? {})
      .map((t) => t?.filename)
      .filter((f): f is string => Boolean(f))
    ok(
      'sustituir el archivo: tamaños nuevos (1800 px de origen) y los anteriores borrados de media/',
      sustituida.status === 200 &&
        nuevo.doc?.sizes?.grande?.width === 1600 &&
        nuevo.doc.sizes.grande.height === 1067 &&
        ahora.every((f) => existsSync(path.join(carpetaMedia(), f))) &&
        antes.filter((f) => !ahora.includes(f)).every((f) => !existsSync(path.join(carpetaMedia(), f))),
      `HTTP ${sustituida.status}; grande ${nuevo.doc?.sizes?.grande?.width}×${nuevo.doc?.sizes?.grande?.height}`,
    )

    // Acceso a los derivados: el del archivo original (privado: es nuevo y no lo usa contenido publicado).
    const derivado = exigir(nuevo.doc?.sizes?.media?.filename ?? undefined, 'un tamaño derivado')
    const pedir = async (nombre: string, cab: Record<string, string>) => {
      const r = await fetch(`${BASE}/api/media/file/${encodeURIComponent(nombre)}`, { headers: cab })
      await r.arrayBuffer()
      return r
    }
    const anonimoD = await pedir(derivado, {})
    const propioD = await pedir(derivado, authI)
    const ajenoD = await pedir(derivado, auth)
    const ajenoO = await pedir(nuevo.doc?.filename ?? '', auth)
    ok(
      'derivado de un archivo privado: sin sesión 403; su grupo 200 (WebP, nosniff y CSP con sandbox); otro grupo sin acceso, igual que al original',
      anonimoD.status === 403 &&
        propioD.status === 200 &&
        propioD.headers.get('content-type') === 'image/webp' &&
        propioD.headers.get('x-content-type-options') === 'nosniff' &&
        (propioD.headers.get('content-security-policy') ?? '').includes('sandbox') &&
        [403, 404].includes(ajenoD.status) &&
        ajenoD.status === ajenoO.status,
      `anónimo ${anonimoD.status}, su grupo ${propioD.status} ${propioD.headers.get('content-type')}, otro grupo ${ajenoD.status} (original ${ajenoO.status})`,
    )
    const manipulado = await pedir(`../${derivado}`, authI)
    const inventado = await pedir(derivado.replace(/-\d+x\d+\.webp$/, '-9999x9999.webp'), authI)
    ok(
      'rutas manipuladas o tamaños inventados: sin contenido',
      manipulado.status >= 400 && inventado.status >= 400,
      `${manipulado.status} / ${inventado.status}`,
    )
    const patchAjeno = await fetch(`${BASE}/api/media/${base.id}`, { method: 'PATCH', headers: { ...auth, ...json }, body: JSON.stringify({ alt: 'ajeno' }) })
    ok('un editor de otro grupo no puede modificar el archivo ni sus tamaños', [403, 404].includes(patchAjeno.status), `HTTP ${patchAjeno.status}`)
  }

  if (seccion('mensajes')) {
    console.log('Mensajes de colaboración: campos personales inmutables, estado editable, borrado solo superadmin')
    const original = {
      nombre: `${MARCA} Persona`,
      correo: 'persona@ejemplo.invalid',
      institucion: 'Institución ficticia',
      tipo: 'Consulta',
      mensaje: 'Mensaje original de prueba, ficticio.',
    }
    const m = await payload.create({ collection: 'mensajes', data: { ...original, grupo: B.id }, overrideAccess: true })
    temporales.push({ collection: 'mensajes', id: m.id })
    const guardado = async () => payload.findByID({ collection: 'mensajes', id: m.id, depth: 0, overrideAccess: true })
    const campos = (d: object) => JSON.stringify(Object.keys(original).map((k) => (d as Record<string, unknown>)[k]))
    for (const k of Object.keys(original) as (keyof typeof original)[]) {
      const r = await fetch(`${BASE}/api/mensajes/${m.id}`, {
        method: 'PATCH',
        headers: { ...auth, ...json },
        body: JSON.stringify({ [k]: k === 'correo' ? 'cambiado@ejemplo.invalid' : 'Cambiado por REST' }),
      })
      ok(`REST: el editor no cambia «${k}»`, campos(await guardado()) === campos(original), `HTTP ${r.status}`)
    }
    const todos = await fetch(`${BASE}/api/mensajes/${m.id}`, {
      method: 'PATCH',
      headers: { ...auth, ...json },
      body: JSON.stringify({ nombre: 'X', correo: 'x@ejemplo.invalid', mensaje: 'Cambiado por completo', estado: 'atendido' }),
    })
    const tras = await guardado()
    ok(
      'REST: con todos a la vez, solo cambia el estado',
      campos(tras) === campos(original) && tras.estado === 'atendido',
      `HTTP ${todos.status}; estado=${tras.estado}`,
    )
    const local = await payload.update({ collection: 'mensajes', id: m.id, data: { mensaje: 'Cambiado por Local API' }, ...comoEditor })
    ok('Local API como editor: tampoco cambia el mensaje', (await guardado()).mensaje === original.mensaje, `devuelve «${String(local.mensaje).slice(0, 25)}»`)
    const borrar = await fetch(`${BASE}/api/mensajes/${m.id}`, { method: 'DELETE', headers: auth })
    ok(
      'REST: el editor no borra (403) y el mensaje sigue',
      borrar.status === 403 && Boolean(await payload.findByID({ collection: 'mensajes', id: m.id, depth: 0, overrideAccess: true }).catch(() => null)),
      `HTTP ${borrar.status}`,
    )
    const superadmin = exigir(
      (await payload.find({ collection: 'usuarios', where: { email: { equals: 'superadmin@plataforma.local' } }, limit: 1, depth: 0 })).docs[0],
      'la cuenta superadmin (pnpm seed)',
    )
    await payload.delete({ collection: 'mensajes', id: m.id, user: { ...superadmin, collection: 'usuarios' }, overrideAccess: false })
    const borrado = !(await payload.findByID({ collection: 'mensajes', id: m.id, depth: 0, overrideAccess: true }).catch(() => null))
    if (borrado)
      temporales.splice(
        temporales.findIndex((t) => t.collection === 'mensajes' && t.id === m.id),
        1,
      )
    ok('el superadmin sí borra', borrado)
    // La creación pública por el formulario se comprueba en la sección `limite`, después de que caduque su ventana.
  }

  if (seccion('auditoria')) {
    console.log('Registro de cambios: grupos, usuarios y borrado de mensajes')
    const sa = exigir(
      (await payload.find({ collection: 'usuarios', where: { email: { equals: 'superadmin@plataforma.local' } }, limit: 1, depth: 0 })).docs[0],
      'la cuenta superadmin (pnpm seed)',
    )
    const comoSA = { user: { ...sa, collection: 'usuarios' as const }, overrideAccess: false, depth: 0 } as const
    const entradas = async (coleccion: string, id: number | string) =>
      (
        await payload.find({
          collection: 'registro-cambios',
          where: { and: [{ coleccion: { equals: coleccion } }, { documento: { equals: String(id) } }] },
          sort: 'createdAt',
          limit: 50,
          depth: 0,
          overrideAccess: true,
        })
      ).docs
    const ops = async (coleccion: string, id: number | string) => (await entradas(coleccion, id)).map((e) => e.operacion).join(',')

    const g = await payload.create({ collection: 'grupos', data: { nombre: `${MARCA} grupo`, slug: `${MARCA}-g` }, ...comoSA })
    temporales.push({ collection: 'grupos' as Coleccion, id: g.id })
    await payload.update({ collection: 'grupos', id: g.id, data: { nombre: `${MARCA} grupo renombrado` }, ...comoSA })
    const eg = await entradas('grupos', g.id)
    ok(
      'grupos: alta y cambio registrados, con el grupo y el actor',
      eg.map((e) => e.operacion).join(',') === 'create,update' &&
        eg.every((e) => (typeof e.grupo === 'object' ? e.grupo?.id : e.grupo) === g.id && e.actor === `usuario:${sa.id}`),
      eg.map((e) => e.operacion).join(','),
    )

    const email = `${MARCA}-auditado@plataforma.local`
    const claveU = randomBytes(18).toString('hex')
    const u = await payload.create({ collection: 'usuarios', data: { email, password: claveU, roles: ['editor'], grupos: [{ grupo: B.id }] }, ...comoSA })
    temporales.push({ collection: 'usuarios', id: u.id })
    await payload.update({ collection: 'usuarios', id: u.id, data: { roles: ['editor'], grupos: [{ grupo: B.id }, { grupo: g.id }] }, ...comoSA })
    const claveNueva = randomBytes(18).toString('hex')
    await payload.update({ collection: 'usuarios', id: u.id, data: { password: claveNueva }, ...comoSA })
    const nAntesLogin = (await entradas('usuarios', u.id)).length
    const lg = await fetch(`${BASE}/api/usuarios/login`, { method: 'POST', headers: json, body: JSON.stringify({ email, password: claveNueva }) })
    const fallido = await fetch(`${BASE}/api/usuarios/login`, { method: 'POST', headers: json, body: JSON.stringify({ email, password: 'incorrecta' }) })
    ok(
      'usuarios: alta, cambio de grupos y cambio de contraseña registrados',
      (await ops('usuarios', u.id)).startsWith('create,update,cambiar-clave'),
      await ops('usuarios', u.id),
    )
    ok(
      'usuarios: los inicios de sesión (correcto y fallido) no generan entradas',
      lg.status === 200 && fallido.status === 401 && (await entradas('usuarios', u.id)).length === nAntesLogin,
      `login ${lg.status}, fallido ${fallido.status}`,
    )
    const textoEntradas = JSON.stringify(await entradas('usuarios', u.id))
    ok(
      'usuarios: las entradas no contienen correo ni contraseñas, solo hashes',
      ![email, claveU, claveNueva].some((v) => textoEntradas.includes(v)) &&
        (await entradas('usuarios', u.id)).every((e) => [e.antesHash, e.despuesHash].every((h) => h == null || /^[0-9a-f]{64}$/.test(h))),
    )
    await payload.delete({ collection: 'usuarios', id: u.id, ...comoSA })
    temporales.splice(
      temporales.findIndex((t) => t.collection === 'usuarios' && t.id === u.id),
      1,
    )
    ok('usuarios: borrado registrado', (await ops('usuarios', u.id)).endsWith('borrar'), await ops('usuarios', u.id))

    const m = await payload.create({
      collection: 'mensajes',
      data: { nombre: `${MARCA} auditado`, correo: 'a@ejemplo.invalid', tipo: 'Consulta', mensaje: 'Mensaje ficticio para el registro.', grupo: B.id },
      overrideAccess: true,
    })
    await payload.delete({ collection: 'mensajes', id: m.id, ...comoSA })
    ok('mensajes: borrado registrado', (await ops('mensajes', m.id)).endsWith('borrar'), await ops('mensajes', m.id))

    await payload.delete({ collection: 'grupos', id: g.id, ...comoSA })
    temporales.splice(
      temporales.findIndex((t) => t.collection === ('grupos' as Coleccion) && t.id === g.id),
      1,
    )
    const borradoG = (await entradas('grupos', g.id)).at(-1)
    ok('grupos: borrado registrado (sin referencia al grupo ya borrado)', borradoG?.operacion === 'borrar' && borradoG.grupo == null, borradoG?.operacion)
    // Todo el registro (no solo lo de esta prueba): ningún correo, contraseña, token ni secreto en claro.
    const todo = (await payload.find({ collection: 'registro-cambios', limit: 0, pagination: false, depth: 0, overrideAccess: true })).docs
    const sospechosas = todo.filter((e) => {
      const valores = [e.coleccion, e.documento, e.operacion, e.actor, e.antesHash, e.despuesHash].map((v) => String(v ?? ''))
      return (
        valores.some((v) => v.includes('@') || /password|token|secret/i.test(v)) ||
        [e.antesHash, e.despuesHash].some((h) => h != null && !/^[0-9a-f]{64}$/.test(h)) ||
        !/^(usuario:\d+|proceso)$/.test(e.actor)
      )
    })
    ok(
      `registro completo (${todo.length} entradas): sin correos, contraseñas, tokens ni secretos; solo hashes y actor «usuario:id»`,
      sospechosas.length === 0,
      sospechosas
        .slice(0, 3)
        .map((e) => e.id)
        .join(','),
    )
    ok('el secreto de este entorno no aparece en ninguna entrada', !JSON.stringify(todo).includes(process.env.PAYLOAD_SECRET ?? '\u0000'))
  }

  if (seccion('cache')) {
    console.log('Caché: las rutas inexistentes no crean entradas')
    const dirCache = path.resolve(process.cwd(), '.next', 'cache')
    const contar = (dir: string): number =>
      existsSync(dir) ? readdirSync(dir, { withFileTypes: true }).reduce((n, e) => n + (e.isDirectory() ? contar(path.join(dir, e.name)) : 1), 0) : 0
    const espera = () => new Promise((res) => setTimeout(res, 1500))
    // Rutas legítimas primero (pueden crear sus entradas una vez), y que sigan funcionando.
    const legitimas: [string, number][] = [
      ['/estudios-andinos-demo', 200],
      ['/estudios-andinos-demo/archivo', 200],
      ['/litartmo', 200],
      ['/litartmo/subgrupo-demo', 200],
      ['/litartmo/subgrupo-demo/archivo', 200],
    ]
    const estados = await Promise.all(legitimas.map(async ([r]) => (await fetch(BASE + r)).status))
    ok(
      'grupos, subgrupos y archivos legítimos responden 200',
      estados.every((s, i) => s === legitimas[i][1]),
      estados.join(','),
    )
    await espera()
    const inventadas = (lote: string) => [
      ...Array.from({ length: 10 }, (_, i) => `/${MARCA}-${lote}-${i}`),
      ...Array.from({ length: 10 }, (_, i) => `/litartmo/${MARCA}-${lote}-${i}`),
      ...Array.from({ length: 5 }, (_, i) => `/${MARCA}-${lote}-${i}/archivo`),
      ...Array.from({ length: 5 }, (_, i) => `/${'x'.repeat(150)}-${lote}${i}/${'y'.repeat(100)}`),
    ]
    const base = contar(dirCache)
    const lote1 = await Promise.all(inventadas('a').map(async (r) => (await fetch(BASE + r)).status))
    await espera()
    const tras1 = contar(dirCache)
    const lote2 = await Promise.all(inventadas('b').map(async (r) => (await fetch(BASE + r)).status))
    await espera()
    const tras2 = contar(dirCache)
    ok(
      '60 rutas inexistentes responden 404',
      [...lote1, ...lote2].every((s) => s === 404),
      [...new Set([...lote1, ...lote2])].join(','),
    )
    ok('y no hacen crecer .next/cache', tras1 - base <= 1 && tras2 === tras1, `${base} → ${tras1} → ${tras2} archivos`)
  }

  if (seccion('limite')) {
    console.log('Límite de envíos del formulario (lib/limite-envios.ts)')
    let t = 0
    const lim = crearLimitador({ ventanaMs: 1000, max: 3, maxClaves: 2, ahora: () => t })
    const r = [lim.comprobar('a'), lim.comprobar('a'), lim.comprobar('a'), lim.comprobar('a'), lim.comprobar('a')]
    ok('3 envíos permitidos y el resto limitados dentro de la ventana', r.join() === 'permitido,permitido,permitido,limite,limite', r.join())
    t = 1000
    ok('la ventana caduca', lim.comprobar('a') === 'permitido')
    ok(
      'saturación: con el máximo de clientes vigentes, uno nuevo se rechaza',
      lim.comprobar('b') === 'permitido' && lim.comprobar('c') === 'saturado' && lim.claves() === 2,
    )
    t = 5000
    ok('al caducar, se purgan las claves y vuelve a admitir', lim.comprobar('c') === 'permitido' && lim.claves() === 1, `claves=${lim.claves()}`)
    const cab = (h: Record<string, string>) => new Headers(h)
    ok(
      'sin proxy de confianza: ignora X-Forwarded-For y X-Real-IP (clave común)',
      clienteDe(cab({ 'x-forwarded-for': '203.0.113.9' }), false).clave === clienteDe(cab({ 'x-real-ip': '198.51.100.7' }), false).clave,
    )
    ok(
      'con proxy de confianza: usa solo X-Real-IP',
      clienteDe(cab({ 'x-real-ip': '203.0.113.9', 'x-forwarded-for': '198.51.100.7' }), true).clave === 'ip4:203.0.113.9',
    )
    ok('con proxy de confianza: un valor que no es IP no tiene clave (se rechaza)', clienteDe(cab({ 'x-real-ip': 'falso' }), true).clave === null)

    // De punta a punta, sin JavaScript (como un formulario HTML): 4 envíos con X-Forwarded-For distinto cada vez.
    // Mensaje demasiado corto: no se guarda nada; cuenta para el límite igual que uno válido.
    const proxy = process.env.CONFIAR_EN_PROXY?.trim() === '1'
    if (proxy) console.log('  · CONFIAR_EN_PROXY=1: la prueba de punta a punta se omite (necesita la clave común; ver la sección proxy)')
    else {
      const nMensajes = (await payload.count({ collection: 'mensajes', overrideAccess: true })).totalDocs
      const respuestas: string[] = []
      for (let i = 1; i <= 4; i++) {
        const { html } = await enviarSinJS(
          'estudios-andinos-demo',
          { nombre: 'Prueba Límite', correo: 'limite@ejemplo.invalid', mensaje: 'Corto' },
          { 'X-Forwarded-For': `203.0.113.${i}` },
        )
        respuestas.push(html.includes('Ha enviado varias propuestas seguidas') ? 'limite' : html.includes('Cuéntenos un poco más') ? 'validacion' : 'otro')
      }
      ok(
        'X-Forwarded-For falsificado no esquiva el límite (4.º envío limitado)',
        respuestas.join() === 'validacion,validacion,validacion,limite',
        respuestas.join(),
      )
      ok('ningún mensaje guardado', (await payload.count({ collection: 'mensajes', overrideAccess: true })).totalDocs === nMensajes)
      console.log('  · esperando 61 s a que caduque la ventana del límite')
      await new Promise((res) => setTimeout(res, 61_000))
    }
  }

  if (seccion('formulario')) {
    console.log('Formulario Colaborar: antispam (marca firmada), creación pública y conservación de lo escrito (H15)')
    const ruta = 'estudios-andinos-demo'
    const ahora = Date.now()
    const marca = emitirMarca(ruta, ahora)
    ok('marca: válida pasados 2 s', comprobarMarca(marca, ruta, ahora + TIEMPO_MINIMO_MS) === 'valida')
    ok('marca: demasiado rápida antes de 2 s (se guarda como posible spam: sección antispam)', comprobarMarca(marca, ruta, ahora + 500) === 'rapida')
    ok('marca: caducada pasadas 24 h', comprobarMarca(marca, ruta, ahora + VALIDEZ_MS + 1) === 'caducada')
    ok(
      'marca: inválida si falta, si está alterada o si es de otra ruta',
      [undefined, '', 'basura', marca.replace(/.$/, (c) => (c === 'A' ? 'B' : 'A')), `${ahora + 1}.${marca.split('.')[1]}`].every(
        (m) => comprobarMarca(m, ruta, ahora + 5000) === 'invalida',
      ) && comprobarMarca(marca, 'litartmo', ahora + 5000) === 'invalida',
    )

    const nMensajes = async () => (await payload.count({ collection: 'mensajes', overrideAccess: true })).totalDocs
    const valido = { nombre: `${MARCA} Antispam`, correo: 'antispam@ejemplo.invalid', institucion: '', mensaje: 'Mensaje que no debe guardarse por la marca.' }
    const antes = await nMensajes()
    const sinMarca = await enviarSinJS(ruta, valido, {}, { quitar: ['marca'] })
    const alterada = await enviarSinJS(ruta, { ...valido, marca: `${Date.now() - 10_000}.firmafalsa` })
    const generico = (h: string) => h.includes('No se pudo enviar la propuesta')
    // Campo trampa (subfase 4c): en un contenedor oculto, sin aria-hidden ni tabindex en el campo; lleno → rechazado.
    const paginaForm = await (await fetch(`${BASE}/${ruta}`)).text()
    const campoTrampa = /<input[^>]*name="sitio_web"[^>]*>/.exec(paginaForm)?.[0] ?? ''
    const contenedorTrampa = /<div class="([^"]+)"><label>Deje este campo en blanco<input[^>]*name="sitio_web"/.exec(paginaForm)?.[1] ?? ''
    ok(
      'campo trampa: dentro de su contenedor oculto, sin aria-hidden ni tabindex en el campo',
      Boolean(campoTrampa) && !/aria-hidden|tabindex/i.test(campoTrampa) && /trampa/.test(contenedorTrampa),
      contenedorTrampa || 'sin contenedor',
    )
    const trampa = await enviarSinJS(ruta, { ...valido, sitio_web: 'https://spam.invalid' })
    ok('campo trampa lleno: error genérico y nada guardado', trampa.html.includes('No se pudo enviar la propuesta') && (await nMensajes()) === antes)
    // El envío rápido (menos de 2 s) ya no se rechaza: se guarda como «posible spam» (subfase 4c, sección antispam).
    ok(
      'sin marca o con la marca alterada: rechazado con el error genérico y sin guardar',
      generico(sinMarca.html) && generico(alterada.html) && (await nMensajes()) === antes,
    )

    // Creación pública (sin JS) con el mecanismo previsto: crearMensajeContacto con overrideAccess.
    const nombre = `${MARCA} Publico`
    const { html } = await enviarSinJS(ruta, {
      nombre,
      correo: 'publico@ejemplo.invalid',
      institucion: '',
      mensaje: 'Mensaje legítimo de prueba desde el formulario.',
    })
    const creado = (await payload.find({ collection: 'mensajes', where: { nombre: { equals: nombre } }, limit: 1, depth: 0, overrideAccess: true })).docs[0]
    if (creado) temporales.push({ collection: 'mensajes', id: creado.id })
    ok(
      'el formulario público sigue creando mensajes',
      html.includes('Mensaje recibido') && creado?.grupo === B.id && creado?.estado === 'nuevo',
      creado ? `id ${creado.id}` : 'no creado',
    )

    // H15 sin JavaScript: tras un error, la página devuelta conserva lo escrito y anuncia el error.
    const escrito = { nombre: 'Ana Prueba Ficticia', correo: 'ana.prueba@ejemplo.invalid', institucion: 'Institución ficticia', mensaje: 'Corto' }
    const err = await enviarSinJS(ruta, escrito)
    const conserva = (Object.entries(escrito) as [string, string][]).every(([k, val]) =>
      (k === 'mensaje'
        ? new RegExp(`name="mensaje"[^>]*>${val}</textarea>`)
        : new RegExp(`value="${val}"[^>]*name="${k}"|name="${k}"[^>]*value="${val}"`)
      ).test(err.html),
    )
    ok('sin JS: tras un error conserva nombre, correo, institución y mensaje', conserva)
    // Subfase 4a: el aviso general resume y cada campo apunta a SU error (aria-describedby → id del mensaje del campo).
    const etiquetaMensaje = /<textarea[^>]*name="mensaje"[^>]*>/.exec(err.html)?.[0] ?? ''
    const describe = /aria-describedby="([^"]+)"/.exec(etiquetaMensaje)?.[1] ?? ''
    ok(
      'sin JS: el error se anuncia (role="alert"), marca el campo (aria-invalid) y lo enlaza a su mensaje (aria-describedby)',
      /role="alert"[^>]*>Mensaje: Cuéntenos un poco más/.test(err.html) &&
        /aria-invalid="true"/.test(etiquetaMensaje) &&
        Boolean(describe) &&
        new RegExp(`id="${describe.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"[^>]*>Cuéntenos un poco más`).test(err.html),
      describe,
    )
    ok(
      'sin JS: los campos llevan los maxLength del servidor',
      /name="nombre"[^>]*maxLength="120"|maxLength="120"[^>]*name="nombre"/i.test(err.html) && /maxLength="4000"/i.test(etiquetaMensaje),
    )
    // Ruta enlazada a la acción manipulada en el campo oculto $ACTION_1:1 (Next no la cifra).
    const nM = await nMensajes()
    const otra = await enviarSinJS(ruta, { ...valido, nombre: `${MARCA} Otra ruta` }, {}, { enlazada: 'litartmo' })
    ok('ruta enlazada cambiada a otro grupo con la marca de esta página: rechazado (la marca es por ruta)', generico(otra.html) && (await nMensajes()) === nM)
    const inactivo = await payload.create({
      collection: 'grupos',
      data: { nombre: `${MARCA} inactivo`, slug: `${MARCA}-inactivo`, activo: false },
      overrideAccess: true,
    })
    temporales.push({ collection: 'grupos', id: inactivo.id })
    // Peor caso: una marca VÁLIDA para la ruta del grupo inactivo (solo posible conociendo PAYLOAD_SECRET).
    const forzada = await enviarSinJS(
      ruta,
      { ...valido, nombre: `${MARCA} Inactivo`, marca: emitirMarca(inactivo.ruta ?? '', Date.now() - 5000) },
      {},
      { enlazada: inactivo.ruta ?? '' },
    )
    ok('ni con una marca válida se escribe en un grupo inactivo', generico(forzada.html) && (await nMensajes()) === nM)
    console.log('  · esperando 61 s a que caduque la ventana del límite')
    await new Promise((res) => setTimeout(res, 61_000))

    // Subfase 4a: validación completa del servidor, sin JavaScript (3 envíos: caben en la ventana del límite).
    console.log('Formulario Colaborar: validación por campo, tipo en lista blanca y limpieza de caracteres (4a)')
    const nV = await nMensajes()
    const varios = await enviarSinJS(ruta, { nombre: 'A', correo: 'no-es-correo', tipo: 'Inventado', mensaje: 'Corto', institucion: 'Institución ficticia' })
    const campoMarcado = (n: string) =>
      new RegExp(`<(input|textarea)[^>]*name="${n}"[^>]*aria-invalid="true"|<(input|textarea)[^>]*aria-invalid="true"[^>]*name="${n}"`).test(varios.html)
    ok(
      'varios errores: un mensaje por campo (nombre, correo, tipo, mensaje) y el resumen en role="alert"',
      /role="alert"[^>]*>Revise 4 campos: Nombre, Correo, Tipo de colaboración, Mensaje\./.test(varios.html) &&
        ['nombre', 'correo', 'mensaje'].every(campoMarcado) &&
        varios.html.includes('Elija uno de los tipos de colaboración de la lista.') &&
        varios.html.includes('Correo no válido'),
    )
    ok(
      'varios errores: se conserva lo escrito (correo e institución) y nada se guarda',
      /value="no-es-correo"/.test(varios.html) && /value="Institución ficticia"/.test(varios.html) && (await nMensajes()) === nV,
    )

    // Caracteres de control e invisibles, marcado y saltos \r\n justo en el límite del mensaje (4000 tras normalizar).
    const nombreSucio = `${MARCA} Limpio`
    const cabeza = '<script>alert(1)</script> javascript:alert(1)'
    const mensajeLimite = `${cabeza}‮\u0007${'a'.repeat(200 - cabeza.length)}${('\r\n' + 'a'.repeat(189)).repeat(20)}`
    const limpio = await enviarSinJS(ruta, {
      nombre: `${nombreSucio}‮\u0000​`,
      correo: 'limpio@ejemplo.invalid',
      institucion: '',
      tipo: 'Otro',
      mensaje: mensajeLimite,
    })
    const guardado = (await payload.find({ collection: 'mensajes', where: { nombre: { equals: nombreSucio } }, limit: 1, depth: 0, overrideAccess: true }))
      .docs[0]
    if (guardado) temporales.push({ collection: 'mensajes', id: guardado.id })
    const sinInvisibles = (t: string) => !/[\u0000-\u0008\u000B-\u001F\u007F-\u009F​‪-‮⁦-⁩﻿]/.test(t)
    ok(
      'controles e invisibles: se guarda limpio, con los saltos como \\n (4000 caracteres justos) y el marcado como texto',
      limpio.html.includes('Mensaje recibido') &&
        guardado?.nombre === nombreSucio &&
        guardado.tipo === 'Otro' &&
        guardado.mensaje.length === 4000 &&
        guardado.mensaje.startsWith('<script>alert(1)</script> javascript:alert(1)a') &&
        sinInvisibles(guardado.mensaje) &&
        !guardado.mensaje.includes('\r'),
      guardado ? `longitud ${guardado.mensaje.length}` : 'no guardado',
    )

    const largo = await enviarSinJS(ruta, { nombre: `${MARCA} Largo`, correo: 'largo@ejemplo.invalid', tipo: 'Otro', mensaje: 'x'.repeat(4001) })
    ok(
      'mensaje de 4001 caracteres: error en el campo y nada guardado',
      /role="alert"[^>]*>Mensaje: Use como máximo 4000 caracteres\./.test(largo.html) && (await nMensajes()) === nV + 1,
    )
    console.log('  · esperando 61 s: la prueba del navegador necesita su propia ventana del límite')
    await new Promise((res) => setTimeout(res, 61_000))
  }
  // Solo con un servidor arrancado con CONFIAR_EN_PROXY=1, y esta prueba también con él: SECCIONES=proxy (subfase 4b).
  // Cada petición lleva el X-Real-IP que pondría Nginx (deploy/nginx/cabeceras-proxy.conf). Crea mensajes en dos grupos
  // de la semilla (y los borra) y deja esas IPs y grupos limitados en ese servidor durante sus ventanas (hasta 1 h): usar
  // un servidor solo para esta sección. Sustituye a la antigua sección `limite-grupo`.
  if (SECCIONES.includes('proxy')) {
    console.log('Límite de envíos con proxy de confianza (4b): X-Real-IP, IP y grupo, concurrencia y límite por grupo')
    if (process.env.CONFIAR_EN_PROXY?.trim() !== '1') ok('CONFIAR_EN_PROXY=1 para esta sección (y en el servidor)', false)
    else {
      const ruta = 'estudios-andinos-demo'
      const generico = (h: string) => h.includes('No se pudo enviar la propuesta')
      const resultado = (h: string) =>
        h.includes('Mensaje recibido')
          ? 'ok'
          : h.includes('Ha enviado varias propuestas seguidas')
            ? 'limite'
            : h.includes('a este grupo en la última hora')
              ? 'limite-cliente-grupo'
              : h.includes('Cuéntenos un poco más')
                ? 'validacion'
                : generico(h)
                  ? 'generico'
                  : 'otro'
      const corto = { nombre: 'Prueba Proxy', correo: 'proxy@ejemplo.invalid', mensaje: 'Corto' }
      const valido = (n: string) => ({
        nombre: `${MARCA} Proxy ${n}`,
        correo: `proxy-${n.toLowerCase()}@ejemplo.invalid`,
        institucion: '',
        tipo: 'Otro',
        mensaje: `Mensaje legítimo de prueba ${n} con el proxy de confianza.`,
      })
      const nMensajes = async () => (await payload.count({ collection: 'mensajes', overrideAccess: true })).totalDocs
      const anotarCreados = async () => {
        const { docs } = await payload.find({
          collection: 'mensajes',
          where: { nombre: { like: `${MARCA} Proxy` } },
          limit: 200,
          depth: 0,
          overrideAccess: true,
        })
        for (const m of docs) if (!temporales.some((t) => t.collection === 'mensajes' && t.id === m.id)) temporales.push({ collection: 'mensajes', id: m.id })
      }
      const serie = async (envios: [string, Record<string, string>, Record<string, string> | [string, string][]][]) => {
        const r: string[] = []
        for (const [destino, campos, cabeceras] of envios) r.push(resultado((await enviarSinJS(destino, campos, cabeceras)).html))
        return r
      }

      // 1. Sin X-Real-IP, o con algo que no es exactamente una IP: error genérico, sin guardar y sin contar en el límite.
      const n0 = await nMensajes()
      const sinCabecera = await serie([[ruta, valido('a'), { 'X-Forwarded-For': '203.0.113.1' }]])
      const malas = ['falso', '203.0.113.5, 203.0.113.6', '203.0.113.5:8080', '[2001:db8::1]', 'fe80::1%eth0', '010.0.0.1', '203.0.113.5 x']
      const resMalas = await serie(malas.map((v) => [ruta, valido('b'), { 'X-Real-IP': v }]))
      const repetida = await serie([
        [
          ruta,
          valido('c'),
          [
            ['X-Real-IP', '203.0.113.7'],
            ['X-Real-IP', '203.0.113.8'],
          ],
        ],
      ])
      ok('sin X-Real-IP (aunque llegue X-Forwarded-For): error genérico', sinCabecera.join() === 'generico', sinCabecera.join())
      ok(
        'X-Real-IP malformada, ambigua, con puerto, zona o varias IP: error genérico',
        resMalas.every((r) => r === 'generico'),
        resMalas.join(),
      )
      ok('X-Real-IP repetida: error genérico', repetida.join() === 'generico', repetida.join())
      ok('ninguno de esos envíos se guarda', (await nMensajes()) === n0)

      // 2. X-Forwarded-For falsificado no cambia la clave, que es la de X-Real-IP.
      const r2 = await serie([0, 1, 2, 3].map((i) => [ruta, corto, { 'X-Real-IP': '198.51.100.200', 'X-Forwarded-For': `203.0.113.${i}` }]))
      ok(
        'misma X-Real-IP: el 4.º intento del minuto se limita aunque cambie X-Forwarded-For',
        r2.join() === 'validacion,validacion,validacion,limite',
        r2.join(),
      )
      ok('otra X-Real-IP tiene su propio límite', (await serie([[ruta, corto, { 'X-Real-IP': '198.51.100.201' }]])).join() === 'validacion')

      // 3. IPv6: la misma /64 es el mismo cliente; una IPv4 mapeada es la misma IPv4.
      const r3 = await serie(['a', 'b', 'c', 'd'].map((s) => [ruta, corto, { 'X-Real-IP': `2001:db8:1:2::${s}` }]))
      ok('IPv6: cambiar de dirección dentro de la misma /64 no da un cubo nuevo', r3.join() === 'validacion,validacion,validacion,limite', r3.join())
      ok('IPv6: otra /64 es otro cliente', (await serie([[ruta, corto, { 'X-Real-IP': '2001:db8:1:3::a' }]])).join() === 'validacion')
      const r3b = await serie(['198.51.100.77', '198.51.100.77', '198.51.100.77', '::ffff:198.51.100.77'].map((v) => [ruta, corto, { 'X-Real-IP': v }]))
      ok('una IPv4 mapeada en IPv6 cuenta como la misma IPv4', r3b.join() === 'validacion,validacion,validacion,limite', r3b.join())

      // 4. IP y grupo: 5 envíos válidos por hora (los intentos con errores no cuentan); cambiar de grupo no salta el
      //    límite por minuto de la IP.
      const ipA = '198.51.100.50'
      const r4 = await serie(['A1', 'A2', 'A3'].map((n) => [ruta, valido(n), { 'X-Real-IP': ipA }]))
      console.log('  · esperando 61 s a que caduque la ventana por minuto de esa IP')
      await new Promise((res) => setTimeout(res, 61_000))
      r4.push(...(await serie(['A4', 'A5', 'A6'].map((n) => [ruta, valido(n), { 'X-Real-IP': ipA }]))))
      await anotarCreados()
      ok(
        'IP y grupo: 5 envíos válidos aceptados en la hora; el 6.º, limitado con su propio aviso',
        r4.join() === 'ok,ok,ok,ok,ok,limite-cliente-grupo',
        r4.join(),
      )
      const otroGrupo = await serie([['litartmo', valido('A7'), { 'X-Real-IP': ipA }]])
      ok('enviar a otro grupo no salta el límite por minuto de la IP', otroGrupo.join() === 'limite', otroGrupo.join())

      // 5. Concurrencia: 6 envíos válidos a la vez desde una IP nueva → exactamente 3 aceptados (límite por minuto).
      const n5 = await nMensajes()
      const r5 = (await Promise.all(['C1', 'C2', 'C3', 'C4', 'C5', 'C6'].map((n) => enviarSinJS(ruta, valido(n), { 'X-Real-IP': '198.51.100.60' })))).map((r) =>
        resultado(r.html),
      )
      await anotarCreados()
      ok(
        '6 envíos simultáneos de una misma IP: 3 aceptados y 3 limitados',
        r5.filter((e) => e === 'ok').length === 3 && r5.filter((e) => e === 'limite').length === 3 && (await nMensajes()) - n5 === 3,
        r5.join(),
      )

      // 6. Límite por grupo: 20 envíos válidos cada 10 min, de cualquier IP. 21 a la vez, de IPs distintas, en un grupo
      //    sin envíos previos en este servidor.
      const rutaG = 'litartmo/subgrupo-demo'
      const grupoG = exigir((await payload.find({ collection: 'grupos', where: { ruta: { equals: rutaG } }, limit: 1, depth: 0 })).docs[0], `el grupo ${rutaG}`)
      const contarG = async () => (await payload.count({ collection: 'mensajes', where: { grupo: { equals: grupoG.id } }, overrideAccess: true })).totalDocs
      const antesG = await contarG()
      const r6 = (await Promise.all(Array.from({ length: 21 }, (_, i) => enviarSinJS(rutaG, valido(`G${i + 1}`), { 'X-Real-IP': `198.51.101.${i + 1}` })))).map(
        (r) => resultado(r.html),
      )
      await anotarCreados()
      ok(
        'límite por grupo: de 21 envíos válidos de IPs distintas, 20 aceptados y 1 rechazado con el error genérico',
        r6.filter((e) => e === 'ok').length === 20 && r6.filter((e) => e === 'generico').length === 1 && (await contarG()) - antesG === 20,
        `${r6.filter((e) => e === 'ok').length} ok, ${r6.filter((e) => e === 'generico').length} rechazado`,
      )
    }
  }
  // Solo con un servidor arrancado con CONFIAR_EN_PROXY=1, y esta prueba también con él: SECCIONES=antispam (subfase 4c).
  // Cada envío lleva su propia X-Real-IP, para que los límites de la 4b no se mezclen con lo que se prueba. Crea
  // mensajes en litartmo y en el grupo demo (y los borra).
  if (SECCIONES.includes('antispam')) {
    console.log('Antispam (4c): posible spam, duplicados y campo trampa')
    if (process.env.CONFIAR_EN_PROXY?.trim() !== '1') ok('CONFIAR_EN_PROXY=1 para esta sección (y en el servidor)', false)
    else {
      const rutaL = 'litartmo'
      const rutaDemo = 'estudios-andinos-demo'
      const L = exigir((await payload.find({ collection: 'grupos', where: { ruta: { equals: rutaL } }, limit: 1, depth: 0 })).docs[0], `el grupo ${rutaL}`)
      let n = 0
      const ip = () => ({ 'X-Real-IP': `198.51.102.${++n}` })
      const campos = (clave: string, extra: Record<string, string> = {}) => ({
        nombre: `${MARCA} ${clave}`,
        correo: `${clave.toLowerCase()}@ejemplo.invalid`,
        institucion: '',
        tipo: 'Otro',
        mensaje: `Propuesta de prueba ${clave} para el antispam.`,
        ...extra,
      })
      const recibido = (h: string) => h.includes('Mensaje recibido')
      const generico = (h: string) => h.includes('No se pudo enviar la propuesta')
      const guardados = async (nombre: string) => {
        const { docs } = await payload.find({ collection: 'mensajes', where: { nombre: { equals: nombre } }, limit: 5, depth: 0, overrideAccess: true })
        for (const d of docs) if (!temporales.some((t) => t.collection === 'mensajes' && t.id === d.id)) temporales.push({ collection: 'mensajes', id: d.id })
        return docs
      }
      const enviarYLeer = async (ruta: string, c: ReturnType<typeof campos>, opciones: { sinEsperar?: boolean } = {}) => {
        const r = await enviarSinJS(ruta, c, ip(), opciones)
        return { html: r.html, doc: (await guardados(c.nombre))[0] }
      }

      // 1. Envío normal, rápido y con enlaces: todos se guardan; solo cambia el estado.
      const normal = await enviarYLeer(rutaL, campos('Normal'))
      ok(
        'envío normal: recibido y guardado como «nuevo», sin duplicado',
        recibido(normal.html) && normal.doc?.estado === 'nuevo' && normal.doc.duplicadoDe == null,
      )
      const cRapido = campos('Rapido')
      const rapido = await enviarYLeer(rutaL, cRapido, { sinEsperar: true })
      ok(
        'enviado en menos de 2 s: misma confirmación para quien envía; guardado como «posible spam» con su contenido intacto',
        recibido(rapido.html) &&
          rapido.doc?.estado === 'posible-spam' &&
          rapido.doc.mensaje === cRapido.mensaje &&
          rapido.doc.correo === cRapido.correo &&
          rapido.doc.grupo === L.id,
        rapido.doc?.estado ?? 'no guardado',
      )
      const tres = 'https://a.invalid https://b.invalid https://c.invalid'
      const conTres = await enviarYLeer(rutaL, campos('Tres', { mensaje: `Propuesta con enlaces: ${tres}` }))
      const cCuatro = campos('Cuatro', { mensaje: `Propuesta con enlaces: ${tres} www.d.invalid` })
      const conCuatro = await enviarYLeer(rutaL, cCuatro)
      ok(
        '3 enlaces: «nuevo»; 4 enlaces: «posible spam», sin descartar',
        conTres.doc?.estado === 'nuevo' && recibido(conCuatro.html) && conCuatro.doc?.estado === 'posible-spam',
      )
      ok('el mensaje marcado conserva el texto original, con sus enlaces', conCuatro.doc?.mensaje === cCuatro.mensaje)

      // 2. Campo trampa: lleno → rechazado sin guardar (también a toda prisa, como un robot).
      const trampa = await enviarSinJS(rutaL, { ...campos('Trampa'), sitio_web: 'https://spam.invalid' }, ip())
      const trampaRapida = await enviarSinJS(rutaL, { ...campos('TrampaRapida'), sitio_web: 'x' }, ip(), { sinEsperar: true })
      ok(
        'campo trampa lleno: error genérico y nada guardado, también sin esperar',
        generico(trampa.html) &&
          generico(trampaRapida.html) &&
          (await guardados(`${MARCA} Trampa`)).length === 0 &&
          (await guardados(`${MARCA} TrampaRapida`)).length === 0,
      )

      // 3. Duplicados: mismo correo (sin distinguir mayúsculas) y mismo mensaje, mismo grupo, 10 minutos.
      const texto = 'Mensaje que se enviará más de una vez.'
      const uno = await enviarYLeer(rutaL, campos('DupUno', { correo: 'dup@ejemplo.invalid', mensaje: texto }))
      const A = exigir(uno.doc, 'el primer envío')
      const fotoA = await foto('mensajes', A.id)
      const dos = await enviarYLeer(rutaL, campos('DupDos', { correo: 'DUP@Ejemplo.invalid', mensaje: texto }))
      ok(
        'mismo correo (otras mayúsculas) y mismo mensaje: guardado y marcado como duplicado del primero',
        recibido(dos.html) && dos.doc?.duplicadoDe === A.id && dos.doc.estado === 'nuevo',
        `duplicadoDe ${dos.doc?.duplicadoDe ?? 'vacío'}`,
      )
      ok(
        'la respuesta del duplicado es la normal y no muestra nada del envío anterior',
        recibido(dos.html) && !dos.html.includes('DupUno') && !dos.html.includes(`/${A.id}`),
      )
      const tresVeces = await enviarYLeer(rutaL, campos('DupTres', { correo: 'dup@ejemplo.invalid', mensaje: texto }))
      ok('un tercero apunta al original, no al segundo', tresVeces.doc?.duplicadoDe === A.id)
      ok('el primer envío no se modifica', (await foto('mensajes', A.id)) === fotoA)
      const otroTexto = await enviarYLeer(rutaL, campos('DupOtroTexto', { correo: 'dup@ejemplo.invalid', mensaje: `${texto} Con otra frase.` }))
      const otroCorreo = await enviarYLeer(rutaL, campos('DupOtroCorreo', { correo: 'otra@ejemplo.invalid', mensaje: texto }))
      ok(
        'coincidencia parcial (solo el correo o solo el mensaje): no es duplicado',
        otroTexto.doc?.duplicadoDe == null && otroCorreo.doc?.duplicadoDe == null && Boolean(otroTexto.doc && otroCorreo.doc),
      )
      const enDemo = await enviarYLeer(rutaDemo, campos('DupDemo', { correo: 'dup@ejemplo.invalid', mensaje: texto }))
      ok(
        'el mismo envío a otro grupo no es duplicado (cada grupo solo se compara consigo mismo)',
        enDemo.doc?.duplicadoDe == null && enDemo.doc?.grupo === B.id,
      )
      const enDemo2 = await enviarYLeer(rutaDemo, campos('DupDemoDos', { correo: 'dup@ejemplo.invalid', mensaje: texto }))
      ok('en ese otro grupo, el segundo sí es duplicado del suyo', enDemo2.doc?.duplicadoDe === enDemo.doc?.id)

      // Fuera de la ventana: un mensaje igual recibido hace 11 minutos no cuenta.
      const textoViejo = 'Mensaje recibido hace más de diez minutos.'
      const viejo = await payload.create({
        collection: 'mensajes',
        overrideAccess: true,
        data: {
          nombre: `${MARCA} DupViejo`,
          correo: 'viejo@ejemplo.invalid',
          tipo: 'Otro',
          mensaje: textoViejo,
          grupo: L.id,
          createdAt: new Date(Date.now() - 11 * 60_000).toISOString(),
        },
      })
      temporales.push({ collection: 'mensajes', id: viejo.id })
      const tarde = await enviarYLeer(rutaL, campos('DupTarde', { correo: 'viejo@ejemplo.invalid', mensaje: textoViejo }))
      ok(
        'el mismo envío fuera de los 10 minutos no es duplicado',
        Date.now() - new Date(viejo.createdAt).getTime() > 10 * 60_000 && Boolean(tarde.doc) && tarde.doc?.duplicadoDe == null,
        `antigüedad del anterior ${Math.round((Date.now() - new Date(viejo.createdAt).getTime()) / 60_000)} min`,
      )

      // Concurrencia: dos envíos idénticos a la vez (desde IPs distintas) → uno original y otro duplicado de él.
      const textoSimultaneo = 'Dos envíos idénticos en el mismo instante.'
      await Promise.all(
        ['DupSimA', 'DupSimB'].map((c) => enviarSinJS(rutaL, campos(c, { correo: 'simultaneo@ejemplo.invalid', mensaje: textoSimultaneo }), ip())),
      )
      const [sa, sb] = [(await guardados(`${MARCA} DupSimA`))[0], (await guardados(`${MARCA} DupSimB`))[0]]
      ok(
        'dos envíos idénticos simultáneos: los dos se guardan y exactamente uno queda marcado como duplicado del otro',
        Boolean(sa && sb) &&
          [sa?.duplicadoDe, sb?.duplicadoDe].filter((d) => d != null).length === 1 &&
          (sa?.duplicadoDe === sb?.id || sb?.duplicadoDe === sa?.id),
      )

      // 4. Panel y permisos (editor temporal del grupo demo).
      const idDemo2 = exigir(enDemo2.doc, 'el duplicado del grupo demo').id
      const leido = await fetch(`${BASE}/api/mensajes/${idDemo2}?depth=0`, { headers: auth })
      const leidoJson = (await leido.json()) as { estado?: string; duplicadoDe?: number }
      ok(
        'el editor del grupo ve el estado y el duplicado de los mensajes de su grupo',
        leido.status === 200 && leidoJson.duplicadoDe === enDemo.doc?.id,
        `HTTP ${leido.status}`,
      )
      const ajeno = await fetch(`${BASE}/api/mensajes/${A.id}`, { headers: auth })
      const listaAjena = (await (await fetch(`${BASE}/api/mensajes?where[duplicadoDe][equals]=${A.id}&depth=0`, { headers: auth })).json()) as {
        totalDocs?: number
      }
      ok(
        'el editor no lee mensajes de otro grupo, ni por id ni buscando sus duplicados',
        [403, 404].includes(ajeno.status) && listaAjena.totalDocs === 0,
        `HTTP ${ajeno.status}`,
      )
      const antesPatch = await foto('mensajes', idDemo2)
      const invalido = await fetch(`${BASE}/api/mensajes/${idDemo2}`, {
        method: 'PATCH',
        headers: { ...auth, ...json },
        body: JSON.stringify({ estado: 'borrado' }),
      })
      ok(
        'un estado que no está en la lista se rechaza y el mensaje no cambia',
        invalido.status === 400 && (await foto('mensajes', idDemo2)) === antesPatch,
        `HTTP ${invalido.status}`,
      )
      const cambio = await fetch(`${BASE}/api/mensajes/${idDemo2}`, {
        method: 'PATCH',
        headers: { ...auth, ...json },
        body: JSON.stringify({ estado: 'posible-spam', duplicadoDe: null, mensaje: 'alterado', correo: 'otro@ejemplo.invalid' }),
      })
      const tras = await payload.findByID({ collection: 'mensajes', id: idDemo2, depth: 0, overrideAccess: true })
      ok(
        'el editor puede cambiar el estado (p. ej. a «posible spam»), pero no el duplicado ni lo que escribió la persona',
        cambio.status === 200 &&
          tras.estado === 'posible-spam' &&
          tras.duplicadoDe === enDemo.doc?.id &&
          tras.mensaje === texto &&
          tras.correo === 'dup@ejemplo.invalid',
        `HTTP ${cambio.status}`,
      )
      const ajenoPatch = await fetch(`${BASE}/api/mensajes/${A.id}`, {
        method: 'PATCH',
        headers: { ...auth, ...json },
        body: JSON.stringify({ estado: 'atendido' }),
      })
      ok(
        'el editor no puede cambiar el estado de un mensaje de otro grupo',
        [403, 404].includes(ajenoPatch.status) && (await foto('mensajes', A.id)) === fotoA,
        `HTTP ${ajenoPatch.status}`,
      )
    }
  }
} catch (e) {
  fallos++
  console.log(`  ✗ error inesperado: ${(e as Error).name}: ${(e as Error).message}`)
} finally {
  for (const t of temporales.reverse()) {
    await payload
      .delete({ collection: t.collection as 'integrantes', id: t.id as number, overrideAccess: true })
      .catch((e) => console.log(`  · no se pudo borrar ${t.collection} ${t.id}: ${(e as Error).message}`))
  }
  const dir = carpetaMedia()
  if (existsSync(dir)) for (const f of readdirSync(dir).filter((n) => n.startsWith(MARCA))) unlinkSync(path.join(dir, f))
  console.log(`limpieza: ${temporales.length} temporales`)
}
console.log(fallos ? `[seguridad] FALLOS: ${fallos}` : '[seguridad] SUCCESS')
process.exit(fallos ? 1 : 0)
