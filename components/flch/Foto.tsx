import type { Imagen } from '@/lib/cms'
import b from './base.module.css'

type Props = {
  img: Imagen
  /** Texto del recuadro rayado cuando no hay imagen (decorativo). */
  pista: string
  alt?: string
  className?: string
  /** Imagen principal de la página: sin carga diferida. */
  prioridad?: boolean
  /** Ancho que ocupa, para que el navegador elija el tamaño derivado (srcset, subfase 5b). */
  sizes?: string
}

/** Imagen pública de Payload o, si falta, el recuadro rayado de la referencia. */
export function Foto({ img, pista, alt, className = '', prioridad = false, sizes = '(max-width: 900px) 100vw, 50vw' }: Props) {
  return (
    <div className={`${b.foto} ${className}`}>
      {img ? (
        <img
          src={img.src}
          srcSet={img.srcSet}
          sizes={sizes}
          alt={alt ?? img.alt}
          loading={prioridad ? 'eager' : 'lazy'}
          fetchPriority={prioridad ? 'high' : undefined}
          decoding="async"
        />
      ) : (
        <span className={b.pista} aria-hidden="true">
          {pista}
        </span>
      )}
    </div>
  )
}
