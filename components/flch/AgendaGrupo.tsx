'use client'

import { DIAS, fechaCorta, useAgenda, type Evento } from '@/lib/agenda'
import b from './base.module.css'
import s from './AgendaGrupo.module.css'

/** Calendario mensual y lista de citas del mes (o del día elegido). La lógica es la de lib/agenda. */
export function AgendaGrupo({ eventos, hoyServidor }: { eventos: Evento[]; hoyServidor: string }) {
  const a = useAgenda(eventos, hoyServidor)
  return (
    <section id="agenda" className={b.seccion} aria-labelledby="agenda-titulo">
      <div className={b.cab}>
        <h2 id="agenda-titulo" className={b.h2}>
          Agenda
        </h2>
      </div>
      <div className={s.agenda}>
        <div className={s.cal}>
          <div className={s.barra}>
            <button type="button" className={s.flecha} onClick={() => a.mover(-1)} aria-label="Mes anterior">
              ←
            </button>
            <span className={s.mes} aria-live="polite">
              {a.mes}
            </span>
            <button type="button" className={s.flecha} onClick={() => a.mover(1)} aria-label="Mes siguiente">
              →
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
                    aria-pressed={evs.length ? c.sel : undefined}
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
            <span className={s.listaTitulo}>{a.tituloLista}</span>
            {a.sel && (
              <button type="button" className={s.todo} onClick={a.verMes}>
                Ver todo el mes
              </button>
            )}
          </div>
          {a.lista.length ? (
            a.lista.map((e, i) => (
              <div key={i} className={s.ev}>
                <div className={s.evFecha}>
                  <span className={s.evDia}>{fechaCorta(e.date).dia}</span>
                  <span className={s.evMes}>{fechaCorta(e.date).mes}</span>
                </div>
                <div className={s.evTexto}>
                  <span className={s.evTipo}>
                    {e.kind} · {e.time}
                  </span>
                  <span className={s.evTit}>{e.title}</span>
                  <span className={s.evLugar}>{e.place}</span>
                </div>
              </div>
            ))
          ) : (
            <p className={b.vacio}>Sin actividades programadas.</p>
          )}
        </div>
      </div>
    </section>
  )
}
