import type { DatosLanding } from '@/lib/cms'
import { cuenta, SeccionNumerada } from './InvestigacionGrupo'
import s from './AliadosGrupo.module.css'

/**
 * Instituciones aliadas. No está en la referencia, pero es contenido real del CMS: se muestra como apartado numerado
 * de la plantilla, con tarjetas como las de Servicios. Sin aliados no se llama (la numeración sigue a los visibles).
 */
export function AliadosGrupo({ n, aliados }: { n: number; aliados: NonNullable<DatosLanding>['aliados'] }) {
  return (
    <SeccionNumerada id="aliados" n={n} titulo="Aliados" resumen={cuenta(aliados.length, 'institución aliada', 'instituciones aliadas')}>
      <ul className={s.aliados}>
        {aliados.map((a) => {
          const contenido = (
            <>
              <span className={s.logo}>
                {a.logo ? (
                  <img src={a.logo.src} srcSet={a.logo.srcSet} sizes="200px" alt="" loading="lazy" decoding="async" />
                ) : (
                  <span className={s.inicial} aria-hidden="true">
                    {a.nombre.charAt(0)}
                  </span>
                )}
              </span>
              <span className={s.nombre}>{a.nombre}</span>
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
    </SeccionNumerada>
  )
}
