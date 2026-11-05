import type { DatosLanding } from '@/lib/cms'
import { Seccion } from './Seccion'
import s from './GaleriaGrupo.module.css'

/** Galería en mosaico: las láminas marcadas como «altas» ocupan dos filas. Sin láminas no se muestra. */
export function GaleriaGrupo({ galeria }: { galeria: NonNullable<DatosLanding>['galeria'] }) {
  if (!galeria.length) return null
  return (
    <Seccion id="galeria" titulo="Galería">
      <div className={s.galeria}>
        {galeria.map((g, i) => (
          <figure key={i} className={`${s.figura} ${g.alta ? s.alta : ''}`}>
            <div className={s.lamina}>
              {g.imagen && (
                <img
                  src={g.imagen.src}
                  srcSet={g.imagen.srcSet}
                  sizes="(max-width: 700px) 100vw, 33vw"
                  alt={g.imagen.alt || g.pie}
                  loading="lazy"
                  decoding="async"
                />
              )}
            </div>
            <figcaption className={s.pie}>{g.pie}</figcaption>
          </figure>
        ))}
      </div>
    </Seccion>
  )
}
