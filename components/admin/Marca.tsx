/**
 * Marca del panel de Payload (F15): logo de la pantalla de acceso e icono del menú, solo con texto y la misma identidad
 * que la cabecera del sitio (components/flch/Cabecera: filete dorado a la izquierda, azul institucional). Sin imágenes
 * ni fuentes externas: el escudo se retiró en la etapa 4.1 (D2). Se registran en payload.config.ts
 * (`admin.components.graphics`) y llegan al panel por app/(payload)/admin/importMap.js (regenerado).
 * Colores como en app/(sitio)/globals.css (.tema-flch): azul #192b52 (13,9:1 sobre blanco) y oro #d9a53a (decorativo).
 */
const AZUL = '#192b52'
const ORO = '#d9a53a'

export function Logo() {
  return (
    <span
      style={{
        display: 'inline-flex',
        flexDirection: 'column',
        gap: 4,
        padding: '2px 0 2px 14px',
        borderLeft: `3px solid ${ORO}`,
        color: AZUL,
        textAlign: 'left',
      }}
    >
      <span style={{ fontFamily: 'Georgia, "Times New Roman", serif', fontSize: 22, fontWeight: 600, lineHeight: 1.2 }}>
        Facultad de Letras y Ciencias Humanas
      </span>
      <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', lineHeight: 1.4 }}>
        Universidad Nacional Mayor de San Marcos
      </span>
      <span style={{ fontSize: 13, lineHeight: 1.4 }}>Grupos de investigación</span>
    </span>
  )
}

export function Icon() {
  return (
    <span
      aria-label="FLCH"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: 24,
        padding: '0 6px',
        borderRadius: 3,
        background: AZUL,
        color: '#fff',
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: '0.06em',
        lineHeight: 1,
      }}
    >
      FLCH
    </span>
  )
}
