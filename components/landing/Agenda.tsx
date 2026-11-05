'use client'

import { DIAS, fechaCorta, useAgenda, type Evento } from '@/lib/agenda'
import s from './Agenda.module.css'

export type { Evento }

/** Calendario mensual + lista de citas. Mes inicial: el actual en Lima. */
export function Agenda({ eventos, hoyServidor }: { eventos: Evento[]; hoyServidor: string }) {
  const a = useAgenda(eventos, hoyServidor)

  return (
    <section id="agenda" className="seccion">
      <div className="seccion__cabecera">
        <h2 className="h2">Agenda</h2>
        <span className="bajada">Las citas del mes en la redacción</span>
      </div>
      <div className={s.agenda}>
        <div className={s.cal}>
          <div className={s.barra}>
            <button type="button" className="btn btn--borde btn--chico" onClick={() => a.mover(-1)}>
              ← Anterior
            </button>
            <div className={s.mes} aria-live="polite">
              {a.mes}
            </div>
            <button type="button" className="btn btn--borde btn--chico" onClick={() => a.mover(1)}>
              Siguiente →
            </button>
          </div>
          <div className={s.scroll}>
            <div className={s.grilla}>
              {DIAS.map((d) => (
                <div key={d} className={s.wd}>
                  {d}
                </div>
              ))}
              {a.celdas.map((c) => {
                const evs = c.eventos
                const clases = [s.dia, !c.enMes && s.fuera, c.hoy && s.hoy, c.sel && s.sel, evs.length && s.conEv].filter(Boolean).join(' ')
                return (
                  <button
                    key={c.key}
                    type="button"
                    className={clases}
                    tabIndex={evs.length ? 0 : -1}
                    aria-label={`${c.etiqueta}${evs.length ? `, ${evs.length} actividad(es)` : ''}`}
                    onClick={evs.length ? () => a.elegir(c.key) : undefined}
                  >
                    <span className={s.num}>{c.dia}</span>
                    {evs.map((e, j) => (
                      <span key={j} className={s.pill}>
                        {e.time} {e.title}
                      </span>
                    ))}
                  </button>
                )
              })}
            </div>
          </div>
        </div>
        <div className={s.lista}>
          <div className={s.listaCab}>
            <span className="etiqueta etiqueta--azul">{a.tituloLista}</span>
            {a.sel && (
              <button type="button" className={`etiqueta ${s.todo}`} onClick={a.verMes}>
                Ver todo el mes
              </button>
            )}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            {a.lista.length ? (
              a.lista.map((e, i) => (
                <div key={i} className={s.ev}>
                  <div className={s.evFecha}>
                    <div className={s.evDia}>{fechaCorta(e.date).dia}</div>
                    <div className={s.evMon}>{fechaCorta(e.date).mes}</div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <span className={s.evTipo}>
                      {e.kind} · {e.time}
                    </span>
                    <span className={s.evTit}>{e.title}</span>
                    <span className={s.evLugar}>{e.place}</span>
                  </div>
                </div>
              ))
            ) : (
              <p style={{ margin: 0, fontStyle: 'italic', color: 'var(--texto-2)' }}>Sin actividades programadas.</p>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}
