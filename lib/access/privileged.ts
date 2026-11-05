import { createHash } from 'node:crypto'
import type { Access, CollectionAfterChangeHook, CollectionAfterDeleteHook, CollectionBeforeValidateHook, Payload, PayloadRequest, Where } from 'payload'
import { ValidationError } from 'payload'
import { mismoEnvio, VENTANA_DUPLICADOS_MS } from '../formulario'
import { esSuperadmin } from './index'

/**
 * Lista cerrada de operaciones privilegiadas. Es el ÚNICO archivo del proyecto
 * que usa `overrideAccess: true`. Cada función pasa `req` para quedar dentro de
 * la misma transacción que la escritura que la dispara.
 */

type Doc = Record<string, unknown> | undefined | null

export function idDe(valor: unknown): number | null {
  if (valor == null) return null
  if (typeof valor === 'object') return (valor as { id?: number }).id ?? null
  return typeof valor === 'number' ? valor : Number(valor)
}

export const grupoDe = (doc: Doc): number | null => idDe(doc?.grupo)

/** Campos que apuntan a otros documentos o archivos, por colección: [campo, colección destino, ¿dentro de un array?]. */
export type Referencia = { campo: string; destino: string; enArray?: string }

function valoresReferidos(data: Doc, ref: Referencia): number[] {
  if (!data) return []
  if (ref.enArray) {
    const filas = (data[ref.enArray] as Record<string, unknown>[] | undefined) ?? []
    return filas.map((f) => idDe(f?.[ref.campo])).filter((v): v is number => v != null)
  }
  const v = data[ref.campo]
  return (Array.isArray(v) ? v : [v]).map(idDe).filter((x): x is number => x != null)
}

/**
 * Un documento solo puede referenciar archivos y documentos de su propio grupo.
 * El plugin multi-tenant no lo impide (comprobado en el spike, Fase A-3).
 * beforeValidate corre también en borradores y autosave.
 */
export function exigirMismoGrupo(refs: Referencia[]): CollectionBeforeValidateHook {
  return async ({ collection, data, originalDoc, req }) => {
    const grupo = grupoDe(data?.grupo != null ? data : originalDoc)
    const errores: { message: string; path: string }[] = []
    for (const ref of refs) {
      for (const id of valoresReferidos(data, ref)) {
        const destino = await req.payload.findByID({ collection: ref.destino as never, id, overrideAccess: true, req, depth: 0 }).catch(() => null)
        if (!destino || grupoDe(destino as unknown as Doc) !== grupo) {
          errores.push({ message: 'Solo puedes elegir elementos de tu propio grupo.', path: ref.enArray ? ref.enArray : ref.campo })
        }
      }
    }
    if (errores.length) throw new ValidationError({ collection: collection.slug, errors: errores }, req.t)
    return data
  }
}

function hash(valor: unknown): string {
  return createHash('sha256')
    .update(JSON.stringify(valor ?? null))
    .digest('hex')
}

/**
 * Lo que se resume (como hash) de cada documento. De los usuarios, SOLO identidad, rol y grupos: nunca la contraseña,
 * su hash o su sal, tokens, sesiones ni intentos de acceso.
 */
function resumen(coleccion: string, doc: Doc): unknown {
  if (!doc || coleccion !== 'usuarios') return doc
  const grupos = ((doc.grupos as { grupo?: unknown }[] | null | undefined) ?? []).map((g) => idDe(g?.grupo))
  return { id: doc.id, email: doc.email, roles: doc.roles, grupos }
}

