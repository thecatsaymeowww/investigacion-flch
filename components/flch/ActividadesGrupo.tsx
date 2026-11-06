import type { DatosLanding } from '@/lib/cms'
import { fechaLarga } from '@/lib/utils'
import { Foto } from './Foto'
import { cuenta, SeccionNumerada } from './InvestigacionGrupo'
import ps from './PlantillaGrupo.module.css'
import s from './ActividadesGrupo.module.css'

type Actividad = NonNullable<DatosLanding>['actividades'][number]

/** Apartado numerado: la actividad más reciente en grande y las demás en tarjetas debajo, de la más nueva a la más antigua. */
export function ActividadesGrupo({ n, actividades }: { n: number; actividades: Actividad[] }) {
  if (!actividades.length) {
    return (
      <SeccionNumerada id="actividades" n={n} titulo="Actividades">
        <p className={ps.vacio}>Todavía no hay actividades publicadas.</p>
      </SeccionNumerada>
    )
  }
  const [d, ...secundarias] = [...actividades].sort((a, b) => b.fecha.localeCompare(a.fecha))
  return (
    <SeccionNumerada id="actividades" n={n} titulo="Actividades" resumen={cuenta(actividades.length, 'actividad publicada', 'actividades publicadas')}>
      <div className={s.act}>
        <article className={s.principal}>
          <Foto img={d.imagen} alt={d.titulo} sigla={d.tipo} className={s.foto} sizes="(max-width: 900px) 100vw, 60vw" />
          <div className={s.cuerpo}>
            <div className={s.meta}>
              <span className={s.badge}>Lo más reciente</span>
              <span className={s.fecha}>
                {d.tipo} · {fechaLarga(d.fecha)}
                {d.hora && ` · ${d.hora}`}
              </span>
            </div>
            <h3 className={s.titular}>{d.titulo}</h3>
            <div className={s.texto}>
              {(d.texto.length ? d.texto : [d.resumen]).map((p, i) => (
                <p key={i}>{p}</p>
              ))}
            </div>
            {d.lugar && <p className={s.lugar}>{d.lugar}</p>}
            {d.url && (
              <a href={d.url} className={s.enlace} target="_blank" rel="noopener">
                Ver la actividad completa →
              </a>
            )}
          </div>
        </article>
        {secundarias.length > 0 && (
          <ul className={s.lateral}>
            {secundarias.map((a) => (
              <li key={a.id} className={s.item}>
                <span className={s.itemTipo}>
                  {a.tipo} · {fechaLarga(a.fecha)}
                </span>
                <h3 className={s.itemTitulo}>
                  {a.url ? (
                    <a href={a.url} target="_blank" rel="noopener">
                      {a.titulo}
                    </a>
                  ) : (
                    a.titulo
                  )}
                </h3>
                {a.resumen && <p>{a.resumen}</p>}
                {a.lugar && <p className={s.lugar}>{a.lugar}</p>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </SeccionNumerada>
  )
}
