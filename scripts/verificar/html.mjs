/**
 * HTML peligroso en el código propio: `dangerouslySetInnerHTML`, asignaciones a `innerHTML`/`outerHTML`,
 * `insertAdjacentHTML` y `document.write`. Solo se admite `dangerouslySetInnerHTML` con una constante de la lista
 * PERMITIDOS, declarada en el mismo archivo como un literal fijo (sin interpolar ni concatenar): así nunca llega
 * por esta vía texto del CMS ni de un usuario.
 * Uso suelto: pnpm verificar:html
 */
import { APROBADO, FALLIDO, relativa, siEsPrincipal } from './comun.mjs'
import { analizar, archivosPropios, leer, lineaDe, siguiente } from './fuente.mjs'

const PERMITIDOS = [
  {
    archivo: 'components/landing/Hero.tsx',
    constante: 'ACTIVAR_TW',
    motivo: 'script estático que activa la máquina de escribir antes del primer pintado (tema de periódico)',
  },
]

const INSERCION = new RegExp('\\bdangerouslySetInnerHTML\\s*=\\s*\\{\\s*\\{\\s*__html\\s*:\\s*([A-Za-z_$][\\w$]*)\\s*\\}\\s*\\}', 'g')
const PELIGROSOS = [
  [new RegExp('\\bdangerouslySetInnerHTML\\b', 'g'), '`dangerouslySetInnerHTML`'],
  [new RegExp('\\.\\s*(innerHTML|outerHTML)\\s*(\\+?=)(?!=)', 'g'), 'asignación a `innerHTML`/`outerHTML`'],
  [new RegExp('\\.\\s*insertAdjacentHTML\\s*\\(', 'g'), '`insertAdjacentHTML`'],
  [new RegExp('\\bdocument\\s*\\.\\s*write(ln)?\\s*\\(', 'g'), '`document.write`'],
]

/** true si `nombre` se declara en el archivo como `const nombre = <literal fijo>` y nada más. */
function constanteFija(codigo, literales, nombre) {
  const m = codigo.match(new RegExp(`(^|\\n)(export\\s+)?const\\s+${nombre.replace(/\$/g, '\\$')}\\s*=\\s*`))
  if (!m) return false
  const lit = literales.find((l) => l.inicio === m.index + m[0].length)
  if (!lit || lit.interpolada) return false
  return ['', ';', '\n'].includes(codigo.slice(lit.fin).match(/^[ \t]*(.?)/)[1]) && siguiente(codigo, lit.fin).caracter !== '+'
}

export function revisar(ruta, texto = leer(ruta)) {
  const rel = relativa(ruta)
  const { codigo, literales } = analizar(texto)
  const admitidas = new Set()
  for (const m of codigo.matchAll(INSERCION)) {
    const permitido = PERMITIDOS.find((p) => p.archivo === rel && p.constante === m[1])
    if (permitido && constanteFija(codigo, literales, m[1])) admitidas.add(m.index)
  }
  const hallazgos = []
  for (const [patron, nombre] of PELIGROSOS) {
    for (const m of codigo.matchAll(patron)) {
      if (admitidas.has(m.index)) continue
      hallazgos.push(`${rel}:${lineaDe(texto, m.index)} ${nombre} no permitido (solo constantes fijas de la lista PERMITIDOS)`)
    }
  }
  return { hallazgos, admitidas: admitidas.size }
}

export async function comprobar() {
  const archivos = archivosPropios()
  const resultados = archivos.map((r) => ({ rel: relativa(r), ...revisar(r) }))
  const hallazgos = resultados.flatMap((r) => r.hallazgos)
  for (const h of hallazgos) console.log(`  ✗ ${h}`)
  for (const p of PERMITIDOS) {
    const usado = resultados.some((r) => r.rel === p.archivo && r.admitidas > 0)
    console.log(`  ${usado ? '·' : '!'} permitido ${p.archivo} (${p.constante}): ${p.motivo}${usado ? '' : ' — YA NO SE USA: retirarlo de la lista'}`)
  }
  const admitidas = resultados.reduce((n, r) => n + r.admitidas, 0)
  return hallazgos.length
    ? { estado: FALLIDO, detalle: `${hallazgos.length} uso(s) no permitido(s)` }
    : { estado: APROBADO, detalle: `${archivos.length} archivos; ${admitidas} uso(s) estático(s) permitido(s)` }
}

await siEsPrincipal(import.meta.url, comprobar)
