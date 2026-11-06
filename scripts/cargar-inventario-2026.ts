/**
 * Carga del inventario de grupos de investigación FLCH-UNMSM 2026 (inventario_grupos_investigacion_flch_2026.md:
 * reporte RAIS 2026 y fichas de letras.unmsm.edu.pe) y retirada de las entradas de prueba.
 *   INVENTARIO_DESTINO=<host>:<puerto>/<base> pnpm payload run scripts/cargar-inventario-2026.ts            (solo plan)
 *   INVENTARIO_DESTINO=<host>:<puerto>/<base> INVENTARIO_APLICAR=1 pnpm payload run scripts/cargar-inventario-2026.ts  (escribe)
 * (Una variable y no una opción --aplicar: `payload run` se queda las opciones y no llegan al script.)
 * INVENTARIO_DESTINO debe coincidir con el destino de DATABASE_URI: así nunca se escribe en una base por descuido.
 *
 * 1. Entradas de prueba: borra los grupos ficticios de la semilla (estudios-andinos-demo y litartmo/subgrupo-demo) con
 *    todo su contenido y sus cuentas de editor; en los grupos reales, el contenido marcado como prueba («(texto de
 *    prueba)», «… de prueba», @validacion.test, imágenes f161-*) y los textos de demostración de LITARTMO.
 * 2. Datos del inventario: solo los que trae el documento; lo que no consta se omite (nada se deduce). Solo rellena
 *    campos vacíos, con texto provisional de la importación o con contenido de prueba: no pisa lo que un editor ya
 *    haya escrito. Idempotente: un integrante que ya existe (mismo nombre en el grupo) no se duplica.
 */
import config from '@payload-config'
import { getPayload } from 'payload'

