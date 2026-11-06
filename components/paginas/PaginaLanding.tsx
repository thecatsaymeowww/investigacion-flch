import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { enviarPropuesta } from '@/app/(sitio)/[grupo]/acciones'
import b from '@/components/flch/base.module.css'
import { Cabecera } from '@/components/flch/Cabecera'
import { CifrasGrupo } from '@/components/flch/CifrasGrupo'
import { GaleriaGrupo } from '@/components/flch/GaleriaGrupo'
import { HeroGrupo } from '@/components/flch/HeroGrupo'
import { IntegrantesGrupo } from '@/components/flch/IntegrantesGrupo'
import { Infraestructura, Lineas, numero, Objetivos, Presentacion, Servicios } from '@/components/flch/InvestigacionGrupo'
import { NavGrupo, seccionesOcultas } from '@/components/flch/NavGrupo'
import { Pie } from '@/components/flch/Pie'
import { PublicacionesGrupo } from '@/components/flch/PublicacionesGrupo'
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
import { hoyLima } from '@/lib/utils'

/** Metadatos de la landing de un grupo o subgrupo. */
export async function metadatosLanding(ruta: string): Promise<Metadata> {
  const d = await obtenerLanding(ruta)
  if (!d) return {}
  const id = d.identidad
  return { title: `${id.nombre} · ${id.grupo} · ${id.sigla}`, description: id.lema }
}

/**
 * Landing completa. La plantilla sale de la relación real del grupo (`grupos.padre`), no de su nombre ni de su ruta:
 * - subgrupo → diseño y modelo de Prensa y Literatura, sin cambios;
 * - grupo de investigación → Plantilla Grupo de Claude Design, con la estructura de información de ADISCO.
 */
export async function PaginaLanding({ ruta }: { ruta: string }) {
  const d = await obtenerLanding(ruta)
  if (!d) notFound()
  if (d.grupo.esSubgrupo) return <LandingPrensa d={d} />
  return <LandingFlch d={d} subgrupos={await subgruposDe(d.grupo.ruta)} />
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

/**
 * Plantilla Grupo (Claude Design, redesign/Plantilla Grupo.dc.html) para los grupos de investigación. Apartados
 * numerados como en la referencia; los que no tienen datos (objetivos, servicios, líneas) no se muestran y la
 * numeración sigue a los visibles. Infraestructura se muestra siempre, con el aviso de «no hay registros» del diseño.
 * Tras Miembros van Publicaciones y Galería (esta solo con contenido), como apartados numerados del mismo diseño, y
 * Contactos. Los grupos de investigación no muestran aliados, actividades ni agenda (decisión del 06-11-2026); los
 * subgrupos (plantilla Prensa) los conservan.
 */
function LandingFlch({ d, subgrupos }: { d: NonNullable<DatosLanding>; subgrupos: EntradaDirectorio['subgrupos'] }) {
  const inv = d.investigacion
  let n = 0
  const sig = () => ++n
  const coordinador = d.integrantes.find((m) => m.coordinador)
  return (
    <TemaFlch>
      <Cabecera />
      <NavGrupo ruta={d.grupo.ruta} nombre={d.identidad.nombre} pagina="portada" ocultas={seccionesOcultas(d)} />
      <HeroGrupo d={d} subgrupos={subgrupos} />
      <main className={`${b.contenedor} ${b.principal}`}>
        <Presentacion n={sig()} texto={d.editorial.texto} />
        <CifrasGrupo cifras={d.cifras} lineas={inv.lineas.length} />
        {(inv.objetivoGeneral || inv.objetivos.length > 0) && <Objetivos n={sig()} inv={inv} />}
        {inv.servicios.length > 0 && <Servicios n={sig()} servicios={inv.servicios} />}
        {inv.lineas.length > 0 && <Lineas n={sig()} lineas={inv.lineas} />}
        <Infraestructura n={sig()} inv={inv} />
        <IntegrantesGrupo n={sig()} intro={d.integrantesIntro} integrantes={d.integrantes} />
        <PublicacionesGrupo n={sig()} ruta={d.grupo.ruta} publicaciones={d.publicaciones} />
        {d.galeria.length > 0 && <GaleriaGrupo n={sig()} galeria={d.galeria} />}
        <Colaborar
          {...propsColaborar(d)}
          etiqueta={`${numero(sig())} · Contactos`}
          titular={`Escriba a ${d.identidad.nombre}`}
          texto={d.colaborar.texto || TEXTO_CONTACTO}
          variante="flch"
          contacto={{ coordinacion: coordinador?.nombre ?? '', correo: inv.correo }}
        />
      </main>
      <Pie variante="grupo" />
    </TemaFlch>
  )
}

/** Texto de «Contactos» de la referencia, si el grupo no ha escrito el suyo. */
const TEXTO_CONTACTO =
  'Recibimos consultas sobre asesoría, tesis, proyectos de investigación, publicaciones y actividades conjuntas. Cuéntenos qué necesita y le responderemos.'

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
