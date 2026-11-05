/**
 * SQL peligroso en el código propio. Toda consulta de la aplicación pasa por Payload/Drizzle (parametrizada); el SQL
 * escrito a mano solo se admite en herramientas de operación, siempre como literal fijo:
 *   - en todo el código: `sql.raw`, y cualquier literal con SQL que se interpole (`${}`) o se concatene (`+`);
 *   - en la aplicación (todo salvo migrations/ y scripts/): `sql```, `.execute(` y `.query(`;
 *   - en migrations/ (generadas por `payload migrate:create`) y scripts/: `.execute(`/`.query(` solo con un literal
 *     fijo (o `sql``` sin interpolar), nunca con una variable.
 * Uso suelto: pnpm verificar:sql
 */
import { APROBADO, FALLIDO, relativa, siEsPrincipal } from './comun.mjs'
import { analizar, anterior, archivosPropios, leer, lineaDe, siguiente } from './fuente.mjs'

const HERRAMIENTAS = ['migrations/', 'scripts/']
// Patrones construidos con cadenas: el propio analizador las deja en blanco y este archivo no se marca a sí mismo.
const SQL_RAW = new RegExp('\\bsql\\s*\\.\\s*raw\\b', 'g')
const SQL_ETIQUETA = new RegExp('\\bsql\\s*`', 'g')
const LLAMADA = new RegExp('\\.\\s*(execute|query)\\s*\\(', 'g')
const TEXTO_SQL = new RegExp(
  '\\b(select\\s[\\s\\S]*\\sfrom|insert\\s+into|update\\s+\\S+\\s+set|delete\\s+from|(drop|alter|create)\\s+(table|schema|database|role)|truncate\\s+table|grant\\s|revoke\\s)',
  'i',
)

export function revisar(ruta, texto = leer(ruta)) {
  const rel = relativa(ruta)
  const herramienta = HERRAMIENTAS.some((p) => rel.startsWith(p))
  const { codigo, literales } = analizar(texto)
  const literalEn = (pos) => literales.find((l) => l.inicio === pos)
  const hallazgos = []
  const marcar = (pos, motivo) => hallazgos.push(`${rel}:${lineaDe(texto, pos)} ${motivo}`)

  for (const m of codigo.matchAll(SQL_RAW)) marcar(m.index, '`sql.raw` (SQL sin parametrizar)')

  for (const m of codigo.matchAll(SQL_ETIQUETA)) {
    const lit = literalEn(m.index + m[0].length - 1)
    if (!herramienta) marcar(m.index, '`sql``` en el código de la aplicación (usar Payload)')
    else if (lit?.interpolada) marcar(m.index, '`sql``` con interpolación en una herramienta (debe ser un literal fijo)')
  }

  for (const m of codigo.matchAll(LLAMADA)) {
    const metodo = `.${m[1]}(`
    if (!herramienta) {
      marcar(m.index, `\`${metodo}\` en el código de la aplicación (usar Payload)`)
      continue
    }
    const arg = siguiente(codigo, m.index + m[0].length)
    const etiqueta = codigo.slice(arg.pos).match(/^sql\s*`/)
    const lit = literalEn(etiqueta ? arg.pos + etiqueta[0].length - 1 : arg.pos)
    if (!lit) {
      marcar(m.index, `\`${metodo}\` con un argumento que no es un literal fijo`)
    } else if (lit.interpolada) {
      marcar(m.index, `\`${metodo}\` con un literal interpolado`)
    } else if (![',', ')'].includes(siguiente(codigo, lit.fin).caracter)) {
      marcar(m.index, `\`${metodo}\` con un literal concatenado`)
    }
  }

  for (const lit of literales) {
    if (!TEXTO_SQL.test(lit.texto)) continue
    if (lit.interpolada) marcar(lit.inicio, 'literal con SQL e interpolación (`${}`)')
    else if (anterior(codigo, lit.inicio) === '+' || siguiente(codigo, lit.fin).caracter === '+') marcar(lit.inicio, 'literal con SQL concatenado (`+`)')
  }
  return hallazgos
}

export async function comprobar() {
  const archivos = archivosPropios()
  const hallazgos = archivos.flatMap((r) => revisar(r))
  for (const h of hallazgos) console.log(`  ✗ ${h}`)
  return hallazgos.length
    ? { estado: FALLIDO, detalle: `${hallazgos.length} hallazgo(s) en ${archivos.length} archivos propios` }
    : { estado: APROBADO, detalle: `${archivos.length} archivos propios sin SQL peligroso` }
}

await siEsPrincipal(import.meta.url, comprobar)
