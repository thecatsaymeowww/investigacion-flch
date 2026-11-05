import type { DatosLanding } from '@/lib/cms'
import { iniciales } from '@/lib/utils'
import { FichaIntegrante } from './FichaIntegrante'
import s from './Integrantes.module.css'

type Datos = NonNullable<DatosLanding>

export function Integrantes({ intro, integrantes }: { intro: string; integrantes: Datos['integrantes'] }) {
  return (
    <section id="integrantes" className="seccion">
      <div className={s.intro}>
        <h2 className="h2">Integrantes</h2>
        {intro && <p>{intro}</p>}
      </div>
      <div className={s.grilla}>
        {integrantes.map((m, i) => (
          <article key={m.id} className={s.miembro}>
            <button type="button" className={s.retrato} data-abrir-ficha={i} aria-haspopup="dialog" aria-label={`Ver biografía de ${m.nombre}`}>
              {m.foto ? (
                <img src={m.foto.src} srcSet={m.foto.srcSet} sizes="(max-width: 700px) 100vw, 400px" alt="" loading="lazy" decoding="async" />
              ) : (
                <>
                  <span className={s.ini}>{iniciales(m.nombre)}</span>
                  <span className={s.pista}>retrato</span>
                </>
              )}
            </button>
            <div className={s.info}>
              <div className={s.num}>Nº {String(i + 1).padStart(2, '0')}</div>
              <h3 className={s.nombre}>{m.nombre}</h3>
              {m.rol && <p className={s.rol}>{m.rol}</p>}
            </div>
          </article>
        ))}
      </div>

      {/* Vista ampliada: foto a la izquierda, nombre, grado y biografía (misma disposición que /nosotros) */}
      <FichaIntegrante>
        {integrantes.map((m, i) => (
          <div key={m.id} className={s.cuerpo} data-ficha-item={i} hidden>
            <div className={s.foto}>
              {m.foto ? (
                <img src={m.foto.src} srcSet={m.foto.srcSet} sizes="160px" alt={m.nombre} loading="lazy" decoding="async" />
              ) : (
                <span className={s.ini}>{iniciales(m.nombre)}</span>
              )}
            </div>
            <div className={s.texto}>
              <div className={s.cab}>
                <h3 className={s.fichaNombre} data-titulo>
                  {m.nombre}
                </h3>
                <p className={s.fichaRol}>{m.rol}</p>
              </div>
              {m.bio.length > 0 && (
                <div className={s.bio}>
                  {m.bio.map((p, j) => (
                    <p key={j}>{p}</p>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
      </FichaIntegrante>
    </section>
  )
}
