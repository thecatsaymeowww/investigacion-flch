# Registro: transición de la base local (22-10-2026)

Ejecución real de «Base existente creada con `push`» (`docs/BASE-DE-DATOS.md`, pasos A–H) sobre la base local de trabajo. Solo constan resultados comprobados. No contiene credenciales.

## Base afectada

| Dato | Valor |
|---|---|
| Servicio / contenedor / volumen | `postgres` / `plataforma-postgres-1` / `plataforma_postgres-data` |
| Base / puerto | `plataforma` / 127.0.0.1:5434 |
| Identificador de instancia | `7695829010429321251` |
| PostgreSQL | 16.15 |
| Migración inicial | `20261022_163428_inicial` |

## Estado inicial y final

| | Antes | Después |
|---|---|---|
| `payload_migrations` | `dev \| -1` | `20261022_163428_inicial \| 1` |
| Roles `plataforma_*` | ninguno | `plataforma_owner`, `plataforma_app` |
| Dueño del esquema `public` | `pg_database_owner` | `plataforma_owner` |
| Dueño de tablas, secuencias y enums | `plataforma` (superusuario) | `plataforma_owner` |
| `PUBLIC` puede conectarse | sí | no |
| Huella del esquema | `b74a262b1b1434167ba590a84158cab11f74e1bb71ea5eb683e8a979e6be3968` (666 líneas) | la misma |
| Filas (30 tablas) | inventario de `filas-antes.txt` | 0 diferencias |
| Tuplas insertadas/actualizadas/borradas | 314/16/42 | 315/16/43: el INSERT de la línea base y el DELETE de la fila `dev` |
| `.env` | `DATABASE_URI` con el superusuario | `DATABASE_URI` con `plataforma_app` y `DATABASE_URI_MIGRACIONES` con `plataforma_owner` |

## Respaldo

- Ruta: `%USERPROFILE%\Respaldos\plataforma\20261022-160359`, fuera del repositorio, con acceso solo para el usuario y sin herencia de permisos.
- `plataforma.dump`: SHA-256 `319414d1450f653eaa023fee33a9e19c39dcb410410dbaeed7d4c5e3e9136808`, 186 900 bytes. Índice de 413 entradas, 30 de ellas con datos de tabla.
- Contiene además `media/` (26 archivos, con manifiesto `media-SHA256.txt`), `env.respaldo` (el `.env` anterior) y `SHA256SUMS.txt`. Las cinco sumas se verificaron después de la transición.

## Pasos ejecutados

| Paso | Operación | Código | Resultado comprobado |
|---|---|---|---|
| A | Comprobaciones previas | — | Servicio sano, app detenida, puerto 5435 libre, 0 conexiones, registro `dev\|-1`, sin escrituras desde el respaldo |
| B | Respaldo (primer intento, mismo día) | 0 | El SHA-256 del volcado es igual dentro y fuera del contenedor; `media` con 0 diferencias |
| C | Restauración en un contenedor desechable (tmpfs, 127.0.0.1:5435, instancia distinta) | 0 | 0 filas y 0 líneas de esquema distintas |
| D | Base `referencia` vacía + `roles.sql` + `pnpm migrate` | 0 / 0 | «Esquema verificado»; la huella nueva coincide con la de trabajo (0 líneas distintas) |
| E | Ensayo sobre `copia`: línea base, roles y `pnpm migrate` | 0 / 0 / 0 | «Pendientes antes: ninguna»; permisos según lo previsto |
| F | `baseline-desde-push.sql` en la base de trabajo | 0 | «Huella del esquema: coincide con la esperada»; el registro queda solo con la inicial |
| G | `roles.sql` por la entrada estándar | 0 | Inventario de `verificar-permisos.sql` según lo esperado |
| G | Reescritura de `.env` | — | Destino, usuarios y formato comprobados sin mostrar valores; las contraseñas no aparecen en el log del servidor |
| H | Huella y recuento de filas | 0 | Sin cambios |
| H | `pnpm migrate` | 0 | «Pendientes antes: ninguna. Esquema verificado»; sin escrituras |
| H | `pnpm migrate:status` | 0 | `20261022_163428_inicial \| 1 \| Yes` |
| H | `pnpm build` | 0 | Correcta |
| H | `pnpm start` + 9 GET anónimos | — | 200 en las rutas públicas, en la API y en un archivo de `media`; 404 en una ruta inexistente; la base solo ve sesiones de `plataforma_app`; sin escrituras |

Verificación directa de las conexiones de `.env` (script de solo lectura; las pruebas de DDL se deshicieron con `ROLLBACK`):
- `DATABASE_URI` conecta como `plataforma_app`, que no es superusuario. Recibe `42501` (permiso denegado) en `CREATE TABLE`, `CREATE TEMP TABLE`, `ALTER TABLE`, `TRUNCATE`, `DROP TABLE`, `SET ROLE plataforma_owner` y `CREATE ROLE`. Puede leer y escribir filas.
- `DATABASE_URI_MIGRACIONES` conecta como `plataforma_owner`, que no es superusuario.

## Pruebas no ejecutadas sobre la base real

`pnpm test:aislamiento` no se ejecutó contra la base de trabajo, porque crea y borra documentos y sube un archivo a `media/`. Pasó 56/56 el mismo día contra una restauración del respaldo en un contenedor desechable, desde una réplica del código con su propio `media/` y la configuración anterior a los roles.

## Incidencias

- **Primer intento detenido en el paso D:** `pnpm migrate` no encontraba `pg`. Una limpieza anterior de una réplica había seguido *junctions* de `.next/node_modules` y vaciado cinco paquetes (`pg`, `drizzle-kit`, `pino`, `pino-pretty`, `sharp`). La base no se modificó.
  - Las dependencias se restauraron con `pnpm install --frozen-lockfile --force`, con `optimistic-repeat-install=false` solo para ese proceso. El lockfile no cambió.
  - **Riesgo permanente:** `.next` contiene *junctions* hacia `node_modules`. No borrarlo con `Remove-Item -Recurse` ni con `robocopy` sin `/XJ`.
- **Salidas de la reanudación:** llevan el sufijo `-reanudacion` en el directorio del respaldo, para no sobrescribir las del intento fallido. Entre las de ese intento está un `esquema-referencia.txt` no válido, de una base vacía.
- **Huella de referencia:** es igual al valor de contraste documentado, pero se generó de nuevo migrando una base vacía; no se reutilizó.

## Pendiente

- Conservar el respaldo hasta haber trabajado con normalidad unos días. Después, borrar al menos `env.respaldo`.
- Producción: nada de esto se ha probado fuera de local.
