import type { DatosLanding } from '@/lib/cms'
import s from './Aliados.module.css'

export function Aliados({ aliados }: { aliados: NonNullable<DatosLanding>['aliados'] }) {
  if (!aliados.length) return null
  return (
    <section id="aliados" className="seccion">
      <div className="seccion__cabecera">
        <h2 className="h2">Con el apoyo de</h2>
        <span className="bajada">Instituciones aliadas del grupo</span>
      </div>
      <ul className={s.aliados}>
        {aliados.map((a) => {
          const contenido = (
            <>
              {a.logo ? (
                <img src={a.logo.src} srcSet={a.logo.srcSet} sizes="200px" alt={a.nombre} loading="lazy" decoding="async" />
              ) : (
                <span className={s.nombre}>{a.nombre}</span>
              )}
              {a.url && <span className={s.ir}>Visitar sitio →</span>}
            </>
          )
          return (
            <li key={a.nombre}>
              {/* Sin enlace no hay acción (sin acciones decorativas) */}
              {a.url ? (
                <a href={a.url} target="_blank" rel="noopener" className={s.aliado}>
                  {contenido}
                </a>
              ) : (
                <div className={s.aliado}>{contenido}</div>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
