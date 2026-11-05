import type { DatosLanding } from '@/lib/cms'
import s from './Cifras.module.css'

export function Cifras({ cifras }: { cifras: NonNullable<DatosLanding>['cifras'] }) {
  return (
    <section id="cifras" className={`seccion ${s.seccion}`}>
      <div className={`seccion__cabecera ${s.cabecera}`}>
        <h2 className="h2">En cifras</h2>
        <span className="bajada">El balance de una tarea paciente</span>
      </div>
      <div className={s.cifras}>
        {cifras.map((c) => (
          <div key={c.etiqueta} className={s.cifra}>
            <div className={s.valor}>{c.valor}</div>
            <div className={s.etiqueta}>{c.etiqueta}</div>
            {c.nota && <p className={s.nota}>{c.nota}</p>}
          </div>
        ))}
      </div>
    </section>
  )
}
