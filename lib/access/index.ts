import type { Access, FieldAccess, PayloadRequest, Where } from 'payload'

/**
 * Único módulo de políticas de acceso. Las colecciones solo usan estas
 * funciones. El plugin multi-tenant añade encima, para los usuarios del panel,
 * la restricción "solo documentos de mis grupos". A los visitantes anónimos el
 * plugin NO los filtra por grupo: eso lo hace siempre lib/cms.
 *
 * Canal (subfase 2b): un anónimo solo lee por la Local API del servidor (lib/cms, `payloadAPI: 'local'`), que filtra
 * por grupo activo y publicado. Por la API REST (`/api/...`, `payloadAPI: 'REST'`) no lee nada: el sitio no la usa y
 * sería una segunda vía, sin ese filtro, al contenido de todos los grupos. La única excepción son los archivos
 * públicos que sirve `/api/media/file/<nombre>` (`isReadingStaticFile`). Cualquier otro canal se deniega.
 */
const porLocalAPI = (req: PayloadRequest) => req.payloadAPI === 'local'

export type Rol = 'superadmin' | 'editor'

export function esSuperadmin(user: PayloadRequest['user'] | null | undefined): boolean {
  const roles = (user as { roles?: Rol[] } | null | undefined)?.roles
  return Array.isArray(roles) && roles.includes('superadmin')
}

export const soloSuperadmin: Access = ({ req }) => esSuperadmin(req.user)
export const campoSoloSuperadmin: FieldAccess = ({ req }) => esSuperadmin(req.user)

/** Usuarios del panel (el plugin los limita a su grupo); anónimos: nada. */
export const usuarioDelPanel: Access = ({ req }) => Boolean(req.user)

/**
 * Cuentas (subfase 2c, H16): un editor solo lee su propia cuenta. Compartir grupo no da acceso a los datos de los
 * compañeros (correo, roles, grupos): ninguna función del editor los necesita. El superadmin, todas.
 */
export const cuentaPropiaOSuperadmin: Access = ({ req }) => {
  if (!req.user) return false
  return esSuperadmin(req.user) || { id: { equals: req.user.id } }
}

/** Anónimo: solo lo publicado, y solo por la Local API. Panel: todo lo de su grupo. */
export const publicadoOPanel: Access = ({ req }) => {
  if (req.user) return true
  return porLocalAPI(req) ? { _status: { equals: 'published' } } : false
}

/** Grupos: anónimo solo los activos, y solo por la Local API (directorio y rutas). Panel: el plugin limita al propio. */
export const grupoActivoOPanel: Access = ({ req }) => {
  if (req.user) return true
  return porLocalAPI(req) ? { activo: { equals: true } } : false
}

const ARCHIVO_VISIBLE: Where = { and: [{ visibilidad: { equals: 'publica' } }, { 'grupo.activo': { equals: true } }] }

/**
 * Archivos: anónimo solo los públicos (visibilidad calculada) de un grupo activo, por la Local API o como archivo
 * servido por `/api/media/file/`; sus metadatos por REST (`/api/media`), no. Un grupo inactivo no tiene página, y sus
 * archivos tampoco se sirven aunque se conozca el nombre. Panel: los de su grupo.
 */
export const archivoPublicoOPanel: Access = ({ req, isReadingStaticFile, data }) => {
  // Un nombre con caracteres de control (p. ej. `%00`) no es un archivo: Payload lo pasaría al sistema de archivos y
  // respondería 500. Se rechaza antes (403), también con sesión.
  if (isReadingStaticFile && [...String((data as { filename?: unknown } | undefined)?.filename ?? '')].some((c) => c.charCodeAt(0) < 32)) return false
  if (req.user) return true
  return porLocalAPI(req) || isReadingStaticFile ? ARCHIVO_VISIBLE : false
}

export const nadie: Access = () => false
