/**
 * Pruebas unitarias del destino de las pruebas HTTP (scripts/pruebas-url.ts), sin base ni servidor.
 *   node --test scripts/test-pruebas-url.mjs     (incluidas en pnpm test:unitarias)
 */
import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { DESTINO_PREDETERMINADO, destinoDePruebas } from './pruebas-url.ts'

describe('destinoDePruebas', () => {
  test('sin variable, vacía o con espacios: el predeterminado de siempre', () => {
    assert.equal(DESTINO_PREDETERMINADO, 'http://127.0.0.1:3000')
    for (const v of [undefined, '', '   ', '\t\n']) assert.equal(destinoDePruebas(v), 'http://127.0.0.1:3000')
  })

  test('destinos locales en los puertos 3000 y 3001: se aceptan y se normalizan a su origen', () => {
    const casos = {
      'http://127.0.0.1:3000': 'http://127.0.0.1:3000',
      'http://127.0.0.1:3001': 'http://127.0.0.1:3001',
      'http://localhost:3000': 'http://localhost:3000',
      'http://localhost:3001': 'http://localhost:3001',
      'http://[::1]:3000': 'http://[::1]:3000',
      'http://[::1]:3001': 'http://[::1]:3001',
      ' http://127.0.0.1:3001 ': 'http://127.0.0.1:3001',
      'http://127.0.0.1:3001/': 'http://127.0.0.1:3001',
      'http://LOCALHOST:3001': 'http://localhost:3001',
    }
    for (const [v, esperado] of Object.entries(casos)) assert.equal(destinoDePruebas(v), esperado, v)
  })

  test('otros puertos, o ninguno: rechazados', () => {
    for (const v of [
      'http://127.0.0.1:3002',
      'http://127.0.0.1:5432',
      'http://127.0.0.1:5439',
      'http://localhost:80',
      'http://[::1]:443',
      'http://127.0.0.1',
      'http://localhost',
      'http://127.0.0.1:0',
    ])
      assert.throws(() => destinoDePruebas(v), /solo admite los puertos 3000 o 3001/, v)
    assert.throws(() => destinoDePruebas('http://127.0.0.1:99999'), /no es una URL válida/)
  })

  test('dominios externos, IP públicas y nombres engañosos: rechazados', () => {
    for (const v of [
      'https://ejemplo.com',
      'http://8.8.8.8:3000',
      'http://192.168.1.10:3000',
      'http://127.0.0.2:3000',
      'http://localhost.ejemplo.com:3000',
      'http://localhost.:3000',
      'http://ejemplo.com.localhost:3000',
      'http://localhost-ejemplo.com',
      'http://xn--lcalhost-9fg:3000',
      'http://lоcalhost:3000', // «о» cirílica
      'http://ejemplo.com\\@127.0.0.1:3000',
      'http://ejemplo.com#@127.0.0.1:3000',
    ])
      assert.throws(() => destinoDePruebas(v), /solo admite|no admite|solo un origen/, v)
  })

  test('credenciales incrustadas: rechazadas, aunque el host sea local', () => {
    for (const v of ['http://usuario:clave@127.0.0.1:3000', 'http://usuario@localhost:3000', 'http://127.0.0.1:3000@ejemplo.com'])
      assert.throws(() => destinoDePruebas(v), /no admite usuario|solo admite/, v)
  })

  test('protocolos distintos de http (también https): rechazados', () => {
    for (const v of [
      'https://127.0.0.1:3001',
      'https://localhost:3000',
      'ftp://127.0.0.1',
      'file:///C:/x',
      'javascript:alert(1)',
      'ws://127.0.0.1:3000',
      'data:text/plain,x',
    ])
      assert.throws(() => destinoDePruebas(v), /solo admite http \(/, v)
  })

  test('ruta, consulta o fragmento: rechazados', () => {
    for (const v of ['http://127.0.0.1:3000/api', 'http://127.0.0.1:3000/?x=1', 'http://127.0.0.1:3000/#a'])
      assert.throws(() => destinoDePruebas(v), /solo un origen/, v)
  })

  test('texto que no es URL: rechazado sin repetir el valor', () => {
    for (const v of ['127.0.0.1:3000', 'localhost', 'no es una url']) {
      assert.throws(
        () => destinoDePruebas(v),
        (e) => {
          assert.match(e.message, /no es una URL válida|solo admite/)
          return true
        },
      )
    }
    assert.throws(
      () => destinoDePruebas('http://usuario:secreto@127.0.0.1'),
      (e) => !e.message.includes('secreto'),
    )
  })
})
