import type { DatosLanding } from '@/lib/cms'
import { fechaPartes, romano } from '@/lib/utils'
import { HeroCliente } from './HeroCliente'
import { Imagen } from './Imagen'
import { NombreCabecera } from './NombreCabecera'
import s from './Hero.module.css'

// Se ejecuta antes del primer pintado para que el titular no aparezca y luego desaparezca.
// Si el script de la máquina de escribir no llega a correr, a los 3 s se muestra todo igual.
const ACTIVAR_TW = `(function(el){if(matchMedia('(prefers-reduced-motion: reduce)').matches)return;el.classList.add('tw-on');setTimeout(function(){if(!el.dataset.twListo)el.classList.remove('tw-on')},3000)})(document.currentScript.parentElement)`

export function Hero({ d }: { d: NonNullable<DatosLanding> }) {
  const { identidad: id, editorial } = d
  const hoy = fechaPartes()
  const anioEdicion = romano(Math.max(1, new Date().getFullYear() - id.anioFundacion + 1))
  return (
    <header id="inicio" className={s.hero}>
      <div className={s.fecha}>
        <span>
          {id.ciudad},{' '}
          <span className={s.dia} data-dia>
            {hoy.dia}{' '}
          </span>
          <span data-fecha>{hoy.fecha}</span>
        </span>
        <span className={s.grupo}>
          {id.grupo} · {id.sigla}
        </span>
        <span>
          Año {anioEdicion}
          {id.edicion && ` · ${id.edicion}`}
        </span>
      </div>

      <div className={s.cabecera}>
        <h1 className={s.h1}>
          <NombreCabecera nombre={id.nombre} />
        </h1>
      </div>

      <div className={s.fileteDoble} />
      <p className={s.lema}>{id.lema}</p>

      <div className={s.cuerpo}>
        {/* La clase tw-on la añade el script antes de hidratar: React no debe quitarla. */}
        <div className={s.editorial} data-tw suppressHydrationWarning>
          <script dangerouslySetInnerHTML={{ __html: ACTIVAR_TW }} />
          {editorial.etiqueta && <span className="etiqueta etiqueta--azul etiqueta--ancha">{editorial.etiqueta}</span>}
          <h2 className={s.titular}>
            <span className="tw__fuente">{editorial.titular}</span>
            <span className="tw__capa" aria-hidden="true" />
          </h2>
          <p className={s.texto}>{editorial.texto}</p>
          <div className={s.botones}>
            <a href="#colaborar" className="btn btn--azul">
              Colaborar con el grupo
            </a>
            <a href="#actividades" className="btn btn--borde">
              Ver actividades
            </a>
          </div>
          <HeroCliente />
        </div>
        <figure className={s.foto}>
          <Imagen img={editorial.foto} pista="foto del grupo" ratio="4/3" prioridad />
          {(editorial.pie || editorial.credito) && (
            <figcaption>
              {editorial.pie} <span style={{ fontStyle: 'italic' }}>{editorial.credito}</span>
            </figcaption>
          )}
        </figure>
      </div>
    </header>
  )
}
