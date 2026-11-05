import c from './Cabecera.module.css'

const SITIO_FLCH = 'https://letras.unmsm.edu.pe'

/** Franja institucional de la Facultad (igual en el directorio y en cada grupo). */
export function Cabecera() {
  return (
    <header className={`oscuro ${c.cabecera}`}>
      <div className={c.inner}>
        {/* Sin escudo hasta contar con el archivo oficial y su permiso de uso: solo la marca textual (etapa 4.1, D2). */}
        <a href={SITIO_FLCH} className={c.marca}>
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
