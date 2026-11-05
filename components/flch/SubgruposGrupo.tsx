import Link from 'next/link'
import type { EntradaDirectorio } from '@/lib/cms'
import { Seccion } from './Seccion'
import s from './SubgruposGrupo.module.css'

/**
 * Subgrupos del grupo padre, con los mismos datos del directorio (lib/cms, listarGrupos: solo activos y con landing
 * publicada). Sin subgrupos, la sección no se muestra.
 */
export function SubgruposGrupo({ subgrupos }: { subgrupos: EntradaDirectorio['subgrupos'] }) {
  if (!subgrupos.length) return null
  return (
    <Seccion
      id="subgrupos"
      titulo="Subgrupos"
      extra={<span className={s.cuenta}>{subgrupos.length === 1 ? '1 subgrupo' : `${subgrupos.length} subgrupos`}</span>}
    >
      <ul className={s.lista}>
        {subgrupos.map((sg) => (
          <li key={sg.ruta}>
            <Link href={`/${sg.ruta}`} className={s.tarjeta}>
              <span className={s.etiqueta}>Subgrupo</span>
              <span className={s.fila}>
                <span className={s.nombre}>{sg.cabecera}</span>
                <span className={s.flecha} aria-hidden="true">
                  →
                </span>
              </span>
              {sg.lema && <span className={s.lema}>{sg.lema}</span>}
            </Link>
          </li>
        ))}
      </ul>
    </Seccion>
  )
}
