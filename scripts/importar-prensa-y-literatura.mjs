/**
 * Completa la landing de Prensa y Literatura (subgrupo de LITARTMO) con el contenido público de
 * https://prensayliteraturaletras.unmsm.edu.pe (revisado el 13-10-2026) que aún no estaba cargado.
 *
 * Entra al CMS por la API REST como el EDITOR del subgrupo (credenciales de .env.credenciales, que
 * no se imprimen), así que pasa por las mismas reglas de acceso, registro de cambios y revalidación
 * que el panel. Idempotente: lo que ya existe (mismo título / mismo pie) no se duplica.
 *   pnpm start   # en otra terminal
 *   node scripts/importar-prensa-y-literatura.mjs
 */
import { readFileSync } from 'node:fs'

const BASE = process.env.PLATAFORMA_URL ?? 'http://127.0.0.1:3000'
if (!['localhost', '127.0.0.1', '[::1]'].includes(new URL(BASE).hostname)) {
  console.error('[importar] Solo se permite contra localhost. Abortado.')
  process.exit(1)
}
const SITIO = 'https://prensayliteraturaletras.unmsm.edu.pe'
const RUTA = 'litartmo/prensa-y-literatura'
const EMAIL = 'editor-prensa-literatura@plataforma.local'

// ---------- Sesión del editor ----------
const linea = readFileSync(new URL('../.env.credenciales', import.meta.url), 'utf8')
  .split(/\r?\n/)
  .find((l) => l.startsWith(EMAIL + ' '))
if (!linea) throw new Error(`No hay credenciales para ${EMAIL} en .env.credenciales`)
const password = linea.slice(EMAIL.length).trim().split(/\s+/)[0]

const login = await fetch(`${BASE}/api/usuarios/login`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email: EMAIL, password }),
})
if (!login.ok) throw new Error(`Login del editor falló (${login.status})`)
const { token } = await login.json()
const auth = { authorization: `JWT ${token}` }