// ── Destino ─────────────────────────────────────────────────────────────────────────────────────────────────────────
const salir = (m: string, codigo = 2): never => {
  console.error(`[inventario] ${m}`)
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
console.log(`[inventario] Destino ${destino} · ${APLICAR ? 'APLICANDO cambios' : 'solo plan (sin INVENTARIO_APLICAR=1 no se escribe nada)'}`)

// ── Datos del inventario (solo lo que consta en el documento) ───────────────────────────────────────────────────────
type Miembro = { nombre: string; rol?: string; tipo?: 'titular' | 'adherente'; coordinador?: boolean }
type Ficha = {
  presentacion?: string[]
  objetivoGeneral?: string
  objetivos?: string[]
  servicios?: string[]
  lineas?: string[]
  ambientes?: string[]
  equipos?: string[]
  correo?: string
  miembros?: Miembro[]
}
const FICHAS: Record<string, Ficha> = {
  adisco: {
    presentacion: [
      'Desarrolla estudios interdisciplinarios orientados al análisis crítico de discursos producidos en contextos comunicativos, históricos y culturales. Aborda el discurso como práctica social y estudia su relación con el poder, la construcción de identidades, los procesos históricos y los intercambios transculturales. Integra estudios del discurso, historia de los medios y crítica literaria.',
    ],
  },
  cigetmen: {
    presentacion: [
      'Equipo multidisciplinario que investiga la información, las tecnologías de información y las normas técnicas y jurídicas relacionadas. Estudia la descripción, análisis y comprensión del impacto de la información en las actividades, así como su producción, gestión y acceso.',
    ],
    miembros: [{ nombre: 'Rosalía Quiroz Papa de García', rol: 'Coordinadora', coordinador: true }],
  },
  comorg: {
    presentacion: [
      'Integrado por docentes, egresados y estudiantes de pregrado y posgrado de Comunicación Organizacional. Promueve producción científica, innovación aplicada y proyección social en comunicación organizacional como eje estratégico para instituciones públicas, privadas y sociales.',
    ],
    lineas: [
      'Comunicación política, digital e inteligencia artificial',
      'Comunicación de políticas públicas, planificación, desarrollo organizacional y responsabilidad social',
      'Comunicación, desarrollo y medio ambiente',
    ],
    miembros: [{ nombre: 'Franz Jesús Portugal Bernedo', rol: 'Coordinador', coordinador: true }],
  },
  episteme: {
    presentacion: [
      'Conformado por docentes del Departamento de Filosofía, colaboradores externos y estudiantes de pregrado y posgrado dedicados a investigar y difundir distintas áreas de la filosofía y sus aplicaciones.',
    ],
    objetivos: [
      'Elaborar productos de investigación de calidad sobre ramas de la filosofía, como epistemología y ética.',
      'Formar investigadores de pregrado y posgrado con rigor académico.',
      'Difundir investigaciones filosóficas mediante eventos académicos y redes sociales.',
    ],
    servicios: ['Cursos de filosofía de diverso nivel y duración.', 'Consultorías para elaborar y desarrollar investigaciones filosóficas.'],
    lineas: ['Epistemología y filosofía de la ciencia', 'Fenomenología', 'Filosofía práctica (ética y política)', 'Historia de la filosofía'],
    ambientes: ['Espacios físicos proporcionados por la Facultad'],
    equipos: ['Computadoras, escritorios, mesas y sillas'],
    miembros: [{ nombre: 'Franklin Ernesto Ibáñez Blancas', rol: 'Coordinador', coordinador: true }],
  },
  femeigen: {
    presentacion: [
      'Estudia disciplinas humanísticas de distintas escuelas de la FLCH desde una perspectiva interdisciplinaria e intercultural de género. Propone investigaciones en diálogo con historia, ciencias sociales y estudios culturales y de género para analizar las relaciones entre género, etnia y clase y la dominación colonial.',
      'Plantea también fortalecer la autoestima e identidad de género, enfrentar la marginación y violencia, empoderar a las mujeres mediante prácticas artísticas y estudios especializados, y recuperar la memoria y el papel de las mujeres en distintos campos del saber.',
    ],
    miembros: [{ nombre: 'María Yolanda Luisa Westphalen Rodríguez', rol: 'Coordinadora', coordinador: true }],
  },
  humanis: {
    presentacion: ['Grupo de docentes con trayectoria compartida de investigación en temas humanísticos durante al menos dos décadas.'],
    objetivos: [
      'Continuar y profundizar las líneas de investigación de sus integrantes.',
      'Difundir los resultados de investigación al público y a estudiantes mediante conferencias y seminarios.',
    ],
    lineas: ['Literaturas hispanoamericanas: narrativa, poesía y ensayística (línea UNMSM)'],
    ambientes: ['Sala de Investigación de la FLCH'],
    equipos: ['Equipo de cómputo y mobiliario'],
    correo: 'mmartosc@unmsm.edu.pe',
    miembros: [
      { nombre: 'Marco Gerardo Martos Carrera', rol: 'Coordinador', coordinador: true },
      { nombre: 'Arquímedes Américo Mudarra Montoya', tipo: 'titular' },
      { nombre: 'Luis Fernando Muñoz Cabrejo', tipo: 'titular' },
      { nombre: 'Óscar Victorino Coello Cruz', tipo: 'titular' },
      { nombre: 'Norma Luz Magán Altamirano de Hurtado', tipo: 'titular' },
      { nombre: 'Eli Romeo Carrillo Vásquez', rol: 'Adjunto' },
      { nombre: 'Eva María Valero Juan', rol: 'Adjunto externo' },
      { nombre: 'María de Fátima Salvatierra Pérez', rol: 'Adjunto externo' },
      { nombre: 'Magaly Elva Rueda Frías', tipo: 'adherente' },
      { nombre: 'Félix Manco Ramos', tipo: 'adherente' },
      { nombre: 'Joseph Max Espíritu Ventocilla', tipo: 'adherente' },
      { nombre: 'Edwin Roberto Matos Araujo', tipo: 'adherente' },
      { nombre: 'Zulma Viviana Ramírez Méndez', tipo: 'adherente' },
    ],
  },
  infocrea: {
    presentacion: [
      'Integrado por docentes del Departamento Académico de Bibliotecología y Ciencias de la Información, estudiantes de pregrado y posgrado, egresados y especialistas externos. Busca fortalecer investigación científica, producción académica y transferencia de conocimiento frente a desafíos de gestión de información, calidad, acreditación y uso estratégico de la información y creatividad.',
    ],
    objetivoGeneral:
      'Desarrollar investigación científica de calidad en Ciencias de la Información, acreditación y gestión del conocimiento, fortaleciendo producción académica e impacto institucional.',
    objetivos: [
      'Investigar acreditación nacional e internacional.',
      'Gestión de información y conocimiento.',
      'Métricas y evaluación de producción científica.',
      'Asesoría a bibliotecas.',
      'Apoyo metodológico cualitativo, cuantitativo y mixto.',
    ],
    servicios: [
      'Organización de eventos en bibliotecología y acreditación.',
      'Publicaciones sobre gestión de procesos, creatividad, acreditación, IA y gestión del conocimiento.',
      'Asesoría a instituciones públicas en bibliotecas virtuales y servicios.',
      'Conferencias.',
    ],
    lineas: [
      'Gestión de información y conocimiento',
      'Métricas de información y evaluación de producción científica',
      'Evaluación bibliotecológica y aseguramiento de calidad',
    ],
    ambientes: ['Salas de investigación asignadas por el Vicedecanato de Investigación y Posgrado', 'Ambiente del IIPPLA'],
    equipos: ['Equipos de cómputo y recursos digitales'],
    miembros: [{ nombre: 'Julio César Olaya Guerrero', rol: 'Coordinador', coordinador: true }],
  },
  incomun: {
    presentacion: [
      'Espacio multidisciplinario de investigación, creación y difusión que desarrolla proyectos sobre producción cultural vinculada a medios y periodismo, diálogo intercultural e intercambio y difusión de conocimientos científicos y tradicionales mediante plataformas mediáticas y audiovisuales.',
    ],
    servicios: [
      'Registro audiovisual y difusión de actividades y proyectos de investigación y creación.',
      'Talleres y asesoría en capacidades y técnicas de comunicación para docentes y estudiantes.',
    ],
    // Las líneas desarrolladas hasta 2025; las denominaciones propuestas para 2026 quedan pendientes de confirmación.
    lineas: ['Comunicación, poder y sociedad', 'Interculturalidad y estudios de la diversidad cultural', 'Artes y medios visuales y multimediales'],
    miembros: [{ nombre: 'Raúl Fernando Zevallos Ortiz', rol: 'Coordinador', coordinador: true }],
  },
  lingcuso: {
    presentacion: [
      'Investiga sistemáticamente las lenguas peruanas como medio de expresión social, cultural e histórica. Incluye lenguas de filiación andina y amazónica y variedades regionales del castellano. Busca producir conocimiento con impacto académico y social, útil para las comunidades de hablantes.',
    ],
    objetivoGeneral:
      'Investigar lenguas y culturas andino-amazónicas y sus contactos históricos; analizar expresiones del pensamiento andino-amazónico, sus valores y contribución a la sociedad nacional.',
    miembros: [{ nombre: 'Isabel Gálvez Astorayme de Gálvez', rol: 'Coordinadora', coordinador: true }],
  },
  zulen: {
    presentacion: [
      'Analiza matrices intelectuales latinoamericanas en distintos periodos, considerando raíces nativas, coloniales y contemporáneas, y propone revisar los horizontes filosóficos del Perú y América Latina.',
    ],
    objetivos: [
      'Estudiar la filosofía peruana y latinoamericana.',
      'Analizar discursos filosóficos peruanos y latinoamericanos.',
      'Organizar eventos académicos.',
      'Publicar investigaciones en libros y artículos.',
    ],
    servicios: ['Asesorías en proyectos interculturales y latinoamericanistas.'],
    lineas: ['Literaturas hispanoamericanas (narrativa, poesía y ensayística)', 'Filosofía peruana y latinoamericana'],
    ambientes: ['Espacio de la Unidad de Investigación de la FLCH'],
    equipos: ['Impresora Braille'],
    miembros: [{ nombre: 'Rubén Alfredo Quiroz Ávila', rol: 'Coordinador', coordinador: true }],
  },
}

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
  console.log(`[inventario] ${APLICAR ? '·' : '(plan)'} ${descripcion}`)
  if (APLICAR) await accion()
}
type Doc = Record<string, unknown> & { id: number }
const todos = async (collection: 'integrantes' | 'publicaciones' | 'noticias' | 'actividades' | 'eventos' | 'mensajes' | 'media' | 'landing', where: object) =>
  (await payload.find({ collection, where: where as never, draft: true, limit: 0, pagination: false, ...op })).docs as unknown as Doc[]
