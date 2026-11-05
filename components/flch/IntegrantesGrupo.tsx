import { FichaIntegrante } from '@/components/landing/FichaIntegrante'
import type { DatosLanding } from '@/lib/cms'
import { iniciales } from '@/lib/utils'
import { Seccion } from './Seccion'
import b from './base.module.css'
import s from './IntegrantesGrupo.module.css'

type Datos = NonNullable<DatosLanding>

/** Tarjetas de integrantes (retrato 4:5, rol y nombre). El retrato abre la ficha con la biografía. */
export function IntegrantesGrupo({ intro, integrantes }: { intro: string; integrantes: Datos['integrantes'] }) {
  const n = integrantes.length
  return (
    <Seccion
      id="integrantes"
      titulo="Integrantes"
      extra={
        n > 0 && (
          <span className={b.extra}>
            {n} {n === 1 ? 'integrante' : 'integrantes'}
          </span>
        )
      }
    >
      {intro && <p className={s.intro}>{intro}</p>}
      {n > 0 ? (
        <div className={s.grilla}>
          {integrantes.map((m, i) => (
            <article key={m.id} className={s.tarjeta}>
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
                {m.rol && <span className={b.etiqueta}>{m.rol}</span>}
                <h3 className={s.nombre}>{m.nombre}</h3>
              </div>
            </article>
          ))}
        </div>
      ) : (
        !intro && <p className={b.vacio}>Todavía no hay integrantes publicados.</p>
      )}

      <FichaIntegrante clases={s}>
        {integrantes.map((m, i) => (
          <div key={m.id} className={s.cuerpo} data-ficha-item={i} hidden>
            <div className={s.fotoFicha}>
              {m.foto ? (
                <img src={m.foto.src} srcSet={m.foto.srcSet} sizes="160px" alt={m.nombre} loading="lazy" decoding="async" />
              ) : (
                <span className={s.ini}>{iniciales(m.nombre)}</span>
              )}
            </div>
            <div className={s.texto}>
              <div className={s.cab}>
                {m.rol && <p className={b.etiqueta}>{m.rol}</p>}
                <h3 className={s.fichaNombre} data-titulo>
                  {m.nombre}
                </h3>
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
    </Seccion>
  )
}
