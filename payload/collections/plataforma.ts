import type { CollectionConfig, Where } from 'payload'
import { APIError } from 'payload'
import { cabecerasDeArchivo, errorDeTamano, ORIGINAL_MAXIMO, TAMANOS_DERIVADOS, tipoParaLimite } from '../../lib/archivos'
import {
  campoSoloSuperadmin,
  cuentaPropiaOSuperadmin,
  esSuperadmin,
  grupoActivoOPanel,
  nadie,
  soloSuperadmin,
  usuarioDelPanel,
  archivoPublicoOPanel,
} from '../../lib/access'
import {
  actualizarRutasDeSubgrupos,
  calcularRuta,
  marcarCambioDeClave,
  registrarBorrado,
  registrarCambio,
  revalidarDirectorio,
  revalidarGrupo,
  revalidarGrupoAlBorrar,
} from '../../lib/access/privileged'
import { cookieSegura } from '../../lib/entorno'
import { ESCUELAS } from '../../lib/escuelas'
import { RUTAS_RESERVADAS } from '../../lib/rutas'

/**
 * Rechazo de un archivo (subfase 5a), con el motivo visible para el editor (400). Lleva `name` propio: el formateador de
 * errores de Payload solo reconoce sus clases con `instanceof`, que falla cuando el build tiene más de una copia, y
 * entonces muestra el mensaje solo si el error tiene nombre (en el build minificado, el de la clase queda vacío).
 */
function errorDeArchivo(mensaje: string) {
  const e = new APIError(mensaje, 400, undefined, true)
  e.name = 'ArchivoNoAdmitido'
  return e
}

/**
 * Grupo o subgrupo. La jerarquía es solo visual (directorio y enlace al padre):
 * para el CMS cada uno es un grupo independiente, con su propia landing,
 * contenido, archivos y editores. Un nivel: un subgrupo no puede tener subgrupos.
 */
export const Grupos: CollectionConfig = {
  slug: 'grupos',
  labels: { singular: 'Grupo', plural: 'Grupos y subgrupos' },
  admin: { useAsTitle: 'nombre', defaultColumns: ['nombre', 'ruta', 'padre', 'activo'], group: 'Plataforma' },
  access: {
    read: grupoActivoOPanel,
    create: soloSuperadmin,
    update: soloSuperadmin,
    delete: soloSuperadmin,
  },
  hooks: { beforeValidate: [calcularRuta], afterChange: [actualizarRutasDeSubgrupos, revalidarDirectorio, registrarCambio], afterDelete: [registrarBorrado] },
  fields: [
    { name: 'nombre', label: 'Nombre del grupo', type: 'text', required: true },
    {
      name: 'padre',
      label: 'Grupo padre (solo para subgrupos)',
      type: 'relationship',
      relationTo: 'grupos',
      // Solo grupos principales pueden ser padres (un único nivel).
      filterOptions: ({ id }): Where => ({ and: [{ padre: { exists: false } }, ...(id ? [{ id: { not_equals: id } }] : [])] as Where[] }),
      admin: { description: 'Déjalo vacío para un grupo principal. Si eliges un grupo, este pasa a ser su subgrupo: /<grupo>/<slug>.' },
    },
    {
      name: 'slug',
      label: 'Dirección (slug)',
      type: 'text',
      required: true,
      index: true,
      admin: { description: 'Solo minúsculas, números y guiones. Grupo: /<slug>. Subgrupo: /<grupo>/<slug>.' },
      validate: (value: unknown) => {
        if (typeof value !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value)) return 'Usa solo minúsculas, números y guiones.'
        if (RUTAS_RESERVADAS.includes(value)) return 'Esa dirección está reservada por la plataforma.'
        return true
      },
    },
    {
      name: 'ruta',
      label: 'Ruta',
      type: 'text',
      unique: true,
      index: true,
      admin: { readOnly: true, position: 'sidebar', description: 'Se calcula sola a partir del grupo padre y el slug.' },
    },
    { name: 'activo', label: 'Landing visible al público', type: 'checkbox', defaultValue: true },
    {
      name: 'escuela',
      label: 'Escuela profesional',
      type: 'select',
      options: ESCUELAS.map((e) => ({ value: e.valor, label: e.nombre })),
      admin: {
        position: 'sidebar',
        description: 'Agrupa el grupo en el directorio y aparece en su portada. Un subgrupo se muestra con la escuela de su grupo padre.',
      },
    },
    {
      name: 'orden',
      label: 'Orden en el menú principal',
      type: 'number',
      defaultValue: 100,
      admin: { position: 'sidebar', description: 'Menor número = aparece antes (entre grupos, o entre los subgrupos de un mismo grupo).' },
    },
  ],
}