async function api(metodo, ruta, cuerpo) {
  const res = await fetch(`${BASE}/api/${ruta}`, {
    method: metodo,
    headers: cuerpo instanceof FormData ? auth : { ...auth, 'content-type': 'application/json' },
    body: cuerpo == null ? undefined : cuerpo instanceof FormData ? cuerpo : JSON.stringify(cuerpo),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(`${metodo} ${ruta} → ${res.status}: ${JSON.stringify(json.errors ?? json)}`)
  return json
}
const q = (where) => new URLSearchParams(Object.entries(where).map(([k, v]) => [`where${k}`, v])).toString()

const grupo = (await api('GET', `grupos?${q({ '[ruta][equals]': RUTA })}&depth=0`)).docs[0]?.id
if (!grupo) throw new Error(`El editor no ve el grupo ${RUTA}`)

// ---------- Archivos ----------
/** Reutiliza un archivo del grupo por nombre; si no está, lo baja del sitio original y lo sube. */
async function media({ local, remoto, alt }) {
  const existe = (await api('GET', `media?${q({ '[filename][equals]': local })}&depth=0&limit=1`)).docs[0]
  if (existe) return existe.id
  if (!remoto) throw new Error(`Falta el archivo ${local}`)
  const url = `${SITIO}/_next/image?url=${encodeURIComponent(`http://strapi-app:1337/uploads/${remoto}`)}&w=3840&q=75`
  const res = await fetch(url, { headers: { accept: 'image/png,image/jpeg' } })
  if (!res.ok) throw new Error(`No se pudo bajar ${remoto} (${res.status})`)
  const tipo = res.headers.get('content-type') ?? 'image/jpeg'
  const form = new FormData()
  form.append('file', new Blob([await res.arrayBuffer()], { type: tipo }), local)
  form.append('_payload', JSON.stringify({ alt, grupo }))
  const { doc } = await api('POST', 'media', form)
  console.log(`[importar] archivo subido: ${local}`)
  return doc.id
}

// ---------- Actividades ----------
const ACTIVIDADES_NUEVAS = [
  {
    tipo: 'Sustentación',
    titulo:
      'Sustentación de tesis de licenciatura de Julia Martell: «La construcción de la imagen de la mujer en el cuento peruano: el caso de Actualidades (1903-1908)»',
    fecha: '2026-09-22',
    hora: '3:00 p. m.',
    lugar: 'Repertorio Bibliográfico, FLCH – UNMSM',
    resumen:
      'Sustentación de la tesis de licenciatura de Julia Martell sobre la imagen de la mujer en el cuento peruano publicado en la revista Actualidades (1903-1908).',
    texto: [
      'La Facultad de Letras y Ciencias Humanas de la UNMSM invitó a la comunidad universitaria a acompañar la sustentación de tesis de la Bach. Julia Valeria Martell Caro, quien presentó la investigación titulada «La construcción de la imagen de la mujer en el cuento peruano: el caso de Actualidades (1903-1908)».',
      'Jurado: Dra. María Yolanda Westphalen Rodríguez (presidenta), Dr. Marcel Martín Velázquez Castro (asesor), Dr. Arquímedes Américo Mudarra Montoya y Lic. Agustín Prado Alvarado (jurados informantes).',
    ],
    imagen: {
      local: 'sustentacion-julia-martell.jpeg',
      remoto: 'Whats_App_Image_2026_09_23_at_10_02_48_AM_1f635fba42.jpeg',
      alt: 'Sustentación de tesis de Julia Martell',
    },
    url: `${SITIO}/noticias/sustentacion-de-tesis-de-licenciatura-de-julia-martell`,
  },
  {
    tipo: 'Coloquio internacional',
    titulo: 'Participación en el Coloquio Internacional «Pensar América Latina y el Caribe desde sus impresos» (CIALC-UNAM)',
    fecha: '2026-04-13',
    lugar: 'Centro de Investigaciones sobre América Latina y el Caribe (CIALC) – UNAM',
    resumen: 'Julia Martell y Yadira Bazán expusieron su investigación sobre prensa ilustrada y lectores infantiles en el Perú de inicios del siglo XX.',
    texto: [
      'Las investigadoras Julia Martell y Yadira Bazán representaron a nuestro equipo en el Coloquio Internacional «Pensar América Latina y el Caribe desde sus impresos: materialidades, cultura y política siglo XIX y siglo XX», organizado por el Centro de Investigaciones sobre América Latina y el Caribe (CIALC) de la Universidad Nacional Autónoma de México (UNAM).',
      'Presentaron la ponencia «Niños lectores y prensa ilustrada: usos impresos y formación del público lector infantil en el Perú (1900–1920)», que aborda la cultura impresa orientada a las infancias y analiza las estrategias visuales y editoriales que contribuyeron a la formación de nuevas comunidades lectoras en el Perú de principios del siglo XX.',
      'Programa del coloquio: https://buff.ly/bN0Hx9P. Transmisión y grabaciones: https://buff.ly/3BhbSc8.',
    ],
    imagen: {
      local: 'coloquio-cialc-unam.jpg',
      remoto: 'coloquio_mexico_24727a5239.jpg',
      alt: 'Coloquio «Pensar América Latina y el Caribe desde sus impresos», CIALC-UNAM',
    },
    url: `${SITIO}/noticias/participacion-en-el-coloquio-internacional-pensar-america-latina-y-el-caribe-desde-sus-impresos-cialc-unam`,
  },
]

/** Textos completos de las actividades ya cargadas (en el prototipo estaban vacíos o resumidos). */
const TEXTOS = {
  'lapa-2': [
    'El grupo de investigación LITARTMO es un espacio destinado al encuentro de estudiantes, egresados, profesores, investigadores y público en general que se interesa en los estudios decimonónicos interdisciplinarios, con énfasis en la prensa y literatura. En el marco de las actividades de este grupo de investigación, se organiza el Seminario Internacional «Lima a Página Abierta (1919-1932): militantes políticos, lectores universitarios y mujeres cosmopolitas», donde se difundirán, entre otros, los resultados del proyecto de investigación ganador de los Estímulos Económicos del Ministerio de Cultura Peruana en la categoría “Concurso para la investigación en el ámbito del libro y la lectura (2025)”.',
    'Este evento académico tiene el propósito de promover el diálogo, la reflexión y la investigación académica en torno a las revistas, comunidades lectoras y prácticas de lecturas en la ciudad de Lima entre 1919 a 1932, centrado en la figura del militante político, lector universitario y mujer cosmopolita. Así, a lo largo de este seminario, se abrirá un espacio para explorar en profundidad la historia de la lectura y las revistas ilustradas en las primeras décadas del siglo XX peruano, y se examinarán diversos aspectos relacionados con los movimientos sociales y políticos de la época, tanto nacional como internacional.',
  ],
  'jalla-2026': [
    'Miembros de nuestro equipo de investigación tuvieron una destacada participación en las XVII Jornadas Andinas de Literatura Latinoamericana (JALLA), celebradas en la Universidad Nacional de San Agustín (UNSA) de Arequipa.',
    "En este prestigioso encuentro académico, la delegación integrada por Marcel Velázquez, Claudia Alejos, Julia Martell, Yadira Bazán, Juan José Bernardo, Enrique Toledo y D'yanna Meza presentó diversas investigaciones vinculadas a la historia de la prensa, las redes intelectuales y la cultura impresa en el Perú y América Latina.",
    'Felicitamos a todo el equipo por llevar nuestras investigaciones a uno de los congresos de estudios literarios más importantes de la región.',
  ],
  'lapa-1': [
    'Este evento académico busca promover la reflexión y la investigación académica en torno a las revistas, comunidades lectoras y prácticas de lecturas en la ciudad de Lima entre 1900 a 1920, centrado en la figura de la mujer, el obrero y el niño.',
    'Así, a lo largo de este seminario, se abrirá un espacio para explorar en profundidad la historia de la lectura y las revistas ilustradas y anarquistas en el Perú a comienzos del siglo XX, y se examinarán diversos aspectos relacionados con los movimientos sociales y políticos de la época, tanto nacional como internacional.',
    'Organizan: Escuela de Literatura UNMSM, GI Literatura y Arte: prensa, cultura visual y redes trasatlánticas entre Europa y América Latina (LITARTMO) y el CELIT – Centro de Estudiantes de Literatura UNMSM.',
  ],
  'seminario-revistas-culturales': [
    'El Seminario de Prensa y Literatura Peruana «Revistas culturales de 1900 a 1930: redes, tramas y materialidades» es una actividad académica organizada por la Red Literaria Peruana, el grupo de investigación LITARTMO, el Departamento de Humanidades PUCP, el Centro de Estudiantes de Literatura UNMSM y Glifos – Club de Edición.',
    'Este seminario tiene como finalidad propiciar un espacio de reflexión y análisis sobre las revistas culturales que surgieron en el Perú durante las primeras décadas del siglo XX, explorando las redes intelectuales, los discursos literarios e ideológicos, y las materialidades que definieron y estuvieron presentes en estos proyectos. Dichas publicaciones fueron fundamentales en la formación de una conciencia cultural, literaria y política en el país, la cual contribuyó, además, a la creación de un diálogo transnacional que vinculó al Perú con otras corrientes culturales y naciones de la época.',
  ],
  'seminario-los-parias': [
    'Este evento académico tiene el propósito de promover el diálogo, la reflexión y la investigación académica en torno a las experiencias, discursos y prensa anarquista en el Perú. Por ello, se analiza el papel que desempeñaron, tanto la prensa como los discursos anarquistas, en el contexto nacional y transnacional.',
    'Así, a lo largo de este seminario, se abrirá un espacio para explorar en profundidad la historia y las culturas anarquistas en el Perú en el periodo de entresiglos, y se examinarán diversos aspectos relacionados con los movimientos sociales y políticos de la época.',
  ],
}

const actuales = (await api('GET', `actividades?${q({ '[grupo][equals]': grupo })}&depth=0&limit=100`)).docs

for (const a of ACTIVIDADES_NUEVAS) {
  if (actuales.some((d) => d.titulo === a.titulo)) {
    console.log(`[importar] actividad ya existe: ${a.titulo.slice(0, 60)}…`)
    continue
  }
  const imagen = await media(a.imagen)
  await api('POST', 'actividades', { ...a, grupo, imagen, texto: a.texto.join('\n\n'), _status: 'published' })
  console.log(`[importar] actividad creada: ${a.titulo.slice(0, 60)}…`)
}

for (const [clave, parrafos] of Object.entries(TEXTOS)) {
  const doc = actuales.find((d) => d.url?.endsWith(clave))
  if (!doc) {
    console.log(`[importar] no se encontró la actividad «${clave}»`)
    continue
  }
  const texto = parrafos.join('\n\n')
  if (doc.texto === texto) continue
  await api('PATCH', `actividades/${doc.id}`, { texto, _status: 'published' })
  console.log(`[importar] texto completo: ${doc.titulo.slice(0, 60)}…`)
}

// ---------- Landing: galería y colaborar ----------
const landing = (await api('GET', `landing?${q({ '[grupo][equals]': grupo })}&depth=0&limit=1`)).docs[0]
if (!landing) throw new Error('El grupo no tiene landing')

const LAMINAS = [
  {
    pie: 'La pieza del mes: «Chirigota: modernismo», caricatura de Variedades, N.º 1242, 25 de diciembre de 1931 (CEDOC – UNMSM)',
    alta: true,
    imagen: {
      local: 'pieza-del-mes-chirigota-modernismo.png',
      remoto: 'Captura_de_pantalla_2026_09_13_194743_f37ab07c0a.png',
      alt: 'Caricatura «Chirigota: modernismo», revista Variedades, 1931',
    },
  },
  {
    pie: 'Archivo digital: «Cartas a una turista», de Angélica Palma (1907)',
    alta: false,
    imagen: {
      local: 'archivo-cartas-a-una-turista.png',
      remoto: 'Captura_de_pantalla_2026_09_24_181854_4c5d977a7f.png',
      alt: '«Cartas a una turista», de Angélica Palma, 1907',
    },
  },
]
const galeria = (landing.galeria ?? []).map(({ id, imagen, pie, alta }) => ({ id, imagen, pie, alta }))
for (const l of LAMINAS) {
  if (galeria.some((g) => g.pie === l.pie)) continue
  galeria.push({ imagen: await media(l.imagen), pie: l.pie, alta: l.alta })
}

// Opciones y datos de contacto de la página /contacto del sitio original.
const colaborarTexto =
  'Recibimos consultas sobre el archivo, propuestas de colaboración académica y solicitudes de prensa. Cuéntenos qué quiere hacer con nosotros y le responderemos en un plazo de cinco días hábiles. También puede escribirnos a prensayliteratura.ge@gmail.com o visitarnos en la Ciudad Universitaria (Calle Germán Amezaga 375, Puerta N.º 3), de lunes a viernes de 10:00 a. m. a 5:00 p. m.'
const tiposColaboracion = ['Consulta sobre el archivo', 'Propuesta de colaboración', 'Prensa y medios', 'Sumarme al grupo', 'Otro'].map((tipo) => ({ tipo }))

const sinCambios =
  galeria.length === (landing.galeria ?? []).length &&
  landing.colaborarTexto === colaborarTexto &&
  JSON.stringify((landing.tiposColaboracion ?? []).map((t) => t.tipo)) === JSON.stringify(tiposColaboracion.map((t) => t.tipo))
if (sinCambios) console.log('[importar] landing ya al día')
else {
  await api('PATCH', `landing/${landing.id}`, { galeria, colaborarTexto, tiposColaboracion, _status: 'published' })
  console.log(`[importar] landing actualizada: galería con ${galeria.length} láminas, datos de contacto y tipos de colaboración`)
}

await fetch(`${BASE}/api/usuarios/logout`, { method: 'POST', headers: auth })
console.log('[importar] listo')
