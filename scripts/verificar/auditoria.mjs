/**
 * Auditoría de las dependencias de producción (consulta el registro de npm: envía nombres y versiones, nada más).
 *   1. `pnpm audit --prod --audit-level=high`: cualquier aviso alto o crítico hace fallar, haya excepción o no.
 *   2. `pnpm audit --prod --json`: lista TODOS los avisos, también los bajos y moderados, sin filtrar ninguno.
 * Cada aviso bajo o moderado debe estar en excepciones-auditoria.json con su motivo y fecha de revisión:
 *   - con excepción vigente → AVISOS (se muestra igual);
 *   - sin excepción, o con la fecha de revisión vencida → FALLIDO.
 * Uso suelto: pnpm verificar:auditoria
 */
import { readFileSync } from 'node:fs'
import { APROBADO, AVISOS, FALLIDO, NO_EJECUTADA, pnpm, siEsPrincipal } from './comun.mjs'

// Sin BOM: algunos editores de Windows lo añaden y JSON.parse no lo admite.
const EXCEPCIONES = JSON.parse(readFileSync(new URL('./excepciones-auditoria.json', import.meta.url), 'utf8').replace(/^﻿/, ''))
const ORDEN = ['critical', 'high', 'moderate', 'low', 'info']
const hoy = () => new Date().toISOString().slice(0, 10)

export async function comprobar() {
  console.log('  $ pnpm audit --prod --audit-level=high')
  const umbral = await pnpm(['audit', '--prod', '--audit-level=high'])
  if (umbral.codigo === null) return { estado: NO_EJECUTADA, detalle: 'no se pudo lanzar pnpm' }

  const r = await pnpm(['audit', '--prod', '--json'], { capturar: true })
  let informe
  try {
    informe = JSON.parse(r.salida)
  } catch {
    return { estado: NO_EJECUTADA, detalle: 'pnpm audit no devolvió un informe (¿sin conexión con el registro?)' }
  }
  if (informe.error || !informe.metadata) return { estado: NO_EJECUTADA, detalle: `pnpm audit: ${informe.error?.message ?? 'informe incompleto'}` }

  const avisos = Object.values(informe.advisories ?? {}).sort((a, b) => ORDEN.indexOf(a.severity) - ORDEN.indexOf(b.severity))
  const v = informe.metadata.vulnerabilities
  console.log(`\n  Avisos (todos): ${v.critical} críticos, ${v.high} altos, ${v.moderate} moderados, ${v.low} bajos, ${v.info ?? 0} info`)
  const problemas = []
  for (const a of avisos) {
    const id = a.github_advisory_id
    const ex = EXCEPCIONES.find((e) => e.id === id)
    const rutas = [...new Set(a.findings.flatMap((f) => f.paths))]
    let situacion
    if (a.severity === 'critical' || a.severity === 'high') {
      situacion = 'NO ADMISIBLE: alto o crítico'
      problemas.push(`${id} ${a.module_name} (${a.severity})`)
    } else if (!ex) {
      situacion = 'SIN EXCEPCIÓN: corregirlo o documentarlo en excepciones-auditoria.json'
      problemas.push(`${id} ${a.module_name} sin excepción`)
    } else if (ex.revisar < hoy()) {
      situacion = `EXCEPCIÓN VENCIDA el ${ex.revisar}: revisarla`
      problemas.push(`${id} ${a.module_name} con excepción vencida`)
    } else {
      situacion = `excepción documentada, revisar el ${ex.revisar} ${ex.condicion ?? ''}`.trim()
    }
    console.log(`  - ${a.severity.toUpperCase()} ${a.module_name} ${a.vulnerable_versions} · ${id} · ${a.title}`)
    console.log(
      `      corregido en: ${a.patched_versions || '(sin versión corregida)'} · ruta: ${rutas[0] ?? '?'}${rutas.length > 1 ? ` (+${rutas.length - 1})` : ''}`,
    )
    console.log(`      ${situacion}`)
    if (ex) console.log(`      motivo: ${ex.motivo}`)
  }
  for (const e of EXCEPCIONES) {
    if (!avisos.some((a) => a.github_advisory_id === e.id))
      console.log(`  · la excepción ${e.id} (${e.paquete}) ya no aparece: retirarla de excepciones-auditoria.json`)
  }

  if (umbral.codigo !== 0 && v.critical + v.high === 0) problemas.push(`pnpm audit --audit-level=high terminó con código ${umbral.codigo}`)
  if (problemas.length) return { estado: FALLIDO, detalle: problemas.join('; ') }
  if (avisos.length)
    return { estado: AVISOS, detalle: `0 altos/críticos; ${avisos.length} aviso(s) con excepción vigente: ${avisos.map((a) => a.module_name).join(', ')}` }
  return { estado: APROBADO, detalle: 'sin avisos' }
}

await siEsPrincipal(import.meta.url, comprobar)
