import { Source_Serif_4 } from 'next/font/google'
import localFont from 'next/font/local'

// Old Standard TT v3.000 (SIL OFL 1.1): subconjunto `latin` de Google Fonts en WOFF2 (~230 caracteres; el resto
// se muestra con la fuente de reserva); ver app/(sitio)/fuentes/old-standard-tt/OFL.txt
// Sin precarga, como Newsreader (subfase 5c): precargadas, se descargarían también en todas las páginas del tema FLCH.
const titular = localFont({
  src: [
    { path: '../../app/(sitio)/fuentes/old-standard-tt/OldStandard-Regular-latin.woff2', weight: '400', style: 'normal' },
    { path: '../../app/(sitio)/fuentes/old-standard-tt/OldStandard-Italic-latin.woff2', weight: '400', style: 'italic' },
    { path: '../../app/(sitio)/fuentes/old-standard-tt/OldStandard-Bold-latin.woff2', weight: '700', style: 'normal' },
  ],
  variable: '--fuente-titular',
  display: 'swap',
  preload: false,
  adjustFontFallback: 'Times New Roman',
})
const texto = Source_Serif_4({
  subsets: ['latin'],
  weight: ['400', '600'],
  style: ['normal', 'italic'],
  variable: '--fuente-texto',
  display: 'swap',
  preload: false,
})

/** Tema de periódico de Prensa y Literatura: sus fuentes, sus tokens (.tema-prensa en globals.css) y la textura de papel. */
export function TemaPrensa({ children }: { children: React.ReactNode }) {
  return (
    <div className={`tema-prensa ${titular.variable} ${texto.variable}`}>
      <div className="grano" aria-hidden="true" />
      {children}
    </div>
  )
}