async function registrar(req: PayloadRequest, coleccion: string, doc: Doc, antes: Doc, operacion: string) {
  // Un grupo se registra a sí mismo; al borrarlo ya no existe, y la referencia quedaría rota.
  const grupo = coleccion === 'grupos' ? (doc ? idDe(doc.id) : null) : grupoDe(doc ?? antes)
  await req.payload.create({
    collection: 'registro-cambios',
    overrideAccess: true,
    req,
    data: {
      grupo,
      coleccion,
      documento: String((doc ?? antes)?.id ?? ''),
      operacion,
      actor: req.user ? `usuario:${req.user.id}` : 'proceso',
      antesHash: antes ? hash(resumen(coleccion, antes)) : null,
      despuesHash: doc ? hash(resumen(coleccion, doc)) : null,
    },
  })
}

/**
 * Registro de cambios (R1): una entrada por operación, en la misma transacción.
 * Usuarios: alta, cambio de identidad, rol o grupos, cambio de contraseña ('cambiar-clave', sin guardarla) y borrado.
 * Las escrituras internas de Payload sobre el usuario que no cambian nada de eso no se registran.
 */
export const registrarCambio: CollectionAfterChangeHook = async ({ collection, context, doc, previousDoc, operation, req }) => {
  let operacion: string = operation
  if (collection.versions?.drafts) {
    const antes = (previousDoc as { _status?: string } | undefined)?._status
    const ahora = (doc as { _status?: string })._status
    if (ahora === 'published' && antes !== 'published') operacion = 'publicar'
    else if (antes === 'published' && ahora !== 'published') operacion = 'despublicar'
  }
  if (collection.slug === 'usuarios' && operation === 'update') {
    // Payload retira `password` de los datos antes de afterChange: lo marca marcarCambioDeClave (beforeValidate).
    if (context.cambiaClave) operacion = 'cambiar-clave'
    else if (hash(resumen('usuarios', doc)) === hash(resumen('usuarios', previousDoc))) return doc
  }
  await registrar(req, collection.slug, doc, operation === 'create' ? null : previousDoc, operacion)
  return doc
}

/** Usuarios: deja constancia (sin el valor) de que la escritura cambia la contraseña, para registrarCambio. */
export const marcarCambioDeClave: CollectionBeforeValidateHook = ({ context, data, operation }) => {
  if (operation === 'update' && typeof data?.password === 'string' && data.password !== '') context.cambiaClave = true
  return data
}

export const registrarBorrado: CollectionAfterDeleteHook = async ({ collection, doc, req }) => {
  await registrar(req, collection.slug, null, doc, 'borrar')
  return doc
}

/** Campos de archivo que hacen público un archivo cuando el documento que los usa está publicado. */
export const CAMPOS_PUBLICOS: Record<string, Referencia[]> = {
  integrantes: [{ campo: 'foto', destino: 'media' }],
  publicaciones: [
    { campo: 'portada', destino: 'media' },
    { campo: 'pdf', destino: 'media' },
  ],
  actividades: [{ campo: 'imagen', destino: 'media' }],
  landing: [
    { campo: 'fotoHero', destino: 'media' },
    { campo: 'imagen', destino: 'media', enArray: 'galeria' },
    { campo: 'logo', destino: 'media', enArray: 'aliados' },
  ],
}

/**
 * Visibilidad calculada (13.2): un archivo es público si al menos un documento
 * publicado de su grupo lo usa en un campo público. Se recalcula al cambiar o
 * borrar cualquier documento que lo referencia.
 */
async function recalcular(req: PayloadRequest, mediaIds: Set<number>) {
  for (const id of mediaIds) {
    const media = await req.payload.findByID({ collection: 'media', id, overrideAccess: true, req, depth: 0 }).catch(() => null)
    if (!media) continue
    const grupo = grupoDe(media as unknown as Doc)
    let publica = false
    for (const [coleccion, refs] of Object.entries(CAMPOS_PUBLICOS)) {
      const or = refs.map((r) => ({ [r.enArray ? `${r.enArray}.${r.campo}` : r.campo]: { equals: id } }))
      const { totalDocs } = await req.payload.count({
        collection: coleccion as never,
        overrideAccess: true,
        req,
        where: { and: [{ grupo: { equals: grupo } }, { _status: { equals: 'published' } }, { or }] },
      })
      if (totalDocs > 0) {
        publica = true
        break
      }
    }
    const visibilidad = publica ? 'publica' : 'privada'
    if ((media as { visibilidad?: string }).visibilidad !== visibilidad) {
      await req.payload.update({ collection: 'media', id, overrideAccess: true, req, data: { visibilidad }, context: { visibilidadCalculada: true } })
    }
  }
}

