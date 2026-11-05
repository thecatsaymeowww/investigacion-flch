/**
 * Semilla local, idempotente y conservadora: si un grupo ya existe no se toca.
 *   pnpm seed
 * - Grupos de DEMOSTRACIÓN con datos ficticios: litartmo (landing de demostración), litartmo/subgrupo-demo
 *   y estudios-andinos-demo. No leen ningún archivo: la semilla funciona sin contenido real.
 * - litartmo/prensa-y-literatura: contenido real, OPCIONAL y fuera del repositorio. Solo se crea si
 *   SEMILLA_PRENSA_DIR apunta a una carpeta externa con data/{sitio,integrantes,publicaciones,actividades,
 *   galeria,aliados}.json (e img/ para las imágenes). Antes de escribir se leen y validan todos los JSON; si
 *   falta o falla alguno, el subgrupo se omite entero. El grupo y su contenido se crean en una sola
 *   transacción (un dato mal formado la deshace entera); las imágenes se suben después del commit, porque un
 *   archivo en disco no se deshace con un rollback.
 * - Cuentas: superadmin, editor de cada grupo. Las contraseñas se generan aquí y se
 *   escriben SOLO en .env.credenciales (ignorado por git); nunca se imprimen.
 * Código de salida 1 si se pidió el contenido real (SEMILLA_PRENSA_DIR) y no se pudo cargar completo.
 */
import config from '@payload-config'
import { randomBytes } from 'node:crypto'
import { appendFileSync, existsSync, readdirSync, readFileSync, statSync, unlinkSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createLocalReq, getPayload, type Payload } from 'payload'

const payload: Payload = await getPayload({ config })
const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const CREDENCIALES = path.join(raiz, '.env.credenciales')
// Problemas con el contenido real pedido: no impiden los grupos de demostración, pero la semilla termina con 1.
let avisos = 0

async function crearGrupo(slug: string, nombre: string, padre?: number, orden = 100) {
  const ruta = padre ? `${(await payload.findByID({ collection: 'grupos', id: padre, depth: 0 })).slug}/${slug}` : slug
  const existe = await payload.find({
    collection: 'grupos',
    where: { or: [{ ruta: { equals: ruta } }, { and: [{ slug: { equals: slug } }, { ruta: { exists: false } }] }] },
    limit: 1,
  })
  if (existe.docs[0]) {
    console.log(`[seed] ${ruta}: ya existe, no se modifica`)
    return null
  }
  return payload.create({ collection: 'grupos', data: { slug, nombre, activo: true, padre, orden } })
}

// Grupos creados antes de existir `ruta`: se recalcula (el hook la deriva del slug). No cambia nada más.
for (const g of (await payload.find({ collection: 'grupos', where: { ruta: { exists: false } }, limit: 1000, depth: 0 })).docs) {
  await payload.update({ collection: 'grupos', id: g.id, data: { slug: g.slug } })
  console.log(`[seed] ruta calculada para ${g.slug}`)
}

async function crearUsuario(email: string, roles: ('superadmin' | 'editor')[], grupos: number[]) {
  const existe = await payload.find({ collection: 'usuarios', where: { email: { equals: email } }, limit: 1 })
  if (existe.docs[0]) return
  const password = randomBytes(15).toString('base64url')
  await payload.create({ collection: 'usuarios', data: { email, password, roles, grupos: grupos.map((grupo) => ({ grupo })) } })
  appendFileSync(CREDENCIALES, `${email}  ${password}  (${roles.join(', ')})\n`)
}

const publicar = { _status: 'published' as const }

