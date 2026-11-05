'use client'

import { useMemo, useState } from 'react'
import f from '@/components/flch/Archivo.module.css'
import { TarjetaPublicacion } from '@/components/flch/TarjetaPublicacion'
import { Portada, type Pub } from '@/components/landing/Portada'
import a from './Archivo.module.css'

const TIPOS = ['Libro', 'Artículo', 'Capítulo', 'Boletín']

/** Clases de cada tema. El de periódico combina su módulo con las clases globales de globals.css. */
const CLASES: Record<'prensa' | 'flch', Record<string, string>> = {
  prensa: { ...a, etiquetaGrupo: 'etiqueta', chip: `chip ${a.chip}`, recuento: 'bajada', titulo: 'pub__titulo', autor: 'pub__autor', enlace: 'pub__pdf' },
  flch: f,
}

/** Búsqueda, filtros por tipo y año, y vista cuadrícula/lista (todo en el navegador, como en el prototipo). */
export function Archivo({ items, variante = 'prensa' }: { items: Pub[]; variante?: 'prensa' | 'flch' }) {
  const s = CLASES[variante]
  const prensa = variante === 'prensa'
  const Tarjeta = prensa ? Portada : TarjetaPublicacion
  const [q, setQ] = useState('')
  const [tipo, setTipo] = useState('Todos')
  const [anio, setAnio] = useState('Todos')
  const [vista, setVista] = useState<'grid' | 'lista'>('grid')
  const anios = useMemo(() => [...new Set(items.map((p) => p.anio))].sort((a, b) => b.localeCompare(a)), [items])

  const t = q.trim().toLowerCase()
  const visibles = items.filter(
    (p) =>
      (tipo === 'Todos' || p.tipo === tipo) && (anio === 'Todos' || p.anio === anio) && (!t || `${p.titulo} ${p.autoria} ${p.tipo}`.toLowerCase().includes(t)),
  )
  const n = visibles.length

  const chips = (grupo: string, valores: string[], actual: string, set: (v: string) => void) => (
    <div className={s.grupo} role="group" aria-label={grupo}>
      <span className={s.etiquetaGrupo} style={prensa ? { marginRight: 4 } : undefined}>
        {grupo}
      </span>
      {['Todos', ...valores].map((v) => (
        <button key={v} type="button" className={s.chip} aria-pressed={v === actual} onClick={() => set(v)}>
          {v}
        </button>
      ))}
    </div>
  )

  return (
    <>
      <section className={s.filtros}>
        <div className={s.fila}>
          <label className={s.buscar}>
            Buscar en el archivo
            <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Título, autoría o tema" />
          </label>
          <div className={s.vistas} role="group" aria-label="Vista">
            <button type="button" aria-pressed={vista === 'grid'} onClick={() => setVista('grid')}>
              Cuadrícula
            </button>
            <button type="button" aria-pressed={vista === 'lista'} onClick={() => setVista('lista')}>
              Lista
            </button>
          </div>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24 }}>
          {chips('Tipo', TIPOS, tipo, setTipo)}
          {chips('Año', anios, anio, setAnio)}
        </div>
        <span className={s.recuento} style={prensa ? { fontSize: 15 } : undefined} aria-live="polite">
          {n} {n === 1 ? 'documento' : 'documentos'} en el archivo
        </span>
      </section>

      {/* Encabezado de la lista (h1 de la página → h2 → h3 de cada documento) */}
      <h2 className="sr-only">Documentos del archivo</h2>
      {n === 0 ? (
        <p className={s.vacio}>No hay documentos que coincidan con la búsqueda.</p>
      ) : vista === 'grid' ? (
        <div className={s.grid}>
          {visibles.map((p) => (
            <Tarjeta key={p.id} pub={p} conCodigo conPdf />
          ))}
        </div>
      ) : (
        <div className={s.lista}>
          {visibles.map((p) => (
            <article key={p.id} className={s.filaItem}>
              <span className={s.anio}>{p.anio}</span>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
                <span className={s.meta}>
                  {p.tipo}
                  {p.codigo && ` · ${p.codigo}`}
                </span>
                <h3 className={s.titulo} style={prensa ? { fontSize: 22 } : undefined}>
                  {p.titulo}
                </h3>
                <span className={s.autor}>{p.autoria}</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end' }}>
                {p.pdf && (
                  <a className={s.enlace} href={p.pdf} target="_blank" rel="noopener">
                    PDF →
                  </a>
                )}
                {p.url && (
                  <a className={s.enlace} href={p.url} target="_blank" rel="noopener">
                    Editorial →
                  </a>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
    </>
  )
}
