import { useMemo, useState } from 'react'

/** Lógica del calendario de la agenda, común a los dos temas (la presentación va en cada componente). */

export type Evento = { date: string; time: string; title: string; kind: string; place: string }

export const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']
export const DIAS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']
const pad = (n: number) => String(n).padStart(2, '0')

/** Estado del calendario mensual + lista de citas. Mes inicial: el actual en Lima, calculado en el servidor. */
export function useAgenda(datos: Evento[], hoyServidor: string) {
  const eventos = useMemo(() => [...datos].sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time)), [datos])
  const [y0, m0] = hoyServidor.split('-').map(Number)
  const [ym, setYm] = useState<[number, number]>([y0, m0 - 1])
  const [sel, setSel] = useState<string | null>(null)

  const [y, m] = ym
  const inicio = (new Date(y, m, 1).getDay() + 6) % 7
  const dias = new Date(y, m + 1, 0).getDate()
  const total = Math.ceil((inicio + dias) / 7) * 7
  const mesKey = `${y}-${pad(m + 1)}`

  const celdas = Array.from({ length: total }, (_, i) => {
    const dt = new Date(y, m, i - inicio + 1)
    const key = `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`
    const enMes = dt.getMonth() === m
    return {
      key,
      dia: dt.getDate(),
      etiqueta: `${dt.getDate()} de ${MESES[dt.getMonth()].toLowerCase()}`,
      enMes,
      // "Hoy" en Lima, calculado en el servidor (mismo valor en SSR e hidratación).
      hoy: key === hoyServidor,
      sel: key === sel,
      eventos: enMes ? eventos.filter((e) => e.date === key) : [],
    }
  })

  return {
    mes: `${MESES[m]} ${y}`,
    celdas,
    lista: eventos.filter((e) => (sel ? e.date === sel : e.date.startsWith(mesKey))),
    sel,
    tituloLista: sel ? `Actividades del ${+sel.slice(8)} de ${MESES[+sel.slice(5, 7) - 1].toLowerCase()}` : 'Este mes',
    elegir: (key: string) => setSel(sel === key ? null : key),
    verMes: () => setSel(null),
    mover: (k: number) => {
      const d = new Date(y, m + k, 1)
      setYm([d.getFullYear(), d.getMonth()])
      setSel(null)
    },
  }
}

/** Día y mes abreviado de un evento: { dia: 8, mes: "Oct" }. */
export const fechaCorta = (iso: string) => ({ dia: +iso.slice(8), mes: MESES[+iso.slice(5, 7) - 1].slice(0, 3) })
