import type { DatosLanding } from '@/lib/cms'
import { cuenta, SeccionNumerada } from './InvestigacionGrupo'
import s from './GaleriaGrupo.module.css'

/**
 * Apartado numerado con la galería en mosaico: las láminas marcadas como «altas» ocupan dos filas.
 * Sin láminas no se llama (la numeración sigue a los apartados visibles).
 */
export function GaleriaGrupo({ n, galeria }: { n: number; galeria: NonNullable<DatosLanding>['galeria'] }) {
  return (
    <SeccionNumerada id="galeria" n={n} titulo="Galería" resumen={cuenta(galeria.length, 'imagen', 'imágenes')}>
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
            {g.pie && <figcaption className={s.pie}>{g.pie}</figcaption>}
          </figure>
        ))}
      </div>
    </SeccionNumerada>
  )
}
