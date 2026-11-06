/**
 * Carga de los datos de las fichas de los grupos de investigación (páginas «grupo-de-investigacion-*» de
 * letras.unmsm.edu.pe, extraídas el 06-11-2026 en scripts/datos/fichas-grupos-2026.json) y retirada de las entradas de
 * prueba.
 *   INVENTARIO_DESTINO=<host>:<puerto>/<base> pnpm payload run scripts/cargar-fichas-2026.ts                       (solo plan)
 *   INVENTARIO_DESTINO=<host>:<puerto>/<base> INVENTARIO_APLICAR=1 pnpm payload run scripts/cargar-fichas-2026.ts  (escribe)
 * (Una variable y no una opción --aplicar: `payload run` se queda las opciones y no llegan al script.)
 * INVENTARIO_DESTINO debe coincidir con el destino de DATABASE_URI: así nunca se escribe en una base por descuido.
 *
 * 1. Entradas de prueba: borra los grupos ficticios de la semilla (estudios-andinos-demo y litartmo/subgrupo-demo) con
 *    todo su contenido y sus cuentas de editor; en los grupos reales, el contenido marcado como prueba («(texto de
 *    prueba)», «… de prueba», @validacion.test, imágenes f161-*) y los textos de demostración de LITARTMO.
 * 2. Datos de las fichas: solo lo que publica cada ficha; lo que no consta se omite (nada se deduce) y nunca se
 *    cargan DNI ni otros datos que la plataforma no usa. No pisa el trabajo de los editores: un campo se escribe si
 *    está vacío, es provisional o de prueba, o si ningún usuario del panel ha modificado nunca esa landing (registro de
 *    cambios); lo mismo con cada integrante. Un integrante ya existente (mismo nombre, aunque esté escrito de otra
 *    forma) se actualiza conservando su nombre; los demás se crean. Idempotente.
 */
import config from '@payload-config'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { getPayload } from 'payload'

// ── Destino ─────────────────────────────────────────────────────────────────────────────────────────────────────────
const salir = (m: string, codigo = 2): never => {
  console.error(`[fichas] ${m}`)
  process.exit(codigo)
}
let destino = ''
try {
  const u = new URL(process.env.DATABASE_URI ?? '')
  destino = `${u.hostname}:${u.port || '5432'}${u.pathname}`
} catch {
  salir('DATABASE_URI no es válida. No se hace nada.')
}
if (process.env.INVENTARIO_DESTINO !== destino) salir(`INVENTARIO_DESTINO no coincide con el destino (${destino}). No se hace nada.`)
const APLICAR = process.env.INVENTARIO_APLICAR === '1'
console.log(`[fichas] Destino ${destino} · ${APLICAR ? 'APLICANDO cambios' : 'solo plan (sin INVENTARIO_APLICAR=1 no se escribe nada)'}`)

// ── Datos de las fichas ─────────────────────────────────────────────────────────────────────────────────────────────
type Miembro = { nombre: string; tipo: 'titular' | 'adherente' | null; coordinador: boolean; rol: string; vinculo: string; facultad: string }
type Ficha = {
  url: string
  error?: string
  presentacion: string[]
  objetivoGeneral: string | null
  objetivos: string[]
  servicios: string[]
  lineas: { codigo: string; linea: string }[]
  ambientes: string[]
  equipos: string[]
  correo: string | null
  miembros: Miembro[]
}
const FICHAS = JSON.parse(readFileSync(fileURLToPath(new URL('./datos/fichas-grupos-2026.json', import.meta.url)), 'utf8')) as Record<string, Ficha>

// ── Marcas de prueba ────────────────────────────────────────────────────────────────────────────────────────────────
const GRUPOS_FICTICIOS = ['estudios-andinos-demo', 'litartmo/subgrupo-demo']
const PRUEBA = /\(texto de prueba\)|\(prueba\)|\bde prueba\b|@validacion\.test|Responsable de prueba/i
const esPrueba = (v: unknown): boolean => (typeof v === 'string' ? PRUEBA.test(v) : v != null && typeof v === 'object' && Object.values(v).some(esPrueba))
const PROVISIONAL_TEXTO = /todavía no ha cargado el contenido de su landing/
const PROVISIONAL_INTRO = 'El grupo aún no ha cargado a sus integrantes.'
/** Textos de demostración de la semilla en la landing de LITARTMO → los de la importación 2026 (categoría A). */
const DEMO_LITARTMO = {
  texto: /^Este contenido es de prueba\./,
  integrantesIntro: /^Sección de demostración/,
  titular: /^Página de demostración/,
  edicion: /^Página de demostración$/,
  editorialEtiqueta: /^Demostración$/,
}

