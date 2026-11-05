/**
 * Código propio para las comprobaciones estáticas (SQL y HTML peligrosos).
 * - `archivosPropios()` recorre el proyecto sin dependencias, build, medios ni archivos generados.
 * - `analizar()` separa el código de comentarios y literales: así una regla no salta por un comentario o un texto que
 *   solo menciona el patrón, y puede comprobar si un literal está interpolado o concatenado.
 */
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { RAIZ, relativa } from './comun.mjs'

const DIRECTORIOS_EXCLUIDOS = new Set(['node_modules', '.next', '.git', 'media', 'public'])
/** Generados por Payload (`pnpm generate`): no son código escrito a mano. */
const GENERADOS = new Set(['payload-types.ts', 'app/(payload)/admin/importMap.js'])
const EXTENSIONES = /\.(ts|tsx|js|jsx|mjs|cjs)$/

export function archivosPropios(dir = RAIZ) {
  const lista = []
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const ruta = path.join(dir, e.name)
    if (e.isDirectory()) {
      if (!DIRECTORIOS_EXCLUIDOS.has(e.name)) lista.push(...archivosPropios(ruta))
    } else if (EXTENSIONES.test(e.name) && !e.name.endsWith('.d.ts') && !GENERADOS.has(relativa(ruta))) {
      lista.push(ruta)
    }
  }
  return lista
}

/**
 * Caracteres tras los que una `/` abre una expresión regular y no es una división. Sin `<`, `>` ni `}`: en JSX
 * preceden a `/` en `</etiqueta>`, `/>` y `{a}/{b}`.
 */
const ANTES_DE_REGEX = new Set(['', '(', ',', '=', ':', '[', '!', '&', '|', '?', '{', ';', '+', '-', '*', '%', '~', '^'])

/**
 * Devuelve `codigo` (el texto con comentarios y contenido de literales en blanco, mismas posiciones) y `literales`:
 * `{ inicio, fin, texto, plantilla, interpolada }`, con `inicio` en la comilla de apertura y `fin` tras la de cierre.
 */
export function analizar(texto) {
  const n = texto.length
  const codigo = texto.split('')
  const literales = []
  const blanquear = (a, b) => {
    for (let k = a; k < b; k++) if (codigo[k] !== '\n' && codigo[k] !== '\r') codigo[k] = ' '
  }
  const anteriorSignificativo = (i) => {
    let k = i - 1
    while (k >= 0 && /\s/.test(codigo[k])) k--
    if (k < 0) return ''
    if (/[\w$]/.test(codigo[k])) {
      let a = k
      while (a > 0 && /[\w$]/.test(codigo[a - 1])) a--
      const palabra = codigo.slice(a, k + 1).join('')
      return ['return', 'typeof', 'case', 'in', 'of', 'delete', 'void', 'throw', 'new'].includes(palabra) ? '' : 'x'
    }
    return codigo[k]
  }

  function leerCadena(i, comilla) {
    let j = i + 1
    while (j < n && texto[j] !== comilla && texto[j] !== '\n') j += texto[j] === '\\' ? 2 : 1
    const fin = Math.min(j + 1, n)
    literales.push({ inicio: i, fin, texto: texto.slice(i + 1, fin - 1), plantilla: false, interpolada: false })
    blanquear(i + 1, fin - 1)
    return fin
  }

  function leerPlantilla(i) {
    let j = i + 1
    let desde = j
    let interpolada = false
    while (j < n && texto[j] !== '`') {
      if (texto[j] === '\\') {
        j += 2
      } else if (texto[j] === '$' && texto[j + 1] === '{') {
        interpolada = true
        blanquear(desde, j)
        j = leerCodigo(j + 2, true) + 1
        desde = j
      } else {
        j++
      }
    }
    blanquear(desde, j)
    const fin = Math.min(j + 1, n)
    literales.push({ inicio: i, fin, texto: texto.slice(i + 1, fin - 1), plantilla: true, interpolada })
    return fin
  }

  function leerRegex(i) {
    let j = i + 1
    let clase = false
    while (j < n && texto[j] !== '\n') {
      if (texto[j] === '\\') j++
      else if (texto[j] === '[') clase = true
      else if (texto[j] === ']') clase = false
      else if (texto[j] === '/' && !clase) break
      j++
    }
    j++
    while (j < n && /[a-z]/.test(texto[j])) j++
    return j
  }

  /** Lee código hasta el final o, dentro de `${ }`, hasta la llave que lo cierra (devuelve su posición). */
  function leerCodigo(i, enExpresion) {
    let llaves = 0
    while (i < n) {
      const c = texto[i]
      const d = texto[i + 1]
      if (c === '/' && d === '/') {
        const f = texto.indexOf('\n', i)
        const fin = f < 0 ? n : f
        blanquear(i, fin)
        i = fin
      } else if (c === '/' && d === '*') {
        const f = texto.indexOf('*/', i + 2)
        const fin = f < 0 ? n : f + 2
        blanquear(i, fin)
        i = fin
      } else if (c === '"' || c === "'") {
        i = leerCadena(i, c)
      } else if (c === '`') {
        i = leerPlantilla(i)
      } else if (c === '/' && ANTES_DE_REGEX.has(anteriorSignificativo(i))) {
        i = leerRegex(i)
      } else {
        if (enExpresion && c === '{') llaves++
        if (enExpresion && c === '}') {
          if (llaves === 0) return i
          llaves--
        }
        i++
      }
    }
    return i
  }

  leerCodigo(0, false)
  return { codigo: codigo.join(''), literales }
}

/** Línea (desde 1) de una posición. */
export const lineaDe = (texto, pos) => texto.slice(0, pos).split('\n').length

/** Primer carácter no blanco de `codigo` desde `pos` (y su posición). */
export function siguiente(codigo, pos) {
  let k = pos
  while (k < codigo.length && /\s/.test(codigo[k])) k++
  return { caracter: codigo[k] ?? '', pos: k }
}

/** Último carácter no blanco de `codigo` antes de `pos`. */
export function anterior(codigo, pos) {
  let k = pos - 1
  while (k >= 0 && /\s/.test(codigo[k])) k--
  return codigo[k] ?? ''
}

export const leer = (ruta) => readFileSync(ruta, 'utf8')
