import Link from 'next/link'
import type { DatosLanding } from '@/lib/cms'
import n from './NavGrupo.module.css'

/** Apartados de la Plantilla Grupo (Claude Design, estructura de ADISCO) y, después, las secciones propias del grupo. */
const ENLACES: [string, string][] = [
  ['presentacion', 'Presentación'],
  ['objetivos', 'Objetivos'],
  ['servicios', 'Servicios'],
  ['lineas', 'Líneas'],
  ['infraestructura', 'Infraestructura'],
  ['miembros', 'Miembros'],
  ['publicaciones', 'Publicaciones'],
  ['actividades', 'Actividades'],
  ['agenda', 'Agenda'],
  ['galeria', 'Galería'],
]

/** Apartados que este grupo no muestra porque no tiene contenido para ellos: no se enlazan. */
export function seccionesOcultas(d: NonNullable<DatosLanding>): string[] {
  const inv = d.investigacion
  return [
    !inv.objetivoGeneral && !inv.objetivos.length && 'objetivos',
    !inv.servicios.length && 'servicios',
    !inv.lineas.length && 'lineas',
    !d.galeria.length && 'galeria',
  ].filter((x): x is string => Boolean(x))
}

type Props = {
  /** Ruta del grupo: "adisco". */
  ruta: string
  /** Nombre corto (sigla) del grupo. */
  nombre: string
  pagina: 'portada' | 'archivo'
  /** Secciones que este grupo no muestra (sin contenido): no se enlazan. */
  ocultas?: string[]
}

/** Barra fija del grupo: vuelta al directorio, sigla, apartados y «Contacto». En móvil los apartados se desplazan en horizontal. */
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
            Contacto
          </a>
        </div>
      </div>
    </nav>
  )
}