// ── Ejecución ───────────────────────────────────────────────────────────────────────────────────────────────────────
const payload = await getPayload({ config })
const op = { overrideAccess: true, depth: 0 } as const
const plan: string[] = []
const paso = async (descripcion: string, accion: () => Promise<unknown>) => {
  plan.push(descripcion)
  console.log(`[fichas] ${APLICAR ? '·' : '(plan)'} ${descripcion}`)
  if (APLICAR) await accion()
}
type Doc = Record<string, unknown> & { id: number }
const todos = async (collection: 'integrantes' | 'publicaciones' | 'noticias' | 'actividades' | 'eventos' | 'mensajes' | 'media' | 'landing', where: object) =>
  (await payload.find({ collection, where: where as never, draft: true, limit: 0, pagination: false, ...op })).docs as unknown as Doc[]
const grupoPorRuta = async (ruta: string) =>
  ((await payload.find({ collection: 'grupos', where: { ruta: { equals: ruta } }, limit: 2, ...op })).docs[0] as unknown as Doc | undefined) ?? null
/** ¿Algún usuario del panel ha modificado este documento? (registro de cambios: actor «usuario:<id>»). */
const tocadoPorEditor = async (coleccion: string, id: number) =>
  (
    await payload.count({
      collection: 'registro-cambios',
      where: { and: [{ coleccion: { equals: coleccion } }, { documento: { equals: String(id) } }, { actor: { like: 'usuario:' } }] },
      overrideAccess: true,
    })
  ).totalDocs > 0

// 1a. Grupos ficticios de la semilla, con todo su contenido y sus cuentas.
for (const ruta of GRUPOS_FICTICIOS) {
  const g = await grupoPorRuta(ruta)
  if (!g) {
    console.log(`[fichas] ${ruta}: no existe (nada que borrar)`)
    continue
  }
  for (const coleccion of ['noticias', 'actividades', 'eventos', 'publicaciones', 'integrantes', 'mensajes', 'landing', 'media'] as const) {
    for (const d of await todos(coleccion, { grupo: { equals: g.id } })) {
      await paso(`borrar ${coleccion} ${d.id} del grupo ficticio ${ruta}`, () => payload.delete({ collection: coleccion, id: d.id, ...op }))
    }
  }
  const cuentas = (await payload.find({ collection: 'usuarios', where: { 'grupos.grupo': { equals: g.id } }, limit: 0, pagination: false, ...op }))
    .docs as unknown as (Doc & {
    roles: string[]
    grupos?: { grupo: unknown }[]
  })[]
  for (const u of cuentas) {
    const soloEste = (u.grupos ?? []).every((x) => (typeof x.grupo === 'object' && x.grupo ? (x.grupo as Doc).id : x.grupo) === g.id)
    if (soloEste && JSON.stringify(u.roles) === '["editor"]')
      await paso(`borrar la cuenta de editor ${u.id} (solo del grupo ficticio ${ruta})`, () => payload.delete({ collection: 'usuarios', id: u.id, ...op }))
    else console.log(`[fichas] la cuenta ${u.id} tiene otros grupos o roles: se conserva`)
  }
  await paso(`borrar el grupo ficticio ${ruta} (${g.id})`, () => payload.delete({ collection: 'grupos', id: g.id, ...op }))
}

