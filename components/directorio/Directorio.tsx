'use client'

import Link from 'next/link'
import { useState } from 'react'
import { Foto } from '@/components/flch/Foto'
import type { EntradaDirectorio } from '@/lib/cms'
import { ESCUELAS, escuelaPorValor, etiquetaEscuela } from '@/lib/escuelas'
import s from './Directorio.module.css'

/** Sin tildes ni mayúsculas: «humanis» encuentra «HUMANÍS». */
const normalizar = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
const texto = (g: Omit<EntradaDirectorio, 'subgrupos'>) => normalizar(`${g.cabecera} ${g.nombre} ${g.lema} ${escuelaPorValor(g.escuela)?.nombre ?? ''}`)

const TODAS = 'todas'
const SIN_ESCUELA = 'sin-escuela'
const claveEscuela = (g: EntradaDirectorio) => g.escuela ?? SIN_ESCUELA

/** Secciones del modo «Por escuela»: las escuelas en su orden y, al final, los grupos aún sin escuela. */
const SECCIONES = [
  ...ESCUELAS.map((e) => ({
    clave: e.valor as string,
    nombre: e.nombre as string,
    antetitulo: e.valor === 'interdisciplinario' ? 'Varias escuelas' : 'Escuela Profesional',
  })),
  { clave: SIN_ESCUELA, nombre: 'Sin escuela asignada', antetitulo: 'Pendiente' },
]

/**
 * Directorio con búsqueda, filtro por escuela y dos vistas (por escuela o A–Z), todo en el navegador.
 * Si coincide el grupo se muestran todos sus subgrupos; si solo coincide un subgrupo, el grupo aparece
 * con los subgrupos que coinciden. Dentro de cada escuela, el orden que fija el superadmin en el CMS.
 */
export function Directorio({ grupos }: { grupos: EntradaDirectorio[] }) {
  const [q, setQ] = useState('')
  const [escuela, setEscuela] = useState(TODAS)
  const [vista, setVista] = useState<'escuelas' | 'az'>('escuelas')

  const t = normalizar(q.trim())
  const porBusqueda = t
    ? grupos.flatMap((g) => {
        if (texto(g).includes(t)) return [g]
        const subgrupos = g.subgrupos.filter((sg) => texto(sg).includes(t))
        return subgrupos.length ? [{ ...g, subgrupos }] : []
      })
    : grupos
  const filtrados = porBusqueda.filter((g) => escuela === TODAS || claveEscuela(g) === escuela)
  const n = filtrados.length

  const chips = [
    { clave: TODAS, nombre: 'Todas las escuelas', cuenta: porBusqueda.length },
    ...SECCIONES.map((x) => ({ clave: x.clave, nombre: x.nombre, cuenta: porBusqueda.filter((g) => claveEscuela(g) === x.clave).length })).filter(
      (c) => c.cuenta > 0 || c.clave === escuela,
    ),
  ]
  const secciones = SECCIONES.map((x) => ({ ...x, items: filtrados.filter((g) => claveEscuela(g) === x.clave) })).filter((x) => x.items.length)
  const az = [...filtrados].sort((a, b) => a.cabecera.localeCompare(b.cabecera, 'es'))
  const nEscuelas = new Set(grupos.map((g) => g.escuela).filter((e) => e && e !== 'interdisciplinario')).size
  const sinFiltro = !t && escuela === TODAS

  return (
    <>
      <div className={s.filtros}>
        <div className={s.filaFiltros}>
          <label className={s.buscar}>
            <span className="sr-only">Buscar un grupo de investigación</span>
            <span className={s.lupa} aria-hidden="true" />
            <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar grupo por sigla o tema…" />
          </label>
          <div className={s.vistas} role="group" aria-label="Vista">
            <button type="button" aria-pressed={vista === 'escuelas'} onClick={() => setVista('escuelas')}>
              Por escuela
            </button>
            <button type="button" aria-pressed={vista === 'az'} onClick={() => setVista('az')}>
              A–Z
            </button>
          </div>
        </div>
        <div className={s.chips} role="group" aria-label="Filtrar por escuela">
          {chips.map((c) => (
            <button key={c.clave} type="button" className={s.chip} aria-pressed={escuela === c.clave} onClick={() => setEscuela(c.clave)}>
              {c.nombre}
              <span className={s.cuenta}>{c.cuenta}</span>
            </button>
          ))}
        </div>
      </div>

      <p className={s.recuento} aria-live="polite">
        {sinFiltro
          ? `${grupos.length} ${grupos.length === 1 ? 'grupo' : 'grupos'}${nEscuelas ? ` · ${nEscuelas} ${nEscuelas === 1 ? 'escuela profesional' : 'escuelas profesionales'}` : ''}`
          : `${n} de ${grupos.length} grupos`}
      </p>

      {n === 0 ? (
        <p className={s.vacio}>No encontramos grupos con ese criterio.</p>
      ) : vista === 'escuelas' ? (
        <div className={s.secciones}>
          {secciones.map((x) => (
            <section key={x.clave} className={s.seccion} aria-labelledby={`escuela-${x.clave}`}>
              <div className={s.cabSeccion}>
                <span className={s.antetitulo}>{x.antetitulo}</span>
                <h2 id={`escuela-${x.clave}`} className={s.h2}>
                  {x.nombre}
                </h2>
                <span className={s.cuentaSeccion}>
                  {x.items.length} {x.items.length === 1 ? 'grupo' : 'grupos'}
                </span>
              </div>
              <Tarjetas grupos={x.items} />
            </section>
          ))}
        </div>
      ) : (
        <>
          <h2 className="sr-only">Grupos de la A a la Z</h2>
          <Tarjetas grupos={az} />
        </>
      )}
    </>
  )
}

function Tarjetas({ grupos }: { grupos: EntradaDirectorio[] }) {
  return (
    <ul className={s.grilla}>
      {grupos.map((g) => {
        const cuerpo = (
          <>
            <Foto img={g.foto} alt="" pista={`foto o logo · ${g.cabecera}`} className={s.foto} sizes="(max-width: 700px) 100vw, 33vw" />
            <span className={s.cuerpo}>
              <span className={s.fila}>
                <span className={s.sigla}>{g.cabecera}</span>
                {g.conLanding && (
                  <span className={s.flecha} aria-hidden="true">
                    →
                  </span>
                )}
              </span>
              {/* Como en la referencia, la escuela; si el grupo aún no la tiene, su nombre completo. */}
              <span className={s.lema}>{etiquetaEscuela(g.escuela) || g.lema}</span>
            </span>
          </>
        )
        return (
          <li key={g.ruta} className={s.tarjeta}>
            {g.conLanding ? (
              <Link href={`/${g.ruta}`} className={s.principal}>
                {cuerpo}
              </Link>
            ) : (
              <div className={s.principal}>{cuerpo}</div>
            )}
            {g.subgrupos.length > 0 && (
              <ul className={s.subgrupos} aria-label={`Subgrupos de ${g.cabecera}`}>
                {g.subgrupos.map((sg) => (
                  <li key={sg.ruta}>
                    <Link href={`/${sg.ruta}`} className={s.sub}>
                      <span className={s.subEtiqueta}>Subgrupo</span>
                      <span className={s.subNombre}>{sg.cabecera}</span>
                      <span className={s.subFlecha} aria-hidden="true">
                        →
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </li>
        )
      })}
    </ul>
  )
}
