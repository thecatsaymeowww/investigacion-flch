import type { DatosLanding } from '@/lib/cms'
import { fechaLarga } from '@/lib/utils'
import { Foto } from './Foto'
import { Seccion } from './Seccion'
import b from './base.module.css'
import s from './ActividadesGrupo.module.css'

/** La actividad más reciente en grande y las demás en la columna lateral. */
export function ActividadesGrupo({ actividades }: { actividades: NonNullable<DatosLanding>['actividades'] }) {
  if (!actividades.length) {
    return (
      <Seccion id="actividades" titulo="Actividades destacadas">
        <p className={b.vacio}>Todavía no hay actividades publicadas.</p>
      </Seccion>
    )
  }
  const [d, ...secundarias] = [...actividades].sort((a, b) => b.fecha.localeCompare(a.fecha))
  return (
    <Seccion id="actividades" titulo="Actividades destacadas">
      <div className={s.act}>
        <article className={s.principal}>
          <Foto img={d.imagen} alt={d.titulo} pista="foto · actividad principal" className={s.foto} sizes="(max-width: 900px) 100vw, 60vw" />
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
            <p className={s.lugar}>{d.lugar}</p>
            {d.url && (
              <a href={d.url} className={s.enlace} target="_blank" rel="noopener">
                Ver la actividad completa →
              </a>
            )}
          </div>
        </article>
        {secundarias.length > 0 && (
          <div className={s.lateral}>
            {secundarias.map((a) => (
              <article key={a.id} className={s.item}>
                <span className={b.etiqueta}>
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
              </article>
            ))}
          </div>
        )}
      </div>
    </Seccion>
  )
}