// 1b. Contenido de prueba en los grupos reales.
for (const [coleccion, campo, re] of [
  ['integrantes', 'nombre', /^Integrante de Prueba\b/],
  ['publicaciones', 'titulo', /^Publicación de prueba\b/],
  ['noticias', 'titulo', /^Actividad de prueba\b/],
  ['eventos', 'titulo', /^Evento de prueba\b/],
] as const) {
  for (const d of await todos(coleccion, {})) {
    if (re.test(String(d[campo] ?? '')))
      await paso(`borrar ${coleccion} ${d.id} «${d[campo]}» (prueba)`, () => payload.delete({ collection: coleccion, id: d.id, ...op }))
  }
}
const imagenesPrueba = (await todos('media', { filename: { like: 'f161-' } })).map((m) => m.id)
for (const l of await todos('landing', {})) {
  const cambios: Record<string, unknown> = {}
  for (const campo of ['objetivoGeneral', 'correoContacto']) if (esPrueba(l[campo])) cambios[campo] = null
  for (const campo of ['objetivosEspecificos', 'servicios', 'lineas', 'ambientes', 'equipos']) {
    const filas = (l[campo] as unknown[] | null) ?? []
    if (filas.some(esPrueba)) cambios[campo] = filas.filter((f) => !esPrueba(f))
  }
  const aliados = (l.aliados as Doc[] | null) ?? []
  if (aliados.some((a) => esPrueba(a.nombre) || imagenesPrueba.includes(Number(a.logo))))
    cambios.aliados = aliados.filter((a) => !esPrueba(a.nombre) && !imagenesPrueba.includes(Number(a.logo)))
  const galeria = (l.galeria as Doc[] | null) ?? []
  if (galeria.some((x) => imagenesPrueba.includes(Number(x.imagen)))) cambios.galeria = galeria.filter((x) => !imagenesPrueba.includes(Number(x.imagen)))
  if (DEMO_LITARTMO.texto.test(String(l.texto ?? ''))) {
    cambios.texto =
      'Grupo de investigación de la Facultad de Letras y Ciencias Humanas, registrado en el Vicerrectorado de Investigación y Posgrado de la UNMSM (2026) con categoría A. El grupo todavía no ha cargado el contenido de su landing.'
    if (DEMO_LITARTMO.integrantesIntro.test(String(l.integrantesIntro ?? ''))) cambios.integrantesIntro = PROVISIONAL_INTRO
    if (DEMO_LITARTMO.titular.test(String(l.titular ?? ''))) cambios.titular = l.lema
    if (DEMO_LITARTMO.edicion.test(String(l.edicion ?? ''))) cambios.edicion = 'Registro 2026'
    if (DEMO_LITARTMO.editorialEtiqueta.test(String(l.editorialEtiqueta ?? ''))) cambios.editorialEtiqueta = 'Categoría A'
  }
  if (Object.keys(cambios).length)
    await paso(`landing ${l.id}: retirar contenido de prueba/demostración (${Object.keys(cambios).join(', ')})`, () =>
      payload.update({ collection: 'landing', id: l.id, data: { ...cambios, _status: 'published' } as never, ...op }),
    )
}
for (const id of imagenesPrueba) await paso(`borrar la imagen de prueba ${id}`, () => payload.delete({ collection: 'media', id, ...op }))

// 2. Datos de las fichas.
/** Palabras significativas de un nombre (sin tildes, mayúsculas, comas ni partículas). */
const palabras = (t: string) =>
  t
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z\s]/g, ' ')
    .split(/\s+/)
    .filter((x) => x && !['de', 'del', 'la', 'los', 'y'].includes(x))
