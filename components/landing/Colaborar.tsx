'use client'

import { useActionState, useId, useState } from 'react'
import type { EstadoEnvio } from '@/app/(sitio)/[grupo]/acciones'
import f from '@/components/flch/Colaborar.module.css'
import { type Campo, LIMITES, TIPO_POR_DEFECTO } from '@/lib/formulario'
import p from './Colaborar.module.css'

type Props = {
  etiqueta: string
  titular: string
  texto: string
  tipos: string[]
  firma: { grupo: string; universidad: string; sigla?: string; escuela?: string; ciudad: string; pais: string }
  /** Marca de tiempo firmada al servir la página (antispam, lib/antispam.ts). */
  marca: string
  accion: (previo: EstadoEnvio, form: FormData) => Promise<EstadoEnvio>
  /** Solo cambia la presentación: el formulario, sus campos y su envío son los mismos en los dos temas. */
  variante?: 'prensa' | 'flch'
  /** Plantilla Grupo («Contactos»): coordinación (integrante coordinador) y correo del grupo. Solo en el tema FLCH. */
  contacto?: { coordinacion: string; correo: string }
}

const INICIAL: EstadoEnvio = { estado: 'inicial' }
const ID_ERROR = 'colaborar-error'

/** Clases de cada tema. El de periódico combina su módulo con las clases globales de globals.css. */
const CLASES: Record<'prensa' | 'flch', Record<string, string>> = {
  prensa: {
    ...p,
    etiqueta: 'etiqueta etiqueta--azul etiqueta--ancha',
    chip: `chip ${p.chip}`,
    enviar: 'btn btn--azul',
    otra: 'btn btn--borde',
  },
  flch: f,
}

