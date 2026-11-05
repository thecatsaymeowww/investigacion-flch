import { Newsreader } from 'next/font/google'

// Newsreader variable (pesos 200–800 y eje óptico opsz), como en la referencia de Claude Design.
// Sin precarga (subfase 5c): Next junta las @font-face de los dos temas y precargaría estas en todas las páginas,
// también en las de Prensa, que no la usan. Cada página la pide al pintarla (swap, con reserva de métricas ajustadas).
const serif = Newsreader({ subsets: ['latin'], style: ['normal', 'italic'], axes: ['opsz'], variable: '--fuente-newsreader', display: 'swap', preload: false })

/** Tema institucional FLCH (Plantilla Grupo y directorio): su fuente serif y sus tokens (.tema-flch en globals.css). */
export function TemaFlch({ children }: { children: React.ReactNode }) {
  return <div className={`tema-flch ${serif.variable}`}>{children}</div>
}