function mediaReferida(slug: string, docs: Doc[]): Set<number> {
  const ids = new Set<number>()
  for (const ref of CAMPOS_PUBLICOS[slug] ?? []) for (const d of docs) for (const id of valoresReferidos(d, ref)) ids.add(id)
  return ids
}

export const recalcularVisibilidad: CollectionAfterChangeHook = async ({ collection, doc, previousDoc, req }) => {
  await recalcular(req, mediaReferida(collection.slug, [doc, previousDoc]))
  return doc
}

export const recalcularVisibilidadAlBorrar: CollectionAfterDeleteHook = async ({ collection, doc, req }) => {
  await recalcular(req, mediaReferida(collection.slug, [doc]))
  return doc
}

/**
 * Mapa de caché: `g:<id>` = landing y archivo de un grupo; `directorio` = página /;
 * `grupos` = búsqueda de grupo por slug. Un cambio en un grupo nunca invalida otro.
 * Fuera de una petición de Next (scripts) no hay caché que invalidar.
 */
async function revalidar(tags: string[]) {
  const { revalidateTag } = await import('next/cache')
  for (const tag of new Set(tags)) {
    try {
      revalidateTag(tag, { expire: 0 })
    } catch {
      // sin contexto de Next
    }
  }
}

const tagsDe = (slug: string, grupos: (number | null)[]) => [
  ...grupos.filter((g): g is number => g != null).map((g) => `g:${g}`),
  // La landing también alimenta el directorio (cabecera y lema).
  ...(slug === 'landing' ? ['directorio'] : []),
]

export const revalidarGrupo: CollectionAfterChangeHook = async ({ collection, doc, previousDoc }) => {
  await revalidar(tagsDe(collection.slug, [grupoDe(doc), grupoDe(previousDoc)]))
  return doc
}

export const revalidarGrupoAlBorrar: CollectionAfterDeleteHook = async ({ collection, doc }) => {
  await revalidar(tagsDe(collection.slug, [grupoDe(doc)]))
  return doc
}

/**
 * Ruta pública del grupo: `slug` (grupo principal) o `padre/slug` (subgrupo).
 * Un único nivel: el padre debe ser principal, y un grupo con subgrupos no puede
 * convertirse en subgrupo. La ruta es única (índice en la base).
 */
export const calcularRuta: CollectionBeforeValidateHook = async ({ data, originalDoc, req }) => {
  if (!data) return data
  const slug = (data.slug ?? originalDoc?.slug) as string | undefined
  const padreId = idDe('padre' in data ? data.padre : originalDoc?.padre)
  const errores: { message: string; path: string }[] = []
  let ruta = slug
  if (padreId != null) {
    if (originalDoc?.id != null && padreId === originalDoc.id) errores.push({ message: 'Un grupo no puede ser su propio padre.', path: 'padre' })
    const padre = await req.payload.findByID({ collection: 'grupos', id: padreId, overrideAccess: true, req, depth: 0 }).catch(() => null)
    if (!padre) errores.push({ message: 'El grupo padre no existe.', path: 'padre' })
    else if (padre.padre != null) errores.push({ message: 'Solo un grupo principal puede tener subgrupos (un nivel).', path: 'padre' })
    else ruta = `${padre.slug}/${slug}`
    if (originalDoc?.id != null) {
      const { totalDocs } = await req.payload.count({ collection: 'grupos', overrideAccess: true, req, where: { padre: { equals: originalDoc.id } } })
      if (totalDocs > 0) errores.push({ message: 'Este grupo tiene subgrupos: no puede convertirse en subgrupo.', path: 'padre' })
    }
  }
  if (errores.length) throw new ValidationError({ collection: 'grupos', errors: errores }, req.t)
  // Siempre se recalcula: lo que llegue escrito en `ruta` se ignora.
  return { ...data, ruta }
}

