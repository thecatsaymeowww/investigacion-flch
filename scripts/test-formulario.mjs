/**
 * Pruebas unitarias del formulario «Colaborar» (subfase 4a): lib/formulario.ts, sin base ni servidor.
 *   pnpm test:formulario
 * Usa el ejecutor de pruebas de Node (`node --test`) y su lectura directa de TypeScript: sin dependencias nuevas
 * (Vitest quedaba sujeto a aprobación en el plan). Las pruebas de punta a punta del formulario están en
 * scripts/test-seguridad.ts, sección `formulario`.
 */
import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import {
  CAMPOS,
  contarEnlaces,
  demasiadosEnlaces,
  ENLACES_MAXIMOS,
  leerValores,
  LIMITES,
  limpiarTexto,
  mismoEnvio,
  resumenDeErrores,
  TIPO_POR_DEFECTO,
  validarPropuesta,
  valoresParaDevolver,
  VENTANA_DUPLICADOS_MS,
} from '../lib/formulario.ts'

const TIPOS = ['Consulta', 'Propuesta de colaboración']
const valido = {
  nombre: 'Ana Prueba',
  correo: 'ana@ejemplo.invalid',
  institucion: 'Institución ficticia',
  tipo: 'Consulta',
  mensaje: 'Una propuesta de prueba con texto suficiente.',
}
const form = (campos) => {
  const fd = new FormData()
  for (const [k, v] of Object.entries(campos)) fd.append(k, v)
  return fd
}
const validar = (cambios, tipos = TIPOS) => validarPropuesta(leerValores(form({ ...valido, ...cambios })), tipos)

describe('limpiarTexto', () => {
  test('quita controles C0, DEL y C1, marcas y controles bidireccionales, espacio de ancho cero y BOM', () => {
    const sucio = 'a\u0000b\u0007c\u001Fd\u007Fe\u0085f‮g‪h⁦i⁩j​k‎l‏m؜n﻿o'
    assert.equal(limpiarTexto(sucio), 'abcdefghijklmno')
  })
  test('conserva los caracteres que unen escrituras y emojis (U+200C, U+200D)', () => {
    assert.equal(limpiarTexto('👩‍🔬 y ‌'), '👩‍🔬 y ‌')
  })
  test('mensaje: \\r\\n y \\r pasan a \\n; tabulador a espacio', () => {
    assert.equal(limpiarTexto('uno\r\ndos\rtres\tcuatro', true), 'uno\ndos\ntres cuatro')
  })
  test('campos de una línea: los saltos pasan a espacio', () => {
    assert.equal(limpiarTexto('Ana\r\nPrueba'), 'Ana Prueba')
  })
  test('normaliza a NFC (una tilde descompuesta queda como un solo carácter)', () => {
    assert.equal(limpiarTexto('Institución'), 'Institución')
  })
  test('el marcado y los esquemas de URL quedan como texto (React los escapa al mostrarlos)', () => {
    assert.equal(limpiarTexto('<script>alert(1)</script> javascript:alert(1)'), '<script>alert(1)</script> javascript:alert(1)')
  })
})

describe('leerValores', () => {
  test('un valor que no es texto (un archivo con el nombre de un campo) cuenta como vacío', () => {
    const fd = form({ ...valido })
    fd.set('nombre', new Blob(['x']), 'nombre.txt')
    assert.equal(leerValores(fd).nombre, '')
  })
  test('un campo que falta cuenta como vacío', () => {
    const fd = form({ ...valido })
    fd.delete('mensaje')
    assert.equal(leerValores(fd).mensaje, '')
  })
  test('no trunca: un texto largo llega completo a la validación', () => {
    assert.equal(leerValores(form({ ...valido, mensaje: 'x'.repeat(5000) })).mensaje.length, 5000)
  })
  test('lo devuelto al formulario se acota a los límites', () => {
    const v = valoresParaDevolver(leerValores(form({ ...valido, mensaje: 'x'.repeat(100_000), nombre: 'n'.repeat(500) })))
    assert.equal(v.mensaje.length, LIMITES.mensaje.max)
    assert.equal(v.nombre.length, LIMITES.nombre.max)
  })
})