// ---------- LITARTMO: grupo principal (landing de demostración) ----------
const idDe = async (ruta: string) => (await payload.find({ collection: 'grupos', where: { ruta: { equals: ruta } }, limit: 1 })).docs[0]?.id
const principal = await crearGrupo('litartmo', 'LITARTMO — Literatura y Arte', undefined, 10)
if (principal) {
  await payload.create({
    collection: 'landing',
    data: {
      grupo: principal.id,
      nombre: 'LITARTMO',
      grupoTexto: 'Grupo de Investigación LITARTMO',
      universidad: 'Universidad Nacional Mayor de San Marcos',
      sigla: 'UNMSM',
      ciudad: 'Lima',
      pais: 'Perú',
      anioFundacion: 2023,
      edicion: 'Página de demostración',
      // Nombre oficial según letras.unmsm.edu.pe/unidad-de-investigacion
      lema: 'Literatura y Arte: Prensa, Cultura Visual y Redes Trasatlánticas entre Europa y América Latina',
      editorialEtiqueta: 'Demostración',
      titular: 'Página de demostración del grupo LITARTMO y de sus subgrupos.',
      texto:
        'Este contenido es de prueba. Los subgrupos del grupo, como Prensa y Literatura, tienen su propia landing y su propio editor, y se listan bajo LITARTMO en el menú principal.',
      integrantesIntro: 'Sección de demostración: el grupo aún no ha cargado a sus integrantes.',
      colaborarTitular: 'Escriba al grupo LITARTMO',
      tiposColaboracion: [{ tipo: 'Consulta' }, { tipo: 'Otro' }],
      ...publicar,
    },
  })
  console.log('[seed] litartmo: grupo principal creado (landing de demostración)')
}
const gL = await idDe('litartmo')

// ---------- Prensa y Literatura: contenido real OPCIONAL, desde una carpeta externa ----------
type Sitio = {
  nombre: string
  grupo: string
  universidad: string
  siglaUniversidad: string
  ciudad: string
  pais: string
  anioFundacion: number
  edicion: string
  lema: string
  editorial: { etiqueta: string; titular: string; texto: string; foto: { src: string; alt: string; pie: string; credito: string } }
  cifras: { etiqueta: string; nota: string }[]
  integrantesIntro: string
  colaborar: { etiqueta: string; titular: string; texto: string; tipos: string[] }
}
type ContenidoReal = {
  dir: string
  sitio: Sitio
  integrantes: { nombre: string; rol: string; foto: string; bio: string[] }[]
  publicaciones: { items: { code: string; type: string; year: string; title: string; author: string; url: string; cover: string }[] }
  actividades: { tipo: string; titulo: string; fecha: string; hora: string; lugar: string; resumen: string; texto: string[]; imagen: string; url: string }[]
  galeria: { src: string; caption: string; alta: boolean }[]
  aliados: { nombre: string; url: string }[]
}

/** Lee y valida TODO antes de escribir nada. null: el subgrupo se omite entero (el motivo sale por consola). */
function leerContenidoReal(): ContenidoReal | null {
  const variable = process.env.SEMILLA_PRENSA_DIR?.trim()
  if (!variable) {
    console.log('[seed] litartmo/prensa-y-literatura: se omite (contenido real opcional; SEMILLA_PRENSA_DIR no está definida)')
    return null
  }
  const omitir = (motivo: string) => {
    avisos++
    console.error(`[seed] litartmo/prensa-y-literatura: se omite entero, sin escribir nada: ${motivo}`)
    return null
  }
  const dir = path.resolve(variable)
  const relativa = path.relative(raiz, dir)
  if (!relativa.startsWith('..') && !path.isAbsolute(relativa)) return omitir('SEMILLA_PRENSA_DIR debe estar fuera del repositorio')
  if (!existsSync(dir) || !statSync(dir).isDirectory()) return omitir('SEMILLA_PRENSA_DIR no es una carpeta existente')
  const datos: Record<string, unknown> = {}
  for (const nombre of ['sitio', 'integrantes', 'publicaciones', 'actividades', 'galeria', 'aliados']) {
    const archivo = path.join(dir, 'data', `${nombre}.json`)
    if (!existsSync(archivo)) return omitir(`falta data/${nombre}.json`)
    try {
      datos[nombre] = JSON.parse(readFileSync(archivo, 'utf8'))
    } catch (e) {
      return omitir(`data/${nombre}.json no se puede leer como JSON (${(e as Error).message})`)
    }
  }
  const s = datos.sitio as Partial<Sitio> | null
  const errores = [
    !s || typeof s !== 'object' || !s.editorial?.foto || !Array.isArray(s.cifras) || !Array.isArray(s.colaborar?.tipos)
      ? 'sitio.json: faltan editorial.foto, cifras o colaborar.tipos'
      : '',
    !Array.isArray(datos.integrantes) ? 'integrantes.json debe ser una lista' : '',
    !Array.isArray((datos.publicaciones as { items?: unknown } | null)?.items) ? 'publicaciones.json debe tener la lista items' : '',
    !Array.isArray(datos.actividades) ? 'actividades.json debe ser una lista' : '',
    !Array.isArray(datos.galeria) ? 'galeria.json debe ser una lista' : '',
    !Array.isArray(datos.aliados) ? 'aliados.json debe ser una lista' : '',
  ].filter(Boolean)
  if (errores.length) return omitir(errores.join('; '))
  return { dir, ...(datos as Omit<ContenidoReal, 'dir'>) }
}

