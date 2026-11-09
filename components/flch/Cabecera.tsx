import c from './Cabecera.module.css'

const SITIO_FLCH = 'https://letras.unmsm.edu.pe'

/**
 * Franja institucional de la Facultad (igual en el directorio y en cada grupo): el escudo de la UNMSM a la izquierda del
 * filete dorado y la marca textual. Escudo: public/img/escudo-unmsm-blanco.svg, variante blanca (sobre el azul) del
 * escudo-unmsm.svg dorado de los iconos de pestaña y del panel (archivo UNMSM_escudo.svg entregado por el usuario el
 * 09-11-2026, optimizado; mismo dibujo, solo cambia el color de relleno).
 */
export function Cabecera() {
  return (
    <header className={`oscuro ${c.cabecera}`}>
      <div className={c.inner}>
        {/* La marca es el único enlace al sitio de la Facultad (sin botón «FLCH» aparte). alt vacío: el texto de al
            lado ya nombra a la institución. */}
        <a href={SITIO_FLCH} className={c.marca}>
          <img src="/img/escudo-unmsm-blanco.svg" alt="" width={1006} height={1188} className={c.escudo} />
          <span className={c.textos}>
            <span className={c.facultad}>Facultad de Letras y Ciencias Humanas</span>
            <span className={c.universidad}>Universidad Nacional Mayor de San Marcos</span>
          </span>
        </a>
      </div>
    </header>
  )
}
