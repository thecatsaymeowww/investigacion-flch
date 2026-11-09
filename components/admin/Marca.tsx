/**
 * Marca del panel de Payload (F15): logo de la pantalla de acceso (solo texto) e icono del menú (el escudo de la UNMSM,
 * desde el 09-11-2026), con la misma identidad que la cabecera del sitio (components/flch/Cabecera: filete dorado a la
 * izquierda, azul institucional). Sin fuentes externas. Se registran en payload.config.ts
 * (`admin.components.graphics`) y llegan al panel por app/(payload)/admin/importMap.js (regenerado).
 * Colores como en app/(sitio)/globals.css (.tema-flch): azul #192b52 y oro #d9a53a (decorativo). El panel usa el tema
 * oscuro: el texto del logo toma el color de texto del tema (--theme-text) para leerse sobre el fondo oscuro.
 */
import m from './Marca.module.css'

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
        color: 'var(--theme-text)',
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

/**
 * Icono de la miga de pan del panel: el escudo de la UNMSM (public/img/escudo-unmsm.svg, el mismo de la cabecera del
 * sitio y del icono de la pestaña; decisión del usuario del 09-11-2026). Estilos en Marca.module.css.
 */
export function Icon() {
  return <img src="/img/escudo-unmsm.svg" alt="UNMSM" width={1006} height={1188} className={m.icono} />
}