const MIME: Record<string, string> = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif', pdf: 'application/pdf' }
/** Carpeta donde Payload escribe los archivos de `media` (staticDir; si es relativa, respecto al directorio de trabajo). */
function carpetaMedia() {
  // Payload usa el slug de la colección si no hay staticDir.
  const dir = payload.collections.media.config.upload.staticDir ?? 'media'
  return path.isAbsolute(dir) ? dir : path.resolve(process.cwd(), dir)
}

/**
 * Payload escribe el archivo en disco ANTES de crear el registro y, si la creación falla, no lo borra. Cada subida
 * usa una raíz de nombre propia (`<nombre>-<16 hex aleatorios>`), que nadie más puede generar; si falla, se borran
 * solo los archivos con esa raíz que ningún registro de `media` usa. Payload puede cambiar la extensión según el
 * contenido (p. ej. .jpeg → .jpg), por eso se busca la raíz y no el nombre exacto.
 */
function borrarHuerfanos(raizNombre: string) {
  const dir = carpetaMedia()
  if (!existsSync(dir)) return Promise.resolve()
  return Promise.all(
    readdirSync(dir)
      .filter((f) => f.startsWith(`${raizNombre}.`))
      .map(async (f) => {
        const { totalDocs } = await payload.count({ collection: 'media', where: { filename: { equals: f } } })
        if (totalDocs === 0) {
          unlinkSync(path.join(dir, f))
          console.error(`[seed] archivo huérfano borrado: ${f}`)
        }
      }),
  )
}

/** Sube una imagen de la carpeta externa. Las imágenes son opcionales: si falta, se omite. */
async function subir(dir: string, grupo: number, rutaPublica: string, alt: string) {
  if (!rutaPublica) return undefined
  const origen = path.join(dir, rutaPublica)
  if (path.relative(dir, origen).startsWith('..') || !existsSync(origen)) return undefined
  const ext = path.extname(origen).slice(1).toLowerCase()
  const base =
    path
      .basename(origen, path.extname(origen))
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'imagen'
  const raizNombre = `${base}-${randomBytes(8).toString('hex')}`
  const data = readFileSync(origen)
  try {
    const file = { data, name: `${raizNombre}.${ext}`, mimetype: MIME[ext] ?? 'application/octet-stream', size: data.length }
    return (await payload.create({ collection: 'media', data: { alt, grupo }, file })).id
  } catch (e) {
    await borrarHuerfanos(raizNombre)
    throw e
  }
}

