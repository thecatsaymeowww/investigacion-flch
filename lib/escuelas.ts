/**
 * Escuelas profesionales de la FLCH, en el orden del directorio (referencia de Claude Design).
 * El valor se guarda en `grupos.escuela`; el nombre y las etiquetas se muestran en el sitio.
 */
export const ESCUELAS = [
  { valor: 'linguistica', nombre: 'Lingüística' },
  { valor: 'literatura', nombre: 'Literatura' },
  { valor: 'filosofia', nombre: 'Filosofía' },
  { valor: 'comunicacion-social', nombre: 'Comunicación Social' },
  { valor: 'bibliotecologia', nombre: 'Bibliotecología y CC. de la Información' },
  { valor: 'conservacion-restauracion', nombre: 'Conservación y Restauración' },
  { valor: 'lenguas-traduccion', nombre: 'Lenguas, Traducción e Interpretación' },
  { valor: 'interdisciplinario', nombre: 'Interdisciplinarios' },
] as const

const POR_VALOR = new Map<string, (typeof ESCUELAS)[number]>(ESCUELAS.map((e) => [e.valor, e]))

export const escuelaPorValor = (valor: string | null | undefined) => (valor ? (POR_VALOR.get(valor) ?? null) : null)

/** Línea corta del grupo: «E.P. Lingüística» o «Interdisciplinario». */
export const etiquetaEscuela = (valor: string | null | undefined) => {
  const e = escuelaPorValor(valor)
  if (!e) return ''
  return e.valor === 'interdisciplinario' ? 'Interdisciplinario' : `E.P. ${e.nombre}`
}
