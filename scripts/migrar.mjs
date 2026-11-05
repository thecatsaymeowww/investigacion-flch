/**
 * Ejecuta un comando de migraciones de Payload con la conexión del ROL PROPIETARIO del esquema.
 *   pnpm migrate          aplica las migraciones pendientes (cada una en su transacción)
 *   pnpm migrate:status   lista las migraciones y si están aplicadas
 * Toma DATABASE_URI_MIGRACIONES (del entorno o de .env.migraciones, nunca de .env) y la entrega como DATABASE_URI
 * solo al proceso de Payload: la aplicación nunca recibe esa credencial. No imprime valores.
 * Los comandos destructivos de Payload (migrate:fresh, :reset, :down, :refresh) no se exponen aquí.
 *
 * `migrate` no se fía del código de salida de Payload: con la fila `dev` (batch -1) del `push`, Payload
 * pregunta y, si no se acepta, termina con 0 sin migrar. Por eso comprueba la base antes y después:
 *   antes    se niega (código 2) si hay fila `dev`, migraciones registradas que no están en migrations/,
 *            o tablas sin registro de migraciones: casos que requieren intervención (docs/BASE-DE-DATOS.md);
 *   después  falla (código 3) si queda alguna pendiente o el esquema no contiene las tablas, columnas y
 *            enums del snapshot de la última migración (no basta con que el registro tenga el nombre).
 * Payload se lanza sin entrada estándar: ninguna pregunta puede aceptarse sin querer.
 *
 * Destino (subfase 3a). Solo se trabaja con bases DESECHABLES; la base real queda fuera de alcance. Antes de
 * conectarse, se niega (código 2) si el destino de DATABASE_URI_MIGRACIONES (`host:puerto/base`) no es local
 * (127.0.0.1 o ::1) o no coincide exactamente con MIGRAR_BD_DESECHABLE, que solo se lee del entorno del proceso
 * (nunca de .env), y, para `migrate`, con `--confirmar=<host:puerto/base>`. Ya conectado, se niega si la base no
 * lleva la marca `plataforma:desechable` en su comentario (COMMENT ON DATABASE), y `migrate` sale con código 4 si otra
 * ejecución tiene el cerrojo de migraciones. Ninguna variable desactiva estas comprobaciones. El adaptador de Payload
 * repite la de destino y marca (scripts/guardia-migraciones.ts), también para `pnpm payload migrate`.
 */
import { spawnSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const PERMITIDOS = ['migrate', 'migrate:status']
const comando = process.argv[2]
if (!PERMITIDOS.includes(comando)) {
  console.error(`[migrar] Comando no permitido: ${comando ?? '(ninguno)'}. Usa: ${PERMITIDOS.join(', ')}`)
  process.exit(1)
}

/** Lee una variable de los archivos indicados, en orden. No lee ninguna otra. */
function variable(nombre, archivos) {
  for (const archivo of archivos) {
    const ruta = path.join(raiz, archivo)
    if (!existsSync(ruta)) continue
    for (const linea of readFileSync(ruta, 'utf8').split(/\r?\n/)) {
      const m = linea.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/)
      if (m?.[1] === nombre && m[2]) return m[2].replace(/^(['"])(.*)\1$/, '$2')
    }
  }
  return undefined
}

// Subfase 3b: la credencial del propietario va en `.env.migraciones` (ignorado por git), que Next y Payload NO cargan.
// En `.env` o `.env.local` acabaría en el entorno del servidor de la aplicación: entonces se niega y explica qué hacer.
const uri = process.env.DATABASE_URI_MIGRACIONES || variable('DATABASE_URI_MIGRACIONES', ['.env.migraciones'])
if (!uri) {
  const enEnv = variable('DATABASE_URI_MIGRACIONES', ['.env.local', '.env'])
  console.error(
    enEnv
      ? '[migrar] DATABASE_URI_MIGRACIONES está en .env o .env.local, que carga la aplicación: muévela a .env.migraciones. Ver docs/BASE-DE-DATOS.md.'
      : '[migrar] Falta DATABASE_URI_MIGRACIONES (conexión del rol propietario) en el entorno o en .env.migraciones. Ver docs/BASE-DE-DATOS.md.',
  )
  process.exit(enEnv ? 2 : 1)
}

function salir(codigo, mensaje) {
  console.error(`[migrar] ${mensaje}`)
  process.exit(codigo)
}

// --- Destino autorizado (sin conectarse todavía) ---
// Igual que scripts/guardia-migraciones.ts (MARCA_DESECHABLE, destinoDe); verificar:migraciones comprueba que coinciden.
const MARCA_DESECHABLE = 'plataforma:desechable'
const CERROJO = 4723001 // pg_try_advisory_lock: una sola ejecución de `migrate` a la vez en cada base
let destino = null
try {
  const u = new URL(uri)
  destino = `${u.hostname}:${u.port || '5432'}${u.pathname}`
} catch {
  salir(2, 'DATABASE_URI_MIGRACIONES no es una URI válida. No se migra.')
}
console.log(`[migrar] Destino: ${destino}`)
if (!['127.0.0.1', '[::1]', '::1'].includes(new URL(`postgres://${destino}`).hostname)) {
  salir(2, `${destino} no es una base local (127.0.0.1 o ::1). Este comando solo trabaja con bases desechables locales.`)
}
const autorizado = process.env.MIGRAR_BD_DESECHABLE
if (!autorizado) salir(2, `Falta MIGRAR_BD_DESECHABLE en el entorno (host:puerto/base de una base desechable). No se conecta a ${destino}.`)
if (autorizado !== destino) salir(2, `MIGRAR_BD_DESECHABLE (${autorizado}) no coincide con el destino (${destino}). No se conecta.`)
if (comando === 'migrate') {
  const confirmacion = process.argv.slice(3).find((a) => a.startsWith('--confirmar='))
  if (!confirmacion) salir(2, `Falta la confirmación: pnpm migrate --confirmar=${destino}`)
  if (confirmacion.slice('--confirmar='.length) !== destino) salir(2, `La confirmación no coincide con el destino (${destino}). No se migra.`)
}

function ejecutarPayload() {
  const r = spawnSync(process.execPath, [path.join(raiz, 'node_modules/payload/bin.js'), comando], {
    cwd: raiz,
    stdio: ['ignore', 'inherit', 'inherit'],
    env: { ...process.env, DATABASE_URI: uri },
  })
  return r.status ?? 1
}

// `pg` es dependencia de @payloadcms/db-postgres (pnpm no lo expone en la raíz).
const { Client } = createRequire(createRequire(import.meta.url).resolve('@payloadcms/db-postgres'))('pg')

// --- Marca de base desechable (ya conectado; solo lectura) ---
{
  const cliente = await conectar()
  const { rows } = await cliente.query(`SELECT shobj_description(oid, 'pg_database') AS comentario FROM pg_database WHERE datname = current_database()`)
  await cliente.end()
  if (rows[0]?.comentario !== MARCA_DESECHABLE) {
    salir(2, `${destino} no lleva la marca de base desechable (COMMENT ON DATABASE … IS '${MARCA_DESECHABLE}'). No se migra.`)
  }
}

if (comando === 'migrate:status') process.exit(ejecutarPayload())

// Las mismas migraciones que leerá Payload (readMigrationFiles): .ts/.js de migrations/ salvo index.
const dirMigraciones = path.join(raiz, 'migrations')
const esperadas = existsSync(dirMigraciones)
  ? readdirSync(dirMigraciones)
      .sort()
      .filter((f) => (f.endsWith('.ts') || f.endsWith('.js')) && !/^index\.(ts|js)$/.test(f))
      .map((f) => f.split('.')[0])
  : []
if (!esperadas.length) salir(3, `No hay migraciones en ${path.relative(raiz, dirMigraciones)}: estado indeterminado.`)
// Payload ejecutaría dos veces un nombre repetido (p. ej. `x.ts` y `x.js`).
const repetidas = esperadas.filter((n, i) => esperadas.indexOf(n) !== i)
if (repetidas.length) salir(2, `Migraciones con el nombre repetido en migrations/: ${[...new Set(repetidas)].join(', ')}. No se migra.`)
const ultima = esperadas.at(-1)
const rutaSnapshot = path.join(dirMigraciones, `${ultima}.json`)
if (!existsSync(rutaSnapshot)) salir(3, `Falta el snapshot ${ultima}.json: no se puede verificar el esquema.`)

// --- Cerrojo: se mantiene esta conexión abierta hasta el final; al salir el proceso, se libera solo ---
const cerrojo = await conectar()
if (!(await cerrojo.query('SELECT pg_try_advisory_lock($1) AS ok', [CERROJO])).rows[0].ok) {
  salir(4, `Otra ejecución de \`pnpm migrate\` está en curso en ${destino}. No se migra.`)
}

async function conectar() {
  try {
    const cliente = new Client({ connectionString: uri })
    await cliente.connect()
    return cliente
  } catch (err) {
    // Sin err.input ni la URI: solo el código y el mensaje del servidor o del analizador.
    salir(1, `No se pudo conectar con DATABASE_URI_MIGRACIONES (${err.code ?? 'error'}): ${err.message}`)
  }
}

/** Registro de migraciones; `null` si la tabla no existe. */
async function leerRegistro(cliente) {
  const { rows } = await cliente.query(`SELECT to_regclass('public.payload_migrations') IS NOT NULL AS existe`)
  if (!rows[0].existe) return null
  return (await cliente.query('SELECT name, batch FROM public.payload_migrations ORDER BY id')).rows
}

const aplicadasEn = (registro) => new Set(registro.filter((m) => Number(m.batch) > 0).map((m) => m.name))

// --- Antes ---
const antes = await conectar()
const registroAntes = await leerRegistro(antes)
if (registroAntes === null) {
  const { rows } = await antes.query(
    `SELECT count(*)::int AS n FROM pg_class c JOIN pg_namespace s ON s.oid = c.relnamespace
     WHERE s.nspname = 'public' AND c.relkind IN ('r', 'p')`,
  )
  if (rows[0].n > 0) {
    salir(2, `El esquema public tiene ${rows[0].n} tablas pero no payload_migrations: estado indeterminado. No se migra.`)
  }
} else {
  if (registroAntes.some((m) => Number(m.batch) === -1)) {
    salir(
      2,
      'payload_migrations tiene la fila `dev` (batch -1): la base se creó con `push`. No se migra; seguir ' +
        '«Base existente creada con push» en docs/BASE-DE-DATOS.md (línea base con verificación de huella).',
    )
  }
  const desconocidas = [...aplicadasEn(registroAntes)].filter((n) => !esperadas.includes(n))
  if (desconocidas.length) {
    salir(2, `La base tiene migraciones que no están en migrations/ (${desconocidas.join(', ')}): código desactualizado. No se migra.`)
  }
}
await antes.end()
const pendientesAntes = esperadas.filter((n) => !aplicadasEn(registroAntes ?? []).has(n))
console.log(`[migrar] Pendientes antes: ${pendientesAntes.length ? pendientesAntes.join(', ') : 'ninguna'}`)

// --- Payload ---
const codigo = ejecutarPayload()
if (codigo !== 0) salir(codigo, `payload migrate terminó con código ${codigo}.`)

// --- Después ---
const despues = await conectar()
const registroDespues = await leerRegistro(despues)
const aplicadas = aplicadasEn(registroDespues ?? [])
const pendientes = esperadas.filter((n) => !aplicadas.has(n))
if (registroDespues === null || pendientes.length) {
  salir(3, `Payload terminó sin error pero siguen pendientes: ${pendientes.join(', ')}. La migración NO se aplicó.`)
}
if (registroDespues.some((m) => Number(m.batch) === -1)) salir(3, 'Apareció una fila `dev` (batch -1) en el registro.')

// El registro solo acredita nombres: se comprueba además que el esquema tenga lo que define el snapshot.
const snapshot = JSON.parse(readFileSync(rutaSnapshot, 'utf8'))
const { rows: columnas } = await despues.query(`SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = 'public'`)
const enBase = new Set(columnas.map((c) => `${c.table_name}.${c.column_name}`))
const tablasEnBase = new Set(columnas.map((c) => c.table_name))
const faltan = []
const tablas = Object.values(snapshot.tables ?? {})
let nColumnas = 0
for (const tabla of tablas) {
  if (!tablasEnBase.has(tabla.name)) {
    faltan.push(`tabla ${tabla.name}`)
    continue
  }
  for (const col of Object.values(tabla.columns ?? {})) {
    nColumnas++
    if (!enBase.has(`${tabla.name}.${col.name}`)) faltan.push(`columna ${tabla.name}.${col.name}`)
  }
}
const { rows: enums } = await despues.query(
  `SELECT t.typname::text AS nombre, string_agg(e.enumlabel::text, ',' ORDER BY e.enumsortorder) AS valores
   FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace JOIN pg_enum e ON e.enumtypid = t.oid
   WHERE n.nspname = 'public' GROUP BY t.typname`,
)
const enumsEnBase = new Map(enums.map((e) => [e.nombre, e.valores]))
const enumsSnapshot = Object.values(snapshot.enums ?? {})
for (const en of enumsSnapshot) {
  if (enumsEnBase.get(en.name) !== en.values.join(',')) faltan.push(`enum ${en.name}`)
}
await despues.end()
if (faltan.length) {
  salir(
    3,
    `El registro marca ${ultima} como aplicada, pero el esquema no coincide con su snapshot. Falta o difiere: ${faltan.slice(0, 10).join('; ')}${faltan.length > 10 ? ` (y ${faltan.length - 10} más)` : ''}.`,
  )
}

await cerrojo.end()
const nuevas = esperadas.filter((n) => pendientesAntes.includes(n))
console.log(
  `[migrar] Aplicadas ahora: ${nuevas.length ? nuevas.join(', ') : 'ninguna'}. Pendientes: ninguna. ` +
    `Esquema verificado contra ${ultima}.json: ${tablas.length} tablas, ${nColumnas} columnas, ${enumsSnapshot.length} enums.`,
)
