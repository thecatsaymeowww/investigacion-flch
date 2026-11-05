import type { DatosLanding } from '@/lib/cms'
import { Seccion } from './Seccion'
import s from './AliadosGrupo.module.css'

/**
 * Instituciones aliadas. No está en la referencia, pero es contenido real del CMS: se conserva con el
 * lenguaje de las tarjetas de la plantilla. Sin aliados no se muestra.
 */
export function AliadosGrupo({ aliados }: { aliados: NonNullable<DatosLanding>['aliados'] }) {
  if (!aliados.length) return null
  return (
    <Seccion id="aliados" titulo="Con el apoyo de">
      <ul className={s.aliados}>
        {aliados.map((a) => {
          const contenido = (
            <>
              {a.logo ? (
                <img src={a.logo.src} srcSet={a.logo.srcSet} sizes="200px" alt={a.nombre} loading="lazy" decoding="async" />
              ) : (
                <span className={s.nombre}>{a.nombre}</span>
              )}
              {a.url && <span className={s.ir}>Visitar sitio →</span>}
            </>
          )
          return (
            <li key={a.nombre}>
              {a.url ? (
                <a href={a.url} target="_blank" rel="noopener" className={s.aliado}>
                  {contenido}
                </a>
              ) : (
                <div className={s.aliado}>{contenido}</div>
              )}
            </li>
          )
        })}
      </ul>
    </Seccion>
  )
}