export const Usuarios: CollectionConfig = {
  slug: 'usuarios',
  labels: { singular: 'Usuario', plural: 'Usuarios' },
  // Cookie de sesión con Secure salvo PAYLOAD_COOKIE_SECURE=false explícito (solo para pruebas locales por HTTP).
  auth: { maxLoginAttempts: 5, lockTime: 10 * 60 * 1000, tokenExpiration: 8 * 60 * 60, cookies: { secure: cookieSegura(), sameSite: 'Lax' } },
  admin: { useAsTitle: 'email', defaultColumns: ['email', 'roles'], group: 'Plataforma' },
  access: {
    read: cuentaPropiaOSuperadmin,
    create: soloSuperadmin,
    update: ({ req, id }) => esSuperadmin(req.user) || (req.user != null && req.user.id === id),
    delete: soloSuperadmin,
    // Desbloquear una cuenta (tras 5 intentos fallidos) anula la protección contra fuerza bruta: solo el superadmin.
    // Sin esto, el plugin dejaba a un editor desbloquear las cuentas con las que comparte grupo.
    unlock: soloSuperadmin,
  },
  hooks: { beforeValidate: [marcarCambioDeClave], afterChange: [registrarCambio], afterDelete: [registrarBorrado] },
  fields: [
    {
      name: 'roles',
      label: 'Rol',
      type: 'select',
      hasMany: true,
      required: true,
      defaultValue: ['editor'],
      options: [
        { label: 'Superadministrador', value: 'superadmin' },
        { label: 'Editor del grupo', value: 'editor' },
      ],
      access: { create: campoSoloSuperadmin, update: campoSoloSuperadmin },
    },
  ],
}

export const Media: CollectionConfig = {
  slug: 'media',
  labels: { singular: 'Archivo', plural: 'Archivos' },
  // Grupo del menú del panel (etapa 4.1, D7): junto al contenido del grupo, al que pertenece cada archivo.
  admin: { useAsTitle: 'alt', defaultColumns: ['filename', 'alt', 'visibilidad'], group: 'Contenido del grupo' },
  access: { read: archivoPublicoOPanel, create: usuarioDelPanel, update: usuarioDelPanel, delete: usuarioDelPanel },
  hooks: {
    // Límite por tipo (subfase 5a, lib/archivos.ts): imágenes hasta 5 MB y PDF hasta 20 MB.
    // 1. Antes de todo, con el archivo recibido (tamaño real y tipo por su contenido), al crear y al SUSTITUIR: Payload
    //    borra el archivo anterior antes de los hooks beforeValidate, así que rechazar allí dejaba el documento sin él.
    beforeOperation: [
      ({ args, operation, req }) => {
        if ((operation === 'create' || operation === 'update') && req.file) {
          const error = errorDeTamano(tipoParaLimite(req.file.data), req.file.size)
          if (error) throw errorDeArchivo(error)
        }
        return args
      },
    ],
    // 2. Al crear, con lo que ya ha medido y comprobado Payload (filesize, mimeType por el contenido): cubre también la
    //    subida desde una URL. Aún no se ha escrito nada en disco.
    beforeValidate: [
      ({ data, operation }) => {
        if (operation !== 'create') return data
        const error = errorDeTamano(data?.mimeType, data?.filesize)
        if (error) throw errorDeArchivo(error)
        return data
      },
    ],
    afterChange: [registrarCambio, revalidarGrupo],
    afterDelete: [registrarBorrado, revalidarGrupoAlBorrar],
  },
  upload: {
    staticDir: 'media',
    // El tipo se comprueba por el contenido (Payload, con file-type), no por la extensión ni por lo que declara el navegador.
    mimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf'],
    // nosniff en todos los archivos servidos y `sandbox` en los PDF (subfase 5a, lib/archivos.ts).
    modifyResponseHeaders: ({ headers }) => cabecerasDeArchivo(headers),
    // Subfase 5b (lib/archivos.ts): el original, acotado a 2400 px y sin metadatos; y sus tamaños en WebP. Los derivados
    // son del mismo documento (mismo grupo, mismo acceso): /api/media/file/ los busca por `sizes.<nombre>.filename`.
    resizeOptions: { ...ORIGINAL_MAXIMO },
    imageSizes: TAMANOS_DERIVADOS.map((t) => ({ ...t, formatOptions: { ...t.formatOptions, options: { ...t.formatOptions.options } } })),
  },
  fields: [
    {
      name: 'alt',
      label: 'Descripción (texto alternativo)',
      type: 'text',
      required: true,
      admin: { description: 'Describe la imagen para quien no puede verla.' },
    },
    {
      name: 'visibilidad',
      label: 'Visibilidad',
      type: 'select',
      defaultValue: 'privada',
      options: [
        { label: 'Pública (la usa contenido publicado)', value: 'publica' },
        { label: 'Privada', value: 'privada' },
      ],
      admin: { readOnly: true, position: 'sidebar', description: 'Se calcula sola: un archivo es público cuando lo usa contenido publicado.' },
      // Solo la escribe el cálculo privilegiado, nunca un editor.
      access: { create: () => false, update: ({ req }) => Boolean(req.context?.visibilidadCalculada) },
    },
  ],
}