const grupoPorRuta = async (ruta: string) =>
  ((await payload.find({ collection: 'grupos', where: { ruta: { equals: ruta } }, limit: 2, ...op })).docs[0] as unknown as Doc | undefined) ?? null

// 1a. Grupos ficticios de la semilla, con todo su contenido y sus cuentas.
for (const ruta of GRUPOS_FICTICIOS) {
  const g = await grupoPorRuta(ruta)
  if (!g) {
    console.log(`[inventario] ${ruta}: no existe (nada que borrar)`)
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
    else console.log(`[inventario] la cuenta ${u.id} tiene otros grupos o roles: se conserva`)
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

// 2. Datos del inventario.
const resumen: string[] = []
for (const [ruta, f] of Object.entries(FICHAS)) {
  const g = await grupoPorRuta(ruta)
  if (!g || g.padre != null) {
    console.log(`[inventario] ${ruta}: no existe como grupo de investigación: se omite`)
    resumen.push(`${ruta}: omitido (no existe)`)
    continue
  }
  const l = (await todos('landing', { grupo: { equals: g.id } }))[0]
  if (!l) {
    resumen.push(`${ruta}: omitido (sin landing)`)
    continue
  }
  // En el modo plan, lo de prueba que la fase 1 retiraría se considera ya retirado.
  const libre = (v: unknown) => v == null || v === '' || (Array.isArray(v) && (v.length === 0 || v.every(esPrueba))) || esPrueba(v)
  const datos: Record<string, unknown> = {}
  if (f.presentacion && (PROVISIONAL_TEXTO.test(String(l.texto ?? '')) || esPrueba(l.texto))) datos.texto = f.presentacion.join('\n\n')
  if (f.objetivoGeneral && libre(l.objetivoGeneral)) datos.objetivoGeneral = f.objetivoGeneral
  if (f.objetivos && libre(l.objetivosEspecificos)) datos.objetivosEspecificos = f.objetivos.map((objetivo) => ({ objetivo }))
  if (f.servicios && libre(l.servicios)) datos.servicios = f.servicios.map((servicio) => ({ servicio }))
  if (f.lineas && libre(l.lineas)) datos.lineas = f.lineas.map((linea) => ({ codigo: '', linea }))
  if (f.ambientes && libre(l.ambientes)) datos.ambientes = f.ambientes.map((ambiente) => ({ ambiente, ubicacion: '' }))
  if (f.equipos && libre(l.equipos)) datos.equipos = f.equipos.map((laboratorio) => ({ codigo: '', laboratorio, responsable: '' }))
  if (f.correo && libre(l.correoContacto)) datos.correoContacto = f.correo
  if (f.miembros?.length && l.integrantesIntro === PROVISIONAL_INTRO) datos.integrantesIntro = ''
  if (Object.keys(datos).length)
    await paso(`landing de ${ruta}: ${Object.keys(datos).join(', ')}`, () =>
      payload.update({ collection: 'landing', id: l.id, data: { ...datos, _status: 'published' } as never, ...op }),
    )
  const existentes = new Set((await todos('integrantes', { grupo: { equals: g.id } })).filter((d) => !esPrueba(d.nombre)).map((d) => String(d.nombre)))
  let orden = 0
  for (const m of f.miembros ?? []) {
    orden += 10
    if (existentes.has(m.nombre)) continue
    await paso(
      `integrante de ${ruta}: ${m.nombre}${m.coordinador ? ' (coordinación)' : ''}${m.tipo ? ` (${m.tipo})` : ''}${m.rol && !m.coordinador ? ` (${m.rol})` : ''}`,
      () =>
        payload.create({
          collection: 'integrantes',
          data: {
            grupo: g.id,
            nombre: m.nombre,
            rol: m.rol,
            tipoInvestigador: m.tipo,
            coordinador: Boolean(m.coordinador),
            orden,
            _status: 'published',
          } as never,
          ...op,
        }),
    )
  }
  resumen.push(
    `${ruta}: ${Object.keys(datos).join(', ') || 'sin cambios en la landing'}; ${(f.miembros ?? []).filter((m) => !existentes.has(m.nombre)).length} integrante(s)`,
  )
}
console.log(`[inventario] ${plan.length} operaciones ${APLICAR ? 'aplicadas' : 'previstas'}.`)
for (const r of resumen) console.log(`[inventario]   ${r}`)
process.exit(0)
