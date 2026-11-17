'use client'

import { useEffect, useRef, useState } from 'react'
import type { Imagen } from '@/lib/cms'
import { Foto } from './Foto'
import s from './FotoAmpliable.module.css'

type Props = {
  img: NonNullable<Imagen> & { original: string }
  leyenda: string
  className?: string
  sizes?: string
  prioridad?: boolean
}

/**
 * Foto que, al pulsarla, se abre en un diálogo modal nativo (showModal: foco atrapado y Escape los da el navegador)
 * con el archivo original y una leyenda. El original solo se descarga al abrir la vista ampliada.
 */
export function FotoAmpliable({ img, leyenda, className = '', sizes, prioridad }: Props) {
  const ref = useRef<HTMLDialogElement>(null)
  const [cargar, setCargar] = useState(false)

  const abrir = () => {
    setCargar(true)
    ref.current?.showModal()
    document.documentElement.style.overflow = 'hidden'
  }
  const cerrar = () => ref.current?.close()

  useEffect(() => {
    const dialogo = ref.current!
    const alCerrar = () => {
      document.documentElement.style.overflow = ''
    }
    dialogo.addEventListener('close', alCerrar)
    return () => {
      dialogo.removeEventListener('close', alCerrar)
      document.documentElement.style.overflow = ''
    }
  }, [])

  return (
    <>
      <button type="button" className={s.disparador} onClick={abrir} aria-haspopup="dialog" aria-label={`Ampliar foto: ${leyenda}`}>
        <Foto img={img} className={className} sizes={sizes} prioridad={prioridad} />
      </button>
      <dialog
        ref={ref}
        className={s.vista}
        aria-label={leyenda}
        // Clic en el velo (fuera de la foto y la leyenda) cierra.
        onClick={(e) => {
          if (e.target === e.currentTarget) cerrar()
        }}
      >
        <button type="button" className={s.cerrar} onClick={cerrar} aria-label="Cerrar">
          ×
        </button>
        <figure className={s.figura}>
          {cargar && <img src={img.original} alt={img.alt} decoding="async" />}
          <figcaption className={s.leyenda}>{leyenda}</figcaption>
        </figure>
      </dialog>
    </>
  )
}
