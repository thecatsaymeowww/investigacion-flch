import b from './base.module.css'

type Props = {
  id: string
  titulo: string
  /** Lo que va a la derecha del título: recuento, enlace "Ver todas →"… */
  extra?: React.ReactNode
  /** Cabecera pegada al contenido (En cifras). */
  compacta?: boolean
  className?: string
  children: React.ReactNode
}

/** Sección de la Plantilla Grupo: título serif sobre filete azul y su contenido. */
export function Seccion({ id, titulo, extra, compacta, className = '', children }: Props) {
  return (
    <section id={id} className={`${b.seccion} ${className}`} aria-labelledby={`${id}-titulo`}>
      <div className={`${b.cab} ${compacta ? b.cabCompacta : ''}`}>
        <h2 id={`${id}-titulo`} className={b.h2}>
          {titulo}
        </h2>
        {extra}
      </div>
      {children}
    </section>
  )
}
