import { metadatosLanding, PaginaLanding } from '@/components/paginas/PaginaLanding'

// Subgrupo: /<grupo>/<subgrupo>. Misma landing que un grupo; para el CMS es un grupo independiente.
type Props = { params: Promise<{ grupo: string; subgrupo: string }> }

export async function generateMetadata({ params }: Props) {
  const { grupo, subgrupo } = await params
  return metadatosLanding(`${grupo}/${subgrupo}`)
}

export default async function LandingSubgrupo({ params }: Props) {
  const { grupo, subgrupo } = await params
  return <PaginaLanding ruta={`${grupo}/${subgrupo}`} />
}
