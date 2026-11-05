import { metadatosArchivo, PaginaArchivo } from '@/components/paginas/PaginaArchivo'

type Props = { params: Promise<{ grupo: string; subgrupo: string }> }

export async function generateMetadata({ params }: Props) {
  const { grupo, subgrupo } = await params
  return metadatosArchivo(`${grupo}/${subgrupo}`)
}

export default async function ArchivoSubgrupo({ params }: Props) {
  const { grupo, subgrupo } = await params
  return <PaginaArchivo ruta={`${grupo}/${subgrupo}`} />
}
