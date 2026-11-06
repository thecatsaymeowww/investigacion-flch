import type { DatosLanding } from '@/lib/cms'
import p from './PlantillaGrupo.module.css'

type Cifra = NonNullable<DatosLanding>['cifras'][number]

/**
 * Cifras calculadas en lib/cms (nunca escritas a mano), en el orden de la Plantilla Grupo: publicaciones, miembros y
 * líneas de investigación. La referencia muestra además «Proyectos», pero el modelo no tiene ninguna fuente de
 * proyectos: el indicador se omite (no se sustituye por actividades, que no son proyectos) y las tres cifras reparten
 * la fila. Las etiquetas y notas son las editables de la landing; las de las líneas, las de la referencia.
 */
export function CifrasGrupo({ cifras, lineas }: { cifras: Cifra[]; lineas: number }) {
  const [, integrantes, publicaciones] = cifras
  const lista = [publicaciones, integrantes, { valor: String(lineas), etiqueta: 'Líneas', nota: 'Líneas de investigación registradas.' }]
  return (
    <section id="cifras" className={p.cifras} aria-label="El grupo en cifras">
      <dl className={`${p.cifrasLista} ${p.cifrasTres}`}>
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