/** Mismo nombre escrito de otra forma («QUIROZ PAPA DE GARCIA, ROSALIA» = «Rosalía Quiroz Papa de García»). */
const mismaPersona = (a: string, b: string) => {
  const x = palabras(a)
  const y = palabras(b)
  const comunes = x.filter((p) => y.includes(p)).length
  const menor = Math.min(x.length, y.length)
  return menor > 0 && comunes >= Math.min(3, menor) && comunes >= menor - 1
}
const resumen: string[] = []
for (const [ruta, f] of Object.entries(FICHAS)) {
  if (f.error) {
    resumen.push(`${ruta}: ficha no disponible (${f.error})`)
    continue
  }
  const g = await grupoPorRuta(ruta)
  if (!g || g.padre != null) {
    resumen.push(`${ruta}: omitido (no existe como grupo de investigación)`)
    continue
  }
  const l = (await todos('landing', { grupo: { equals: g.id } }))[0]
  if (!l) {
    resumen.push(`${ruta}: omitido (sin landing)`)
    continue
  }
  // Sin cambios de editores, la landing solo tiene lo cargado por procesos: se puede actualizar con la ficha.
  const libreLanding = !(await tocadoPorEditor('landing', l.id))
  const libre = (v: unknown) => libreLanding || v == null || v === '' || (Array.isArray(v) && (v.length === 0 || v.every(esPrueba))) || esPrueba(v)
  const datos: Record<string, unknown> = {}
  const texto = f.presentacion.join('\n\n')
  if (texto && texto !== l.texto && (libreLanding || PROVISIONAL_TEXTO.test(String(l.texto ?? '')) || esPrueba(l.texto))) datos.texto = texto
  const poner = (campo: string, valor: unknown, hay: boolean) => {
    if (hay && libre(l[campo]) && JSON.stringify(valor) !== JSON.stringify(sinIds(l[campo]))) datos[campo] = valor
  }
  const sinIds = (v: unknown) => (Array.isArray(v) ? v.map((x) => Object.fromEntries(Object.entries(x as object).filter(([k]) => k !== 'id'))) : v)
  poner('objetivoGeneral', f.objetivoGeneral, Boolean(f.objetivoGeneral))
  poner(
    'objetivosEspecificos',
    f.objetivos.map((objetivo) => ({ objetivo })),
    f.objetivos.length > 0,
  )
  poner(
    'servicios',
    f.servicios.map((servicio) => ({ servicio })),
    f.servicios.length > 0,
  )
  poner(
    'lineas',
    f.lineas.map((x) => ({ codigo: x.codigo || null, linea: x.linea })),
    f.lineas.length > 0,
  )
  poner(
    'ambientes',
    f.ambientes.map((ambiente) => ({ ambiente, ubicacion: null })),
    f.ambientes.length > 0,
  )
  poner(
    'equipos',
    f.equipos.map((laboratorio) => ({ codigo: null, laboratorio, responsable: null })),
    f.equipos.length > 0,
  )
  poner('correoContacto', f.correo, Boolean(f.correo))
  if (f.miembros.length && l.integrantesIntro === PROVISIONAL_INTRO) datos.integrantesIntro = ''
  if (Object.keys(datos).length)
    await paso(`landing de ${ruta}: ${Object.keys(datos).join(', ')}`, () =>
      payload.update({ collection: 'landing', id: l.id, data: { ...datos, _status: 'published' } as never, ...op }),
    )

  // Integrantes: los existentes se actualizan (si ningún editor los tocó) y los que faltan se crean.
  const existentes = (await todos('integrantes', { grupo: { equals: g.id } })).filter((d) => !esPrueba(d.nombre))
  const coordWeb = f.miembros.find((m) => m.coordinador)
  // Un coordinador anterior que no es el de la ficha deja de serlo (si ningún editor lo marcó).
  for (const e of existentes.filter((x) => x.coordinador && coordWeb && !mismaPersona(String(x.nombre), coordWeb.nombre))) {
    if (await tocadoPorEditor('integrantes', e.id)) console.log(`[fichas] ${ruta}: ${e.nombre} sigue como coordinador (lo marcó un editor)`)
    else
      await paso(`integrante de ${ruta}: ${e.nombre} deja la coordinación (la ficha indica a ${coordWeb!.nombre})`, () =>
        payload.update({ collection: 'integrantes', id: e.id, data: { coordinador: false, _status: 'published' } as never, ...op }),
      )
  }
  let creados = 0
  let actualizados = 0
  for (const [i, m] of f.miembros.entries()) {
    const orden = (i + 1) * 10
    const datosM = { tipoInvestigador: m.tipo, coordinador: m.coordinador, rol: m.rol || null, vinculo: m.vinculo || null, facultad: m.facultad || null, orden }
    const e = existentes.find((x) => mismaPersona(String(x.nombre), m.nombre))
    // Si la ficha no indica coordinador, se conserva el que ya hubiera (p. ej. el del reporte RAIS).
    if (e?.coordinador && !coordWeb) Object.assign(datosM, { coordinador: true, rol: e.rol ?? datosM.rol })
    if (e) {
      const igual = Object.entries(datosM).every(([k, v]) => (e[k] ?? null) === (v ?? null) || (k === 'coordinador' && Boolean(e[k]) === v))
      if (igual || (await tocadoPorEditor('integrantes', e.id))) continue
      actualizados++
      await paso(`integrante de ${ruta}: actualizar ${e.nombre}`, () =>
        payload.update({ collection: 'integrantes', id: e.id, data: { ...datosM, _status: 'published' } as never, ...op }),
      )
      continue
    }
    creados++
    await paso(`integrante de ${ruta}: crear ${m.nombre}`, () =>
      payload.create({ collection: 'integrantes', data: { grupo: g.id, nombre: m.nombre, ...datosM, _status: 'published' } as never, ...op }),
    )
  }
  resumen.push(`${ruta}: ${Object.keys(datos).join(', ') || 'landing sin cambios'}; integrantes +${creados} creados, ${actualizados} actualizados`)
}
console.log(`[fichas] ${plan.length} operaciones ${APLICAR ? 'aplicadas' : 'previstas'}.`)
for (const r of resumen) console.log(`[fichas]   ${r}`)
process.exit(0)
