import { z } from 'zod'

/**
 * Formulario «Colaborar» (subfase 4a): límites, limpieza y validación de lo que envía la persona.
 * El servidor (app/(sitio)/[grupo]/acciones.ts) es la autoridad: valida con validarPropuesta. El navegador solo usa
 * LIMITES para los `maxLength`, así que los dos lados comparten los mismos números.
 * Sin otras importaciones que zod, y el esquema se construye dentro de una función: importar LIMITES desde el
 * componente de cliente no arrastra zod al navegador. `node --test scripts/test-formulario.mjs` lo prueba tal cual.
 */

export const CAMPOS = ['nombre', 'correo', 'institucion', 'tipo', 'mensaje'] as const
export type Campo = (typeof CAMPOS)[number]
export type ValoresEnvio = Record<Campo, string>
export type ErroresEnvio = Partial<Record<Campo, string>>

export const LIMITES = {
  nombre: { min: 2, max: 120 },
  correo: { max: 160 },
  institucion: { max: 160 },
  tipo: { max: 80 },
  mensaje: { min: 10, max: 4000 },
} as const

export const ETIQUETAS: Record<Campo, string> = {
  nombre: 'Nombre',
  correo: 'Correo',
  institucion: 'Institución',
  tipo: 'Tipo de colaboración',
  mensaje: 'Mensaje',
}

/** Se admite siempre: es lo que envía el formulario cuando la landing no define tipos de colaboración. */
export const TIPO_POR_DEFECTO = 'Otro'

/**
 * Caracteres de control e invisibles que se quitan (1.7 del plan): C0 salvo tabulador y saltos de línea (se tratan
 * aparte), DEL y C1; marcas y controles bidireccionales (U+061C, U+200E, U+200F, U+202A–U+202E, U+2066–U+2069), que
 * permiten disfrazar un texto en el panel; espacio de ancho cero (U+200B) y BOM (U+FEFF). Se conservan U+200C y
 * U+200D, que forman parte de escrituras y emojis legítimos.
 */
const INVISIBLES = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F؜​‎‏‪-‮⁦-⁩﻿]/g

/**
 * Normaliza un texto enviado: forma NFC, saltos de línea como `\n` (el navegador envía `\r\n`, que contaría doble
 * frente al `maxLength`), tabuladores como espacio y sin los caracteres de INVISIBLES. En los campos de una línea,
 * los saltos pasan a ser espacios. No recorta ni trunca: eso lo decide la validación.
 */
export function limpiarTexto(valor: string, multilinea = false): string {
  const t = valor.normalize('NFC').replace(/\r\n?/g, '\n').replace(/\t/g, ' ').replace(INVISIBLES, '')
  return multilinea ? t : t.replace(/\n+/g, ' ')
}

/** Lo enviado, limpio y completo. Un valor que no es texto (p. ej. un archivo con el nombre de un campo) cuenta como vacío. */
export function leerValores(form: FormData): ValoresEnvio {
  const leer = (campo: Campo) => {
    const v = form.get(campo)
    return typeof v === 'string' ? limpiarTexto(v, campo === 'mensaje') : ''
  }
  return { nombre: leer('nombre'), correo: leer('correo'), institucion: leer('institucion'), tipo: leer('tipo'), mensaje: leer('mensaje') }
}

/** Lo que se devuelve al formulario tras un error, acotado a los límites (no se refleja un texto arbitrariamente largo). */
export const valoresParaDevolver = (v: ValoresEnvio): ValoresEnvio => Object.fromEntries(CAMPOS.map((c) => [c, v[c].slice(0, LIMITES[c].max)])) as ValoresEnvio

const maximo = (n: number) => `Use como máximo ${n} caracteres.`

