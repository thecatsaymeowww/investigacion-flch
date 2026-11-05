import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { enviarPropuesta } from '@/app/(sitio)/[grupo]/acciones'
import { ActividadesGrupo } from '@/components/flch/ActividadesGrupo'
import { AgendaGrupo } from '@/components/flch/AgendaGrupo'
import { AliadosGrupo } from '@/components/flch/AliadosGrupo'
import b from '@/components/flch/base.module.css'
import { Cabecera } from '@/components/flch/Cabecera'
import { CifrasGrupo } from '@/components/flch/CifrasGrupo'
import { GaleriaGrupo } from '@/components/flch/GaleriaGrupo'
import { HeroGrupo } from '@/components/flch/HeroGrupo'
import { IntegrantesGrupo } from '@/components/flch/IntegrantesGrupo'
import { NavGrupo } from '@/components/flch/NavGrupo'
import { Pie } from '@/components/flch/Pie'
import { PublicacionesGrupo } from '@/components/flch/PublicacionesGrupo'
import { SubgruposGrupo } from '@/components/flch/SubgruposGrupo'
import { Actividades } from '@/components/landing/Actividades'
import { Agenda } from '@/components/landing/Agenda'
import { Aliados } from '@/components/landing/Aliados'
import { Cifras } from '@/components/landing/Cifras'
import { Colaborar } from '@/components/landing/Colaborar'
import { Footer } from '@/components/landing/Footer'
import { FranjaInstitucional } from '@/components/landing/FranjaInstitucional'
import { Galeria } from '@/components/landing/Galeria'
import { Hero } from '@/components/landing/Hero'
import { Integrantes } from '@/components/landing/Integrantes'
import { Nav } from '@/components/landing/Nav'
import { Publicaciones } from '@/components/landing/Publicaciones'
import { TemaFlch } from '@/components/temas/TemaFlch'
import { TemaPrensa } from '@/components/temas/TemaPrensa'
import { emitirMarca } from '@/lib/antispam'
import { listarGrupos, obtenerLanding, type DatosLanding, type EntradaDirectorio } from '@/lib/cms'
import { etiquetaEscuela } from '@/lib/escuelas'
import { usaTemaPrensa } from '@/lib/temas'
import { hoyLima } from '@/lib/utils'

/** Metadatos de la landing de un grupo o subgrupo. */
export async function metadatosLanding(ruta: string): Promise<Metadata> {
  const d = await obtenerLanding(ruta)
  if (!d) return {}
  const id = d.identidad
  return { title: `${id.nombre} · ${id.grupo} · ${id.sigla}`, description: id.lema }
}

/** Landing completa. Grupos y subgrupos usan la misma página: solo cambia la ruta (y el tema, ver lib/temas). */
export async function PaginaLanding({ ruta }: { ruta: string }) {
  const d = await obtenerLanding(ruta)
  if (!d) notFound()
  if (usaTemaPrensa(d.grupo.ruta)) return <LandingPrensa d={d} />
  return <LandingFlch d={d} subgrupos={d.grupo.padre ? [] : await subgruposDe(d.grupo.ruta)} />
}

/**
 * Subgrupos publicados de un grupo principal, tomados del directorio ya calculado (lib/cms, listarGrupos: lectura
 * pública con overrideAccess: false, solo grupos activos con landing publicada). Sin consultas ni relaciones nuevas.
 */
async function subgruposDe(ruta: string) {
  return (await listarGrupos()).find((g) => g.ruta === ruta)?.subgrupos ?? []
}

/** Formulario de colaboración: el grupo sale de la ruta ligada en el servidor, nunca del cliente. */
const propsColaborar = (d: NonNullable<DatosLanding>) => ({
  etiqueta: d.colaborar.etiqueta,
  titular: d.colaborar.titular,
  texto: d.colaborar.texto,
  tipos: d.colaborar.tipos.length ? d.colaborar.tipos : ['Otro'],
  firma: {
    grupo: d.identidad.grupo,
    universidad: d.identidad.universidad,
    sigla: d.identidad.sigla,
    escuela: etiquetaEscuela(d.grupo.escuela),
    ciudad: d.identidad.ciudad,
    pais: d.identidad.pais,
  },
  marca: emitirMarca(d.grupo.ruta),
  accion: enviarPropuesta.bind(null, d.grupo.ruta),
})

/** Plantilla Grupo (Claude Design): la de todos los grupos salvo los de tema propio. */
function LandingFlch({ d, subgrupos }: { d: NonNullable<DatosLanding>; subgrupos: EntradaDirectorio['subgrupos'] }) {
  return (
    <TemaFlch>
      <Cabecera />
      <NavGrupo ruta={d.grupo.ruta} nombre={d.identidad.nombre} pagina="portada" ocultas={d.galeria.length ? [] : ['galeria']} />
      <HeroGrupo d={d} />
      <main className={`${b.contenedor} ${b.principal}`}>
        <CifrasGrupo cifras={d.cifras} />
        <SubgruposGrupo subgrupos={subgrupos} />
        <IntegrantesGrupo intro={d.integrantesIntro} integrantes={d.integrantes} />
        <AliadosGrupo aliados={d.aliados} />
        <PublicacionesGrupo ruta={d.grupo.ruta} publicaciones={d.publicaciones} />
        <ActividadesGrupo actividades={d.actividades} />
        <AgendaGrupo eventos={d.eventos} hoyServidor={hoyLima()} />
        <GaleriaGrupo galeria={d.galeria} />
        <Colaborar {...propsColaborar(d)} variante="flch" />
      </main>
      <Pie variante="grupo" />
    </TemaFlch>
  )
}

/** Diseño de periódico de Prensa y Literatura, sin cambios salvo la franja institucional (etapa 4.1, D6). */
function LandingPrensa({ d }: { d: NonNullable<DatosLanding> }) {
  const id = d.identidad
  return (
    <TemaPrensa>
      <FranjaInstitucional />
      <Nav
        ruta={d.grupo.ruta}
        nombre={id.nombre}
        padre={d.grupo.padre}
        pagina="portada"
        ocultas={[!d.aliados.length && 'aliados', !d.galeria.length && 'galeria'].filter((x): x is string => Boolean(x))}
      />
      <main className="contenedor">
        <Hero d={d} />
        <Cifras cifras={d.cifras} />
        <Integrantes intro={d.integrantesIntro} integrantes={d.integrantes} />
        <Aliados aliados={d.aliados} />
        <Publicaciones ruta={d.grupo.ruta} publicaciones={d.publicaciones} />
        <Actividades actividades={d.actividades} />
        <Agenda eventos={d.eventos} hoyServidor={hoyLima()} />
        <Galeria galeria={d.galeria} />
        <Colaborar {...propsColaborar(d)} />
      </main>
      <Footer nombre={id.nombre} grupo={id.grupo} universidad={id.universidad} />
    </TemaPrensa>
  )
}
