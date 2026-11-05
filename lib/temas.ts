/**
 * Tema visual de cada landing. Todas usan la Plantilla Grupo (tema FLCH) salvo las que conservan
 * su diseño propio de periódico. Decisión de la fase 31: se elige por ruta, sin campo en el CMS
 * (añadir uno exige una migración aprobada aparte).
 */
const RUTAS_TEMA_PRENSA = new Set(['litartmo/prensa-y-literatura'])

export const usaTemaPrensa = (ruta: string) => RUTAS_TEMA_PRENSA.has(ruta)
