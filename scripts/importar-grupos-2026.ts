/**
 * Alta de los grupos de investigación de la Facultad registrados en 2026, idempotente:
 *   pnpm importar:grupos
 * Fuente: «Grupos de investigación 2026» (VRIP-UNMSM / RAIS, 23/03/2026),
 * letras.unmsm.edu.pe/wp-content/uploads/2026/08/Grupos-de-Invsetigacion-2026.pdf
 * - Cada grupo recibe una landing mínima publicada para que aparezca en el directorio;
 *   su editor la completa después desde el panel.
 * - El documento no menciona subgrupos: todos se crean como grupos principales.
 * - LITARTMO ya existe (semilla) y se omite; cualquier grupo existente no se modifica.
 */
import config from '@payload-config'
import { getPayload, type Payload } from 'payload'

const payload: Payload = await getPayload({ config })

// [sigla, nombre oficial, categoría]
const GRUPOS: [string, string, string][] = [
  ['ADISCO', 'Análisis del Discurso en Comunicaciones', 'D'],
  ['CIGETMEN', 'Ciencias de la Información: Gestión, Tecnologías, Métricas, Normas Éticas y Jurídicas', 'B'],
  ['COMORG', 'Comunicación Social Especialidad Organizacional', 'D'],
  ['CONSERVA', 'Conservación y Restauración del Patrimonio Cultural', 'D'],
  ['EILA', 'Discursos, Representaciones y Estudios Interculturales', 'A'],
  ['DOLENPER', 'Documentación Lingüística de Lenguas Amenazadas en el Perú', 'C'],
  ['EPISTEME', 'Episteme. Investigación Interdisciplinaria en Epistemología, Ciencias y Humanidades', 'A'],
  ['ESANDINO', 'Estudios Andinos de Interculturalidad: Quechua y Aymara', 'A'],
  ['HUMANÍS', 'Estudios Humanísticos', 'B'],
  ['ELDLI', 'Estudios Lingüísticos y de Lingüística Interdisciplinaria', 'D'],
  ['FEMEIGEN', 'Feminidades: Estudios Interdisciplinarios e Interculturales de Género', 'A'],
  ['FILOSOFO', 'Filosofar desde el Perú', 'D'],
  ['KAWSAY', 'Filosofía y Liberación', 'C'],
  ['ZULEN', 'Grupo de Estudios Latinoamericanos Pedro S. Zulen', 'D'],
  ['GDESEYL', 'Grupo de Estudios sobre Ética y Literatura', 'B'],
  ['GIISCLS', 'Grupo de Investigación Interdisciplinaria sobre Cultura, Lenguaje y Sociedad', 'D'],
  ['IDEOPE', 'Ideologías Dominantes y Marginales en el Perú Contemporáneo', 'D'],
  ['INFOCREA', 'Información y Creatividad en el Perú', 'D'],
  [
    'INCOMUN',
    'Interculturalidad y Comunicación. Puentes Interdisciplinarios para el Intercambio y Difusión de Conocimientos Científicos y Tradicionales mediante Plataformas Mediáticas y Audiovisuales',
    'C',
  ],
  ['KAWSASUN', 'Investigación Intercultural para la Formación Docente y Enseñanza de Lenguas', 'D'],
  ['LECOG', 'Lectura y Cognición', 'C'],
  ['LEAYEP', 'Lectura, Escritura Académica y Estrategias Pedagógicas', 'D'],
  ['SOCIOLIN', 'Lenguas en Contacto e Implicancias Lingüísticas y Psicosocioculturales', 'B'],
  ['LFP', 'Lenguas y Filosofías del Perú', 'D'],
  ['LEXI', 'Lexicografía y Lexicología', 'D'],
  ['LINGCUSO', 'Lingüística, Cultura y Sociedad', 'B'],
  ['LITARTMO', 'Literatura y Arte: Prensa, Cultura Visual y Redes Trasatlánticas entre Europa y América Latina', 'A'],
  ['LITCULT', 'Literatura y Cultura', 'A'],
  ['GILS', 'Literatura y Sociedad en el Siglo XX', 'D'],
  ['MEDIALAB', 'Media Lab UNMSM', 'A'],
  ['NEDSIIS', 'Núcleo de Estudios sobre Diálogo, Sistematización e Intercambio Intercultural de Saberes', 'D'],
  ['TDLI', 'Tecnologías, Derechos y Libertades Informativas', 'C'],
]

const slugDe = (sigla: string) => sigla.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

let creados = 0
for (const [sigla, nombre, categoria] of GRUPOS) {
  const slug = slugDe(sigla)
  const existe = await payload.find({ collection: 'grupos', where: { or: [{ ruta: { equals: slug } }, { slug: { equals: slug } }] }, limit: 1, depth: 0 })
  if (existe.docs[0]) {
    console.log(`[grupos] ${slug}: ya existe, no se modifica`)
    continue
  }
  const grupo = await payload.create({ collection: 'grupos', data: { slug, nombre: `${sigla} — ${nombre}`, activo: true } })
  await payload.create({
    collection: 'landing',
    data: {
      grupo: grupo.id,
      nombre: sigla,
      grupoTexto: `Grupo de Investigación ${sigla}`,
      universidad: 'Universidad Nacional Mayor de San Marcos',
      sigla: 'UNMSM',
      ciudad: 'Lima',
      pais: 'Perú',
      // El documento no indica el año de fundación: se usa el del registro; el editor lo corrige.
      anioFundacion: 2026,
      edicion: 'Registro 2026',
      lema: nombre,
      editorialEtiqueta: `Categoría ${categoria}`,
      titular: nombre,
      texto: `Grupo de investigación de la Facultad de Letras y Ciencias Humanas, registrado en el Vicerrectorado de Investigación y Posgrado de la UNMSM (2026) con categoría ${categoria}. El grupo todavía no ha cargado el contenido de su landing.`,
      integrantesIntro: 'El grupo aún no ha cargado a sus integrantes.',
      colaborarTitular: `Escriba al grupo ${sigla}`,
      tiposColaboracion: [{ tipo: 'Consulta' }, { tipo: 'Otro' }],
      _status: 'published',
    },
  })
  creados++
  console.log(`[grupos] ${slug}: creado`)
}
console.log(`[grupos] listo: ${creados} creados, ${GRUPOS.length - creados} omitidos`)
process.exit(0)
