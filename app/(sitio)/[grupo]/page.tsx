import { metadatosLanding, PaginaLanding } from '@/components/paginas/PaginaLanding'

type Props = { params: Promise<{ grupo: string }> }

export async function generateMetadata({ params }: Props) {
  return metadatosLanding((await params).grupo)
}

export default async function LandingGrupo({ params }: Props) {
  return <PaginaLanding ruta={(await params).grupo} />
}
