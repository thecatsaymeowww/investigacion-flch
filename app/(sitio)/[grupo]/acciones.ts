'use server'

import config from '@payload-config'
import { headers } from 'next/headers'
import { getPayload } from 'payload'
import { crearMensajeContacto } from '@/lib/access/privileged'
import { comprobarMarca } from '@/lib/antispam'
import { grupoPorRuta, obtenerLanding } from '@/lib/cms'
import { demasiadosEnlaces, type ErroresEnvio, leerValores, resumenDeErrores, validarPropuesta, type ValoresEnvio, valoresParaDevolver } from '@/lib/formulario'
import { confiarEnProxy } from '@/lib/entorno'
import { clienteDe, crearLimitador } from '@/lib/limite-envios'

export type EstadoEnvio = {
  estado: 'inicial' | 'ok' | 'error'
  envio?: number
  mensaje?: string
  nombre?: string
  correo?: string
  /** Lo que escribió la persona, ya limpio, para devolvérselo si el envío falla (los campos no se vacían). */
  valores?: ValoresEnvio
  /** Error de cada campo (validación del servidor, lib/formulario.ts). */
  errores?: ErroresEnvio
  /** Distingue dos errores seguidos iguales, para que el aviso se vuelva a anunciar. */
  intento?: number
}

// En memoria de este proceso (lib/limite-envios.ts; un solo proceso, D10). El cliente es su IP de confianza (4b):
// - por cliente: 3 intentos por minuto, válidos o no (ráfagas);
// - por cliente y grupo: 5 envíos válidos por hora (punto 5.4 del plan); los intentos con errores no cuentan, para no
//   bloquear a quien corrige lo que escribió;
// - por grupo: 20 envíos válidos cada 10 minutos, de cualquier cliente.
const porCliente = crearLimitador({ ventanaMs: 60_000, max: 3, maxClaves: 10_000 })
const porClienteYGrupo = crearLimitador({ ventanaMs: 60 * 60_000, max: 5, maxClaves: 10_000 })
const porGrupo = crearLimitador({ ventanaMs: 10 * 60_000, max: 20, maxClaves: 1_000 })

/**
 * El grupo sale de `ruta`, el argumento enlazado con `.bind()` al renderizar su página. Next no lo cifra: viaja en el
 * formulario (campo oculto `$ACTION_1:1`) y quien envía puede cambiarlo. Solo sirve para enviar un mensaje a otro grupo
 * ACTIVO, lo mismo que desde su propia página: la marca antispam está firmada para la ruta (otra ruta la invalida),
 * grupoPorRuta solo encuentra grupos activos y los límites por cliente y por grupo se aplican igual.
 */
export async function enviarPropuesta(ruta: string, _previo: EstadoEnvio, form: FormData): Promise<EstadoEnvio> {
  const error = 'No se pudo enviar la propuesta. Inténtelo de nuevo en unos minutos.'
  // Campo trampa: las personas no lo ven; si viene lleno, es un robot (no se le devuelve nada).
  if (String(form.get('sitio_web') ?? '').trim()) return { estado: 'error', mensaje: error }
  const valores = leerValores(form)
  const fallo = (mensaje: string, errores?: ErroresEnvio): EstadoEnvio => ({
    estado: 'error',
    mensaje,
    valores: valoresParaDevolver(valores),
    errores,
    intento: Date.now(),
  })

  // Marca firmada de la página (lib/antispam.ts): sin ella o alterada, no se acepta; enviada en menos de 2 s, se acepta
  // pero se guarda como «posible spam» (subfase 4c); caducada, se pide reenviar conservando lo escrito.
  const marca = comprobarMarca(form.get('marca'), ruta)
  if (marca === 'caducada') return fallo('La página lleva demasiado tiempo abierta. Recárguela y vuelva a enviar la propuesta.')
  if (marca !== 'valida' && marca !== 'rapida') return fallo(error)

  // Con el proxy de confianza, sin una IP válida en X-Real-IP la petición no llegó por él: se rechaza, sin cubo común.
  const cliente = clienteDe(await headers(), confiarEnProxy())
  if (cliente.clave === null) {
    console.error(`[colaborar] envío rechazado: ${cliente.motivo === 'sin-cabecera' ? 'falta' : 'no es válida'} la IP del proxy (X-Real-IP)`)
    return fallo(error)
  }
  const limite = porCliente.comprobar(cliente.clave)
  if (limite === 'limite') return fallo('Ha enviado varias propuestas seguidas. Espere un minuto.')
  if (limite === 'saturado') return fallo(error)

  // El grupo va antes que la validación: el tipo se valida contra la lista de SU landing (o «Otro»), no contra lo que
  // envíe el navegador. Un grupo inexistente o inactivo recibe el mismo error genérico que cualquier otro rechazo.
  const grupo = await grupoPorRuta(ruta)
  if (!grupo) return fallo(error)
  const landing = await obtenerLanding(ruta)
  const datos = validarPropuesta(valores, landing?.grupo.id === grupo.id ? landing.colaborar.tipos : [])
  if (!datos.ok) return fallo(resumenDeErrores(datos.errores), datos.errores)

  // Después de comprobar el grupo: una ruta inventada no crea claves en los límites por grupo. El de cliente y grupo va
  // primero: un mismo cliente no puede gastar más de 5 de los 20 envíos del grupo.
  const deClienteEnGrupo = porClienteYGrupo.comprobar(`${cliente.clave}|grupo:${grupo.id}`)
  if (deClienteEnGrupo === 'limite') return fallo('Ya ha enviado varias propuestas a este grupo en la última hora. Inténtelo más tarde.')
  if (deClienteEnGrupo === 'saturado') return fallo(error)
  if (porGrupo.comprobar(`grupo:${grupo.id}`) !== 'permitido') return fallo(error)

  try {
    const payload = await getPayload({ config })
    // Posible spam (4c): se guarda marcado, nunca se descarta. La respuesta es la misma en todos los casos (spam,
    // duplicado o normal): nada indica a quien envía qué se detectó ni si había un envío anterior.
    await crearMensajeContacto(payload, grupo.id, datos.datos, { posibleSpam: marca === 'rapida' || demasiadosEnlaces(datos.datos) })
  } catch {
    // Sin datos personales en los logs.
    console.error(`[colaborar] no se pudo guardar el mensaje del grupo ${grupo.id}`)
    return fallo(error)
  }
  return { estado: 'ok', envio: Date.now(), nombre: datos.datos.nombre.split(/\s+/)[0], correo: datos.datos.correo }
}
