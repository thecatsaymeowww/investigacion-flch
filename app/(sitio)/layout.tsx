import type { Metadata } from 'next'
import { Public_Sans } from 'next/font/google'
import './globals.css'

// Común a los dos temas; cada tema carga su serif (components/temas). Variable: 400–700 para ambos.
// Es la única fuente precargada (subfase 5c): la usan todas las páginas.
const etiqueta = Public_Sans({ subsets: ['latin'], variable: '--fuente-etiqueta', display: 'swap' })

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'),
  title: 'Grupos de investigación · FLCH-UNMSM',
}

export default function SitioLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-PE" className={etiqueta.variable}>
      <body>{children}</body>
    </html>
  )
}
