import { connection } from 'next/server'
import { Directorio as Tarjetas } from '@/components/directorio/Directorio'
import b from '@/components/flch/base.module.css'
import { Cabecera } from '@/components/flch/Cabecera'
import { Pie } from '@/components/flch/Pie'
import { TemaFlch } from '@/components/temas/TemaFlch'
import { listarGrupos } from '@/lib/cms'
import s from './directorio.module.css'

/** Menú principal: grupos con landing publicada y, debajo de cada uno, sus subgrupos (directorio v2 de Claude Design). */
export default async function Directorio() {
  // Se genera bajo demanda (no en el build): así `pnpm build` funciona sin base de datos.
  // Los datos siguen en caché (tag `directorio`) y se invalidan al publicar.
  await connection()
  const grupos = await listarGrupos()
  // Se cuentan los publicados que muestra el directorio: grupos principales y, aparte, sus subgrupos.
  const nSubgrupos = grupos.reduce((n, g) => n + g.subgrupos.length, 0)
  return (
    <TemaFlch>
      <Cabecera />
      <section className={`oscuro ${s.hero}`}>
        <div className={s.inner}>
          <div className={s.texto}>
            <h1 className={s.h1}>Grupos de Investigación</h1>
            <p className={s.intro}>
              En la Facultad de Letras y Ciencias Humanas, además de las actividades lectivas, se realizan investigaciones en distintos campos del quehacer
              humanístico. Estas plantean alternativas a los problemas nacionales.
            </p>
          </div>
          {/* La referencia muestra también investigadores y proyectos: no hay datos en el CMS, se omiten. */}
          <div className={s.cifras}>
            <div className={s.cifra}>
              <span className={s.valor}>{grupos.length}</span>
              <span className={s.etiqueta}>{grupos.length === 1 ? 'grupo de investigación' : 'grupos de investigación'}</span>
            </div>
            <div className={s.cifra}>
              <span className={`${s.valor} ${s.valorOro}`}>{nSubgrupos}</span>
              <span className={s.etiqueta}>{nSubgrupos === 1 ? 'subgrupo' : 'subgrupos'}</span>
            </div>
          </div>
        </div>
      </section>
      <main className={`${b.contenedor} ${b.principal}`} style={{ paddingBottom: 64 }}>
        {grupos.length ? <Tarjetas grupos={grupos} /> : <p className={s.vacio}>Todavía no hay grupos publicados.</p>}
      </main>
      <Pie variante="directorio" />
    </TemaFlch>
  )
}
