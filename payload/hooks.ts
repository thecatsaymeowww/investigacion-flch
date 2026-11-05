import type { CollectionConfig } from 'payload'
import {
  exigirMismoGrupo,
  recalcularVisibilidad,
  recalcularVisibilidadAlBorrar,
  registrarBorrado,
  registrarCambio,
  revalidarGrupo,
  revalidarGrupoAlBorrar,
  type Referencia,
} from '../lib/access/privileged'

/** Hooks comunes a todo el contenido editorial de un grupo. */
export function hooksEditoriales(refs: Referencia[]): CollectionConfig['hooks'] {
  return {
    beforeValidate: refs.length ? [exigirMismoGrupo(refs)] : [],
    afterChange: [recalcularVisibilidad, registrarCambio, revalidarGrupo],
    afterDelete: [recalcularVisibilidadAlBorrar, registrarBorrado, revalidarGrupoAlBorrar],
  }
}
