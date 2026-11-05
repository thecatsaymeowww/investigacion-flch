import type { Imagen } from '@/lib/cms'
import b from './base.module.css'

type Props = {
  img: Imagen
  /** Identificador que se muestra en el bloque liso cuando no hay imagen (decorativo): la sigla del grupo o el tipo de actividad. */
  sigla?: string
  alt?: string
  className?: string
  /** Imagen principal de la página: sin carga diferida. */
  prioridad?: boolean
  /** Ancho que ocupa, para que el navegador elija el tamaño derivado (srcset, subfase 5b). */
  sizes?: string
}

/** Imagen pública de Payload o, si falta, un bloque liso con la sigla (sin imágenes ni logos inventados). */
export function Foto({ img, sigla, alt, className = '', prioridad = false, sizes = '(max-width: 900px) 100vw, 50vw' }: Props) {
  return (
    <div className={`${b.foto} ${img ? '' : b.sinFoto} ${className}`}>
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
        sigla && (
          <span className={b.sigla} aria-hidden="true">
            {sigla}
          </span>
        )
      )}
    </div>
  )
}
