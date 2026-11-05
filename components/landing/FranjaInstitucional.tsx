import Link from 'next/link'
import s from './FranjaInstitucional.module.css'

const SITIO_FLCH = 'https://letras.unmsm.edu.pe'

/**
 * Franja institucional fina sobre la barra de Prensa y Literatura (etapa 4.1, D6): pertenencia a la Facultad y vuelta
 * al directorio general. No es fija: se va con el desplazamiento y la barra fija conserva su altura (scroll-margin 60 px).
 */
export function FranjaInstitucional() {
  return (
    <div className={s.franja}>
      <div className={s.inner}>
        {/* En móvil se ve la forma corta; la larga queda solo para lectores de pantalla (el nombre no cambia con el ancho). */}
        <a href={SITIO_FLCH} className={s.facultad}>
          <span className={s.largo}>Facultad de Letras y Ciencias Humanas · UNMSM</span>
          <span className={s.corto} aria-hidden="true">
            FLCH · UNMSM
          </span>
        </a>
        <Link href="/" className={s.directorio}>
          <span aria-hidden="true">←</span> Grupos de investigación
        </Link>
      </div>
    </div>
  )
}
