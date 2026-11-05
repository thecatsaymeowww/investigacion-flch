import { metadatosArchivo, PaginaArchivo } from '@/components/paginas/PaginaArchivo'

type Props = { params: Promise<{ grupo: string }> }

export async function generateMetadata({ params }: Props) {
  return metadatosArchivo((await params).grupo)
}

export default async function ArchivoGrupo({ params }: Props) {
  return <PaginaArchivo ruta={(await params).grupo} />
}
