import { FichaIntegrante } from '@/components/landing/FichaIntegrante'
import type { DatosLanding } from '@/lib/cms'
import { iniciales } from '@/lib/utils'
import b from './base.module.css'
import { SeccionNumerada } from './InvestigacionGrupo'
import s from './IntegrantesGrupo.module.css'
import p from './PlantillaGrupo.module.css'

type Integrante = NonNullable<DatosLanding>['integrantes'][number]

/** Bloques de la referencia ADISCO: titulares y adherentes; quien aún no tiene tipo, aparte (no se oculta a nadie). */
function agrupar(integrantes: Integrante[]) {
  const sinTipo = integrantes.filter((m) => !m.tipo)
  return [
    { titulo: 'Titulares', items: integrantes.filter((m) => m.tipo === 'titular') },
    { titulo: 'Adherentes', items: integrantes.filter((m) => m.tipo === 'adherente') },
    { titulo: sinTipo.length === integrantes.length ? 'Integrantes' : 'Otros integrantes', items: sinTipo },
  ].filter((g) => g.items.length)
}

/**
 * Miembros (Plantilla Grupo): lista por tipo de investigador, con retrato o iniciales, «vínculo · facultad» (o el grado,
 * si no hay) y la insignia del coordinador. Con biografía, la fila abre la ficha del integrante.
 */
export function IntegrantesGrupo({ n, intro, integrantes }: { n: number; intro: string; integrantes: Integrante[] }) {
  const total = integrantes.length
  // Índice de cada integrante en la lista completa: es el que enlaza su fila con su ficha.
  const indice = new Map(integrantes.map((m, i) => [m.id, i]))
  return (
    <SeccionNumerada id="miembros" n={n} titulo="Miembros" resumen={`${total} ${total === 1 ? 'miembro registrado' : 'miembros registrados'}`}>
      <div className={p.miembros}>
        {intro && <p className={p.intro}>{intro}</p>}
        {total === 0 && !intro && <p className={b.vacio}>Todavía no hay integrantes publicados.</p>}
        {agrupar(integrantes).map((g) => (
          <div key={g.titulo} className={p.grupoMiembros}>
            <div className={p.grupoCab}>
              <h3 className={p.grupoTitulo}>{g.titulo}</h3>
              <span className={p.grupoCuenta}>{g.items.length}</span>
            </div>
            {g.items.map((m) => {
              const detalle = [m.vinculo, m.facultad].filter(Boolean).join(' · ') || m.rol
              const contenido = (
                <>
                  <span className={p.avatar} aria-hidden="true">
                    {m.foto ? <img src={m.foto.src} srcSet={m.foto.srcSet} sizes="44px" alt="" loading="lazy" decoding="async" /> : iniciales(m.nombre)}
                  </span>
                  <span className={p.miembroTexto}>
                    <span className={p.miembroNombre}>{m.nombre}</span>
                    {detalle && <span className={p.miembroDetalle}>{detalle}</span>}
                  </span>
                  {m.coordinador && <span className={p.insignia}>Coordinador</span>}
                </>
              )
              return m.bio.length > 0 ? (
                <button
                  key={m.id}
                  type="button"
                  className={`${p.miembro} ${p.miembroBoton}`}
                  data-abrir-ficha={indice.get(m.id)}
                  aria-haspopup="dialog"
                  aria-label={`Ver biografía de ${m.nombre}`}
                >
                  {contenido}
                </button>
              ) : (
                <div key={m.id} className={p.miembro}>
                  {contenido}
                </div>
              )
            })}
          </div>
        ))}
      </div>

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
                  {m.bio.map((x, j) => (
                    <p key={j}>{x}</p>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
      </FichaIntegrante>
    </SeccionNumerada>
  )
}
