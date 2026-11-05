const ROMANOS: [number, string][] = [
  [1000, 'M'],
  [900, 'CM'],
  [500, 'D'],
  [400, 'CD'],
  [100, 'C'],
  [90, 'XC'],
  [50, 'L'],
  [40, 'XL'],
  [10, 'X'],
  [9, 'IX'],
  [5, 'V'],
  [4, 'IV'],
  [1, 'I'],
]

export function romano(n: number): string {
  let out = ''
  for (const [v, s] of ROMANOS)
    while (n >= v) {
      out += s
      n -= v
    }
  return out
}

/** Iniciales para el retrato: primer nombre + primer apellido. */
export function iniciales(nombre: string): string {
  const partes = nombre.replace(/^(Dr|Dra|Mg|Lic)\.\s+/i, '').split(/\s+/)
  const apellido = partes[partes.length > 2 ? partes.length - 2 : 1] ?? ' '
  return (partes[0][0] + apellido[0]).toUpperCase()
}

/** Partes de la fecha en Lima: { dia: "martes", fecha: "6 de octubre de 2026" }. */
export function fechaPartes(d = new Date()) {
  const opts = { timeZone: 'America/Lima' } as const
  return {
    dia: new Intl.DateTimeFormat('es-PE', { ...opts, weekday: 'long' }).format(d),
    fecha: new Intl.DateTimeFormat('es-PE', { ...opts, day: 'numeric', month: 'long', year: 'numeric' }).format(d),
  }
}

/** YYYY-MM-DD en Lima. */
export const hoyLima = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima' }).format(new Date())

export const fechaLarga = (iso: string) =>
  new Intl.DateTimeFormat('es-PE', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(iso))
