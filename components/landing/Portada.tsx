import type { DatosLanding } from '@/lib/cms'

export type Pub = NonNullable<DatosLanding>['publicaciones'][number]

/** Tarjeta de publicación (portada 3:4 + ficha). Usada en la landing y en /archivo. */
export function Portada({ pub, conCodigo = false, conPdf = false }: { pub: Pub; conCodigo?: boolean; conPdf?: boolean }) {
  return (
    <article className="pub">
      <div className={`portada${pub.portada ? ' portada--con-img' : ''}`}>
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
        <div className="portada__meta">
          <span>{pub.tipo}</span>
          {conCodigo && pub.codigo && <span>{pub.codigo}</span>}
        </div>
        {!pub.portada && <span className="portada__pista">portada</span>}
        <span className="portada__anio">{pub.anio}</span>
      </div>
      <div className="pub__info">
        <h3 className="pub__titulo">{pub.titulo}</h3>
        <span className="pub__autor">{pub.autoria}</span>
        {conPdf && pub.pdf && (
          <a className="pub__pdf" href={pub.pdf} target="_blank" rel="noopener">
            Consultar PDF →
          </a>
        )}
        {pub.url && (
          <a className="pub__pdf" href={pub.url} target="_blank" rel="noopener">
            Ver en editorial →
          </a>
        )}
      </div>
    </article>
  )
}