describe('validarPropuesta', () => {
  test('envío válido: datos limpios y recortados; institución vacía → undefined', () => {
    const r = validar({ nombre: '  Ana‮ Prueba  ', institucion: '   ' })
    assert.ok(r.ok)
    assert.equal(r.datos.nombre, 'Ana Prueba')
    assert.equal(r.datos.institucion, undefined)
  })
  test('campos vacíos: un error en cada campo obligatorio, en el orden del formulario', () => {
    const r = validar({ nombre: '', correo: '', mensaje: '' })
    assert.equal(r.ok, false)
    assert.deepEqual(Object.keys(r.errores), ['nombre', 'correo', 'mensaje'])
    assert.equal(r.errores.correo, 'Escriba su correo.')
  })
  test('solo espacios o solo caracteres invisibles cuentan como vacío', () => {
    const r = validar({ nombre: '   ', mensaje: '‮​\u0000\u0000\u0000\u0000\u0000\u0000\u0000\u0000\u0000\u0000' })
    assert.equal(r.ok, false)
    assert.ok(r.errores.nombre && r.errores.mensaje)
  })
  for (const correo of ['no-es-correo', 'ana@', '@ejemplo.invalid', 'ana ejemplo@x.invalid', 'ana@ejemplo']) {
    test(`correo inválido: ${JSON.stringify(correo)}`, () => {
      const r = validar({ correo })
      assert.equal(r.ok, false)
      assert.match(r.errores.correo, /Correo no válido/)
    })
  }
  for (const campo of ['nombre', 'institucion', 'mensaje']) {
    test(`${campo}: exactamente el máximo se acepta; uno más, no`, () => {
      const max = LIMITES[campo].max
      assert.ok(validar({ [campo]: 'a'.repeat(max) }).ok)
      const r = validar({ [campo]: 'a'.repeat(max + 1) })
      assert.equal(r.ok, false)
      assert.equal(r.errores[campo], `Use como máximo ${max} caracteres.`)
    })
  }
  test('correo: máximo de 160 caracteres', () => {
    const local = (n) => `${'a'.repeat(n - '@ejemplo.invalid'.length)}@ejemplo.invalid`
    assert.ok(validar({ correo: local(160) }).ok)
    assert.equal(validar({ correo: local(161) }).ok, false)
  })
  test('mensaje de 100 000 caracteres → error de validación', () => {
    assert.equal(validar({ mensaje: 'x'.repeat(100_000) }).errores?.mensaje, 'Use como máximo 4000 caracteres.')
  })
  test('mensaje: los saltos \\r\\n cuentan como uno, igual que el maxLength del navegador', () => {
    // 3980 letras y 20 saltos: 4000 caracteres para el navegador, 4020 en el envío (cada salto llega como \r\n).
    const enviado = 'a'.repeat(200) + ('\r\n' + 'a'.repeat(189)).repeat(20)
    assert.equal(enviado.length, 4020)
    const r = validar({ mensaje: enviado })
    assert.ok(r.ok, JSON.stringify(r.errores))
    assert.equal(r.datos.mensaje.length, 4000)
    assert.equal(validar({ mensaje: `${enviado}a` }).errores?.mensaje, 'Use como máximo 4000 caracteres.')
  })
  test('mensaje demasiado corto', () => {
    assert.match(validar({ mensaje: 'Corto' }).errores?.mensaje ?? '', /^Cuéntenos un poco más/)
  })
  test('tipo: los de la landing y «Otro» se aceptan', () => {
    for (const tipo of [...TIPOS, TIPO_POR_DEFECTO]) assert.ok(validar({ tipo }).ok, tipo)
  })
  test('tipo: uno inventado, vacío o de otra landing se rechaza', () => {
    for (const tipo of ['Inventado', '', 'consulta', 'Sumarme al grupo'])
      assert.equal(validar({ tipo }).errores?.tipo, 'Elija uno de los tipos de colaboración de la lista.', tipo)
  })
  test('tipo: sin tipos en la landing solo se acepta «Otro»', () => {
    assert.ok(validar({ tipo: TIPO_POR_DEFECTO }, []).ok)
    assert.equal(validar({ tipo: 'Consulta' }, []).ok, false)
  })
  test('tipo: un tipo válido con un control bidireccional pegado se limpia y se acepta', () => {
    assert.ok(validar({ tipo: 'Consulta‮' }).ok)
  })
  test('varios errores a la vez: uno por campo', () => {
    const r = validar({ nombre: 'A', correo: 'x', tipo: 'Inventado', mensaje: 'Corto' })
    assert.deepEqual(Object.keys(r.errores), ['nombre', 'correo', 'tipo', 'mensaje'])
  })
})