/** Si cambia el slug de un grupo principal, se recalcula la ruta de sus subgrupos. */
export const actualizarRutasDeSubgrupos: CollectionAfterChangeHook = async ({ doc, previousDoc, req }) => {
  if (doc.padre != null || !previousDoc || previousDoc.slug === doc.slug) return doc
  const hijos = await req.payload.find({ collection: 'grupos', overrideAccess: true, req, where: { padre: { equals: doc.id } }, limit: 500, depth: 0 })
  for (const h of hijos.docs) {
    await req.payload.update({ collection: 'grupos', id: h.id, overrideAccess: true, req, data: { slug: h.slug } })
  }
  return doc
}

/** Cambios en la colección `grupos` (nombre, slug, activo). */
export const revalidarDirectorio: CollectionAfterChangeHook = async ({ doc, previousDoc }) => {
  // También el padre (anterior y nuevo): la landing del subgrupo muestra su enlace y el padre puede cambiar.
  await revalidar(['grupos', 'directorio', `g:${doc.id}`, ...[idDe(doc.padre), idDe(previousDoc?.padre)].filter((g) => g != null).map((g) => `g:${g}`)])
  return doc
}

/**
 * Plantilla de contenido de un grupo, por su relación real (`grupos.padre`), nunca por nombre o ruta: un grupo con
 * padre es un subgrupo (modelo y diseño de Prensa y Literatura) y uno sin padre, un grupo de investigación (modelo
 * ampliado según ADISCO). Se guarda en `req.context` para no repetir la consulta dentro de la misma operación.
 */
export async function esSubgrupo(req: PayloadRequest, grupo: unknown): Promise<boolean | null> {
  if (grupo && typeof grupo === 'object' && 'padre' in grupo) return (grupo as { padre?: unknown }).padre != null
  const id = idDe(grupo)
  if (id == null) return null
  const cache = ((req.context.plantillas as Map<number, boolean> | undefined) ??= new Map<number, boolean>())
  if (!cache.has(id)) {
    const g = await req.payload.findByID({ collection: 'grupos', id, overrideAccess: true, req, depth: 0 }).catch(() => null)
    if (!g) return null
    cache.set(id, g.padre != null)
  }
  return cache.get(id)!
}

/**
 * Campo virtual `plantilla` (sin columna): «grupo» o «subgrupo». Solo sirve al panel, para mostrar los campos propios
 * de los grupos (admin.condition no puede consultar la base); fuera del panel no se calcula.
 */
export const calcularPlantilla = async ({ data, req }: { data?: Doc; req: PayloadRequest }) => {
  if (!req.user || !data) return undefined
  const sub = await esSubgrupo(req, data.grupo)
  return sub == null ? undefined : sub ? 'subgrupo' : 'grupo'
}

/**
 * Los campos propios de los grupos de investigación no se escriben nunca en un subgrupo, por ninguna vía (panel o API):
 * lo que llegue se sustituye por lo que ya había (nada, en un alta). No borra datos: si un grupo pasa a ser subgrupo,
 * los suyos se conservan sin mostrarse.
 */
export function soloEnGrupos(campos: string[]): CollectionBeforeValidateHook {
  return async ({ data, originalDoc, req }) => {
    if (!data) return data
    if (!(await esSubgrupo(req, data.grupo ?? originalDoc?.grupo))) return data
    const limpio: Record<string, unknown> = { ...data }
    for (const c of campos) {
      if (originalDoc && c in originalDoc) limpio[c] = originalDoc[c]
      else delete limpio[c]
    }
    return limpio
  }
}