export function Colaborar({ etiqueta, titular, texto, tipos, firma, marca, accion, variante = 'prensa', contacto }: Props) {
  const s = CLASES[variante]
  const prensa = variante === 'prensa'
  // Textos de cada tema; los de la Plantilla Grupo son los de su referencia (consulta, no propuesta).
  const t = prensa
    ? { leyenda: 'Tipo de colaboración', mensaje: 'Describa su propuesta en unas líneas', enviar: 'Enviar propuesta', otra: 'Enviar otra propuesta' }
    : { leyenda: 'Motivo', mensaje: 'Describa su consulta en unas líneas', enviar: 'Enviar mensaje', otra: 'Enviar otro mensaje' }
  const [estado, enviar, enviando] = useActionState(accion, INICIAL)
  // Tras un error, React restablece el formulario a sus valores por defecto: son los que se enviaron.
  const v = estado.estado === 'error' ? estado.valores : undefined
  // Sin JavaScript, la página devuelta se monta de nuevo: el tipo elegido sale de lo enviado.
  const [tipo, setTipo] = useState(v?.tipo && tipos.includes(v.tipo) ? v.tipo : (tipos[0] ?? TIPO_POR_DEFECTO))
  // Envío ya agradecido y descartado con "Enviar otra propuesta".
  const [descartado, setDescartado] = useState<number | undefined>()
  const mostrarGracias = estado.estado === 'ok' && estado.envio !== descartado
  const errores = estado.estado === 'error' ? (estado.errores ?? {}) : {}
  const base = useId()
  const id = (campo: Campo) => `${base}-${campo}`
  const idError = (campo: Campo) => `${base}-${campo}-error`
  // Cada campo con error queda marcado y enlazado a SU mensaje; el aviso general (role="alert") los resume.
  const conError = (campo: Campo) => (errores[campo] ? { 'aria-invalid': true, 'aria-describedby': idError(campo) } : {})
  const errorDe = (campo: Campo) =>
    errores[campo] && (
      <span id={idError(campo)} className={s.errorCampo}>
        {errores[campo]}
      </span>
    )

  return (
    <section id="colaborar" className={s.colaborar}>
      <div className={s.grid}>
        <div className={s.texto}>
          {etiqueta && <span className={s.etiqueta}>{etiqueta}</span>}
          <h2 className={s.h2}>{titular}</h2>
          {texto && <p className={s.p}>{texto}</p>}
          {prensa ? (
            <div className={s.firma}>
              {firma.grupo}
              <br />
              {firma.universidad} · {firma.ciudad}, {firma.pais}
            </div>
          ) : (
            <div className={s.firma}>
              <span className={f.firmaGrupo}>{contacto?.coordinacion ? `Coordinación: ${contacto.coordinacion}` : firma.grupo}</span>
              <span>
                {firma.escuela && `${firma.escuela} · `}FLCH · {firma.sigla || firma.universidad}
              </span>
              {contacto?.correo && (
                <a href={`mailto:${contacto.correo}`} className={f.correo}>
                  {contacto.correo}
                </a>
              )}
            </div>
          )}
        </div>

        <div className={s.caja}>
          {mostrarGracias ? (
            <div className={s.gracias}>
              <span className={s.etiqueta}>Mensaje recibido</span>
              <h3>Gracias, {estado.nombre || (prensa ? 'lector' : 'colega')}.</h3>
              <p>
                {prensa && 'Su propuesta ya está en la mesa de redacción. '}Le escribiremos a {estado.correo}.
              </p>
              <button
                type="button"
                className={s.otra}
                style={prensa ? { fontSize: 12, padding: '11px 18px', alignSelf: 'flex-start', marginTop: 8 } : undefined}
                onClick={() => setDescartado(estado.envio)}
              >
                {t.otra}
              </button>
            </div>
          ) : (
            <form key={descartado ?? 0} action={enviar} className={s.form}>
              <input type="hidden" name="marca" value={marca} />
              {/* La etiqueta y el error son hermanos del campo: el error no forma parte de su nombre accesible. */}
              <div className={s.fila}>
                <div className={s.campo}>
                  <label htmlFor={id('nombre')}>Nombre</label>
                  <input
                    id={id('nombre')}
                    name="nombre"
                    required
                    maxLength={LIMITES.nombre.max}
                    autoComplete="name"
                    placeholder="Nombre y apellidos"
                    defaultValue={v?.nombre}
                    {...conError('nombre')}
                  />
                  {errorDe('nombre')}
                </div>
                <div className={s.campo}>
                  <label htmlFor={id('correo')}>Correo</label>
                  <input
                    id={id('correo')}
                    name="correo"
                    type="email"
                    required
                    maxLength={LIMITES.correo.max}
                    autoComplete="email"
                    placeholder="nombre@correo.com"
                    defaultValue={v?.correo}
                    {...conError('correo')}
                  />
                  {errorDe('correo')}
                </div>
              </div>
              <div className={s.campo}>
                <label htmlFor={id('institucion')}>Institución</label>
                <input
                  id={id('institucion')}
                  name="institucion"
                  maxLength={LIMITES.institucion.max}
                  autoComplete="organization"
                  placeholder="Universidad, revista, colectivo…"
                  defaultValue={v?.institucion}
                  {...conError('institucion')}
                />
                {errorDe('institucion')}
              </div>
              {/* aria-invalid no se admite en un grupo: aquí solo se enlaza el error. */}
              <fieldset className={`${s.campo} ${s.tipos}`} aria-describedby={errores.tipo ? idError('tipo') : undefined}>
                <legend>{t.leyenda}</legend>
                <input type="hidden" name="tipo" value={tipo} />
                <div className={s.chips}>
                  {tipos.map((t) => (
                    <button key={t} type="button" className={s.chip} aria-pressed={t === tipo} onClick={() => setTipo(t)}>
                      {t}
                    </button>
                  ))}
                </div>
                {errorDe('tipo')}
              </fieldset>
              <div className={s.campo}>
                <label htmlFor={id('mensaje')}>Mensaje</label>
                <textarea
                  id={id('mensaje')}
                  name="mensaje"
                  required
                  maxLength={LIMITES.mensaje.max}
                  rows={5}
                  placeholder={t.mensaje}
                  defaultValue={v?.mensaje}
                  {...conError('mensaje')}
                />
                {errorDe('mensaje')}
              </div>
              {/* Campo trampa para robots (5.2, subfase 4c): su contenedor no se muestra (display:none), así que no se ve,
                  no recibe foco ni lo anuncia un lector de pantalla, sin aria-hidden sobre un campo. Si la hoja de estilos
                  no cargara, la etiqueta pide dejarlo en blanco. El servidor rechaza el envío si llega lleno. */}
              <div className={s.trampa}>
                <label>
                  Deje este campo en blanco
                  <input type="text" name="sitio_web" autoComplete="off" />
                </label>
              </div>
              {estado.estado === 'error' && (
                <p key={estado.intento} id={ID_ERROR} role="alert" className={s.error}>
                  {estado.mensaje}
                </p>
              )}
              <button type="submit" className={s.enviar} style={prensa ? { padding: '15px 26px', alignSelf: 'flex-start' } : undefined} disabled={enviando}>
                {enviando ? 'Enviando…' : t.enviar}
              </button>
            </form>
          )}
        </div>
      </div>
    </section>
  )
}
