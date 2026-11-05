import Link from 'next/link'
import b from '@/components/flch/base.module.css'
import { Cabecera } from '@/components/flch/Cabecera'
import h from '@/components/flch/CabeceraArchivo.module.css'
import { Pie } from '@/components/flch/Pie'
import { TemaFlch } from '@/components/temas/TemaFlch'

export default function NoEncontrado() {
  return (
    <TemaFlch>
      <Cabecera />
      <main className={b.principal}>
        <section className={`oscuro ${h.cab}`}>
          <div className={h.inner}>
            <span className={h.kicker}>Error 404</span>
            <h1 className={h.h1}>Esta página no existe</h1>
            <p className={h.texto}>Puede que el grupo aún no tenga su landing publicada.</p>
            <div className={h.acciones}>
              <Link href="/" className={h.oro}>
                Ver todos los grupos
              </Link>
            </div>
          </div>
        </section>
      </main>
      <Pie variante="directorio" />
    </TemaFlch>
  )
}
