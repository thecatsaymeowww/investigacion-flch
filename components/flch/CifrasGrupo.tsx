import type { DatosLanding } from '@/lib/cms'
import p from './PlantillaGrupo.module.css'

type Cifra = NonNullable<DatosLanding>['cifras'][number]

/**
 * Cifras calculadas en lib/cms (nunca escritas a mano), en el orden de la Plantilla Grupo: publicaciones, miembros,
 * tercera cifra (allí «proyectos», aquí actividades: el modelo no tiene proyectos) y líneas de investigación.
 * Las etiquetas y notas son las editables de la landing; las de las líneas, las de la referencia.
 */
export function CifrasGrupo({ cifras, lineas }: { cifras: Cifra[]; lineas: number }) {
  const [, integrantes, publicaciones, actividades] = cifras
  const lista = [publicaciones, integrantes, actividades, { valor: String(lineas), etiqueta: 'Líneas', nota: 'Líneas de investigación registradas.' }]
  return (
    <section id="cifras" className={p.cifras} aria-label="El grupo en cifras">
      <dl className={p.cifrasLista}>
        {lista.filter(Boolean).map((x, i) => (
          <div key={i} className={p.cifra}>
            <dt className={p.cifraEtiqueta}>{x.etiqueta}</dt>
            <dd className={p.cifraValor}>{x.valor}</dd>
            {x.nota && <dd className={p.cifraNota}>{x.nota}</dd>}
          </div>
        ))}
      </dl>
    </section>
  )
}
