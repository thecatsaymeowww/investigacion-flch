import type { CollectionConfig } from 'payload'
import { publicadoOPanel, soloSuperadmin, usuarioDelPanel } from '../../lib/access'
import { hooksEditoriales } from '../hooks'

const accesoEditorial: CollectionConfig['access'] = {
  read: publicadoOPanel,
  create: usuarioDelPanel,
  update: usuarioDelPanel,
  delete: usuarioDelPanel,
  readVersions: usuarioDelPanel,
}

/** Grupo del menú lateral del panel para el contenido de cada grupo (etapa 4.1, D7; solo presentación). */
const GRUPO_PANEL = 'Contenido del grupo'

const urlValida = (value: unknown) =>
  value == null || value === '' || (typeof value === 'string' && /^https?:\/\/\S+$/.test(value)) || 'Debe empezar por http:// o https://'

export const Integrantes: CollectionConfig = {
  slug: 'integrantes',
  labels: { singular: 'Integrante', plural: 'Integrantes' },
  admin: { useAsTitle: 'nombre', defaultColumns: ['nombre', 'rol', '_status', 'orden'], listSearchableFields: ['nombre', 'rol'], group: GRUPO_PANEL },
  defaultSort: 'orden',
  versions: { drafts: true },
  access: accesoEditorial,
  hooks: hooksEditoriales([{ campo: 'foto', destino: 'media' }]),
  fields: [
    { name: 'nombre', label: 'Nombre completo', type: 'text', required: true },
    { name: 'rol', label: 'Grado o rol', type: 'text', admin: { description: 'Se muestra bajo el nombre. Ej.: Doctor, Magíster, Estudiante.' } },
    { name: 'foto', label: 'Retrato', type: 'upload', relationTo: 'media', admin: { description: 'Si no hay retrato se muestran las iniciales.' } },
    {
      name: 'bio',
      label: 'Biografía',
      type: 'textarea',
      admin: { description: 'Deja una línea en blanco entre párrafos. Aparece al abrir la ficha del integrante.' },
    },
    {
      name: 'orden',
      label: 'Orden en la lista',
      type: 'number',
      defaultValue: 100,
      admin: { position: 'sidebar', description: 'Menor número = aparece antes.' },
    },
  ],
}

export const Publicaciones: CollectionConfig = {
  slug: 'publicaciones',
  labels: { singular: 'Publicación', plural: 'Publicaciones' },
  admin: { useAsTitle: 'titulo', defaultColumns: ['titulo', 'tipo', 'anio', '_status'], listSearchableFields: ['titulo', 'autoria'], group: GRUPO_PANEL },
  defaultSort: '-anio',
  versions: { drafts: true },
  access: accesoEditorial,
  hooks: hooksEditoriales([
    { campo: 'portada', destino: 'media' },
    { campo: 'pdf', destino: 'media' },
  ]),
  fields: [
    { name: 'titulo', label: 'Título', type: 'text', required: true },
    { name: 'autoria', label: 'Autoría', type: 'text', required: true, admin: { description: 'Nombres de los autores, separados por comas o «y».' } },
    {
      type: 'row',
      fields: [
        { name: 'tipo', type: 'select', required: true, defaultValue: 'Artículo', options: ['Libro', 'Artículo', 'Capítulo', 'Boletín'] },
        { name: 'anio', label: 'Año', type: 'number', required: true, min: 1800, max: 2100 },
        { name: 'codigo', label: 'Código (opcional)', type: 'text' },
      ],
    },
    { name: 'portada', label: 'Portada', type: 'upload', relationTo: 'media' },
    { name: 'pdf', label: 'PDF (opcional)', type: 'upload', relationTo: 'media', admin: { description: 'Si se adjunta, el archivo muestra «Consultar PDF».' } },
    { name: 'url', label: 'Enlace a la editorial (opcional)', type: 'text', validate: urlValida },
  ],
}