export const Mensajes: CollectionConfig = {
  slug: 'mensajes',
  labels: { singular: 'Mensaje de contacto', plural: 'Mensajes de contacto' },
  admin: { useAsTitle: 'nombre', defaultColumns: ['nombre', 'tipo', 'estado', 'duplicadoDe', 'createdAt'], group: 'Contenido del grupo' },
  access: { read: usuarioDelPanel, create: nadie, update: usuarioDelPanel, delete: soloSuperadmin },
  hooks: {
    // La fecha de recepción la pone Payload al crear y no se edita (subfase 2c): sin esto, un PATCH con `createdAt` la
    // cambiaba, porque Payload añade ese campo sin control de acceso.
    beforeChange: [({ data, originalDoc, operation }) => (operation === 'update' && originalDoc ? { ...data, createdAt: originalDoc.createdAt } : data)],
    afterChange: [registrarCambio],
    afterDelete: [registrarBorrado],
  },
  // Lo que escribió la persona no se puede cambiar por ninguna vía (REST incluida): solo `estado` es editable.
  // La creación usa overrideAccess (crearMensajeContacto), que no se ve afectada.
  fields: [
    { name: 'nombre', type: 'text', required: true, access: { update: () => false }, admin: { readOnly: true } },
    { name: 'correo', type: 'email', required: true, access: { update: () => false }, admin: { readOnly: true } },
    { name: 'institucion', label: 'Institución', type: 'text', access: { update: () => false }, admin: { readOnly: true } },
    { name: 'tipo', label: 'Tipo de colaboración', type: 'text', access: { update: () => false }, admin: { readOnly: true } },
    { name: 'mensaje', type: 'textarea', required: true, access: { update: () => false }, admin: { readOnly: true } },
    {
      name: 'estado',
      type: 'select',
      defaultValue: 'nuevo',
      // «Posible spam» lo asigna el formulario (subfase 4c: envío en menos de 2 s o con más de 3 enlaces); el mensaje se
      // guarda igual y el editor decide. Solo se admiten estas tres opciones.
      options: [
        { label: 'Nuevo', value: 'nuevo' },
        { label: 'Posible spam', value: 'posible-spam' },
        { label: 'Atendido', value: 'atendido' },
      ],
    },
    {
      name: 'duplicadoDe',
      label: 'Duplicado de',
      type: 'relationship',
      relationTo: 'mensajes',
      // Subfase 4c: mismo correo y mismo mensaje en el mismo grupo en 10 minutos. Lo fija solo la creación
      // (crearMensajeContacto); nadie puede cambiarlo, y el mensaje anterior no se toca.
      access: { create: () => false, update: () => false },
      admin: { readOnly: true, position: 'sidebar', description: 'Mismo correo y mensaje que otro recibido poco antes. No se borra nada.' },
    },
  ],
}

export const RegistroCambios: CollectionConfig = {
  slug: 'registro-cambios',
  labels: { singular: 'Registro de cambios', plural: 'Registro de cambios' },
  admin: {
    hidden: ({ user }) => !esSuperadmin(user as never),
    group: 'Plataforma',
    defaultColumns: ['operacion', 'coleccion', 'documento', 'actor', 'createdAt'],
  },
  access: { read: soloSuperadmin, create: nadie, update: nadie, delete: nadie },
  fields: [
    { name: 'grupo', type: 'relationship', relationTo: 'grupos' },
    { name: 'coleccion', type: 'text', required: true },
    { name: 'documento', type: 'text', required: true },
    { name: 'operacion', type: 'text', required: true },
    { name: 'actor', type: 'text', required: true },
    { name: 'antesHash', type: 'text' },
    { name: 'despuesHash', type: 'text' },
  ],
}
