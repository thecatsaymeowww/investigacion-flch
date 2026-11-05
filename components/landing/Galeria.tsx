import type { DatosLanding } from '@/lib/cms'
import { romano } from '@/lib/utils'
import s from './Galeria.module.css'

export function Galeria({ galeria }: { galeria: NonNullable<DatosLanding>['galeria'] }) {
  if (!galeria.length) return null
  return (
    <section id="galeria" className="seccion seccion--doble">
      <div className="seccion__cabecera">
        <h2 className="h2">Galería</h2>
        <span className="bajada">Láminas de archivo, encuentros y presentaciones</span>
      </div>
      <div className={s.galeria}>
        {galeria.map((g, i) => (
          <figure key={i} className={s.figura} style={{ gridRow: `span ${g.alta ? 2 : 1}` }}>
            <div className={`ph ${s.lamina}`}>
              {g.imagen && (
                <img src={g.imagen.src} srcSet={g.imagen.srcSet} sizes="(max-width: 700px) 100vw, 33vw" alt={g.pie} loading="lazy" decoding="async" />
              )}
            </div>
            <figcaption className={s.pie}>
              <span className={s.num}>{romano(i + 1)}</span>
              {g.pie}
            </figcaption>
          </figure>
        ))}
      </div>
    </section>
  )
}
