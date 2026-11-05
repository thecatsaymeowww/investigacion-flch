import config from '@payload-config'
import { unstable_cache } from 'next/cache'
import { getPayload, type Where } from 'payload'
import type { Actividade, Evento, Grupo, Integrante, Landing, Media, Publicacione } from '@/payload-types'
import { srcSetDe } from '@/lib/archivos'

/**
 * Única capa de lectura pública del sitio. Toda consulta:
 *   - pasa `overrideAccess: false` (la Local API lo omite por defecto),
 *   - filtra por el grupo de la URL (el plugin no filtra a los anónimos),
 *   - pide solo lo publicado.
 * Ningún otro código del frontend importa Payload directamente.
 */

const publico = { overrideAccess: false as const }
const delGrupo = (grupo: number, extra: Where[] = []): Where => ({
  and: [{ grupo: { equals: grupo } }, { _status: { equals: 'published' } }, ...extra],
})

export type Imagen = { src: string; alt: string; srcSet?: string } | null

/**
 * Solo expone archivos públicos; uno privado o no poblado no se muestra, ni su original ni sus tamaños (subfase 5b).
 * `src` es el tamaño `media` (960 px) si existe, y `srcSet` lista los tamaños para que el navegador elija (lib/archivos.ts).
 */
function imagen(m: number | Media | null | undefined): Imagen {
  if (!m || typeof m !== 'object' || m.visibilidad !== 'publica' || !m.url) return null
  return { src: m.sizes?.media?.url ?? m.url, alt: m.alt, srcSet: srcSetDe(m.sizes) }
}

const parrafos = (texto: string | null | undefined) =>
  (texto ?? '')
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)

export type DatosLanding = Awaited<ReturnType<typeof leerLanding>>

/** Grupo activo por su ruta completa: "litartmo" o "litartmo/subgrupo". */
async function leerGrupo(ruta: string) {
  const payload = await getPayload({ config })
  const res = await payload.find({ collection: 'grupos', ...publico, where: { ruta: { equals: ruta } }, limit: 1, depth: 1 })
  return (res.docs[0] as Grupo | undefined) ?? null
}

/** Padre visible (solo para el enlace "pertenece a"); si está inactivo, no se enlaza. */
function padreDe(grupo: Grupo) {
  const p = grupo.padre
  if (!p || typeof p !== 'object' || !p.activo || !p.ruta) return null
  return { ruta: p.ruta, nombre: p.nombre }
}

/** Escuela del grupo; un subgrupo sin escuela propia toma la de su padre. */
function escuelaDe(grupo: Grupo): string | null {
  return grupo.escuela ?? (grupo.padre && typeof grupo.padre === 'object' ? (grupo.padre.escuela ?? null) : null)
}

