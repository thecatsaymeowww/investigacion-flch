import type { Pub } from '@/components/landing/Portada'
import p from './Publicaciones.module.css'

/** Publicación: portada 3:4 con tipo y año, título y autoría. En la landing y en el archivo del grupo. */
export function TarjetaPublicacion({ pub, conCodigo = false, conPdf = false }: { pub: Pub; conCodigo?: boolean; conPdf?: boolean }) {
  return (
    <article className={p.pub}>
      <div className={`${p.portada} ${pub.portada ? p.conImagen : ''}`}>
        {pub.portada && (
          <img
            src={pub.portada.src}
            srcSet={pub.portada.srcSet}
            sizes="(max-width: 700px) 50vw, 25vw"
            alt={`Portada de ${pub.titulo}`}
            loading="lazy"
            decoding="async"
          />
        )}
        <span className={p.meta}>
          <span className={p.tipo}>{pub.tipo}</span>
          {conCodigo && pub.codigo && <span className={p.codigo}>{pub.codigo}</span>}
        </span>
        {!pub.portada && (
          <span className={p.pista} aria-hidden="true">
            portada
          </span>
        )}
        <span className={p.anio}>{pub.anio}</span>
      </div>
      <div className={p.info}>
        <h3 className={p.titulo}>{pub.titulo}</h3>
        <span className={p.autor}>{pub.autoria}</span>
        {conPdf && pub.pdf && (
          <a className={p.enlace} href={pub.pdf} target="_blank" rel="noopener">
            Consultar PDF →
          </a>
        )}
        {pub.url && (
          <a className={p.enlace} href={pub.url} target="_blank" rel="noopener">
            Ver en editorial →
          </a>
        )}
      </div>
    </article>
  )
}