export const Actividades: CollectionConfig = {
  slug: 'actividades',
  labels: { singular: 'Actividad', plural: 'Actividades' },
  admin: { useAsTitle: 'titulo', defaultColumns: ['titulo', 'tipo', 'fecha', '_status'], listSearchableFields: ['titulo', 'lugar'], group: GRUPO_PANEL },
  defaultSort: '-fecha',
  versions: { drafts: true },
  access: accesoEditorial,
  hooks: hooksEditoriales([{ campo: 'imagen', destino: 'media' }]),
  fields: [
    { name: 'titulo', label: 'Título', type: 'text', required: true },
    {
      type: 'row',
      fields: [
        { name: 'tipo', type: 'text', required: true, defaultValue: 'Seminario', admin: { description: 'Seminario, Congreso, Taller…' } },
        { name: 'fecha', type: 'date', required: true, admin: { date: { pickerAppearance: 'dayOnly', displayFormat: 'd MMM yyyy' } } },
        { name: 'hora', type: 'text', admin: { description: 'Ej.: 3:00 p. m. – 7:00 p. m.' } },
      ],
    },
    { name: 'lugar', type: 'text', required: true },
    { name: 'resumen', type: 'textarea', required: true, admin: { description: 'Una o dos frases. Se usa en la columna lateral.' } },
    {
      name: 'texto',
      label: 'Texto completo',
      type: 'textarea',
      admin: { description: 'Deja una línea en blanco entre párrafos. Solo se muestra si es la actividad más reciente.' },
    },
    { name: 'imagen', label: 'Afiche o foto', type: 'upload', relationTo: 'media' },
    { name: 'url', label: 'Enlace a la actividad completa (opcional)', type: 'text', validate: urlValida },
  ],
}

export const Eventos: CollectionConfig = {
  slug: 'eventos',
  labels: { singular: 'Evento de agenda', plural: 'Agenda' },
  admin: { useAsTitle: 'titulo', defaultColumns: ['titulo', 'fecha', 'hora', '_status'], group: GRUPO_PANEL },
  defaultSort: 'fecha',
  versions: { drafts: true },
  access: accesoEditorial,
  hooks: hooksEditoriales([]),
  fields: [
    { name: 'titulo', label: 'Título', type: 'text', required: true },
    {
      type: 'row',
      fields: [
        { name: 'fecha', type: 'date', required: true, admin: { date: { pickerAppearance: 'dayOnly', displayFormat: 'd MMM yyyy' } } },
        { name: 'hora', type: 'text', required: true, admin: { description: 'Formato 24 h, ej.: 17:00' } },
        { name: 'tipo', type: 'text', required: true, defaultValue: 'Seminario' },
      ],
    },
    { name: 'lugar', type: 'text', required: true },
  ],
}