async function leerLanding(grupo: Grupo) {
  const payload = await getPayload({ config })
  const g = grupo.id
  const [landingRes, integrantes, publicaciones, actividades, eventos] = await Promise.all([
    payload.find({ collection: 'landing', ...publico, where: delGrupo(g), limit: 1, depth: 1 }),
    payload.find({ collection: 'integrantes', ...publico, where: delGrupo(g), sort: 'orden', limit: 200, depth: 1 }),
    payload.find({ collection: 'publicaciones', ...publico, where: delGrupo(g), sort: '-anio', limit: 500, depth: 1 }),
    payload.find({ collection: 'actividades', ...publico, where: delGrupo(g), sort: '-fecha', limit: 50, depth: 1 }),
    payload.find({ collection: 'eventos', ...publico, where: delGrupo(g), sort: 'fecha', limit: 500, depth: 0 }),
  ])
  const l = landingRes.docs[0] as Landing | undefined
  if (!l) return null

  // Plantilla por la relación real (grupos.padre), aunque el padre esté inactivo: un subgrupo usa siempre el modelo y el
  // diseño de Prensa y Literatura, y nunca recibe los apartados propios de los grupos.
  const esSubgrupo = grupo.padre != null
  const texto = (v: string | null | undefined) => (v ?? '').trim()
  return {
    grupo: { id: g, ruta: grupo.ruta ?? grupo.slug, nombre: grupo.nombre, padre: padreDe(grupo), escuela: escuelaDe(grupo), esSubgrupo },
    /** Estructura de información de ADISCO (solo grupos; en un subgrupo, vacía). */
    investigacion: {
      objetivoGeneral: esSubgrupo ? '' : texto(l.objetivoGeneral),
      objetivos: esSubgrupo ? [] : (l.objetivosEspecificos ?? []).map((o) => texto(o.objetivo)).filter(Boolean),
      servicios: esSubgrupo ? [] : (l.servicios ?? []).map((s) => texto(s.servicio)).filter(Boolean),
      lineas: esSubgrupo ? [] : (l.lineas ?? []).map((x) => ({ codigo: texto(x.codigo), linea: texto(x.linea) })).filter((x) => x.linea),
      ambientes: esSubgrupo ? [] : (l.ambientes ?? []).map((a) => ({ ambiente: texto(a.ambiente), ubicacion: texto(a.ubicacion) })).filter((a) => a.ambiente),
      equipos: esSubgrupo
        ? []
        : (l.equipos ?? [])
            .map((e) => ({ codigo: texto(e.codigo), laboratorio: texto(e.laboratorio), responsable: texto(e.responsable) }))
            .filter((e) => e.laboratorio),
      correo: esSubgrupo ? '' : texto(l.correoContacto),
    },
    identidad: {
      nombre: l.nombre,
      grupo: l.grupoTexto,
      universidad: l.universidad,
      sigla: l.sigla,
      ciudad: l.ciudad,
      pais: l.pais,
      anioFundacion: l.anioFundacion,
      edicion: l.edicion ?? '',
      lema: l.lema,
    },
    editorial: {
      etiqueta: l.editorialEtiqueta ?? '',
      titular: l.titular,
      texto: l.texto,
      foto: imagen(l.fotoHero),
      pie: l.fotoPie ?? '',
      credito: l.fotoCredito ?? '',
    },
    // Valores calculados, nunca almacenados (handoff 5.9). Los textos sí son editables.
    cifras: [
      { valor: String(l.anioFundacion), etiqueta: l.cifraFundacion ?? '', nota: l.notaFundacion ?? '' },
      { valor: String(integrantes.totalDocs), etiqueta: l.cifraIntegrantes ?? '', nota: l.notaIntegrantes ?? '' },
      { valor: String(publicaciones.totalDocs), etiqueta: l.cifraPublicaciones ?? '', nota: l.notaPublicaciones ?? '' },
      { valor: String(actividades.totalDocs), etiqueta: l.cifraActividades ?? '', nota: l.notaActividades ?? '' },
    ],
    integrantesIntro: l.integrantesIntro ?? '',
    integrantes: (integrantes.docs as Integrante[]).map((m) => ({
      id: m.id,
      nombre: m.nombre,
      rol: m.rol ?? '',
      foto: imagen(m.foto),
      bio: parrafos(m.bio),
      // Clasificación en ESTE grupo (ADISCO, «Miembros»); en un subgrupo no se usa.
      tipo: esSubgrupo ? null : (m.tipoInvestigador ?? null),
      coordinador: !esSubgrupo && Boolean(m.coordinador),
      vinculo: esSubgrupo ? '' : texto(m.vinculo),
      facultad: esSubgrupo ? '' : texto(m.facultad),
    })),
    aliados: (l.aliados ?? []).map((a) => ({ nombre: a.nombre, url: a.url ?? '', logo: imagen(a.logo) })),
    publicaciones: (publicaciones.docs as Publicacione[]).map((p) => {
      const pdf = typeof p.pdf === 'object' && p.pdf?.visibilidad === 'publica' ? (p.pdf.url ?? '') : ''
      return {
        id: p.id,
        codigo: p.codigo ?? '',
        tipo: p.tipo,
        anio: String(p.anio),
        titulo: p.titulo,
        autoria: p.autoria,
        portada: imagen(p.portada),
        pdf,
        url: p.url ?? '',
      }
    }),
    actividades: (actividades.docs as Actividade[]).map((a) => ({
      id: a.id,
      tipo: a.tipo,
      titulo: a.titulo,
      fecha: a.fecha.slice(0, 10),
      hora: a.hora ?? '',
      lugar: a.lugar,
      resumen: a.resumen,
      texto: parrafos(a.texto),
      imagen: imagen(a.imagen),
      url: a.url ?? '',
    })),
    eventos: (eventos.docs as Evento[]).map((e) => ({ date: e.fecha.slice(0, 10), time: e.hora, title: e.titulo, kind: e.tipo, place: e.lugar })),
    galeria: (l.galeria ?? []).map((g) => ({ imagen: imagen(g.imagen), pie: g.pie, alta: Boolean(g.alta) })).filter((g) => g.imagen),
    colaborar: {
      etiqueta: l.colaborarEtiqueta ?? '',
      titular: l.colaborarTitular ?? '',
      texto: l.colaborarTexto ?? '',
      tipos: (l.tiposColaboracion ?? []).map((t) => t.tipo),
    },
  }
}

/** Forma de una ruta de grupo: `slug` o `slug/slug` (minúsculas, números y guiones), con longitud acotada. */
const RUTA = /^[a-z0-9]+(?:-[a-z0-9]+)*(?:\/[a-z0-9]+(?:-[a-z0-9]+)*)?$/
export const esRutaValida = (ruta: string) => ruta.length <= 200 && RUTA.test(ruta)