function esquema(tipos: readonly string[]) {
  return z.object({
    nombre: z.string().trim().min(LIMITES.nombre.min, 'Escriba su nombre.').max(LIMITES.nombre.max, maximo(LIMITES.nombre.max)),
    correo: z
      .string()
      .trim()
      .min(1, 'Escriba su correo.')
      .email('Correo no válido: revise que tenga la forma nombre@dominio.')
      .max(LIMITES.correo.max, maximo(LIMITES.correo.max)),
    institucion: z.string().trim().max(LIMITES.institucion.max, maximo(LIMITES.institucion.max)),
    tipo: z
      .string()
      .trim()
      .refine((t) => tipos.includes(t), 'Elija uno de los tipos de colaboración de la lista.'),
    mensaje: z
      .string()
      .trim()
      .min(LIMITES.mensaje.min, `Cuéntenos un poco más (al menos ${LIMITES.mensaje.min} caracteres).`)
      .max(LIMITES.mensaje.max, maximo(LIMITES.mensaje.max)),
  })
}

export type DatosPropuesta = { nombre: string; correo: string; institucion?: string; tipo: string; mensaje: string }

/**
 * Valida lo enviado contra los límites y la lista blanca de tipos de la landing del grupo (más TIPO_POR_DEFECTO).
 * Devuelve todos los errores, uno por campo (el primero de cada uno), en el orden del formulario.
 */
export function validarPropuesta(
  valores: ValoresEnvio,
  tiposDeLaLanding: readonly string[],
): { ok: true; datos: DatosPropuesta } | { ok: false; errores: ErroresEnvio } {
  const r = esquema([...tiposDeLaLanding, TIPO_POR_DEFECTO]).safeParse(valores)
  if (r.success) return { ok: true, datos: { ...r.data, institucion: r.data.institucion || undefined } }
  const errores: ErroresEnvio = {}
  for (const issue of r.error.issues) {
    const campo = issue.path[0]
    if (typeof campo === 'string' && (CAMPOS as readonly string[]).includes(campo)) errores[campo as Campo] ??= issue.message
  }
  return { ok: false, errores: Object.fromEntries(CAMPOS.filter((c) => errores[c]).map((c) => [c, errores[c]])) }
}

/**
 * Antispam (subfase 4c, punto 5.2 del plan). Nada de esto rechaza un envío: lo marca para el editor.
 * - Más de ENLACES_MAXIMOS enlaces (`http://`, `https://` o `www.`) en lo escrito → «posible spam». La lista de términos
 *   que también prevé el plan no está definida: decisión pendiente.
 * - Mismo correo (sin distinguir mayúsculas) y mismo mensaje (tal como queda tras limpiarTexto y recortar) en el mismo
 *   grupo dentro de VENTANA_DUPLICADOS_MS → el nuevo se marca como duplicado del anterior. Nunca se borra nada.
 */
export const ENLACES_MAXIMOS = 3
export const VENTANA_DUPLICADOS_MS = 10 * 60_000

const ENLACE = /\bhttps?:\/\/|\bwww\./gi

/** Enlaces en lo que escribió la persona (nombre, institución y mensaje). */
export const contarEnlaces = (d: Pick<DatosPropuesta, 'nombre' | 'institucion' | 'mensaje'>): number =>
  [d.nombre, d.institucion ?? '', d.mensaje].reduce((n, t) => n + (t.match(ENLACE)?.length ?? 0), 0)

export const demasiadosEnlaces = (d: Pick<DatosPropuesta, 'nombre' | 'institucion' | 'mensaje'>) => contarEnlaces(d) > ENLACES_MAXIMOS

/** Mismo envío a efectos de duplicado: el correo sin distinguir mayúsculas y el mensaje idéntico. */
export const mismoEnvio = (a: { correo: string; mensaje: string }, b: { correo: string; mensaje: string }) =>
  a.correo.toLowerCase() === b.correo.toLowerCase() && a.mensaje === b.mensaje

/** Resumen del aviso general (`role="alert"`): con un solo campo, su error; con varios, cuáles revisar. */
export function resumenDeErrores(errores: ErroresEnvio): string {
  const campos = CAMPOS.filter((c) => errores[c])
  if (campos.length === 1) return `${ETIQUETAS[campos[0]]}: ${errores[campos[0]]}`
  return `Revise ${campos.length} campos: ${campos.map((c) => ETIQUETAS[c]).join(', ')}.`
}
