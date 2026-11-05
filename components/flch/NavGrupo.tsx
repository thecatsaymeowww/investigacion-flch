import Link from 'next/link'
import n from './NavGrupo.module.css'

const ENLACES: [string, string][] = [
  ['cifras', 'Cifras'],
  ['integrantes', 'Integrantes'],
  ['publicaciones', 'Publicaciones'],
  ['actividades', 'Actividades'],
  ['agenda', 'Agenda'],
  ['galeria', 'Galería'],
]

type Props = {
  /** Ruta del grupo: "adisco" o "litartmo/subgrupo". */
  ruta: string
  /** Nombre corto (sigla) del grupo. */
  nombre: string
  pagina: 'portada' | 'archivo'
  /** Secciones que este grupo no muestra (sin contenido): no se enlazan. */
  ocultas?: string[]
}

/** Barra fija del grupo: vuelta al directorio, sigla, secciones y "Colaborar". En móvil las secciones se desplazan en horizontal. */
export function NavGrupo({ ruta, nombre, pagina, ocultas = [] }: Props) {
  const base = `/${ruta}`
  const ancla = (id: string) => (pagina === 'portada' ? `#${id}` : `${base}#${id}`)
  return (
    <nav className={n.nav} aria-label="Secciones del grupo">
      <div className={n.inner}>
        <Link href="/" className={n.volver}>
          <span aria-hidden="true">←</span> Grupos
        </Link>
        <span className={n.sep} aria-hidden="true" />
        <a href={pagina === 'portada' ? '#inicio' : base} className={n.sigla}>
          {nombre}
        </a>
        <div className={n.enlaces}>
          {ENLACES.filter(([id]) => !ocultas.includes(id)).map(([id, label]) => (
            <a key={id} href={ancla(id)} className={n.enlace}>
              {label}
            </a>
          ))}
          <a href={ancla('colaborar')} className={n.cta}>
            Colaborar
          </a>
        </div>
      </div>
    </nav>
  )
}
