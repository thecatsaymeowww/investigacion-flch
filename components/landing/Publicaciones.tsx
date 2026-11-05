import Link from 'next/link'
import { Portada, type Pub } from './Portada'

export function Publicaciones({ ruta, publicaciones }: { ruta: string; publicaciones: Pub[] }) {
  // Las 4 más recientes (por año y código, descendente)
  const recientes = [...publicaciones].sort((a, b) => b.anio.localeCompare(a.anio) || b.codigo.localeCompare(a.codigo)).slice(0, 4)
  return (
    <section id="publicaciones" className="seccion">
      <div className="seccion__cabecera">
        <h2 className="h2">Publicaciones recientes</h2>
        <Link href={`/${ruta}/archivo`} className="etiqueta" style={{ fontSize: 12 }}>
          Ver todo el archivo →
        </Link>
      </div>
      {recientes.length ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 230px), 1fr))', gap: '36px 28px' }}>
          {recientes.map((p) => (
            <Portada key={p.id} pub={p} />
          ))}
        </div>
      ) : (
        <p className="bajada" style={{ margin: 0 }}>
          Todavía no hay publicaciones.
        </p>
      )}
    </section>
  )
}
