/**
 * Pruebas de aislamiento entre grupos (Local API + HTTP).
 *   pnpm test:aislamiento        (con `pnpm start` corriendo en 127.0.0.1:3000 para la parte HTTP, o en PRUEBAS_URL, solo local)
 * Solo usa los grupos y cuentas FICTICIOS de la semilla: litartmo (L), litartmo/subgrupo-demo (S) y
 * estudios-andinos-demo (B). Crea sus propios temporales, con una marca única: un segundo subgrupo de LITARTMO (T)
 * con su landing publicada y su editor (contraseña solo en memoria); en T, un integrante, una publicación, una
 * actividad, un evento, un mensaje y un archivo; en B, un mensaje y un archivo (imágenes generadas en memoria).
 * - Cada comprobación de aislamiento tiene su control positivo: el dueño ve su recurso de prueba.
 * - Un rechazo esperado solo cuenta si es un error 4xx de la API (o una respuesta HTTP 4xx). Un 5xx, un error de red
 *   o cualquier otro error es un fallo.
 * - Al terminar borra SOLO lo que creó, aunque algo falle: sus registros y los archivos con su marca que una creación
 *   fallida dejara en media/. Quedan las entradas del registro de cambios, que es de auditoría y no se borra.
 */
import config from '@payload-config'
import { randomBytes } from 'node:crypto'
import { existsSync, readdirSync, unlinkSync } from 'node:fs'
import path from 'node:path'
import { getPayload } from 'payload'
import sharp from 'sharp'
import { destinoDePruebas } from './pruebas-url'

// PRUEBAS_URL: otro servidor LOCAL del entorno desechable (p. ej. en otro puerto); por defecto, el de `pnpm verificar`.
// Se valida antes de conectar con la base: un destino no permitido detiene la prueba sin crear nada. La parte de
// Local API usa siempre la base de DATABASE_URI.
let BASE: string
try {
  BASE = destinoDePruebas(process.env.PRUEBAS_URL)
} catch (e) {
  console.error(`✗ ${(e as Error).message}. No se ejecuta ninguna prueba.`)
  process.exit(2)
}
console.log(`Parte HTTP contra ${BASE}`)
const payload = await getPayload({ config })
const MARCA = `aislamiento-${randomBytes(6).toString('hex')}`
let fallos = 0
const ok = (label: string, cond: boolean, extra = '') => {
  console.log(`${cond ? '  ✓' : '  ✗'} ${label}${extra ? ` (${extra})` : ''}`)
  if (!cond) fallos++
}
const es4xx = (status: unknown) => typeof status === 'number' && status >= 400 && status < 500
/** true solo si la operación se rechaza con un error 4xx de la API. Cualquier otro error es un fallo y se muestra. */
const rechaza = async (fn: () => Promise<unknown>) => {
  try {
    await fn()
    return false
  } catch (e) {
    if (es4xx((e as { status?: unknown }).status)) return true
    console.log(`    · error inesperado (no es un rechazo 4xx): ${(e as Error).name}: ${(e as Error).message}`)
    return false
  }
}
type Coleccion = 'grupos' | 'usuarios' | 'media' | 'integrantes' | 'publicaciones' | 'actividades' | 'eventos' | 'mensajes' | 'landing'
const temporales: { collection: Coleccion; id: number }[] = []
/** Comprobación de que una creación se rechaza; si por error se crea, se apunta para borrarla al final. */
const rechazaCrear = (collection: Coleccion, crear: () => Promise<{ id: number }>) =>
  rechaza(async () => {
    const d = await crear()
    temporales.push({ collection, id: d.id })
  })
const exigir = <T>(valor: T | null | undefined, que: string): T => {
  if (valor == null) throw new Error(`falta ${que}`)
  return valor
}
const gid = (d: unknown) => {
  const g = (d as { grupo?: unknown }).grupo
  return typeof g === 'object' && g ? (g as { id: number }).id : (g as number)
}
const grupo = async (ruta: string) => (await payload.find({ collection: 'grupos', where: { ruta: { equals: ruta } }, limit: 1 })).docs[0]
const usuario = async (email: string) => (await payload.find({ collection: 'usuarios', where: { email: { equals: email } }, limit: 1 })).docs[0]
const json = { 'Content-Type': 'application/json' }
const carpetaMedia = () => {
  const dir = payload.collections.media.config.upload.staticDir ?? 'media' // Payload usa el slug si no hay staticDir
  return path.isAbsolute(dir) ? dir : path.resolve(process.cwd(), dir)
}