describe('antispam (subfase 4c)', () => {
  const datos = (mensaje, extra = {}) => ({ nombre: 'Ana Prueba', institucion: undefined, mensaje, ...extra })
  test('enlaces: http://, https:// y www. cuentan; mayúsculas también', () => {
    assert.equal(contarEnlaces(datos('Ver https://a.invalid, HTTP://b.invalid, www.c.invalid y Www.d.invalid')), 4)
    assert.equal(contarEnlaces(datos('Sin enlaces: correo ana@ejemplo.invalid, «www» suelto, httpx://no')), 0)
  })
  test('enlaces: cuentan también en el nombre y la institución', () => {
    assert.equal(contarEnlaces(datos('uno https://a.invalid', { nombre: 'www.b.invalid', institucion: 'https://c.invalid https://d.invalid' })), 4)
  })
  test(`hasta ${ENLACES_MAXIMOS} enlaces es normal; uno más, posible spam`, () => {
    assert.equal(demasiadosEnlaces(datos('https://a.invalid https://b.invalid https://c.invalid')), false)
    assert.equal(demasiadosEnlaces(datos('https://a.invalid https://b.invalid https://c.invalid https://d.invalid')), true)
  })
  test('duplicado: mismo correo (sin distinguir mayúsculas) y mismo mensaje', () => {
    const a = { correo: 'Ana@Ejemplo.invalid', mensaje: 'Una propuesta.\nSegunda línea.' }
    assert.ok(mismoEnvio(a, { correo: 'ana@ejemplo.invalid', mensaje: 'Una propuesta.\nSegunda línea.' }))
  })
  test('no es duplicado: otro correo, otro mensaje o el mensaje con otra mayúscula o espacio', () => {
    const a = { correo: 'ana@ejemplo.invalid', mensaje: 'Una propuesta.' }
    for (const b of [
      { correo: 'otra@ejemplo.invalid', mensaje: 'Una propuesta.' },
      { correo: 'ana@ejemplo.invalid', mensaje: 'Otra propuesta.' },
      { correo: 'ana@ejemplo.invalid', mensaje: 'una propuesta.' },
      { correo: 'ana@ejemplo.invalid', mensaje: 'Una  propuesta.' },
    ])
      assert.equal(mismoEnvio(a, b), false, JSON.stringify(b))
  })
  test('lo que compara es el mensaje ya limpio: \\r\\n y \\n, o un control invisible, dan el mismo texto', () => {
    const v = (m) => leerValores(form({ ...valido, mensaje: m })).mensaje
    assert.ok(mismoEnvio({ correo: 'a@x.invalid', mensaje: v('Hola\r\nmundo de prueba') }, { correo: 'a@x.invalid', mensaje: v('Hola\nmundo de‮ prueba') }))
  })
  test(`la ventana de duplicados es de 10 minutos`, () => {
    assert.equal(VENTANA_DUPLICADOS_MS, 600_000)
  })
})

describe('resumenDeErrores', () => {
  test('un campo: su etiqueta y su error', () => {
    assert.equal(resumenDeErrores({ mensaje: 'Cuéntenos un poco más.' }), 'Mensaje: Cuéntenos un poco más.')
  })
  test('varios: cuántos y cuáles, en el orden del formulario', () => {
    assert.equal(resumenDeErrores({ mensaje: 'x', nombre: 'y', tipo: 'z' }), 'Revise 3 campos: Nombre, Tipo de colaboración, Mensaje.')
  })
  test('todos los campos tienen etiqueta y límite', () => {
    for (const c of CAMPOS) assert.ok(LIMITES[c].max > 0)
  })
})
