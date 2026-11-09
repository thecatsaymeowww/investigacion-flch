import type { Metadata } from 'next'
import { Public_Sans } from 'next/font/google'
import './globals.css'

// Común a los dos temas; cada tema carga su serif (components/temas). Variable: 400–700 para ambos.
// Es la única fuente precargada (subfase 5c): la usan todas las páginas.
const etiqueta = Public_Sans({ subsets: ['latin'], variable: '--fuente-etiqueta', display: 'swap' })

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'),
  title: 'Grupos de investigación · FLCH-UNMSM',
  // Icono de la pestaña: el escudo de la UNMSM (public/img/escudo-unmsm.svg, el mismo de la cabecera y del panel).
  icons: { icon: { url: '/img/escudo-unmsm.svg', type: 'image/svg+xml' } },
}

export default function SitioLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-PE" className={etiqueta.variable}>
      <body>{children}</body>
    </html>
  )
}
