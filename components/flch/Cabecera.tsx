import c from './Cabecera.module.css'

const SITIO_FLCH = 'https://letras.unmsm.edu.pe'

/** Franja institucional de la Facultad (igual en el directorio y en cada grupo). */
export function Cabecera() {
  return (
    <header className={`oscuro ${c.cabecera}`}>
      <div className={c.inner}>
        <a href={SITIO_FLCH} className={c.marca}>
          {/* Recuadro del escudo como en la referencia: falta el archivo oficial del escudo. */}
          <span className={c.escudo} aria-hidden="true">
            escudo
          </span>
          <span className={c.textos}>
            <span className={c.facultad}>Facultad de Letras y Ciencias Humanas</span>
            <span className={c.universidad}>Universidad Nacional Mayor de San Marcos</span>
          </span>
        </a>
        <a href={SITIO_FLCH} className={c.flch} aria-label="FLCH: sitio web de la Facultad">
          FLCH
        </a>
      </div>
    </header>
  )
}
