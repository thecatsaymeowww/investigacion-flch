import type { CSSProperties } from 'react'
import type { DatosLanding } from '@/lib/cms'
import p from './PlantillaGrupo.module.css'

type Cifra = NonNullable<DatosLanding>['cifras'][number]

/** Valor con dato real: ni vacío, ni nulo convertido a texto, ni cero. */
const conDato = (valor: string) => Boolean(valor) && valor !== 'null' && valor !== 'undefined' && valor !== '0'

/**
 * Cifras de la Plantilla Grupo: año de fundación, integrantes y líneas de investigación. Los valores se calculan en
 * lib/cms (nunca escritos a mano); las etiquetas y notas del año y de los integrantes son las editables de la landing,
 * y las de las líneas, fijas. Una cifra sin dato o con la etiqueta vacía no se muestra; si no queda ninguna, tampoco
 * la sección. Publicaciones y actividades no se muestran en los grupos (sí en los subgrupos).
 */
export function CifrasGrupo({ cifras, lineas }: { cifras: Cifra[]; lineas: number }) {
  const [fundacion, integrantes] = cifras
  const lista = [
    fundacion ?? null,
    integrantes ?? null,
    { valor: String(lineas), etiqueta: 'Líneas de investigación', nota: 'Líneas de investigación registradas.' },
  ].filter((x): x is Cifra => x !== null && Boolean(x.etiqueta.trim()) && conDato(x.valor))
  if (lista.length === 0) return null
  return (
    <section id="cifras" className={p.cifras} aria-label="El grupo en cifras">
      <dl className={`${p.cifrasLista} ${p.cifrasTres}`} style={{ '--columnas': lista.length } as CSSProperties}>
        {lista.map((x, i) => (
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
