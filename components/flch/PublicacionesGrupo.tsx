import Link from 'next/link'
import type { Pub } from '@/components/landing/Portada'
import { cuenta, SeccionNumerada } from './InvestigacionGrupo'
import { TarjetaPublicacion } from './TarjetaPublicacion'
import ps from './PlantillaGrupo.module.css'
import p from './Publicaciones.module.css'

/** Apartado numerado con las 4 publicaciones más recientes y el enlace al archivo completo del grupo. */
export function PublicacionesGrupo({ n, ruta, publicaciones }: { n: number; ruta: string; publicaciones: Pub[] }) {
  const recientes = [...publicaciones].sort((a, b) => b.anio.localeCompare(a.anio) || b.codigo.localeCompare(a.codigo)).slice(0, 4)
  return (
    <SeccionNumerada
      id="publicaciones"
      n={n}
      titulo="Publicaciones"
      resumen={publicaciones.length > 0 ? cuenta(publicaciones.length, 'publicación registrada', 'publicaciones registradas') : undefined}
      extra={
        publicaciones.length > 0 && (
          <Link href={`/${ruta}/archivo`} className={ps.cabEnlace}>
            Ver todas en el archivo →
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
        <p className={ps.vacio}>Todavía no hay publicaciones.</p>
      )}
    </SeccionNumerada>
  )
}
