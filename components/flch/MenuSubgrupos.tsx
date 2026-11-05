'use client'

import Link from 'next/link'
import { useEffect, useId, useRef, useState } from 'react'
import h from './HeroGrupo.module.css'

type Subgrupo = { ruta: string; nombre: string; lema: string }

/**
 * Botón «Subgrupos» del hero (Plantilla Grupo): despliega los subgrupos publicados del grupo (los del directorio, ver
 * lib/cms). Se cierra al pulsar fuera, con Escape (devolviendo el foco al botón) o al elegir uno.
 */
export function MenuSubgrupos({ sigla, subgrupos }: { sigla: string; subgrupos: Subgrupo[] }) {
  const [abierto, setAbierto] = useState(false)
  const caja = useRef<HTMLDivElement>(null)
  const boton = useRef<HTMLButtonElement>(null)
  const id = useId()

  useEffect(() => {
    if (!abierto) return
    const fuera = (e: MouseEvent) => {
      if (caja.current && !caja.current.contains(e.target as Node)) setAbierto(false)
    }
    const tecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setAbierto(false)
        boton.current?.focus()
      }
    }
    document.addEventListener('mousedown', fuera)
    document.addEventListener('keydown', tecla)
    return () => {
      document.removeEventListener('mousedown', fuera)
      document.removeEventListener('keydown', tecla)
    }
  }, [abierto])

  return (
    <div ref={caja} className={h.subgrupos}>
      <button ref={boton} type="button" className={h.subBoton} aria-expanded={abierto} aria-controls={id} onClick={() => setAbierto((a) => !a)}>
        Subgrupos
        <span className={h.flecha} aria-hidden="true">
          ▼
        </span>
      </button>
      {/* Cerrado: visibility hidden (fuera del foco y de los lectores de pantalla), con la transición de la referencia. */}
      <div id={id} className={h.panel} data-abierto={abierto}>
        <span className={h.panelTitulo}>Subgrupos de {sigla}</span>
        {subgrupos.map((sg, i) => (
          <Link key={sg.ruta} href={`/${sg.ruta}`} className={h.subItem} onClick={() => setAbierto(false)}>
            <span className={h.subN} aria-hidden="true">
              {String(i + 1).padStart(2, '0')}
            </span>
            <span className={h.subTexto}>
              <span className={h.subNombre}>{sg.nombre}</span>
              {sg.lema && <span className={h.subLema}>{sg.lema}</span>}
            </span>
            <span className={h.subIr} aria-hidden="true">
              →
            </span>
          </Link>
        ))}
      </div>
    </div>
  )
}
