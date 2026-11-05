/**
 * Deriva entre el esquema que definen las colecciones y el snapshot de la última migración (subfase 3a).
 * Es el mismo cálculo que hace `payload migrate:create` (drizzle-kit: generateDrizzleJson + generateMigration), pero no
 * escribe nada y NO se conecta a ninguna base (`disableDBConnect`, como el propio migrate:create).
 *   pnpm payload run scripts/verificar/deriva-esquema.ts
 * Código 0 sin deriva; 1 si hace falta una migración (lista las sentencias que generaría). Lo usa verificar/migraciones.mjs.
 */
import config from '@payload-config'
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import payload from 'payload'

type Snapshot = { version: string }
type Adaptador = {
  migrationDir: string
  schema: unknown
  requireDrizzleKit: () => {
    generateDrizzleJson: (schema: unknown) => Promise<Snapshot>
    generateMigration: (antes: Snapshot, despues: Snapshot) => Promise<string[]>
    upSnapshot?: (s: Snapshot) => Snapshot
  }
}

await payload.init({ config, disableDBConnect: true, disableOnInit: true })
const db = payload.db as unknown as Adaptador
const { generateDrizzleJson, generateMigration, upSnapshot } = db.requireDrizzleKit()
const despues = await generateDrizzleJson(db.schema)
const ultimo = readdirSync(db.migrationDir)
  .filter((f) => f.endsWith('.json'))
  .sort()
  .at(-1)
if (!ultimo) {
  console.log('[deriva] No hay ningún snapshot en migrations/.')
  process.exit(1)
}
let antes = JSON.parse(readFileSync(path.join(db.migrationDir, ultimo), 'utf8')) as Snapshot
if (upSnapshot && antes.version < despues.version) antes = upSnapshot(antes)
const sentencias = await generateMigration(antes, despues)
if (sentencias.length) {
  console.log(`[deriva] El código define un esquema distinto de ${ultimo}: falta una migración (pnpm migrate:create). Generaría:`)
  for (const s of sentencias) console.log(`  ${s.replace(/\s+/g, ' ').slice(0, 200)}`)
  process.exit(1)
}
console.log(`[deriva] Sin deriva: las colecciones coinciden con ${ultimo}.`)
process.exit(0)
