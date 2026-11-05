import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { Archivo } from '@/components/archivo/Archivo'
import s from '@/components/archivo/Archivo.module.css'
import b from '@/components/flch/base.module.css'
import { Cabecera } from '@/components/flch/Cabecera'
import h from '@/components/flch/CabeceraArchivo.module.css'
import { NavGrupo } from '@/components/flch/NavGrupo'
import { Pie } from '@/components/flch/Pie'
import { Footer } from '@/components/landing/Footer'
import { Nav } from '@/components/landing/Nav'
import { TemaFlch } from '@/components/temas/TemaFlch'
import { TemaPrensa } from '@/components/temas/TemaPrensa'
import { obtenerLanding, type DatosLanding } from '@/lib/cms'
import { usaTemaPrensa } from '@/lib/temas'

export async function metadatosArchivo(ruta: string): Promise<Metadata> {
  const d = await obtenerLanding(ruta)
  if (!d) return {}
  return { title: `Archivo · ${d.identidad.nombre}`, description: `Libros, artículos y ediciones de ${d.identidad.grupo}` }
}

const siglas = (nombre: string) =>
  nombre
    .split(/\s+/)
    .filter((p) => p.length > 2 && /^[A-ZÁÉÍÓÚÑ]/.test(p))
    .map((p) => p[0])
    .join(' · ') || nombre.slice(0, 1)

const ordenar = (d: NonNullable<DatosLanding>) => [...d.publicaciones].sort((a, b) => b.anio.localeCompare(a.anio) || b.codigo.localeCompare(a.codigo))

/** Archivo de un grupo o subgrupo, con el tema de su landing. */
export async function PaginaArchivo({ ruta }: { ruta: string }) {
  const d = await obtenerLanding(ruta)
  if (!d) notFound()
  return usaTemaPrensa(d.grupo.ruta) ? <ArchivoPrensa d={d} /> : <ArchivoFlch d={d} />
}

/** Sin referencia propia en Claude Design: cabecera y piezas de la Plantilla Grupo. */
function ArchivoFlch({ d }: { d: NonNullable<DatosLanding> }) {
  const id = d.identidad
  return (
    <TemaFlch>
      <Cabecera />
      <NavGrupo ruta={d.grupo.ruta} nombre={id.nombre} pagina="archivo" ocultas={d.galeria.length ? [] : ['galeria']} />
      <section className={`oscuro ${h.cab}`}>
        <div className={h.inner}>
          <span className={h.kicker}>Archivo · {id.nombre}</span>
          <h1 className={h.h1}>Publicaciones</h1>
          <p className={h.texto}>Libros, artículos, capítulos y boletines del {id.grupo}.</p>
        </div>
      </section>
      <main className={`${b.contenedor} ${b.principal}`} style={{ paddingBottom: 72 }}>
        <Archivo items={ordenar(d)} variante="flch" />
      </main>
      <Pie variante="grupo" />
    </TemaFlch>
  )
}

function ArchivoPrensa({ d }: { d: NonNullable<DatosLanding> }) {
  const id = d.identidad
  return (
    <TemaPrensa>
      <Nav ruta={d.grupo.ruta} nombre={id.nombre} padre={d.grupo.padre} pagina="archivo" />
      <main className="contenedor" style={{ paddingBottom: 72 }}>
        <header style={{ paddingTop: 28 }}>
          <div className={s.barra}>
            <span>
              {id.nombre} · {id.grupo} · {id.sigla}
            </span>
            <span>Fondo documental del grupo</span>
          </div>
          <div className={s.cab}>
            <h1 className={s.h1}>Archivo</h1>
            <div className={s.sello} aria-hidden="true">
              Fondo
              <br />
              <span>{siglas(id.nombre)}</span>
              <br />
              {id.sigla}
            </div>
          </div>
          <div style={{ borderTop: '3px solid var(--tinta)', borderBottom: '1px solid var(--tinta)', height: 7 }} />
          <p className={s.lema}>Recopilación de libros, artículos, dossieres y ediciones publicadas por el grupo</p>
        </header>
        <Archivo items={ordenar(d)} />
      </main>
      <Footer nombre={id.nombre} grupo={id.grupo} universidad={id.universidad} />
    </TemaPrensa>
  )
}