let tokenT: string | undefined
let landingT: number | undefined

try {
  // Grupos, cuentas y contenido ficticios de la semilla (`pnpm seed`).
  const L = exigir(await grupo('litartmo'), 'el grupo litartmo (pnpm seed)')
  const S = exigir(await grupo('litartmo/subgrupo-demo'), 'el subgrupo litartmo/subgrupo-demo (pnpm seed)')
  const B = exigir(await grupo('estudios-andinos-demo'), 'el grupo estudios-andinos-demo (pnpm seed)')
  const editorL = exigir(await usuario('editor-litartmo@plataforma.local'), 'la cuenta editor-litartmo (pnpm seed)')
  const editorS = exigir(await usuario('editor-subgrupo-demo@plataforma.local'), 'la cuenta editor-subgrupo-demo (pnpm seed)')
  const editorB = exigir(await usuario('editor-demo@plataforma.local'), 'la cuenta editor-demo (pnpm seed)')
  const deB = async (collection: 'integrantes' | 'publicaciones' | 'actividades' | 'eventos' | 'landing', que: string, estado?: 'draft' | 'published') =>
    exigir(
      (
        await payload.find({
          collection,
          where: { and: [{ grupo: { equals: B.id } }, ...(estado ? [{ _status: { equals: estado } }] : [])] },
          draft: true,
          limit: 1,
          depth: 0,
        })
      ).docs[0],
      `${que} del demo (pnpm seed)`,
    )
  const borradorB = await deB('integrantes', 'un integrante en borrador', 'draft')
  const publicadoB = await deB('integrantes', 'un integrante publicado', 'published')
  const publicacionB = await deB('publicaciones', 'una publicación')
  const actividadB = await deB('actividades', 'una actividad')
  const eventoB = await deB('eventos', 'un evento')
  const landingB = await deB('landing', 'la landing')
  const integranteS = exigir(
    (await payload.find({ collection: 'integrantes', where: { grupo: { equals: S.id } }, limit: 1 })).docs[0],
    'un integrante del subgrupo demo',
  )

  // Temporales de esta ejecución (Local API con permisos completos; se borran al final).
  const png = await sharp({ create: { width: 8, height: 8, channels: 3, background: { r: 120, g: 30, b: 30 } } })
    .png()
    .toBuffer()
  const archivo = (sufijo: string) => ({ data: png, mimetype: 'image/png', name: `${MARCA}-${sufijo}.png`, size: png.length })
  const apuntar = <D extends { id: number }>(collection: Coleccion, doc: D) => {
    temporales.push({ collection, id: doc.id })
    return doc
  }
  const publicado = { _status: 'published' as const }
  const T = apuntar(
    'grupos',
    await payload.create({ collection: 'grupos', data: { nombre: `Subgrupo temporal ${MARCA}`, slug: MARCA, activo: true, padre: L.id, orden: 1000 } }),
  )
  const clave = randomBytes(24).toString('base64url')
  const editorT = apuntar(
    'usuarios',
    await payload.create({
      collection: 'usuarios',
      data: { email: `${MARCA}@plataforma.local`, password: clave, roles: ['editor'], grupos: [{ grupo: T.id }] },
    }),
  )
  const mediaT = apuntar('media', await payload.create({ collection: 'media', data: { alt: `Archivo de ${MARCA}`, grupo: T.id }, file: archivo('t') }))
  const mediaB = apuntar('media', await payload.create({ collection: 'media', data: { alt: `Archivo de ${MARCA}`, grupo: B.id }, file: archivo('b') }))
  const integranteT = apuntar(
    'integrantes',
    await payload.create({ collection: 'integrantes', data: { grupo: T.id, nombre: `Integrante ${MARCA}`, foto: mediaT.id, orden: 10, ...publicado } }),
  )
  const publicacionT = apuntar(
    'publicaciones',
    await payload.create({
      collection: 'publicaciones',
      data: { grupo: T.id, titulo: `Publicación ${MARCA}`, autoria: 'Autoría de prueba', tipo: 'Libro', anio: 2026, ...publicado },
    }),
  )
  const actividadT = apuntar(
    'actividades',
    await payload.create({
      collection: 'actividades',
      data: {
        grupo: T.id,
        tipo: 'Seminario',
        titulo: `Actividad ${MARCA}`,
        fecha: '2026-10-01',
        lugar: 'Sala de prueba',
        resumen: 'Actividad temporal de la prueba.',
        ...publicado,
      },
    }),
  )
  const eventoT = apuntar(
    'eventos',
    await payload.create({
      collection: 'eventos',
      data: { grupo: T.id, titulo: `Evento ${MARCA}`, fecha: '2026-10-20', hora: '16:00', tipo: 'Reunión', lugar: 'Sala de prueba', ...publicado },
    }),
  )
  const mensajeT = apuntar(
    'mensajes',
    await payload.create({
      collection: 'mensajes',
      data: { grupo: T.id, nombre: `Remitente ${MARCA}`, correo: `${MARCA}-t@plataforma.local`, mensaje: 'Mensaje temporal de la prueba de aislamiento.' },
    }),
  )
  const mensajeB = apuntar(
    'mensajes',
    await payload.create({
      collection: 'mensajes',
      data: { grupo: B.id, nombre: `Remitente ${MARCA}`, correo: `${MARCA}-b@plataforma.local`, mensaje: 'Mensaje temporal de la prueba de aislamiento.' },
    }),
  )
  const lT = apuntar(
    'landing',
    await payload.create({
      collection: 'landing',
      data: {
        grupo: T.id,
        nombre: `Cabecera ${MARCA}`,
        grupoTexto: 'Subgrupo temporal de la prueba de aislamiento',
        universidad: 'Universidad Nacional Mayor de San Marcos',
        sigla: 'UNMSM',
        ciudad: 'Lima',
        pais: 'Perú',
        anioFundacion: 2026,
        lema: 'Temporal',
        titular: `Titular ${MARCA}`,
        texto: 'Landing temporal de la prueba de aislamiento.',
        ...publicado,
      },
    }),
  )
  landingT = lT.id
  const comoT = { user: editorT, overrideAccess: false as const }

  console.log('Local API — editor del subgrupo temporal: ve lo suyo (control positivo) y nada de los demás')
  const propiosT = {
    integrantes: integranteT.id,
    publicaciones: publicacionT.id,
    actividades: actividadT.id,
    eventos: eventoT.id,
    landing: lT.id,
    media: mediaT.id,
    mensajes: mensajeT.id,
  }
  for (const [coleccion, id] of Object.entries(propiosT) as [keyof typeof propiosT, number][]) {
    const r = await payload.find({ collection: coleccion, ...comoT, draft: true, limit: 500, depth: 0 })
    ok(
      `${coleccion}: ve su recurso de prueba y solo los de su grupo`,
      r.docs.some((d) => d.id === id) && r.docs.every((d) => gid(d) === T.id),
      `${r.totalDocs} docs`,
    )
  }
  const mensajesB = await payload.find({ collection: 'mensajes', user: editorB, overrideAccess: false, limit: 500, depth: 0 })
  ok(
    'mensajes: el editor del demo ve el suyo y ninguno del subgrupo temporal',
    mensajesB.docs.some((d) => d.id === mensajeB.id) && mensajesB.docs.every((d) => gid(d) === B.id),
    `${mensajesB.totalDocs} docs`,
  )
  const porId: [keyof typeof propiosT, number][] = [
    ['integrantes', borradorB.id],
    ['publicaciones', publicacionB.id],
    ['actividades', actividadB.id],
    ['eventos', eventoB.id],
    ['mensajes', mensajeB.id],
    ['media', mediaB.id],
  ]
  for (const [coleccion, id] of porId)
    ok(`no lee por id: ${coleccion} del demo`, await rechaza(() => payload.findByID({ collection: coleccion, id, draft: true, ...comoT })))
  ok(
    'edita su propia publicación (control positivo)',
    !(await rechaza(() => payload.update({ collection: 'publicaciones', id: publicacionT.id, data: { titulo: `Publicación ${MARCA} (editada)` }, ...comoT }))),
  )
  ok('no edita un integrante del demo', await rechaza(() => payload.update({ collection: 'integrantes', id: publicadoB.id, data: { nombre: 'X' }, ...comoT })))
  ok(
    'no edita una publicación del demo',
    await rechaza(() => payload.update({ collection: 'publicaciones', id: publicacionB.id, data: { titulo: 'X' }, ...comoT })),
  )
  ok('no edita una actividad del demo', await rechaza(() => payload.update({ collection: 'actividades', id: actividadB.id, data: { titulo: 'X' }, ...comoT })))
  ok('no edita un evento del demo', await rechaza(() => payload.update({ collection: 'eventos', id: eventoB.id, data: { titulo: 'X' }, ...comoT })))
  ok('no edita un mensaje del demo', await rechaza(() => payload.update({ collection: 'mensajes', id: mensajeB.id, data: { estado: 'atendido' }, ...comoT })))
  ok('no borra un integrante del demo', await rechaza(() => payload.delete({ collection: 'integrantes', id: publicadoB.id, ...comoT })))
  ok(
    'no crea contenido en el demo (ni como borrador)',
    await rechazaCrear('integrantes', () => payload.create({ collection: 'integrantes', data: { nombre: 'Intruso', grupo: B.id }, draft: true, ...comoT })),
  )
  ok('no edita la landing del demo', await rechaza(() => payload.update({ collection: 'landing', id: landingB.id, data: { titular: 'X' }, ...comoT })))
  ok(
    'no crea una segunda landing en su grupo',
    await rechazaCrear('landing', () =>
      payload.create({
        collection: 'landing',
        data: {
          grupo: T.id,
          nombre: 'X',
          grupoTexto: 'X',
          universidad: 'X',
          sigla: 'X',
          ciudad: 'X',
          pais: 'X',
          anioFundacion: 2020,
          lema: 'X',
          titular: 'X',
          texto: 'X',
        },
        ...comoT,
      }),
    ),
  )
  ok('no lee el registro de cambios', await rechaza(() => payload.find({ collection: 'registro-cambios', ...comoT })))
  ok(
    'no crea usuarios',
    await rechazaCrear('usuarios', () =>
      payload.create({ collection: 'usuarios', data: { email: `${MARCA}-intruso@plataforma.local`, password: 'x'.repeat(20), roles: ['editor'] }, ...comoT }),
    ),
  )
  await payload
    .update({ collection: 'usuarios', id: editorT.id, data: { roles: ['superadmin'], grupos: [{ grupo: T.id }, { grupo: B.id }] }, ...comoT })
    .catch(() => null)
  const yo = await payload.findByID({ collection: 'usuarios', id: editorT.id, depth: 0 })
  ok('no se asciende ni se asigna el grupo demo', !(yo.roles ?? []).includes('superadmin') && !(yo.grupos ?? []).some((g) => gid(g) === B.id))

  console.log('Referencias entre grupos')
  const tmp = apuntar(
    'integrantes',
    await payload.create({ collection: 'integrantes', data: { nombre: `Temporal ${MARCA}`, grupo: T.id }, draft: true, ...comoT }),
  )
  ok(
    'usa un archivo de su grupo en su integrante (control positivo)',
    !(await rechaza(() => payload.update({ collection: 'integrantes', id: tmp.id, data: { foto: mediaT.id }, draft: true, ...comoT }))),
  )
  ok(
    'no puede usar un archivo del demo en su integrante',
    await rechaza(() => payload.update({ collection: 'integrantes', id: tmp.id, data: { foto: mediaB.id }, draft: true, ...comoT })),
  )

  console.log('Grupo LITARTMO y sus subgrupos (subgrupo-demo y el temporal) — independientes')
  const ven = async (user: typeof editorS, coleccion: 'integrantes' | 'landing' | 'media') =>
    new Set((await payload.find({ collection: coleccion, user, overrideAccess: false, draft: true, limit: 500, depth: 0 })).docs.map((d) => gid(d)))
  for (const c of ['integrantes', 'landing', 'media'] as const) {
    ok(
      `editor del subgrupo demo: ${c} solo del subgrupo`,
      [...(await ven(editorS, c))].every((g) => g === S.id),
    )
    ok(`editor del subgrupo temporal: ${c} sin nada del subgrupo demo`, !(await ven(editorT, c)).has(S.id))
    ok(`editor del demo: ${c} sin nada del subgrupo`, !(await ven(editorB, c)).has(S.id))
    ok(
      `editor de LITARTMO (padre): ${c} solo del grupo principal, nada de sus subgrupos`,
      [...(await ven(editorL, c))].every((g) => g === L.id),
    )
  }
  ok(
    'el subgrupo temporal no edita contenido del subgrupo demo',
    await rechaza(() => payload.update({ collection: 'integrantes', id: integranteS.id, data: { nombre: 'X' }, ...comoT })),
  )
  ok(
    'el subgrupo demo no edita contenido del subgrupo temporal',
    await rechaza(() => payload.update({ collection: 'integrantes', id: integranteT.id, data: { nombre: 'X' }, user: editorS, overrideAccess: false })),
  )
  ok(
    'el subgrupo demo no crea contenido en el subgrupo temporal',
    await rechazaCrear('integrantes', () =>
      payload.create({ collection: 'integrantes', data: { nombre: 'Intruso', grupo: T.id }, draft: true, user: editorS, overrideAccess: false }),
    ),
  )
  ok(
    'el padre LITARTMO no edita a su subgrupo temporal',
    await rechaza(() => payload.update({ collection: 'integrantes', id: integranteT.id, data: { nombre: 'X' }, user: editorL, overrideAccess: false })),
  )
  ok(
    'el padre LITARTMO no crea contenido en su subgrupo',
    await rechazaCrear('integrantes', () =>
      payload.create({ collection: 'integrantes', data: { nombre: 'Intruso', grupo: S.id }, draft: true, user: editorL, overrideAccess: false }),
    ),
  )
  ok(
    'un subgrupo no puede tener subgrupos',
    await rechazaCrear('grupos', () => payload.create({ collection: 'grupos', data: { nombre: 'Nieto', slug: `${MARCA}-nieto`, padre: S.id } })),
  )
  ok(
    'un subgrupo no puede llamarse «archivo»',
    await rechazaCrear('grupos', () => payload.create({ collection: 'grupos', data: { nombre: 'X', slug: 'archivo', padre: L.id } })),
  )
  ok('rutas calculadas', S.ruta === 'litartmo/subgrupo-demo' && T.ruta === `litartmo/${MARCA}` && L.ruta === 'litartmo', `${S.ruta}, ${T.ruta}`)

  console.log('Visitante anónimo')
  const anon = await payload.find({ collection: 'integrantes', overrideAccess: false, draft: true, limit: 500, depth: 0 })
  ok(
    'integrantes: solo ve publicados, incluido el temporal (control positivo)',
    anon.docs.some((d) => d.id === integranteT.id) && anon.docs.every((d) => d._status === 'published'),
  )
  const anonMensajes = await payload.find({ collection: 'mensajes', overrideAccess: false, limit: 500 }).then(
    (r) => r.totalDocs === 0,
    (e) => es4xx((e as { status?: unknown }).status),
  )
  ok('no lee mensajes de contacto (existen los dos temporales)', anonMensajes)

  console.log('HTTP (requiere pnpm start)')
  try {
    const login = await fetch(`${BASE}/api/usuarios/login`, { method: 'POST', headers: json, body: JSON.stringify({ email: editorT.email, password: clave }) })
    tokenT = ((await login.json()) as { token?: string }).token
    ok('REST: el editor del subgrupo temporal inicia sesión', login.status === 200 && Boolean(tokenT), `HTTP ${login.status}`)
    if (tokenT) {
      const h = { Authorization: `JWT ${tokenT}` }
      // Edita su propia landing por REST: control positivo y, como el hook corre en el servidor, invalida la caché del
      // directorio y del grupo (desde este proceso no se puede: un script no comparte la caché de Next).
      const propia = await fetch(`${BASE}/api/landing/${lT.id}`, {
        method: 'PATCH',
        headers: { ...h, ...json },
        body: JSON.stringify({ titular: `Titular ${MARCA} (REST)`, _status: 'published' }),
      })
      ok('REST: el editor edita su propia landing (control positivo)', propia.status === 200, `HTTP ${propia.status}`)
      for (const [coleccion, id] of [
        ['integrantes', integranteT.id],
        ['mensajes', mensajeT.id],
      ] as const) {
        const res = await fetch(`${BASE}/api/${coleccion}?draft=true&limit=500&depth=0`, { headers: h })
        const lista = (await res.json()) as { docs?: { id: number; grupo: number }[] }
        ok(
          `REST: ${coleccion}: el editor ve el suyo y solo su grupo`,
          res.status === 200 && Array.isArray(lista.docs) && lista.docs.some((d) => d.id === id) && lista.docs.every((d) => d.grupo === T.id),
          `HTTP ${res.status}, ${lista.docs?.length ?? 0} docs`,
        )
      }
      const ajeno = await fetch(`${BASE}/api/integrantes/${borradorB.id}?draft=true`, { headers: h })
      ok('REST: borrador del demo por id → no accesible', ajeno.status === 403 || ajeno.status === 404, `HTTP ${ajeno.status}`)
      const patch = await fetch(`${BASE}/api/integrantes/${publicadoB.id}`, {
        method: 'PATCH',
        headers: { ...h, ...json },
        body: JSON.stringify({ nombre: 'X' }),
      })
      ok('REST: editar un integrante del demo → 4xx', es4xx(patch.status), `HTTP ${patch.status}`)
      const patchMsg = await fetch(`${BASE}/api/mensajes/${mensajeB.id}`, {
        method: 'PATCH',
        headers: { ...h, ...json },
        body: JSON.stringify({ estado: 'atendido' }),
      })
      ok('REST: editar un mensaje del demo → 4xx', es4xx(patchMsg.status), `HTTP ${patchMsg.status}`)
    }
    // Subfase 2b: un anónimo no lee contenido por REST (ni borradores ni publicado): 403 y ningún documento.
    const anonDraft = await fetch(`${BASE}/api/integrantes?draft=true&where[_status][equals]=draft`)
    const anonDraftJson = (await anonDraft.json()) as { docs?: unknown[] }
    ok('REST anónimo: borradores → 403 sin documentos', anonDraft.status === 403 && anonDraftJson.docs === undefined, `HTTP ${anonDraft.status}`)
    const anonMsg = await fetch(`${BASE}/api/mensajes?limit=500`)
    const anonMsgOk = es4xx(anonMsg.status) || (anonMsg.status === 200 && ((await anonMsg.json()) as { totalDocs?: number }).totalDocs === 0)
    ok('REST anónimo: mensajes → no accesibles', anonMsgOk, `HTTP ${anonMsg.status}`)
    const gql = await fetch(`${BASE}/api/graphql`, { method: 'POST', headers: json, body: JSON.stringify({ query: '{ __schema { types { name } } }' }) })
    ok('GraphQL desactivado', gql.status === 404 || gql.status === 405, `HTTP ${gql.status}`)
    const contacto = await fetch(`${BASE}/api/mensajes`, {
      method: 'POST',
      headers: json,
      body: JSON.stringify({ nombre: 'x', correo: 'x@x.com', mensaje: 'xxxxxxxxxxxx', grupo: T.id }),
    })
    ok('REST anónimo: crear mensaje directo → 4xx', es4xx(contacto.status), `HTTP ${contacto.status}`)
    ok('la landing del demo no muestra el borrador', !(await (await fetch(`${BASE}/estudios-andinos-demo`)).text()).includes('Borrador Demo'))
    const sub = await fetch(`${BASE}/litartmo/subgrupo-demo`)
    const subHtml = await sub.text()
    ok(
      'landing del subgrupo: 200, sin su borrador, con enlace al padre',
      sub.status === 200 && !subHtml.includes('Borrador del subgrupo') && subHtml.includes('href="/litartmo"'),
      `HTTP ${sub.status}`,
    )
    ok('archivo del subgrupo: 200', (await fetch(`${BASE}/litartmo/subgrupo-demo/archivo`)).status === 200)
    ok('subgrupo inexistente: 404', (await fetch(`${BASE}/litartmo/no-existe`)).status === 404)
    ok('el subgrupo no responde bajo otro grupo', (await fetch(`${BASE}/estudios-andinos-demo/subgrupo-demo`)).status === 404)
    ok('el archivo de LITARTMO sigue en /litartmo/archivo', (await fetch(`${BASE}/litartmo/archivo`)).status === 200)
    const dir = await (await fetch(`${BASE}/`)).text()
    const iL = dir.indexOf('href="/litartmo"'),
      iS = dir.indexOf('href="/litartmo/subgrupo-demo"'),
      iT = dir.indexOf(`href="/litartmo/${MARCA}"`)
    ok('el menú principal lista bajo LITARTMO: subgrupo demo (orden 10) y luego el temporal (orden 1000)', iL >= 0 && iL < iS && iS < iT)
    const pagT = await fetch(`${BASE}/litartmo/${MARCA}`)
    ok('subgrupo temporal: 200 en su ruta, con su contenido', pagT.status === 200 && (await pagT.text()).includes(`Integrante ${MARCA}`), `HTTP ${pagT.status}`)
    ok('archivo del subgrupo temporal: 200', (await fetch(`${BASE}/litartmo/${MARCA}/archivo`)).status === 200)
    // La Plantilla Grupo lista los subgrupos en el hero (menú «Subgrupos»: cabecera, lema y enlace, datos públicos del
    // directorio). Lo que no puede aparecer en la landing del padre es el CONTENIDO del subgrupo.
    const htmlL = await (await fetch(`${BASE}/litartmo`)).text()
    ok(
      'la landing de LITARTMO (demo) no muestra contenido de sus subgrupos',
      ['Integrante', 'Publicación', 'Actividad', 'Evento', 'Titular', 'Remitente'].every((p) => !htmlL.includes(`${p} ${MARCA}`)),
    )
    ok('la landing de LITARTMO (demo) enlaza su subgrupo desde el menú «Subgrupos»', htmlL.includes(`href="/litartmo/${MARCA}"`))
    const pub = await fetch(`${BASE}/api/media/file/${encodeURIComponent(exigir(mediaT.filename, 'el nombre del archivo temporal'))}`)
    ok('archivo usado por contenido publicado: accesible', pub.status === 200, `HTTP ${pub.status}`)
    const priv = await fetch(`${BASE}/api/media/file/${encodeURIComponent(exigir(mediaB.filename, 'el nombre del archivo temporal'))}`)
    ok('archivo no usado por contenido publicado: no accesible para un anónimo', priv.status === 403 || priv.status === 404, `HTTP ${priv.status}`)
  } catch (e) {
    ok(`parte HTTP completa (¿pnpm start en ${BASE}?)`, false, (e as Error).message)
  }
} catch (e) {
  ok('la prueba se completó sin interrupciones', false, (e as Error).message)
} finally {
  // Despublica por REST la landing temporal antes de borrarla: así el servidor invalida su caché.
  if (tokenT && landingT != null) {
    await fetch(`${BASE}/api/landing/${landingT}`, {
      method: 'PATCH',
      headers: { Authorization: `JWT ${tokenT}`, ...json },
      body: JSON.stringify({ _status: 'draft' }),
    }).catch(() => null)
  }
  const pendientes: string[] = []
  for (const t of [...temporales].reverse()) {
    await payload.delete({ collection: t.collection, id: t.id }).catch((e: Error) => {
      pendientes.push(`${t.collection} ${t.id}`)
      console.log(`  ✗ limpieza: no se pudo borrar ${t.collection} ${t.id}: ${e.message}`)
      fallos++
    })
  }
  // Archivos con la marca de esta ejecución que una creación fallida dejara sin registro (Payload escribe el archivo
  // antes de crear el registro y no lo borra si falla). La marca es aleatoria: no puede coincidir con otro archivo.
  let huerfanos = 0
  const dirMedia = carpetaMedia()
  if (existsSync(dirMedia)) {
    for (const f of readdirSync(dirMedia).filter((n) => n.startsWith(`${MARCA}-`))) {
      if ((await payload.count({ collection: 'media', where: { filename: { equals: f } } })).totalDocs > 0) {
        pendientes.push(`archivo ${f} (con registro)`)
        continue
      }
      unlinkSync(path.join(dirMedia, f))
      huerfanos++
    }
  }
  console.log(
    `Limpieza: ${temporales.length - pendientes.filter((p) => !p.startsWith('archivo')).length}/${temporales.length} temporales borrados, ${huerfanos} archivo(s) huérfano(s) borrado(s)${pendientes.length ? `; quedan: ${pendientes.join(', ')}` : ''}`,
  )
  if (fallos) console.log(`Diagnóstico: marca ${MARCA}; temporales creados: ${temporales.map((t) => `${t.collection} ${t.id}`).join(', ') || 'ninguno'}`)
}
console.log(fallos === 0 ? '[aislamiento] SUCCESS' : `[aislamiento] FAILED - ${fallos}`)
process.exit(fallos === 0 ? 0 : 1)
