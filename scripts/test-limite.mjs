/**
 * Pruebas unitarias del límite de envíos y del modelo de confianza de IP (subfase 4b), sin base ni servidor.
 *   pnpm test:limite
 * Cubren lib/limite-envios.ts (ipCanonica, clienteDe, crearLimitador), CONFIAR_EN_PROXY (lib/entorno.ts) y, de forma
 * estática, las dos premisas del modelo: la aplicación solo escucha en 127.0.0.1 y la plantilla de Nginx
 * (deploy/nginx/) sobrescribe las cabeceras de IP. Las pruebas de punta a punta, con un servidor arrancado con
 * CONFIAR_EN_PROXY=1, son la sección `proxy` de scripts/test-seguridad.ts.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { confiarEnProxy } from '../lib/entorno.ts'
import { CLAVE_SIN_PROXY, clienteDe, crearLimitador, ipCanonica } from '../lib/limite-envios.ts'

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const leer = (r) => readFileSync(path.join(raiz, r), 'utf8')
/** Configuración de Nginx sin comentarios: las comprobaciones miran solo las directivas. */
const directivas = (r) => leer(r).replace(/^\s*#.*$/gm, '')
const cab = (pares) => {
  const h = new Headers()
  for (const [k, v] of pares) h.append(k, v)
  return h
}

describe('ipCanonica', () => {
  test('IPv4 válidas', () => {
    for (const ip of ['203.0.113.9', '0.0.0.0', '255.255.255.255', '10.0.0.1']) assert.equal(ipCanonica(ip), `ip4:${ip}`)
  })
  test('IPv6: distintas escrituras de la misma dirección dan la misma clave, agrupada por /64', () => {
    const c = ipCanonica('2001:db8:1:2::a')
    assert.equal(c, 'ip6:2001:db8:1:2::/64')
    for (const v of ['2001:DB8:1:2::A', '2001:0db8:0001:0002:0000:0000:0000:000b', '2001:db8:1:2:ffff:ffff:ffff:ffff']) assert.equal(ipCanonica(v), c, v)
    assert.notEqual(ipCanonica('2001:db8:1:3::a'), c)
    assert.equal(ipCanonica('::1'), 'ip6:0:0:0:0::/64')
  })
  test('IPv4 mapeada en IPv6 es la misma IPv4', () => {
    assert.equal(ipCanonica('::ffff:198.51.100.7'), 'ip4:198.51.100.7')
    assert.equal(ipCanonica('::FFFF:c633:6407'), 'ip4:198.51.100.7')
  })
  test('rechaza lo que no es exactamente una IP', () => {
    const malas = [
      '',
      ' ',
      'falso',
      'localhost',
      '203.0.113.9 ',
      ' 203.0.113.9',
      '203.0.113.9x',
      '203.0.113',
      '203.0.113.9.1',
      '256.1.1.1',
      '203.0.113.-1',
      '010.0.0.1',
      '01.2.3.4',
      '203.0.113.09', // ceros a la izquierda: ambiguos (octal)
      '203.0.113.9, 198.51.100.7',
      '203.0.113.9,198.51.100.7', // lista: la cabecera repetida llega así
      '203.0.113.9:8080',
      '[2001:db8::1]',
      '[2001:db8::1]:443',
      'fe80::1%eth0',
      '2001:db8::1/64',
      '2001:db8:::1',
      '1:2:3:4:5:6:7:8:9',
      '١٢٣.٠.١١٣.٩',
      '２０３.0.113.9',
      '203.0.113.9\u0000',
      'x'.repeat(46),
    ]
    for (const v of malas) assert.equal(ipCanonica(v), null, JSON.stringify(v))
  })
})

describe('clienteDe', () => {
  test('sin proxy de confianza: ignora X-Real-IP y X-Forwarded-For (todos comparten una clave)', () => {
    for (const h of [[], [['x-real-ip', '203.0.113.9']], [['x-forwarded-for', '198.51.100.7']], [['x-real-ip', 'falso']]]) {
      assert.deepEqual(clienteDe(cab(h), false), { clave: CLAVE_SIN_PROXY })
    }
  })
  test('con proxy: usa SOLO X-Real-IP; X-Forwarded-For no cambia la clave', () => {
    const a = clienteDe(
      cab([
        ['x-real-ip', '203.0.113.9'],
        ['x-forwarded-for', '198.51.100.7'],
      ]),
      true,
    )
    const b = clienteDe(
      cab([
        ['x-real-ip', '203.0.113.9'],
        ['x-forwarded-for', '192.0.2.1, 198.51.100.8'],
      ]),
      true,
    )
    assert.deepEqual(a, { clave: 'ip4:203.0.113.9' })
    assert.deepEqual(b, a)
  })
  test('con proxy: sin X-Real-IP (aunque haya X-Forwarded-For) o vacía → sin clave', () => {
    assert.deepEqual(clienteDe(cab([['x-forwarded-for', '203.0.113.9']]), true), { clave: null, motivo: 'sin-cabecera' })
    assert.deepEqual(clienteDe(cab([['x-real-ip', '']]), true), { clave: null, motivo: 'sin-cabecera' })
  })
  test('con proxy: X-Real-IP repetida o malformada → sin clave', () => {
    assert.deepEqual(
      clienteDe(
        cab([
          ['x-real-ip', '203.0.113.9'],
          ['x-real-ip', '198.51.100.7'],
        ]),
        true,
      ),
      { clave: null, motivo: 'ip-no-valida' },
    )
    for (const v of ['falso', '203.0.113.9:80', '[::1]', 'fe80::1%eth0']) assert.equal(clienteDe(cab([['x-real-ip', v]]), true).clave, null, v)
  })
  test('con proxy: IPv6 de la misma /64 comparte clave', () => {
    assert.equal(clienteDe(cab([['x-real-ip', '2001:db8:1:2::1']]), true).clave, clienteDe(cab([['x-real-ip', '2001:db8:1:2::ffff']]), true).clave)
  })
})

describe('crearLimitador', () => {
  test('primer envío y sucesivos permitidos hasta el máximo; el siguiente, limitado', () => {
    const lim = crearLimitador({ ventanaMs: 1000, max: 3, maxClaves: 10, ahora: () => 0 })
    assert.deepEqual(
      [1, 2, 3, 4, 5].map(() => lim.comprobar('a')),
      ['permitido', 'permitido', 'permitido', 'limite', 'limite'],
    )
    assert.equal(lim.comprobar('b'), 'permitido')
  })
  test('al vencer la ventana vuelve a permitir', () => {
    let t = 0
    const lim = crearLimitador({ ventanaMs: 1000, max: 1, maxClaves: 10, ahora: () => t })
    assert.equal(lim.comprobar('a'), 'permitido')
    t = 999
    assert.equal(lim.comprobar('a'), 'limite')
    t = 1000
    assert.equal(lim.comprobar('a'), 'permitido')
  })
  test('los intentos limitados no alargan la espera', () => {
    let t = 0
    const lim = crearLimitador({ ventanaMs: 1000, max: 1, maxClaves: 10, ahora: () => t })
    lim.comprobar('a')
    t = 900
    lim.comprobar('a')
    t = 1000
    assert.equal(lim.comprobar('a'), 'permitido')
  })
  test('barrido periódico: las claves caducadas se borran una vez por ventana, sin llegar al tope', () => {
    let t = 0
    const lim = crearLimitador({ ventanaMs: 1000, max: 1, maxClaves: 10_000, ahora: () => t })
    for (let i = 0; i < 500; i++) lim.comprobar(`k${i}`)
    assert.equal(lim.claves(), 500)
    t = 1000
    lim.comprobar('nueva')
    assert.equal(lim.claves(), 1)
  })
  test('tope: 100 000 IP distintas no pasan de maxClaves; las nuevas se rechazan hasta que caducan', () => {
    let t = 0
    const lim = crearLimitador({ ventanaMs: 60_000, max: 3, maxClaves: 10_000, ahora: () => t })
    const r = { permitido: 0, limite: 0, saturado: 0 }
    for (let i = 0; i < 100_000; i++) r[lim.comprobar(`ip4:10.${(i >> 16) & 255}.${(i >> 8) & 255}.${i & 255}`)]++
    assert.equal(lim.claves(), 10_000)
    assert.deepEqual(r, { permitido: 10_000, limite: 0, saturado: 90_000 })
    t = 60_000
    assert.equal(lim.comprobar('ip4:192.0.2.1'), 'permitido')
    assert.equal(lim.claves(), 1)
  })
  test('cada clave guarda como mucho `max` marcas, por muchos intentos que haga', () => {
    const lim = crearLimitador({ ventanaMs: 60_000, max: 3, maxClaves: 10, ahora: () => 0 })
    for (let i = 0; i < 10_000; i++) lim.comprobar('a')
    assert.equal(lim.claves(), 1)
    assert.equal(lim.comprobar('a'), 'limite')
  })
  test('peticiones concurrentes: de 50 a la vez, exactamente `max` pasan', async () => {
    const lim = crearLimitador({ ventanaMs: 60_000, max: 3, maxClaves: 10 })
    const r = await Promise.all(Array.from({ length: 50 }, () => Promise.resolve().then(() => lim.comprobar('a'))))
    assert.equal(r.filter((x) => x === 'permitido').length, 3)
  })
})

describe('CONFIAR_EN_PROXY', () => {
  const con = (valores, fn) => {
    const antes = { CONFIAR_EN_PROXY: process.env.CONFIAR_EN_PROXY, NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL }
    const fijar = (pares) => {
      for (const [k, v] of Object.entries(pares)) {
        if (v === undefined) delete process.env[k]
        else process.env[k] = v
      }
    }
    try {
      fijar(valores)
      return fn()
    } finally {
      fijar(antes)
    }
  }
  test('"1" activa; ausente, vacío o "0" no', () => {
    const local = 'http://127.0.0.1:3000'
    assert.equal(con({ CONFIAR_EN_PROXY: '1', NEXT_PUBLIC_SITE_URL: local }, confiarEnProxy), true)
    for (const v of [undefined, '', '0', ' 0 ']) assert.equal(con({ CONFIAR_EN_PROXY: v, NEXT_PUBLIC_SITE_URL: local }, confiarEnProxy), false, String(v))
  })
  test('cualquier otro valor impide arrancar', () => {
    for (const v of ['true', 'yes', 'si', '2', 'x-real-ip']) {
      assert.throws(() => con({ CONFIAR_EN_PROXY: v, NEXT_PUBLIC_SITE_URL: 'http://127.0.0.1:3000' }, confiarEnProxy), /CONFIAR_EN_PROXY debe ser/, v)
    }
  })
  test('un sitio HTTPS exige CONFIAR_EN_PROXY=1', () => {
    assert.throws(() => con({ CONFIAR_EN_PROXY: undefined, NEXT_PUBLIC_SITE_URL: 'https://gi.ejemplo.invalid' }, confiarEnProxy), /exige CONFIAR_EN_PROXY=1/)
    assert.equal(con({ CONFIAR_EN_PROXY: '1', NEXT_PUBLIC_SITE_URL: 'https://gi.ejemplo.invalid' }, confiarEnProxy), true)
  })
})

describe('premisas del modelo de confianza (estáticas)', () => {
  test('la aplicación solo escucha en 127.0.0.1 (start y dev)', () => {
    const { scripts } = JSON.parse(leer('package.json'))
    assert.match(scripts.start, /-H 127\.0\.0\.1(\s|$)/)
    assert.match(scripts.dev, /-H 127\.0\.0\.1(\s|$)/)
  })
  test('el código solo lee X-Real-IP, y nunca X-Forwarded-For', () => {
    const lib = leer('lib/limite-envios.ts')
    assert.match(lib, /cabeceras\.get\('x-real-ip'\)/)
    assert.doesNotMatch(lib, /\.get\('x-forwarded-for'\)/i)
    assert.doesNotMatch(leer('app/(sitio)/[grupo]/acciones.ts'), /forwarded/i)
  })
  test('plantilla de Nginx: sobrescribe X-Real-IP y X-Forwarded-For con $remote_addr, sin añadir a la lista del cliente', () => {
    const c = directivas('deploy/nginx/cabeceras-proxy.conf')
    assert.match(c, /^proxy_set_header X-Real-IP\s+\$remote_addr;$/m)
    assert.match(c, /^proxy_set_header X-Forwarded-For\s+\$remote_addr;$/m)
    assert.match(c, /^proxy_set_header X-Forwarded-Host\s+\$host;$/m)
    assert.doesNotMatch(c, /proxy_add_x_forwarded_for/)
  })
  test('plantilla de Nginx: cada location con proxy_pass incluye las cabeceras; la zona `acciones` solo en el sitio público', () => {
    const u = directivas('deploy/nginx/ubicaciones.conf')
    const bloques = [...u.matchAll(/location\s+([^{]+)\{([^}]*)\}/g)]
    assert.ok(bloques.length >= 5)
    for (const [, ruta, cuerpo] of bloques) {
      if (/proxy_pass/.test(cuerpo)) assert.match(cuerpo, /include plataforma\/cabeceras-proxy\.conf;/, ruta)
      if (/zone=acciones/.test(cuerpo)) assert.equal(ruta.trim(), '/')
    }
    const l = directivas('deploy/nginx/limites.conf')
    assert.match(l, /map "\$request_method:\$http_next_action" \$limite_accion/)
    assert.match(l, /limit_req_zone \$limite_accion\s+zone=acciones/)
    assert.match(l, /^limit_req_status\s+429;$/m)
  })
})
