import { postgresAdapter } from '@payloadcms/db-postgres'
import { multiTenantPlugin } from '@payloadcms/plugin-multi-tenant'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import { es } from '@payloadcms/translations/languages/es'
import path from 'path'
import { buildConfig } from 'payload'
import sharp from 'sharp'
import { fileURLToPath } from 'url'
import { esSuperadmin } from './lib/access'
import { protegerBloqueos } from './lib/access/privileged'
import { LIMITE_GLOBAL_BYTES } from './lib/archivos'
import { protegerEscrituras } from './lib/claves-peligrosas'
import { exigirConexionDeAplicacion } from './scripts/guardia-conexion'
import { protegerMigraciones } from './scripts/guardia-migraciones'
import { confiarEnProxy, secretoPayload, urlDelSitio } from './lib/entorno'
import { conTiposDeTexto } from './lib/tipos-texto'
import { Actividades, Eventos, Integrantes, Landing, Noticias, Publicaciones } from './payload/collections/contenido'
import { Grupos, Media, Mensajes, RegistroCambios, Usuarios } from './payload/collections/plataforma'

const dirname = path.dirname(fileURLToPath(import.meta.url))

// Al arrancar: un CONFIAR_EN_PROXY incoherente (o ausente con un sitio HTTPS) impide arrancar (lib/entorno.ts, 4b).
confiarEnProxy()

export default buildConfig({
  admin: {
    user: Usuarios.slug,
    importMap: { baseDir: dirname },
    // Identidad textual (etapa 4.1, D7) y marca del panel (F15): logo de la pantalla de acceso e icono del menú, solo
    // texto (components/admin/Marca.tsx). Cualquier cambio de estos componentes exige regenerar importMap.js
    // (`pnpm payload generate:importmap`).
    components: {
      graphics: {
        Logo: '/components/admin/Marca#Logo',
        Icon: '/components/admin/Marca#Icon',
      },
    },
    meta: {
      titleSuffix: ' · FLCH · Grupos de investigación',
      description: 'Panel de edición de los grupos de investigación de la Facultad de Letras y Ciencias Humanas (UNMSM).',
    },
    // Tema oscuro fijo, por decisión del usuario (06-11-2026); sin selector claro/oscuro en la cuenta.
    theme: 'dark',
    // Gravatar en el círculo de la cuenta, por decisión del usuario (06-11-2026), que acepta el efecto de privacidad: el
    // navegador pide a www.gravatar.com la imagen con el hash del correo de cada usuario (solo en el panel, no en el sitio).
    avatar: 'gravatar',
  },
  // Los campos de texto solo admiten cadenas, también en borradores: ver lib/tipos-texto.ts.
  collections: [Landing, Integrantes, Publicaciones, Noticias, Actividades, Eventos, Media, Mensajes, Grupos, Usuarios, RegistroCambios].map(conTiposDeTexto),
  // Requerido por Payload aunque el modelo no usa texto enriquecido (D16: texto plano/Markdown).
  editor: lexicalEditor(),
  i18n: { supportedLanguages: { es }, fallbackLanguage: 'es' },
  // GraphQL no lo usa el sitio: se desactiva (la introspección anónima quedaba abierta, Fase A).
  graphQL: { disable: true },
  // Payload envía telemetría anónima a telemetry.payloadcms.com salvo que se desactive aquí (por defecto `true`).
  telemetry: false,
  // Validado al arrancar (longitud, valores de ejemplo): ver lib/entorno.ts.
  secret: secretoPayload(),
  // La cookie de sesión solo se acepta desde el propio sitio: con `csrf` vacío Payload la aceptaba con cualquier Origin.
  // Sin Origin, Payload exige Sec-Fetch-Site same-origin/same-site/none (navegadores); la cabecera JWT no cambia.
  serverURL: urlDelSitio(),
  csrf: [urlDelSitio()],
  // Rechazo de claves peligrosas en toda escritura (deepmerge, GHSA-gcqx-w48m-w2h4). En onInit porque las colecciones
  // internas de Payload no existen todavía cuando se procesan `collections` y `plugins`. Ver lib/claves-peligrosas.ts.
  // También en onInit, por la misma razón, el acceso por grupo a los bloqueos de edición (lib/access/privileged.ts).
  // Y, antes que nada, que la conexión sea la del rol de la aplicación, sin privilegios de estructura ni de
  // administración (scripts/guardia-conexion.ts). `payload migrate` no ejecuta onInit.
  onInit: async (payload) => {
    await exigirConexionDeAplicacion(payload)
    protegerEscrituras(payload)
    protegerBloqueos(payload)
  },
  typescript: { outputFile: path.resolve(dirname, 'payload-types.ts') },
  // `migrate` solo contra bases desechables autorizadas; los comandos destructivos, nunca (scripts/guardia-migraciones.ts).
  db: protegerMigraciones(
    postgresAdapter({
      pool: { connectionString: process.env.DATABASE_URI || '' },
      // El esquema solo cambia con migraciones versionadas (`pnpm migrate`, rol propietario), en todos los
      // entornos: sin `push` automático de Drizzle. Ver docs/BASE-DE-DATOS.md.
      push: false,
      migrationDir: path.resolve(dirname, 'migrations'),
      // El rol de la aplicación no puede crear bases: si falta la base, error claro en vez de intentarlo.
      disableCreateDatabase: true,
    }),
  ),
  sharp,
  // Límite global por archivo (subfase 5a, lib/archivos.ts): la subida multipart se corta al pasarlo (413). El límite
  // por tipo (imágenes 5 MB) lo aplica el hook de `media`.
  upload: { limits: { fileSize: LIMITE_GLOBAL_BYTES } },
  plugins: [
    multiTenantPlugin({
      tenantsSlug: 'grupos',
      tenantField: { name: 'grupo' },
      tenantsArrayField: { arrayFieldName: 'grupos', arrayTenantFieldName: 'grupo' },
      tenantSelectorLabel: 'Grupo',
      userHasAccessToAllTenants: (user) => esSuperadmin(user as never),
      collections: {
        landing: { isGlobal: true },
        integrantes: {},
        publicaciones: {},
        noticias: {},
        actividades: {},
        eventos: {},
        media: {},
        mensajes: {},
      },
    }),
  ],
})