/** Rutas de los grupos activos: UNA entrada de caché para todo el sitio (se invalida con cualquier cambio en grupos). */
const rutasActivas = unstable_cache(
  async (): Promise<string[]> => {
    const payload = await getPayload({ config })
    const grupos = (await payload.find({ collection: 'grupos', ...publico, limit: 1000, depth: 0 })).docs as Grupo[]
    return grupos.map((g) => g.ruta ?? g.slug)
  },
  ['rutas-activas'],
  { tags: ['grupos'], revalidate: 300 },
)

/**
 * Versión de la forma de DatosLanding en la clave de caché. Hay que subirla cada vez que esa forma cambie: la caché de
 * datos (.next/cache) sobrevive a los builds y, sin esto, el primer servidor nuevo recibiría entradas con la forma
 * antigua (p. ej. sin `investigacion`) hasta que caducaran.
 */
const VERSION_LANDING = 'v2-adisco'

/**
 * Landing completa de un grupo o subgrupo activo, por su ruta ("litartmo" o
 * "litartmo/subgrupo"), o null. Caché por grupo: solo la invalida un cambio de ese grupo.
 * Solo las rutas de la lista de grupos activos tienen entrada de caché propia: si no, cada URL inventada añadiría
 * una. Una ruta que no está en la lista se consulta sin caché, por si el grupo se creó fuera de Next (seed,
 * importación o pruebas: ahí no se puede invalidar la lista) y la lista aún no lo incluye.
 */
export async function obtenerLanding(ruta: string) {
  if (!esRutaValida(ruta)) return null
  const grupo = (await rutasActivas()).includes(ruta)
    ? await unstable_cache(() => leerGrupo(ruta), ['grupo', ruta], { tags: ['grupos'], revalidate: 300 })()
    : await leerGrupo(ruta)
  if (!grupo) return null
  return unstable_cache(() => leerLanding(grupo), ['landing', VERSION_LANDING, String(grupo.id)], { tags: [`g:${grupo.id}`, 'grupos'], revalidate: 300 })()
}

export type EntradaDirectorio = {
  ruta: string
  nombre: string
  cabecera: string
  lema: string
  /** Valor de lib/escuelas (null si no tiene); un subgrupo lleva la de su padre. */
  escuela: string | null
  foto: Imagen
  conLanding: boolean
  subgrupos: Omit<EntradaDirectorio, 'subgrupos'>[]
}

/**
 * Directorio: grupos principales y, debajo de cada uno, sus subgrupos. Solo se
 * enlaza lo que tiene landing publicada; un grupo sin landing aparece (sin
 * enlace) si alguno de sus subgrupos sí la tiene.
 */
export const listarGrupos = unstable_cache(
  async (): Promise<EntradaDirectorio[]> => {
    const payload = await getPayload({ config })
    // Orden editable por el superadmin; a igual orden, alfabético.
    const grupos = ((await payload.find({ collection: 'grupos', ...publico, limit: 1000, depth: 0 })).docs as Grupo[]).sort(
      (a, b) => (a.orden ?? 100) - (b.orden ?? 100) || a.nombre.localeCompare(b.nombre, 'es'),
    )
    // depth 1: la foto de portada de la landing ilustra su tarjeta (solo si el archivo es público, ver imagen()).
    const landings = (await payload.find({ collection: 'landing', ...publico, where: { _status: { equals: 'published' } }, limit: 1000, depth: 1 }))
      .docs as Landing[]
    const landingDe = new Map(landings.map((l) => [typeof l.grupo === 'object' ? l.grupo?.id : l.grupo, l]))
    const entrada = (g: Grupo, escuelaPadre: string | null = null) => {
      const l = landingDe.get(g.id)
      return {
        ruta: g.ruta ?? g.slug,
        nombre: g.nombre,
        cabecera: l?.nombre ?? g.nombre,
        lema: l?.lema ?? '',
        escuela: g.escuela ?? escuelaPadre,
        foto: imagen(l?.fotoHero),
        conLanding: Boolean(l),
      }
    }
    const padreId = (g: Grupo) => (typeof g.padre === 'object' ? g.padre?.id : g.padre) ?? null
    return grupos
      .filter((g) => padreId(g) == null)
      .map((g) => ({
        ...entrada(g),
        subgrupos: grupos
          .filter((s) => padreId(s) === g.id)
          .map((s) => entrada(s, g.escuela ?? null))
          .filter((s) => s.conLanding),
      }))
      .filter((g) => g.conLanding || g.subgrupos.length > 0)
  },
  ['directorio'],
  { tags: ['directorio', 'grupos'], revalidate: 300 },
)

/** Grupo activo por ruta (formulario de contacto: el grupo sale de la URL, nunca del cliente). */
export async function grupoPorRuta(ruta: string) {
  return leerGrupo(ruta)
}