/**
 * Un único coordinador por grupo (ADISCO lo indica en «Tipo de investigador»). Se cuentan los demás integrantes del
 * mismo grupo marcados como coordinadores, sin leer ni devolver sus datos.
 */
export async function coordinadorUnico(valor: unknown, { data, id, req }: { data?: Doc; id?: number | string; req: PayloadRequest }): Promise<true | string> {
  if (valor !== true) return true
  const grupo = grupoDe(data)
  if (grupo == null) return true
  const { totalDocs } = await req.payload.count({
    collection: 'integrantes',
    overrideAccess: true,
    req,
    where: { and: [{ grupo: { equals: grupo } }, { coordinador: { equals: true } }, ...(id != null ? [{ id: { not_equals: id } }] : [])] },
  })
  return totalDocs === 0 || 'Este grupo ya tiene un coordinador. Desmárcalo antes de marcar a otro integrante.'
}

/**
 * Cola por grupo: la búsqueda de duplicados y la creación de un mensaje no se solapan con las de otro envío al mismo
 * grupo. En memoria de este proceso (un solo proceso, D10), como los límites de envío.
 */
const colas = new Map<number, Promise<unknown>>()
function enCola<T>(grupo: number, tarea: () => Promise<T>): Promise<T> {
  const previa = colas.get(grupo) ?? Promise.resolve()
  const actual = previa.then(tarea, tarea)
  const fin = actual.catch(() => undefined)
  colas.set(grupo, fin)
  void fin.then(() => {
    if (colas.get(grupo) === fin) colas.delete(grupo)
  })
  return actual
}

/**
 * Única vía de creación de mensajes de contacto: Server Action, grupo tomado de la ruta.
 * Subfase 4c: `posibleSpam` guarda el mensaje con ese estado (no se descarta), y un envío con el mismo correo (sin
 * distinguir mayúsculas) y el mismo mensaje que otro del MISMO grupo en los últimos 10 minutos se guarda con
 * `duplicadoDe` apuntando a él (o a su original). El mensaje anterior no se modifica. Se buscan solo los del grupo.
 */
export async function crearMensajeContacto(
  payload: import('payload').Payload,
  grupo: number,
  datos: { nombre: string; correo: string; institucion?: string; tipo: string; mensaje: string },
  { posibleSpam = false }: { posibleSpam?: boolean } = {},
) {
  return enCola(grupo, async () => {
    const desde = new Date(Date.now() - VENTANA_DUPLICADOS_MS).toISOString()
    const { docs } = await payload.find({
      collection: 'mensajes',
      overrideAccess: true,
      where: { and: [{ grupo: { equals: grupo } }, { createdAt: { greater_than_equal: desde } }, { mensaje: { equals: datos.mensaje } }] },
      sort: 'createdAt',
      limit: 100,
      depth: 0,
    })
    const anterior = docs.find((d) => mismoEnvio(d, datos))
    const duplicadoDe = anterior ? (idDe(anterior.duplicadoDe) ?? anterior.id) : undefined
    return payload.create({
      collection: 'mensajes',
      overrideAccess: true,
      data: { ...datos, grupo, estado: posibleSpam ? 'posible-spam' : 'nuevo', ...(duplicadoDe ? { duplicadoDe } : {}) },
    })
  })
}

/** Colecciones con campo `grupo` del plugin multi-tenant (payload.config.ts). */
const CON_GRUPO = ['landing', 'integrantes', 'publicaciones', 'actividades', 'eventos', 'media', 'mensajes'] as const

