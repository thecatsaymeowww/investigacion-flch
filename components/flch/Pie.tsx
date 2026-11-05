import Link from 'next/link'
import p from './Pie.module.css'

/** Pie institucional. En las páginas de grupo lleva el enlace de vuelta al directorio; en el directorio, el horario. */
export function Pie({ variante }: { variante: 'grupo' | 'directorio' }) {
  return (
    <footer className={`oscuro ${p.pie}`}>
      <div className={p.inner}>
        <div className={p.facultad}>
          <span className={p.nombre}>Facultad de Letras y Ciencias Humanas</span>
          <span>Formando profesionales en humanidades con excelencia académica y compromiso social desde 1551. Decana de América.</span>
        </div>
        <div className={p.contacto}>
          <span className={p.titulo}>Contacto</span>
          <span>Calle Germán Amézaga N° 375, Lima, Perú</span>
          {variante === 'directorio' ? (
            <span>Lunes a Viernes · 8:00 – 17:00</span>
          ) : (
            <Link href="/" className={p.enlace}>
              Todos los grupos de investigación →
            </Link>
          )}
        </div>
      </div>
      <div className={p.legal}>© {new Date().getFullYear()} Facultad de Letras y Ciencias Humanas · Universidad Nacional Mayor de San Marcos</div>
    </footer>
  )
}