async function crearContenidoReal(padre: number, d: ContenidoReal) {
  // El contexto se crea antes de abrir la transacción: si falla, no queda ninguna abierta.
  const req = await createLocalReq({}, payload)
  let transaccion: Awaited<ReturnType<typeof payload.db.beginTransaction>> = null
  try {
    transaccion = await payload.db.beginTransaction()
  } catch (e) {
    console.error(`[seed] beginTransaction: ${(e as Error).message}`)
  }
  if (transaccion == null) {
    avisos++
    console.error('[seed] litartmo/prensa-y-literatura: se omite: la base de datos no abrió una transacción')
    return
  }
  // Todas las escrituras con este req van en la misma transacción (Payload no la confirma por su cuenta).
  req.transactionID = transaccion
  const imagenes: { ruta: string; alt: string; asignar: (media: number) => Promise<unknown> }[] = []
  let g = 0
  let landing = 0
  try {
    g = (
      await payload.create({ collection: 'grupos', data: { slug: 'prensa-y-literatura', nombre: 'Prensa y Literatura', activo: true, padre, orden: 20 }, req })
    ).id
    for (const [i, m] of d.integrantes.entries()) {
      const doc = await payload.create({
        collection: 'integrantes',
        data: { grupo: g, nombre: m.nombre, rol: m.rol, bio: m.bio.join('\n\n'), orden: (i + 1) * 10, ...publicar },
        req,
      })
      imagenes.push({
        ruta: m.foto,
        alt: `Retrato de ${m.nombre}`,
        asignar: (foto) => payload.update({ collection: 'integrantes', id: doc.id, data: { foto, ...publicar } }),
      })
    }
    for (const p of d.publicaciones.items) {
      const doc = await payload.create({
        collection: 'publicaciones',
        data: {
          grupo: g,
          titulo: p.title,
          autoria: p.author,
          tipo: p.type as 'Libro',
          anio: Number(p.year),
          codigo: p.code || undefined,
          url: p.url || undefined,
          ...publicar,
        },
        req,
      })
      imagenes.push({
        ruta: p.cover,
        alt: `Portada de ${p.title}`,
        asignar: (portada) => payload.update({ collection: 'publicaciones', id: doc.id, data: { portada, ...publicar } }),
      })
    }
    for (const a of d.actividades) {
      const doc = await payload.create({
        collection: 'actividades',
        data: {
          grupo: g,
          tipo: a.tipo,
          titulo: a.titulo,
          fecha: a.fecha,
          hora: a.hora || undefined,
          lugar: a.lugar,
          resumen: a.resumen,
          texto: a.texto.join('\n\n') || undefined,
          url: a.url || undefined,
          ...publicar,
        },
        req,
      })
      imagenes.push({
        ruta: a.imagen,
        alt: a.titulo,
        asignar: (imagen) => payload.update({ collection: 'actividades', id: doc.id, data: { imagen, ...publicar } }),
      })
    }
    const s = d.sitio
    landing = (
      await payload.create({
        collection: 'landing',
        data: {
          grupo: g,
          nombre: s.nombre,
          grupoTexto: s.grupo,
          universidad: s.universidad,
          sigla: s.siglaUniversidad,
          ciudad: s.ciudad,
          pais: s.pais,
          anioFundacion: s.anioFundacion,
          edicion: s.edicion,
          lema: s.lema,
          editorialEtiqueta: s.editorial.etiqueta,
          titular: s.editorial.titular,
          texto: s.editorial.texto,
          fotoPie: s.editorial.foto.pie,
          fotoCredito: s.editorial.foto.credito,
          cifraFundacion: 'Año de fundación',
          notaFundacion: s.cifras[0]?.nota,
          cifraIntegrantes: 'Investigadores',
          notaIntegrantes: s.cifras[1]?.nota,
          cifraPublicaciones: 'Publicaciones',
          notaPublicaciones: s.cifras[3]?.nota,
          cifraActividades: 'Actividades',
          integrantesIntro: s.integrantesIntro,
          aliados: d.aliados.map((a) => ({ nombre: a.nombre, url: a.url })),
          colaborarEtiqueta: s.colaborar.etiqueta,
          colaborarTitular: s.colaborar.titular,
          colaborarTexto: s.colaborar.texto,
          tiposColaboracion: s.colaborar.tipos.map((tipo) => ({ tipo })),
          ...publicar,
        },
        req,
      })
    ).id
    await payload.db.commitTransaction(transaccion)
  } catch (e) {
    await payload.db.rollbackTransaction(transaccion).catch((r: Error) => console.error(`[seed] rollbackTransaction: ${r.message}`))
    avisos++
    console.error(`[seed] litartmo/prensa-y-literatura: error al crear; transacción deshecha, no queda nada: ${(e as Error).message}`)
    return
  }
  console.log('[seed] litartmo/prensa-y-literatura: grupo y contenido creados (transacción confirmada)')

  // Imágenes, después del commit. Si una falla, se borra lo que dejó (su registro de media o, si Payload escribió el
  // archivo sin llegar a crear el registro, ese archivo) y se sigue. Si el proceso se interrumpe aquí, el contenido
  // queda sin las imágenes restantes y una nueva ejecución no las añade (el subgrupo ya existe): se completan en el panel.
  let fallidas = 0
  const intentar = async (ruta: string, alt: string, asignar?: (media: number) => Promise<unknown>) => {
    let media: number | undefined
    try {
      media = await subir(d.dir, g, ruta, alt)
      if (media != null && asignar) await asignar(media)
      return media
    } catch (e) {
      fallidas++
      console.error(`[seed] imagen ${ruta}: ${(e as Error).message}`)
      if (media != null) await payload.delete({ collection: 'media', id: media }).catch(() => null)
      return undefined
    }
  }
  for (const im of imagenes) await intentar(im.ruta, im.alt, im.asignar)
  const fotoHero = await intentar(d.sitio.editorial.foto.src, d.sitio.editorial.foto.alt)
  const galeria: { imagen: number; pie: string; alta: boolean }[] = []
  for (const im of d.galeria) {
    const imagen = await intentar(im.src, im.caption)
    if (imagen != null) galeria.push({ imagen, pie: im.caption, alta: Boolean(im.alta) })
  }
  if (fotoHero != null || galeria.length) {
    try {
      await payload.update({ collection: 'landing', id: landing, data: { fotoHero, galeria, ...publicar } })
    } catch (e) {
      fallidas++
      console.error(`[seed] imágenes de la landing: ${(e as Error).message}`)
      for (const id of [fotoHero, ...galeria.map((x) => x.imagen)]) if (id != null) await payload.delete({ collection: 'media', id }).catch(() => null)
    }
  }
  if (fallidas) {
    avisos++
    console.error(`[seed] litartmo/prensa-y-literatura: contenido creado, pero ${fallidas} imagen(es) no se pudieron asignar`)
  }
}