/** Ids de los bloqueos de edición cuyo documento es de un grupo del usuario (o es su propia cuenta o uno de sus grupos). */
async function bloqueosVisibles(req: PayloadRequest): Promise<number[]> {
  const yo = idDe(req.user?.id)
  const mios = ((req.user as { grupos?: { grupo?: unknown }[] } | null)?.grupos ?? []).map((g) => idDe(g?.grupo)).filter((g): g is number => g != null)
  const { docs } = await req.payload.find({ collection: 'payload-locked-documents', overrideAccess: true, req, depth: 0, limit: 0, pagination: false })
  const porColeccion = new Map<string, { bloqueo: number; doc: number }[]>()
  for (const b of docs) {
    const doc = idDe(b.document?.value)
    if (!b.document || doc == null) continue
    porColeccion.set(b.document.relationTo, [...(porColeccion.get(b.document.relationTo) ?? []), { bloqueo: b.id, doc }])
  }
  const visibles: number[] = []
  for (const [coleccion, filas] of porColeccion) {
    let permitidos: number[] = []
    if (coleccion === 'grupos') permitidos = filas.map((f) => f.doc).filter((id) => mios.includes(id))
    else if (coleccion === 'usuarios') permitidos = filas.map((f) => f.doc).filter((id) => id === yo)
    else if ((CON_GRUPO as readonly string[]).includes(coleccion) && mios.length > 0) {
      const r = await req.payload.find({
        collection: coleccion as (typeof CON_GRUPO)[number],
        overrideAccess: true,
        req,
        depth: 0,
        limit: 0,
        pagination: false,
        select: {},
        where: { and: [{ id: { in: filas.map((f) => f.doc) } }, { grupo: { in: mios } }] },
      })
      permitidos = r.docs.map((d) => d.id)
    }
    visibles.push(...filas.filter((f) => permitidos.includes(f.doc)).map((f) => f.bloqueo))
  }
  return visibles
}

const soloVisibles = async (req: PayloadRequest): Promise<Where> => {
  const ids = await bloqueosVisibles(req)
  // Sin bloqueos visibles, una condición que no cumple nadie (no `false`: el panel consulta esta colección al abrir un
  // documento y un 403 rompería el formulario).
  return ids.length ? { id: { in: ids } } : { id: { exists: false } }
}

/**
 * Bloqueos de edición del panel (`payload-locked-documents`, colección interna de Payload; subfase 2c). Payload solo
 * exige sesión, sin grupo: un editor veía, tomaba, creaba y borraba bloqueos de documentos de OTROS grupos (qué se
 * edita, cuándo y con qué cuenta). Ahora un editor solo lee, toma y libera los bloqueos de documentos de sus grupos,
 * solo puede ponerse a sí mismo como dueño y no los crea por la API: el panel los crea en el servidor con `payload.db`,
 * sin pasar por estas funciones. El superadmin, sin cambios.
 */
const accesoBloqueos: Record<'read' | 'create' | 'update' | 'delete', Access> = {
  read: async ({ req }) => (!req.user ? false : esSuperadmin(req.user) ? true : soloVisibles(req)),
  create: ({ req }) => esSuperadmin(req.user),
  update: async ({ req, data }) => {
    if (!req.user) return false
    if (esSuperadmin(req.user)) return true
    const d = (data ?? {}) as { user?: unknown; document?: unknown; globalSlug?: unknown }
    if (d.document !== undefined || d.globalSlug !== undefined) return false
    if (d.user !== undefined && idDe(typeof d.user === 'object' && d.user && 'value' in d.user ? d.user.value : d.user) !== idDe(req.user.id)) return false
    return soloVisibles(req)
  },
  delete: async ({ req }) => (!req.user ? false : esSuperadmin(req.user) ? true : soloVisibles(req)),
}

/** Aplica `accesoBloqueos` en onInit: la colección la añade Payload después de procesar `collections` y `plugins`. */
export function protegerBloqueos(payload: Payload) {
  const bloqueos = payload.collections['payload-locked-documents']?.config
  if (bloqueos) Object.assign(bloqueos.access, accesoBloqueos)
}
