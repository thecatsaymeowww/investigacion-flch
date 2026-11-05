import type { CollectionBeforeValidateHook, GlobalBeforeValidateHook, Payload, PayloadRequest } from 'payload'
import { ValidationError } from 'payload'

/**
 * Rechazo de claves peligrosas en los datos de cualquier escritura (aviso GHSA-gcqx-w48m-w2h4 de deepmerge 4.3.1,
 * sin versión corregida). Payload fusiona los datos recibidos con el documento guardado (deepmerge) antes de validar
 * cada campo; una clave propia `__proto__` dentro de un valor puede alterar el prototipo del objeto resultante.
 *
 * Se rechazan las CLAVES, nunca los valores: un texto "constructor" es válido. JSON.parse (API REST, `_payload` de
 * multipart) crea `__proto__` como propiedad propia, y por eso aparece en Object.keys.
 */
const PELIGROSAS = new Set(['__proto__', 'constructor', 'prototype'])

/** Anidamiento máximo aceptado. El modelo más profundo (filas de arrays de la landing) no pasa de 3 niveles. */
export const PROFUNDIDAD_MAXIMA = 32

export type Hallazgo = { ruta: string; motivo: 'clave' | 'profundidad' }

/** Primera clave peligrosa (o exceso de profundidad) en `valor`, o null. Recorrido iterativo: sin desbordar la pila. */
export function buscarClavePeligrosa(valor: unknown): Hallazgo | null {
  const pendientes: [unknown, string, number][] = [[valor, '', 0]]
  while (pendientes.length) {
    const [v, ruta, nivel] = pendientes.pop()!
    if (v === null || typeof v !== 'object') continue
    if (nivel > PROFUNDIDAD_MAXIMA) return { ruta: ruta || '(raíz)', motivo: 'profundidad' }
    for (const clave of Object.keys(v)) {
      const sub = ruta ? `${ruta}.${clave}` : clave
      if (PELIGROSAS.has(clave)) return { ruta: sub, motivo: 'clave' }
      pendientes.push([(v as Record<string, unknown>)[clave], sub, nivel + 1])
    }
  }
  return null
}

function rechazar(hallazgo: Hallazgo, contexto: { collection?: string; global?: string }, req: PayloadRequest): never {
  const message =
    hallazgo.motivo === 'clave' ? 'Los datos contienen una clave no permitida.' : `Los datos superan la profundidad máxima (${PROFUNDIDAD_MAXIMA} niveles).`
  throw new ValidationError({ ...contexto, errors: [{ message, path: hallazgo.ruta }] }, req.t)
}

export const rechazarClavesPeligrosas: CollectionBeforeValidateHook = ({ collection, data, req }) => {
  const hallazgo = buscarClavePeligrosa(data)
  if (hallazgo) rechazar(hallazgo, { collection: collection.slug }, req)
  return data
}

export const rechazarClavesPeligrosasGlobal: GlobalBeforeValidateHook = ({ data, global, req }) => {
  const hallazgo = buscarClavePeligrosa(data)
  if (hallazgo) rechazar(hallazgo, { global: global.slug }, req)
  return data
}

/**
 * Antepone el rechazo a los hooks beforeValidate de TODAS las colecciones y globales ya inicializadas, incluidas las
 * internas que Payload añade después de los plugins (payload-preferences, payload-locked-documents,
 * payload-migrations). create, update, restoreVersion y la actualización de globales ejecutan estos hooks antes de la
 * fusión (beforeChange de campos), tanto por REST (JSON y multipart) como desde el panel o la Local API.
 */
export function protegerEscrituras(payload: Payload) {
  for (const { config } of Object.values(payload.collections)) {
    const hooks = (config.hooks.beforeValidate ??= [])
    if (hooks[0] !== rechazarClavesPeligrosas) hooks.unshift(rechazarClavesPeligrosas)
  }
  for (const global of payload.config.globals) {
    const hooks = (global.hooks.beforeValidate ??= [])
    if (hooks[0] !== rechazarClavesPeligrosasGlobal) hooks.unshift(rechazarClavesPeligrosasGlobal)
  }
}
