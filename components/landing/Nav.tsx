import Link from 'next/link'
import { NombreCabecera } from './NombreCabecera'
import s from './Nav.module.css'

const ENLACES: [string, string][] = [
  ['cifras', 'Cifras'],
  ['integrantes', 'Integrantes'],
  ['aliados', 'Aliados'],
  ['publicaciones', 'Publicaciones'],
  ['actividades', 'Actividades'],
  ['agenda', 'Agenda'],
  ['galeria', 'Galería'],
]

type Props = {
  /** Ruta del grupo: "litartmo" o "litartmo/subgrupo". */
  ruta: string
  nombre: string
  pagina: 'portada' | 'archivo'
  /** Grupo padre de un subgrupo: se muestra como "pertenece a" (jerarquía solo visual). */
  padre?: { ruta: string; nombre: string } | null
  /** Secciones que este grupo no muestra (sin contenido): no se enlazan. */
  ocultas?: string[]
}

export function Nav({ ruta, nombre, pagina, padre, ocultas = [] }: Props) {
  const enPortada = pagina === 'portada'
  const base = `/${ruta}`
  const ancla = (id: string) => (enPortada ? `#${id}` : `${base}#${id}`)
  const enlaces = (enPortada ? ENLACES : ENLACES.filter(([id]) => id === 'publicaciones' || id === 'agenda')).filter(([id]) => !ocultas.includes(id))
  return (
    <nav className={s.nav} aria-label="Principal">
      <div className={s.inner}>
        <div className={s.marca}>
          <a href={enPortada ? '#inicio' : base} className={s.logo}>
            <NombreCabecera nombre={nombre} />
          </a>
          {padre && (
            <Link href={`/${padre.ruta}`} className={s.padre} title={`Subgrupo de ${padre.nombre}`}>
              <span aria-hidden="true">↑</span> {padre.nombre}
            </Link>
          )}
        </div>
        <div className={s.der}>
          {enPortada ? (
            <Link href={`${base}/archivo`} className={s.sello}>
              Archivo
            </Link>
          ) : (
            <Link href={base}>← Portada</Link>
          )}
          {/* Enlaces a secciones: solo en escritorio */}
          <div className={s.links}>
            {enlaces.map(([id, label]) => (
              <a key={id} href={ancla(id)}>
                {label}
              </a>
            ))}
            <a href={ancla('colaborar')} className={s.cta}>
              Colaborar
            </a>
          </div>
        </div>
      </div>
    </nav>
  )
}