if (gL) {
  if (await idDe('litartmo/prensa-y-literatura')) console.log('[seed] litartmo/prensa-y-literatura: ya existe, no se modifica')
  else {
    const contenido = leerContenidoReal()
    if (contenido) await crearContenidoReal(gL, contenido)
  }
}

// ---------- Grupo de demostración (FICTICIO) ----------
const demo = await crearGrupo('estudios-andinos-demo', 'Grupo de demostración (ficticio)')
if (demo) {
  const g = demo.id
  await payload.create({
    collection: 'integrantes',
    data: { grupo: g, nombre: 'Ana Ejemplo Demo', rol: 'Doctora (ficticio)', bio: 'Integrante ficticia del grupo de demostración.', orden: 10, ...publicar },
  })
  await payload.create({ collection: 'integrantes', data: { grupo: g, nombre: 'Luis Prueba Demo', rol: 'Magíster (ficticio)', orden: 20, ...publicar } })
  await payload.create({
    collection: 'integrantes',
    data: { grupo: g, nombre: 'Borrador Demo sin publicar', rol: 'No debe verse en la web', orden: 30 },
    draft: true,
  })
  await payload.create({
    collection: 'publicaciones',
    data: { grupo: g, titulo: 'Publicación de demostración', autoria: 'Ana Ejemplo Demo', tipo: 'Libro', anio: 2026, ...publicar },
  })
  await payload.create({
    collection: 'actividades',
    data: {
      grupo: g,
      tipo: 'Taller',
      titulo: 'Taller de demostración',
      fecha: '2026-10-01',
      lugar: 'Sala ficticia',
      resumen: 'Actividad ficticia para probar la plataforma.',
      ...publicar,
    },
  })
  await payload.create({
    collection: 'eventos',
    data: { grupo: g, titulo: 'Reunión de demostración', fecha: '2026-10-20', hora: '16:00', tipo: 'Reunión', lugar: 'Sala ficticia', ...publicar },
  })
  await payload.create({
    collection: 'landing',
    data: {
      grupo: g,
      nombre: 'Estudios Andinos',
      grupoTexto: 'Grupo de demostración (ficticio)',
      universidad: 'Universidad Nacional Mayor de San Marcos',
      sigla: 'UNMSM',
      ciudad: 'Lima',
      pais: 'Perú',
      anioFundacion: 2026,
      edicion: 'Edición de prueba',
      lema: 'Landing ficticia para comprobar que cada grupo edita solo la suya',
      editorialEtiqueta: 'Demostración',
      titular: 'Este grupo existe solo para probar el aislamiento entre landings.',
      texto: 'Todo el contenido de esta landing es ficticio. Su editor no puede ver ni modificar la landing de LITARTMO, y viceversa.',
      integrantesIntro: 'Integrantes ficticios.',
      colaborarTitular: 'Escriba al grupo de demostración',
      tiposColaboracion: [{ tipo: 'Consulta' }, { tipo: 'Otro' }],
      ...publicar,
    },
  })
  console.log('[seed] estudios-andinos-demo: creado (ficticio)')
}

