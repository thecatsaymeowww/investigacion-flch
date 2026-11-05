import nextVitals from 'eslint-config-next/core-web-vitals'
import nextTs from 'eslint-config-next/typescript'

const config = [
  ...nextVitals,
  ...nextTs,
  {
    // Código generado por Payload (tipos, rutas del panel y migraciones).
    ignores: ['.next/**', 'node_modules/**', 'payload-types.ts', 'app/(payload)/**', 'migrations/**'],
  },
  {
    rules: {
      // Las imágenes las sirve Payload con control de acceso y se muestran con <img>
      // como en el prototipo (sin optimizador: next.config images.unoptimized).
      '@next/next/no-img-element': 'off',
    },
  },
]

export default config
