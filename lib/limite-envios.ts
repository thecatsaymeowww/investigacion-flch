import { isIP } from 'node:net'

/**
 * Límite de envíos del formulario público, en memoria de UN proceso (no se comparte entre procesos ni servidores, y se
 * reinicia con el proceso: para eso, `limit_req` en Nginx, deploy/nginx/, o un almacén común). Memoria acotada: cada
 * clave guarda como mucho `max` marcas de tiempo; una vez por ventana se barren las claves caducadas (en la primera
 * comprobación que llega después, sin temporizadores) y, si se alcanzan `maxClaves` clientes a la vez, los nuevos se
 * rechazan hasta que caduquen las ventanas (se prefiere rechazar a crecer sin límite). `comprobar` es síncrona: en un
 * proceso de Node, dos peticiones simultáneas no pueden pasar a la vez el mismo hueco.
 */
export type Limitador = { comprobar: (clave: string) => 'permitido' | 'limite' | 'saturado'; claves: () => number }

export function crearLimitador({
  ventanaMs,
  max,
  maxClaves,
  ahora = Date.now,
}: {
  ventanaMs: number
  max: number
  maxClaves: number
  ahora?: () => number
}): Limitador {
  const envios = new Map<string, number[]>()
  const vigentes = (lista: number[] | undefined, t: number) => (lista ?? []).filter((x) => t - x < ventanaMs)
  let ultimoBarrido = ahora()
  const purgar = (t: number) => {
    for (const [clave, lista] of envios) {
      const v = vigentes(lista, t)
      if (v.length) envios.set(clave, v)
      else envios.delete(clave)
    }
    ultimoBarrido = t
  }
  return {
    comprobar(clave) {
      const t = ahora()
      if (t - ultimoBarrido >= ventanaMs) purgar(t)
      if (!envios.has(clave) && envios.size >= maxClaves) {
        purgar(t)
        if (envios.size >= maxClaves) return 'saturado'
      }
      const lista = vigentes(envios.get(clave), t)
      if (lista.length >= max) {
        envios.set(clave, lista)
        return 'limite'
      }
      lista.push(t)
      envios.set(clave, lista)
      return 'permitido'
    },
    claves: () => envios.size,
  }
}

/** Clave común a todos los envíos cuando no hay proxy de confianza (solo en local: un sitio HTTPS exige el proxy). */
export const CLAVE_SIN_PROXY = 'sin-proxy-de-confianza'

/** Cliente para el límite: su clave, o `null` si con el proxy de confianza no llega una IP válida (el envío se rechaza). */
export type Cliente = { clave: string } | { clave: null; motivo: 'sin-cabecera' | 'ip-no-valida' }

/**
 * Identidad del cliente para el límite (subfase 4b). Next no da acceso a la IP del socket, así que el modelo de
 * confianza es el del punto 4.4 del plan:
 * - La aplicación solo escucha en 127.0.0.1 (`next start -H 127.0.0.1`): el único que puede hablar con ella es el
 *   proxy de la misma máquina (Nginx). Esa es la lista de proxies de confianza; no hay rangos de IP configurados.
 * - Nginx SOBRESCRIBE `X-Real-IP` (y `X-Forwarded-For`) con `$remote_addr` (deploy/nginx/cabeceras-proxy.conf): lo que
 *   envíe el cliente en esas cabeceras nunca llega.
 * - Con `confiar` (CONFIAR_EN_PROXY=1, lib/entorno.ts) se usa SOLO `X-Real-IP`, y solo si es una IP válida (ipCanonica).
 *   Si falta o no lo es, la petición no llegó por el proxy como se espera: no se le asigna clave ni comparte cubo.
 * - Sin `confiar` no se lee ninguna cabecera: todos comparten CLAVE_SIN_PROXY (seguro, pero limita a todos a la vez).
 * `X-Forwarded-For` no se lee nunca: con varios proxies su primer valor lo pone el cliente.
 */
export function clienteDe(cabeceras: Headers, confiar: boolean): Cliente {
  if (!confiar) return { clave: CLAVE_SIN_PROXY }
  const valor = cabeceras.get('x-real-ip')
  if (!valor) return { clave: null, motivo: 'sin-cabecera' }
  const clave = ipCanonica(valor)
  return clave ? { clave } : { clave: null, motivo: 'ip-no-valida' }
}

/** IPv4 en notación decimal estricta: cuatro octetos, sin ceros a la izquierda (ambiguos: `010` es octal para algunos). */
const IPV4 = /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/

/**
 * Clave canónica de una IP, o `null` si el valor no es exactamente una IP. Se rechaza todo lo que no sea una sola
 * dirección: espacios, listas (`a, b`: la cabecera repetida llega así), puertos, corchetes, zonas IPv6 (`%eth0`) y
 * cualquier otro carácter. Distintas escrituras de la misma dirección dan la misma clave:
 * - IPv6 se normaliza (WHATWG URL) y se agrupa por su prefijo /64, lo que una conexión doméstica suele recibir entero:
 *   cambiar de dirección dentro de él no da un cubo nuevo;
 * - una IPv4 mapeada en IPv6 (`::ffff:a.b.c.d`) es la misma IPv4.
 */
export function ipCanonica(valor: string): string | null {
  if (valor.length > 45 || !/^[0-9A-Fa-f:.]+$/.test(valor)) return null
  if (IPV4.test(valor)) return `ip4:${valor}`
  if (isIP(valor) !== 6) return null
  const g = expandirIPv6(new URL(`http://[${valor}]`).hostname.slice(1, -1))
  if (g.slice(0, 5).every((x) => x === 0) && g[5] === 0xffff) return `ip4:${g[6] >> 8}.${g[6] & 255}.${g[7] >> 8}.${g[7] & 255}`
  return `ip6:${g
    .slice(0, 4)
    .map((x) => x.toString(16))
    .join(':')}::/64`
}

/** Los 8 grupos de 16 bits de una IPv6 ya normalizada por URL (minúsculas, sin IPv4 incrustada, `::` como mucho una vez). */
function expandirIPv6(normalizada: string): number[] {
  const [izq, der] = normalizada.split('::')
  const a = izq ? izq.split(':') : []
  const b = der === undefined ? [] : der ? der.split(':') : []
  const relleno = der === undefined ? [] : Array<string>(8 - a.length - b.length).fill('0')
  return [...a, ...relleno, ...b].map((h) => parseInt(h, 16))
}
