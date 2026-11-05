import type { DatosLanding } from '@/lib/cms'
import { fechaLarga } from '@/lib/utils'
import s from './Actividades.module.css'

export function Actividades({ actividades }: { actividades: NonNullable<DatosLanding>['actividades'] }) {
  if (!actividades.length) {
    return (
      <section id="actividades" className="seccion">
        <div className="seccion__cabecera">
          <h2 className="h2">Actividades destacadas</h2>
        </div>
        <p className="bajada" style={{ margin: 0 }}>
          Todavía no hay actividades publicadas.
        </p>
      </section>
    )
  }
  // La más reciente es la nota principal; el resto va en la columna lateral.
  const [d, ...secundarias] = [...actividades].sort((a, b) => b.fecha.localeCompare(a.fecha))
  return (
    <section id="actividades" className="seccion">
      <div className="seccion__cabecera">
        <h2 className="h2">Actividades destacadas</h2>
        <span className="etiqueta" style={{ fontWeight: 400 }}>
          Crónica del grupo
        </span>
      </div>
      <div className={s.act}>
        <div className={s.principal}>
          <div className={s.meta}>
            <span className={`etiqueta ${s.badge}`}>Lo más reciente</span>
            <span className={s.fecha}>
              {d.tipo} · {fechaLarga(d.fecha)}
              {d.hora && ` · ${d.hora}`}
            </span>
          </div>
          <h3 className={s.titular}>{d.titulo}</h3>
          <p className={s.sub}>{d.lugar}</p>
          <div className={`ph ${s.foto}`}>
            {d.imagen ? (
              <img src={d.imagen.src} srcSet={d.imagen.srcSet} sizes="(max-width: 900px) 100vw, 60vw" alt={d.titulo} loading="lazy" decoding="async" />
            ) : (
              <span className="ph__pista">foto · actividad</span>
            )}
          </div>
          <div className={s.texto}>
            {(d.texto.length ? d.texto : [d.resumen]).map((p, i) => (
              <p key={i}>{p}</p>
            ))}
          </div>
          {d.url && (
            <a href={d.url} className="etiqueta" target="_blank" rel="noopener">
              Ver la actividad completa →
            </a>
          )}
        </div>
        <div className={s.lateral}>
          {secundarias.map((a) => (
            <div key={a.id} className={s.item}>
              <span className="etiqueta etiqueta--azul">
                {a.tipo} · {fechaLarga(a.fecha)}
              </span>
              <h4>
                {a.url ? (
                  <a href={a.url} target="_blank" rel="noopener">
                    {a.titulo}
                  </a>
                ) : (
                  a.titulo
                )}
              </h4>
              <p>{a.resumen}</p>
              <p className={s.lugar}>{a.lugar}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
