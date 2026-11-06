import type { DatosLanding } from '@/lib/cms'
import p from './PlantillaGrupo.module.css'

type Datos = NonNullable<DatosLanding>
type Investigacion = Datos['investigacion']

/** Número de apartado de la referencia: «01», «02»… (se cuentan solo los apartados que se muestran). */
export const numero = (n: number) => String(n).padStart(2, '0')

/** Recuento real bajo el título de un apartado: «1 publicación», «4 publicaciones». */
export const cuenta = (n: number, singular: string, plural: string) => `${n} ${n === 1 ? singular : plural}`

type SeccionProps = {
  id: string
  n: number
  titulo: string
  /** Línea bajo el título (p. ej. «7 miembros registrados»). */
  resumen?: string
  /** Enlace bajo el resumen (p. ej. «Ver todas →» hacia el archivo). */
  extra?: React.ReactNode
  children: React.ReactNode
}

/** Apartado numerado de la Plantilla Grupo: número y título a la izquierda, contenido en las dos columnas restantes. */
export function SeccionNumerada({ id, n, titulo, resumen, extra, children }: SeccionProps) {
  return (
    <section id={id} className={p.seccion} aria-labelledby={`${id}-titulo`}>
      <div className={p.cab}>
        <span className={p.numero}>{numero(n)}</span>
        <h2 id={`${id}-titulo`} className={p.h2}>
          {titulo}
        </h2>
        {resumen && <span className={p.resumen}>{resumen}</span>}
        {extra}
      </div>
      <div className={p.cuerpo}>{children}</div>
    </section>
  )
}

/** Presentación: el «Texto» de portada de la landing, en párrafos. */
export function Presentacion({ n, texto }: { n: number; texto: string }) {
  const parrafos = texto
    .split(/\n\s*\n/)
    .map((x) => x.trim())
    .filter(Boolean)
  return (
    <SeccionNumerada id="presentacion" n={n} titulo="Presentación">
      <div className={p.presentacion}>
        {parrafos.map((x, i) => (
          <p key={i}>{x}</p>
        ))}
      </div>
    </SeccionNumerada>
  )
}

/** Objetivo general (recuadro azul) y objetivos específicos numerados. */
export function Objetivos({ n, inv }: { n: number; inv: Investigacion }) {
  return (
    <SeccionNumerada id="objetivos" n={n} titulo="Objetivos">
      <div className={p.objetivos}>
        {inv.objetivoGeneral && (
          <div className={p.general}>
            <span className={p.rotulo}>Objetivo general</span>
            <p>{inv.objetivoGeneral}</p>
          </div>
        )}
        {inv.objetivos.length > 0 && (
          <div className={p.especificos}>
            <span className={p.rotulo}>Objetivos específicos</span>
            <ol className={p.lista}>
              {inv.objetivos.map((o, i) => (
                <li key={i} className={p.objetivo}>
                  <span className={p.objetivoN} aria-hidden="true">
                    {numero(i + 1)}
                  </span>
                  <span className={p.objetivoTexto}>{o}</span>
                </li>
              ))}
            </ol>
          </div>
        )}
      </div>
    </SeccionNumerada>
  )
}

export function Servicios({ n, servicios }: { n: number; servicios: string[] }) {
  return (
    <SeccionNumerada id="servicios" n={n} titulo="Servicios">
      <ol className={p.servicios}>
        {servicios.map((s, i) => (
          <li key={i} className={p.servicio}>
            <span className={p.servicioN} aria-hidden="true">
              {i + 1}
            </span>
            <span className={p.servicioTexto}>{s}</span>
          </li>
        ))}
      </ol>
    </SeccionNumerada>
  )
}

/** Tabla Código / Línea, en el orden del panel. */
export function Lineas({ n, lineas }: { n: number; lineas: Investigacion['lineas'] }) {
  return (
    <SeccionNumerada id="lineas" n={n} titulo="Líneas de investigación">
      <table className={p.lineas}>
        <thead>
          <tr>
            <th scope="col">Código</th>
            <th scope="col">Línea</th>
          </tr>
        </thead>
        <tbody>
          {lineas.map((l, i) => (
            <tr key={i}>
              <td className={p.codigo}>{l.codigo || '—'}</td>
              <td className={p.linea}>{l.linea}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </SeccionNumerada>
  )
}

/** Ambientes físicos y equipamiento; sin registros, el aviso de la referencia (nada inventado). */
export function Infraestructura({ n, inv }: { n: number; inv: Investigacion }) {
  return (
    <SeccionNumerada id="infraestructura" n={n} titulo="Infraestructura">
      <div className={p.infra}>
        <div id="ambientes" className={p.tarjeta}>
          <h3 className={p.h3}>Ambientes físicos</h3>
          {inv.ambientes.length > 0 ? (
            inv.ambientes.map((a, i) => (
              <div key={i} className={p.item}>
                <span className={p.itemNombre}>{a.ambiente}</span>
                {a.ubicacion && <span className={p.itemNota}>{a.ubicacion}</span>}
              </div>
            ))
          ) : (
            <p className={p.vacio}>No hay ambientes registrados</p>
          )}
        </div>
        <div id="equipamiento" className={p.tarjeta}>
          <h3 className={p.h3}>Equipamiento de laboratorio</h3>
          {inv.equipos.length > 0 ? (
            inv.equipos.map((e, i) => (
              <div key={i} className={p.equipo}>
                <span className={p.equipoCodigo}>{e.codigo || '—'}</span>
                <div className={p.equipoTexto}>
                  <span className={p.itemNombre}>{e.laboratorio}</span>
                  {e.responsable && <span className={p.itemNota}>Responsable: {e.responsable}</span>}
                </div>
              </div>
            ))
          ) : (
            <p className={p.vacio}>No hay equipos registrados</p>
          )}
        </div>
      </div>
    </SeccionNumerada>
  )
}
