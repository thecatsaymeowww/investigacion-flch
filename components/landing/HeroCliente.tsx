'use client'

import { useEffect, useRef } from 'react'
import { fechaPartes } from '@/lib/utils'

/**
 * Comportamiento del hero en el navegador (sin estado de React, solo DOM):
 * - actualiza la fecha de Lima de la cabecera (el HTML puede venir de caché);
 * - máquina de escribir del titular. Lo aún no escrito queda transparente en su
 *   sitio, así los saltos de línea no se mueven mientras se escribe.
 */
export function HeroCliente() {
  const ref = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    const { dia, fecha } = fechaPartes()
    document.querySelectorAll('[data-dia]').forEach((el) => (el.textContent = `${dia} `))
    document.querySelectorAll('[data-fecha]').forEach((el) => (el.textContent = fecha))

    const el = ref.current?.closest<HTMLElement>('[data-tw]')
    if (!el || !el.classList.contains('tw-on') || el.dataset.twListo) return
    el.dataset.twListo = '1'
    const texto = el.querySelector('.tw__fuente')!.textContent!.trim()
    const capa = el.querySelector<HTMLElement>('.tw__capa')!
    // El cursor va dentro de la última letra escrita, así nunca se separa de ella al cortar la línea.
    const escrito = document.createTextNode('')
    const ultima = document.createElement('span')
    const letra = document.createTextNode('')
    const cursor = document.createElement('span')
    const resto = document.createElement('span')
    ultima.className = 'tw__ultima'
    cursor.className = 'tw__cursor'
    cursor.textContent = '|'
    ultima.append(letra, cursor)
    resto.className = 'tw__resto'
    resto.textContent = texto
    capa.replaceChildren(escrito, ultima, resto)

    // Avance por tiempo transcurrido (no por tics), para que no se atrase si el navegador ralentiza los timers.
    const MS_POR_LETRA = 30
    const ESPERA = 350
    let inicio = 0
    let i = 0
    let raf = 0
    const cuadro = (t: number) => {
      if (!inicio) inicio = t
      const n = Math.min(texto.length, Math.max(0, Math.floor((t - inicio - ESPERA) / MS_POR_LETRA)))
      if (n !== i) {
        i = n
        escrito.data = texto.slice(0, Math.max(0, i - 1))
        letra.data = texto.slice(Math.max(0, i - 1), i)
        resto.textContent = texto.slice(i)
      }
      if (i < texto.length) raf = requestAnimationFrame(cuadro)
      else el.classList.add('tw-fin')
    }
    // Empieza cuando la página está visible (no en una pestaña de fondo).
    const empezar = () => (raf = requestAnimationFrame(cuadro))
    if (document.hidden) document.addEventListener('visibilitychange', empezar, { once: true })
    else empezar()
    return () => cancelAnimationFrame(raf)
  }, [])

  return <span ref={ref} hidden />
}