// ---------- Subgrupo de demostración de LITARTMO (FICTICIO) ----------
const sub = gL ? await crearGrupo('subgrupo-demo', 'Subgrupo de demostración de LITARTMO (ficticio)', gL, 10) : null
if (sub) {
  const g = sub.id
  await payload.create({
    collection: 'integrantes',
    data: {
      grupo: g,
      nombre: 'Clara Muestra Demo',
      rol: 'Coordinadora (ficticio)',
      bio: 'Integrante ficticia del subgrupo de demostración.',
      orden: 10,
      ...publicar,
    },
  })
  await payload.create({ collection: 'integrantes', data: { grupo: g, nombre: 'Pedro Ensayo Demo', rol: 'Estudiante (ficticio)', orden: 20, ...publicar } })
  await payload.create({
    collection: 'integrantes',
    data: { grupo: g, nombre: 'Borrador del subgrupo sin publicar', rol: 'No debe verse en la web', orden: 30 },
    draft: true,
  })
  await payload.create({
    collection: 'publicaciones',
    data: { grupo: g, titulo: 'Cuaderno de trabajo del subgrupo (demostración)', autoria: 'Clara Muestra Demo', tipo: 'Boletín', anio: 2026, ...publicar },
  })
  await payload.create({
    collection: 'actividades',
    data: {
      grupo: g,
      tipo: 'Seminario',
      titulo: 'Sesión de lectura del subgrupo (demostración)',
      fecha: '2026-10-05',
      lugar: 'Sala ficticia',
      resumen: 'Actividad ficticia del subgrupo.',
      ...publicar,
    },
  })
  await payload.create({
    collection: 'eventos',
    data: { grupo: g, titulo: 'Reunión del subgrupo (demo)', fecha: '2026-10-27', hora: '17:00', tipo: 'Reunión', lugar: 'Sala ficticia', ...publicar },
  })
  await payload.create({
    collection: 'landing',
    data: {
      grupo: g,
      nombre: 'Taller de Lectura',
      grupoTexto: 'Subgrupo de demostración de LITARTMO (ficticio)',
      universidad: 'Universidad Nacional Mayor de San Marcos',
      sigla: 'UNMSM',
      ciudad: 'Lima',
      pais: 'Perú',
      anioFundacion: 2026,
      edicion: 'Edición de prueba',
      lema: 'Subgrupo ficticio: se edita con su propio usuario, sin acceso a LITARTMO',
      editorialEtiqueta: 'Subgrupo',
      titular: 'Un subgrupo con su propia landing, su propio contenido y su propio editor.',
      texto: 'La relación con LITARTMO es solo visual: aparece bajo el grupo en el menú principal y enlaza a él, pero cada uno se edita por separado.',
      integrantesIntro: 'Integrantes ficticios del subgrupo.',
      colaborarTitular: 'Escriba al subgrupo',
      tiposColaboracion: [{ tipo: 'Consulta' }, { tipo: 'Otro' }],
      ...publicar,
    },
  })
  console.log('[seed] litartmo/subgrupo-demo: creado (ficticio)')
}

// ---------- Cuentas ----------
const gD = await idDe('estudios-andinos-demo')
const gS = await idDe('litartmo/subgrupo-demo')
const gP = await idDe('litartmo/prensa-y-literatura')
await crearUsuario('superadmin@plataforma.local', ['superadmin'], [])
if (gL) await crearUsuario('editor-litartmo@plataforma.local', ['editor'], [gL])
if (gP) await crearUsuario('editor-prensa-literatura@plataforma.local', ['editor'], [gP])
if (gD) await crearUsuario('editor-demo@plataforma.local', ['editor'], [gD])
if (gS) await crearUsuario('editor-subgrupo-demo@plataforma.local', ['editor'], [gS])
console.log(`[seed] listo. Credenciales nuevas (si las hubo) en ${path.basename(CREDENCIALES)}`)
if (avisos) console.error(`[seed] terminado con ${avisos} aviso(s) sobre el contenido real (ver arriba): código 1`)
process.exit(avisos ? 1 : 0)
