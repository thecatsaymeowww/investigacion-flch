import Link from 'next/link'
import type { DatosLanding } from '@/lib/cms'
import { etiquetaEscuela } from '@/lib/escuelas'
import { Foto } from './Foto'
import h from './HeroGrupo.module.css'

/**
 * Identidad del grupo. Correspondencia con la referencia: sigla → nombre de la cabecera (landing.nombre),
 * nombre completo → lema, presentación → texto de portada. La línea superior lleva la escuela profesional
 * (o, si el grupo aún no la tiene, la etiqueta de portada) y, en un subgrupo, su grupo padre.
 */
export function HeroGrupo({ d }: { d: NonNullable<DatosLanding> }) {
  const { identidad: id, editorial, grupo } = d
  const linea = etiquetaEscuela(grupo.escuela) || editorial.etiqueta
  return (
    <section id="inicio" className={`oscuro ${h.hero}`}>
      <div className={h.inner}>
        <div className={h.texto}>
          {(linea || grupo.padre) && (
            <p className={h.kicker}>
              {linea && <span>{linea}</span>}
              {grupo.padre && (
                <span className={h.padre}>
                  {linea && '· '}Subgrupo de <Link href={`/${grupo.padre.ruta}`}>{grupo.padre.nombre}</Link>
                </span>
              )}
            </p>
          )}
          <h1 className={h.h1}>{id.nombre}</h1>
          {id.lema && <p className={h.nombre}>{id.lema}</p>}
          {editorial.texto && <p className={h.presentacion}>{editorial.texto}</p>}
          <div className={h.botones}>
            <a href="#colaborar" className={h.oro}>
              Colaborar con el grupo
            </a>
            <a href="#actividades" className={h.contorno}>
              Ver actividades
            </a>
          </div>
        </div>
        <figure className={h.figura}>
          <Foto img={editorial.foto} sigla={id.nombre} className={h.foto} prioridad />
          {(editorial.pie || editorial.credito) && (
            <figcaption className={h.pie}>
              {editorial.pie}
              {editorial.credito && (
                <>
                  {' '}
                  <span className={h.credito}>{editorial.credito}</span>
                </>
              )}
            </figcaption>
          )}
        </figure>
      </div>
    </section>
  )
}
