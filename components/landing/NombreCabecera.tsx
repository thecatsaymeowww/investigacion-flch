/** "Prensa y Literatura" → la conjunción va en cursiva, como en el logotipo del prototipo. */
export function NombreCabecera({ nombre }: { nombre: string }) {
  const partes = nombre.split(/(\s(?:y|e)\s)/)
  return (
    <>
      {partes.map((p, i) =>
        /^\s(?:y|e)\s$/.test(p) ? (
          <span key={i}>
            {' '}
            <span className="logo-y">{p.trim()}</span>{' '}
          </span>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </>
  )
}
