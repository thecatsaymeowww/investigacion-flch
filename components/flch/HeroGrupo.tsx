import type { DatosLanding, EntradaDirectorio } from '@/lib/cms'
import { etiquetaEscuela } from '@/lib/escuelas'
import { Foto } from './Foto'
import h from './HeroGrupo.module.css'
import { MenuSubgrupos } from './MenuSubgrupos'

/**
 * Hero de la Plantilla Grupo (Claude Design). Correspondencia: sigla → nombre de la cabecera (landing.nombre), nombre
 * completo → lema; la línea superior lleva la escuela profesional (o, si aún no la tiene, la etiqueta de portada).
 * La presentación ya no va aquí: es el apartado 01. Solo grupos de investigación (los subgrupos usan Prensa y Literatura).
 */
export function HeroGrupo({ d, subgrupos }: { d: NonNullable<DatosLanding>; subgrupos: EntradaDirectorio['subgrupos'] }) {
  const { identidad: id, editorial, grupo, investigacion } = d
  const linea = etiquetaEscuela(grupo.escuela) || editorial.etiqueta
  return (
    <section id="inicio" className={`oscuro ${h.hero}`}>
      <div className={h.inner}>
        <div className={h.texto}>
          {linea && (
            <p className={h.kicker}>
              <span>{linea}</span>
            </p>
          )}
          <h1 className={h.h1}>{id.nombre}</h1>
          {id.lema && <p className={h.nombre}>{id.lema}</p>}
          <div className={h.botones}>
            <a href="#colaborar" className={h.oro}>
              Contactar al grupo
            </a>
            {investigacion.lineas.length > 0 && (
              <a href="#lineas" className={h.contorno}>
                Líneas de investigación
              </a>
            )}
            {subgrupos.length > 0 && <MenuSubgrupos sigla={id.nombre} subgrupos={subgrupos.map((s) => ({ ruta: s.ruta, nombre: s.cabecera, lema: s.lema }))} />}
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
