import Link from 'next/link'
import type { Pub } from '@/components/landing/Portada'
import { Seccion } from './Seccion'
import { TarjetaPublicacion } from './TarjetaPublicacion'
import b from './base.module.css'
import p from './Publicaciones.module.css'

/** Las 4 publicaciones más recientes y el enlace al archivo completo del grupo. */
export function PublicacionesGrupo({ ruta, publicaciones }: { ruta: string; publicaciones: Pub[] }) {
  const recientes = [...publicaciones].sort((a, b) => b.anio.localeCompare(a.anio) || b.codigo.localeCompare(a.codigo)).slice(0, 4)
  return (
    <Seccion
      id="publicaciones"
      titulo="Publicaciones recientes"
      extra={
        publicaciones.length > 0 && (
          <Link href={`/${ruta}/archivo`} className={b.enlaceExtra}>
            Ver todas →
          </Link>
        )
      }
    >
      {recientes.length ? (
        <div className={p.grilla}>
          {recientes.map((x) => (
            <TarjetaPublicacion key={x.id} pub={x} />
          ))}
        </div>
      ) : (
        <p className={b.vacio}>Todavía no hay publicaciones.</p>
      )}
    </Seccion>
  )
}
