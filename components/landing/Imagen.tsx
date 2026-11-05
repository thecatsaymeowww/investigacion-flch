import type { Imagen as Img } from '@/lib/cms'

/** Muestra la imagen si existe; si no, el placeholder rayado con su pista. */
export function Imagen({
  img,
  pista,
  ratio,
  className = '',
  alt,
  sizes = '(max-width: 900px) 100vw, 50vw',
  prioridad = false,
}: {
  img: Img
  pista: string
  ratio?: string
  className?: string
  alt?: string
  /** Ancho que ocupa, para que el navegador elija el tamaño derivado (srcset, subfase 5b). */
  sizes?: string
  /** Imagen principal de la página (LCP, subfase 5c): sin carga diferida y con prioridad alta. Solo en el Hero. */
  prioridad?: boolean
}) {
  return (
    <div className={`ph ${className}`} style={ratio ? { aspectRatio: ratio } : undefined}>
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
        <span className="ph__pista">{pista}</span>
      )}
    </div>
  )
}
