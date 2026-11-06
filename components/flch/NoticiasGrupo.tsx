import type { DatosLanding } from '@/lib/cms'
import { fechaLarga } from '@/lib/utils'
import { Foto } from './Foto'
import { cuenta, SeccionNumerada } from './InvestigacionGrupo'
import ps from './PlantillaGrupo.module.css'
import s from './NoticiasGrupo.module.css'

type Noticia = NonNullable<DatosLanding>['noticias'][number]

/** Línea de fecha de una noticia: «Convocatoria · 28 de octubre de 2026» (la categoría es opcional). */
const fechaDe = (n: Noticia) => [n.categoria, fechaLarga(n.fecha)].filter(Boolean).join(' · ')

/** Apartado numerado de los grupos: la noticia más reciente en grande y las demás en tarjetas, de la más nueva a la más antigua. */
export function NoticiasGrupo({ n, noticias }: { n: number; noticias: Noticia[] }) {
  if (!noticias.length) {
    return (
      <SeccionNumerada id="noticias" n={n} titulo="Noticias">
        <p className={ps.vacio}>Todavía no hay noticias publicadas.</p>
      </SeccionNumerada>
    )
  }
  const [d, ...otras] = [...noticias].sort((a, b) => b.fecha.localeCompare(a.fecha))
  return (
    <SeccionNumerada id="noticias" n={n} titulo="Noticias" resumen={cuenta(noticias.length, 'noticia publicada', 'noticias publicadas')}>
      <div className={s.noticias}>
        <article className={s.principal}>
          <Foto img={d.imagen} alt={d.titulo} sigla={d.categoria || 'Noticia'} className={s.foto} sizes="(max-width: 900px) 100vw, 60vw" />
          <div className={s.cuerpo}>
            <div className={s.meta}>
              <span className={s.badge}>Lo más reciente</span>
              <span className={s.fecha}>{fechaDe(d)}</span>
            </div>
            <h3 className={s.titular}>{d.titulo}</h3>
            <div className={s.texto}>
              {(d.texto.length ? d.texto : [d.resumen]).map((p, i) => (
                <p key={i}>{p}</p>
              ))}
            </div>
            {d.url && (
              <a href={d.url} className={s.enlace} target="_blank" rel="noopener">
                Leer la noticia completa →
              </a>
            )}
          </div>
        </article>
        {otras.length > 0 && (
          <ul className={s.lateral}>
            {otras.map((x) => (
              <li key={x.id} className={s.item}>
                <span className={s.itemTipo}>{fechaDe(x)}</span>
                <h3 className={s.itemTitulo}>
                  {x.url ? (
                    <a href={x.url} target="_blank" rel="noopener">
                      {x.titulo}
                    </a>
                  ) : (
                    x.titulo
                  )}
                </h3>
                {x.resumen && <p>{x.resumen}</p>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </SeccionNumerada>
  )
}
