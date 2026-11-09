import { withPayload } from '@payloadcms/next/withPayload'

/**
 * Cabeceras de seguridad para todo el sitio, el panel y la API. La CSP es MÍNIMA a propósito: solo directivas que no
 * afectan a scripts ni estilos (Next y el panel de Payload usan scripts y estilos en línea; una CSP de script-src y
 * style-src necesita nonces y otra fase de pruebas). HSTS se fija en el proxy HTTPS, no aquí.
 */
const CSP = "frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'"
const cabecerasDeSeguridad = [
  { key: 'Content-Security-Policy', value: CSP },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=()' },
]

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Imagen de Docker (Dockerfile): servidor mínimo en .next/standalone, sin node_modules completos.
  output: 'standalone',
  // Los archivos los entrega Payload (/api/media/file/...) con su control de acceso;
  // se muestran con <img> igual que en el prototipo, sin pasar por el optimizador.
  images: { unoptimized: true },
  // Sin X-Powered-By (ni el de Next ni el «Next.js, Payload» que añade withPayload si no se desactiva aquí).
  poweredByHeader: false,
  // Archivos servidos (subfase 5a, punto 1.8): la misma CSP más `sandbox`, para que un PDF (o cualquier archivo abierto
  // directamente) no ejecute nada con el origen del sitio. Va en TODOS los archivos, no por extensión: el tipo servido
  // sale del contenido y un PDF puede llevar otro nombre. En una imagen mostrada con <img>, sandbox no tiene efecto.
  // Next aplica estas cabeceras sobre las de la respuesta (las de `modifyResponseHeaders` de media, lib/archivos.ts):
  // si dos reglas fijan la misma, gana la última.
  headers: async () => [
    { source: '/:path*', headers: cabecerasDeSeguridad },
    { source: '/api/media/file/:path*', headers: [{ key: 'Content-Security-Policy', value: `${CSP}; sandbox` }] },
  ],
}

export default withPayload(nextConfig)
