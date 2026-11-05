import type { DatosLanding } from '@/lib/cms'
import { Seccion } from './Seccion'
import c from './CifrasGrupo.module.css'

type Cifra = NonNullable<DatosLanding>['cifras'][number]

/**
 * Cifras calculadas en lib/cms (nunca escritas a mano). Orden de la referencia: publicaciones, integrantes,
 * tercera cifra (allí «proyectos», aquí actividades: el modelo no tiene proyectos) y fundación.
 */
export function CifrasGrupo({ cifras }: { cifras: Cifra[] }) {
  const [fundacion, integrantes, publicaciones, actividades] = cifras
  return (
    <Seccion id="cifras" titulo="En cifras" compacta>
      <dl className={c.cifras}>
        {[publicaciones, integrantes, actividades, fundacion].filter(Boolean).map((x, i) => (
          <div key={i} className={c.cifra}>
            <dt className={c.etiqueta}>{x.etiqueta}</dt>
            <dd className={c.valor}>{x.valor}</dd>
            {x.nota && <dd className={c.nota}>{x.nota}</dd>}
          </div>
        ))}
      </dl>
    </Seccion>
  )
}
