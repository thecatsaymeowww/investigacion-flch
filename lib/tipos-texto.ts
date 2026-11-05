import type { CollectionBeforeValidateHook, CollectionConfig, Field } from 'payload'
import { ValidationError } from 'payload'

/**
 * Los campos de texto (text, textarea, email) solo admiten cadenas. Payload no comprueba el tipo: un objeto o un
 * array llegaba a la base convertido a JSON por el driver de Postgres (`pg`), y un número o booleano como texto.
 *
 * Es un hook de colección y no un `validate` de campo a propósito: Payload no valida los campos al guardar borradores
 * (versions.drafts sin `validate`), y un objeto guardado así se publicaría después como texto JSON.
 * Solo comprueba el TIPO; obligatorios, longitudes y formatos siguen en las validaciones de cada campo.
 */
const DE_TEXTO = new Set(['text', 'textarea', 'email'])

type Error = { message: string; path: string }

function revisar(fields: Field[], datos: unknown, ruta: string, errores: Error[]) {
  if (!datos || typeof datos !== 'object') return
  const d = datos as Record<string, unknown>
  for (const field of fields) {
    // Contenedores sin nombre (row, collapsible, tabs sin nombre): sus campos están al mismo nivel.
    if (field.type === 'row' || field.type === 'collapsible') revisar(field.fields, d, ruta, errores)
    else if (field.type === 'tabs') {
      for (const tab of field.tabs) {
        if ('name' in tab && tab.name) revisar(tab.fields, d[tab.name], `${ruta}${tab.name}.`, errores)
        else revisar(tab.fields, d, ruta, errores)
      }
    } else if (!('name' in field) || !(field.name in d)) continue
    else if (field.type === 'group') revisar(field.fields, d[field.name], `${ruta}${field.name}.`, errores)
    else if (field.type === 'array') {
      const filas = d[field.name]
      if (Array.isArray(filas)) filas.forEach((fila, i) => revisar(field.fields, fila, `${ruta}${field.name}.${i}.`, errores))
    } else if (DE_TEXTO.has(field.type) && !('hasMany' in field && field.hasMany)) {
      const v = d[field.name]
      if (v !== null && v !== undefined && typeof v !== 'string') errores.push({ message: 'Este campo debe ser texto.', path: `${ruta}${field.name}` })
    }
  }
}

export const exigirTextoEnCamposDeTexto: CollectionBeforeValidateHook = ({ collection, data, req }) => {
  const errores: Error[] = []
  revisar(collection.fields, data, '', errores)
  if (errores.length) throw new ValidationError({ collection: collection.slug, errors: errores }, req.t)
  return data
}

/** Añade la comprobación como primer beforeValidate propio de una colección del proyecto. */
export const conTiposDeTexto = (c: CollectionConfig): CollectionConfig => ({
  ...c,
  hooks: { ...c.hooks, beforeValidate: [exigirTextoEnCamposDeTexto, ...(c.hooks?.beforeValidate ?? [])] },
})
