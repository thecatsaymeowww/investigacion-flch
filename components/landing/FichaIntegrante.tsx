'use client'

import { useEffect, useRef } from 'react'
import s from './Integrantes.module.css'

/**
 * Diálogo modal nativo de la ficha ampliada (showModal: foco atrapado y Escape
 * los da el navegador). Se abre con los botones [data-abrir-ficha] de la grilla.
 */
export function FichaIntegrante({ children, clases = s }: { children: React.ReactNode; clases?: Record<string, string> }) {
  const ref = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialogo = ref.current!
    const items = [...dialogo.querySelectorAll<HTMLElement>('[data-ficha-item]')]
    const seccion = dialogo.closest('section')!
    let origen: HTMLElement | null = null

    const abrir = (b: HTMLElement) => {
      const i = b.dataset.abrirFicha
      items.forEach((it) => {
        const activo = it.dataset.fichaItem === i
        it.hidden = !activo
        it.scrollTop = 0
        it.querySelector('[data-titulo]')!.id = activo ? 'ficha-titulo' : ''
      })
      origen = b
      dialogo.scrollTop = 0
      dialogo.showModal()
      document.documentElement.style.overflow = 'hidden'
    }
    const limpiar = () => {
      document.documentElement.style.overflow = ''
      origen?.focus()
      origen = null
    }
    const cerrar = () => {
      if (dialogo.open) dialogo.close()
      limpiar()
    }

    const botones = [...seccion.querySelectorAll<HTMLElement>('[data-abrir-ficha]')]
    const handlers = botones.map((b) => {
      const h = () => abrir(b)
      b.addEventListener('click', h)
      return [b, h] as const
    })
    const enVelo = (e: MouseEvent) => {
      if (e.target === dialogo) cerrar()
    }
    const alCerrar = () => {
      if (origen) limpiar()
    }
    const x = dialogo.querySelector<HTMLButtonElement>('[data-cerrar-ficha]')!
    x.addEventListener('click', cerrar)
    // Clic en el velo (fuera de la caja) cierra; Escape lo maneja el navegador.
    dialogo.addEventListener('click', enVelo)
    dialogo.addEventListener('close', alCerrar)
    return () => {
      handlers.forEach(([b, h]) => b.removeEventListener('click', h))
      x.removeEventListener('click', cerrar)
      dialogo.removeEventListener('click', enVelo)
      dialogo.removeEventListener('close', alCerrar)
      document.documentElement.style.overflow = ''
    }
  }, [])

  return (
    <dialog ref={ref} className={clases.ficha} aria-labelledby="ficha-titulo">
      <button type="button" className={clases.cerrar} data-cerrar-ficha aria-label="Cerrar">
        ×
      </button>
      {children}
    </dialog>
  )
}
