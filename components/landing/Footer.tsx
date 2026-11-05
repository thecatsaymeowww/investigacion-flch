import { NombreCabecera } from './NombreCabecera'

export function Footer({ nombre, grupo, universidad }: { nombre: string; grupo: string; universidad: string }) {
  return (
    <footer className="footer">
      <div className="footer__inner">
        <div className="footer__logo">
          <NombreCabecera nombre={nombre} />
        </div>
        <div className="footer__creditos">
          {grupo}
          <br />
          {universidad} · {new Date().getFullYear()}
        </div>
      </div>
    </footer>
  )
}