/** Contenido de la landing: un único documento por grupo (global del plugin multi-tenant). */
export const Landing: CollectionConfig = {
  slug: 'landing',
  labels: { singular: 'Landing del grupo', plural: 'Landing del grupo' },
  admin: { useAsTitle: 'nombre', group: GRUPO_PANEL },
  versions: { drafts: true },
  access: { read: publicadoOPanel, create: usuarioDelPanel, update: usuarioDelPanel, delete: soloSuperadmin, readVersions: usuarioDelPanel },
  hooks: hooksEditoriales([
    { campo: 'fotoHero', destino: 'media' },
    { campo: 'imagen', destino: 'media', enArray: 'galeria' },
    { campo: 'logo', destino: 'media', enArray: 'aliados' },
  ]),
  fields: [
    {
      type: 'tabs',
      tabs: [
        {
          label: 'Identidad',
          fields: [
            {
              name: 'nombre',
              label: 'Nombre de la cabecera',
              type: 'text',
              required: true,
              admin: { description: 'Ej.: Prensa y Literatura. La «y» aparece en cursiva.' },
            },
            { name: 'grupoTexto', label: 'Nombre del grupo de investigación', type: 'text', required: true },
            {
              type: 'row',
              fields: [
                { name: 'universidad', type: 'text', required: true, defaultValue: 'Universidad Nacional Mayor de San Marcos' },
                { name: 'sigla', label: 'Sigla de la universidad', type: 'text', required: true, defaultValue: 'UNMSM' },
              ],
            },
            {
              type: 'row',
              fields: [
                { name: 'ciudad', type: 'text', required: true, defaultValue: 'Lima' },
                { name: 'pais', label: 'País', type: 'text', required: true, defaultValue: 'Perú' },
                { name: 'anioFundacion', label: 'Año de fundación', type: 'number', required: true, min: 1900, max: 2100 },
              ],
            },
            { name: 'edicion', label: 'Texto de edición', type: 'text', defaultValue: 'Edición permanente' },
            { name: 'lema', type: 'textarea', required: true },
          ],
        },
        {
          label: 'Portada',
          fields: [
            { name: 'editorialEtiqueta', label: 'Etiqueta', type: 'text', defaultValue: 'Editorial' },
            { name: 'titular', type: 'textarea', required: true, admin: { description: 'Aparece con efecto de máquina de escribir.' } },
            { name: 'texto', type: 'textarea', required: true, admin: { description: 'La primera letra se muestra como capitular.' } },
            { name: 'fotoHero', label: 'Foto de portada', type: 'upload', relationTo: 'media' },
            {
              type: 'row',
              fields: [
                { name: 'fotoPie', label: 'Pie de foto', type: 'text' },
                { name: 'fotoCredito', label: 'Crédito', type: 'text' },
              ],
            },
          ],
        },
        {
          label: 'Cifras',
          description: 'Los números se calculan solos (año de fundación, integrantes, publicaciones y actividades publicadas). Aquí solo se editan los textos.',
          fields: [
            {
              type: 'row',
              fields: [
                { name: 'cifraFundacion', label: 'Etiqueta 1', type: 'text', defaultValue: 'Año de fundación' },
                { name: 'notaFundacion', label: 'Nota 1', type: 'text' },
              ],
            },
            {
              type: 'row',
              fields: [
                { name: 'cifraIntegrantes', label: 'Etiqueta 2', type: 'text', defaultValue: 'Investigadores' },
                { name: 'notaIntegrantes', label: 'Nota 2', type: 'text' },
              ],
            },
            {
              type: 'row',
              fields: [
                { name: 'cifraPublicaciones', label: 'Etiqueta 3', type: 'text', defaultValue: 'Publicaciones' },
                { name: 'notaPublicaciones', label: 'Nota 3', type: 'text' },
              ],
            },
            {
              type: 'row',
              fields: [
                { name: 'cifraActividades', label: 'Etiqueta 4', type: 'text', defaultValue: 'Actividades' },
                { name: 'notaActividades', label: 'Nota 4', type: 'text' },
              ],
            },
          ],
        },
        {
          label: 'Secciones',
          fields: [
            { name: 'integrantesIntro', label: 'Introducción de Integrantes', type: 'textarea' },
            {
              name: 'aliados',
              label: 'Aliados («Con el apoyo de»)',
              type: 'array',
              labels: { singular: 'Aliado', plural: 'Aliados' },
              fields: [
                { name: 'nombre', type: 'text', required: true },
                { name: 'url', label: 'Sitio web', type: 'text', validate: urlValida },
                { name: 'logo', type: 'upload', relationTo: 'media' },
              ],
            },
            {
              name: 'galeria',
              label: 'Galería',
              type: 'array',
              labels: { singular: 'Lámina', plural: 'Láminas' },
              fields: [
                { name: 'imagen', type: 'upload', relationTo: 'media', required: true },
                { name: 'pie', label: 'Pie', type: 'text', required: true },
                { name: 'alta', label: 'Lámina alta (ocupa dos filas)', type: 'checkbox' },
              ],
            },
          ],
        },
        {
          label: 'Colaborar',
          fields: [
            { name: 'colaborarEtiqueta', label: 'Etiqueta', type: 'text', defaultValue: 'Convocatoria abierta' },
            { name: 'colaborarTitular', label: 'Titular', type: 'text', defaultValue: 'Escriba a la redacción' },
            { name: 'colaborarTexto', label: 'Texto', type: 'textarea' },
            {
              name: 'tiposColaboracion',
              label: 'Tipos de colaboración',
              type: 'array',
              labels: { singular: 'Tipo', plural: 'Tipos' },
              fields: [{ name: 'tipo', type: 'text', required: true }],
            },
          ],
        },
      ],
    },
  ],
}
