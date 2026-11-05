# Base de datos: migraciones, roles y recuperación

PostgreSQL 16 a través de Payload 3.90.2 (`@payloadcms/db-postgres`, Drizzle). Este documento cubre los
hallazgos T-01 (migraciones) y H-06 (privilegios) del informe de auditoría del 22-10-2026 (documento interno, no incluido en el repositorio), y los
R-01 a R-05 de la revisión de cierre de la Fase 0–1.

## Modelo

| Rol | Para qué | Atributos | Privilegios |
|---|---|---|---|
| Superusuario del contenedor (`POSTGRES_USER`) | Administrar el clúster: crear la base, respaldar, restaurar y ejecutar los scripts de `deploy/postgres/` | El de la imagen de Docker | Todos. **Ni la app ni las migraciones lo usan** |
| `plataforma_owner` | Dueño del esquema `public` y de todos sus objetos. Solo lo usa `pnpm migrate` | `LOGIN`, sin `SUPERUSER`, `CREATEDB`, `CREATEROLE`, `REPLICATION` ni `BYPASSRLS` | Crear, alterar y borrar objetos de `public`, porque es su dueño |
| `plataforma_app` | Next.js + Payload en ejecución (`DATABASE_URI`) | `LOGIN`, `NOINHERIT`, sin atributos administrativos; no es miembro de `plataforma_owner` | `CONNECT` a la base; `USAGE` en `public`; `SELECT, INSERT, UPDATE, DELETE` en las tablas, salvo `payload_migrations` (solo `SELECT`) y `registro_cambios` (solo `SELECT, INSERT`); `USAGE, SELECT` en todas las secuencias. Sin `CREATE`, `TEMP`, `TRUNCATE`, `REFERENCES` ni `TRIGGER` |

- **Objetos futuros:** las tablas y secuencias que cree `plataforma_owner` (es decir, futuras migraciones) reciben esos mismos permisos para la app gracias a `ALTER DEFAULT PRIVILEGES`.
- **Tablas restringidas (subfase 3b):**
  - `payload_migrations` solo la escriben las migraciones;
  - `registro_cambios` es el registro de auditoría: la app añade entradas, pero no las cambia ni las borra.
  - Su clave foránea a `grupos` (`ON DELETE SET NULL`) la aplica Postgres como dueño de la tabla, así que sigue funcionando sin `UPDATE` para la app (comprobado).

### Qué conexión usa cada componente (subfase 3b)

| Componente | Conexión | Rol | Garantía |
|---|---|---|---|
| Servidor (`next start`/`dev`) y `payload run` (semilla, pruebas, importación) | `DATABASE_URI` (`.env`) | `plataforma_app` | La guardia de arranque, en `onInit`: `scripts/guardia-conexion.ts` |
| `pnpm migrate`, `pnpm migrate:status` | `DATABASE_URI_MIGRACIONES` (entorno o **`.env.migraciones`**) | `plataforma_owner` | `scripts/migrar.mjs`: se niega si la variable está en `.env` o `.env.local`; protección del destino de la 3a |
| `pnpm migrate:create`, `pnpm verificar` (pasos estáticos) | Ninguna | — | `disableDBConnect`; la deriva se calcula con una `DATABASE_URI` inalcanzable |
| Administración (`roles.sql`, respaldos, restauraciones, marca de desechable, línea base) | `docker exec` / `docker compose exec` dentro del contenedor | Superusuario del contenedor | Ni la app ni las migraciones lo usan |

**Guardia de arranque.** Al iniciarse Payload, salvo en `payload migrate`, que no ejecuta `onInit`, la aplicación hace dos cosas:
1. **Retira credenciales de su entorno:** quita `DATABASE_URI_MIGRACIONES` y `POSTGRES_PASSWORD`. Next y Payload cargan **todo** `.env`.
2. **Comprueba su rol y se niega a arrancar** si tiene cualquiera de estos privilegios:
   - superusuario, `CREATEROLE`, `CREATEDB`, `BYPASSRLS` o `REPLICATION`;
   - pertenencia al dueño del esquema;
   - `CREATE` en el esquema o en la base;
   - la propiedad de alguna tabla.

   No hay ninguna variable que la desactive. Probado: con `plataforma_owner` y con el superusuario, la app no arranca; con `plataforma_app`, sí.

**`.env.migraciones`.**
- **Qué contiene:** una sola línea, `DATABASE_URI_MIGRACIONES=postgres://plataforma_owner:…`.
- **Quién lo lee:** solo `scripts/migrar.mjs`. Next y Payload no lo cargan, porque solo leen `.env`, `.env.local` y `.env.<modo>`.
- **Git:** lo ignora (`.env.*`).
- **`POSTGRES_PASSWORD`:** sigue en `.env` porque la usa Docker Compose. La app la retira de su entorno al arrancar, aunque el cargador de Next la haya leído. En producción, esa contraseña no debería estar en el equipo de la app.
- **Conexiones:** `PUBLIC` no puede conectarse a la base.
- **RLS:** no hay Row-Level Security. El aislamiento entre grupos lo hace la aplicación (plugin multi-tenant, `exigirMismoGrupo`, `lib/cms`) y lo cubre `pnpm test:aislamiento`. Estos roles limitan el daño de un fallo de la app, pero no aíslan grupos.

### Scripts de `deploy/postgres/`

Todos se ejecutan **dentro del contenedor** con el `psql` de la imagen (en el equipo no hace falta tener `psql`), como superusuario y, salvo `roles.sql`, sin credenciales.

| Script | Qué hace | Escribe |
|---|---|---|
| `roles.sql` | Crea o ajusta los dos roles, transfiere la propiedad y fija los permisos. Idempotente. Con las dos contraseñas (`\set`), crea los roles o rota sus claves; sin ninguna, **solo repara** atributos y permisos de roles que ya existen, sin tocar las claves. Con una sola, se detiene | Roles, dueños y permisos |
| `baseline-desde-push.sql` | Registra la migración inicial en una base creada con `push`, **solo si la huella del esquema coincide** | Solo `payload_migrations` |
| `huella-esquema.sql` | Huella SHA-256 del esquema normalizado y, con `-v detalle=1`, sus líneas | Nada |
| `recuento-filas.sql` | Filas exactas por tabla | Nada |
| `verificar-permisos.sql` | Inventario de roles, dueños y privilegios | Nada |

### Reparar los permisos de una base existente (sin cambiar contraseñas)

Para una base que ya tiene los dos roles, como la de trabajo. Sin `\set`, `roles.sql`:
- **no cambia** contraseñas, **no crea ni borra** roles y **no toca** datos;
- solo fija atributos, dueños y permisos, incluidas las restricciones de `payload_migrations` y `registro_cambios`;
- es idempotente: una segunda ejecución da el mismo resultado.

Es una operación de administración: la hace el superusuario del contenedor, **con autorización** y después de un respaldo (paso B).
1. **Destino:** comprobar que `docker compose ps` es el proyecto y el contenedor que se quiere reparar. En una base real, no seguir sin la autorización expresa.
2. **Antes:** guardar la salida de `verificar-permisos.sql` (paso H).
3. **Reparar:** `docker compose cp deploy/postgres postgres:/tmp/plataforma-sql`, y después el comando de «Vuelta atrás», «Configuración».
4. **Después:** `verificar-permisos.sql` debe mostrar:
   - `app en payload_migrations | SELECT` y `app en registro_cambios | INSERT,SELECT`;
   - `tablas sin SELECT/INSERT/UPDATE/DELETE para app | 2`, que son esas dos;
   - la app sin CREATE ni TEMP, y los contadores de membresías, TRUNCATE y `setval` en 0.
5. **La app:** no hace falta reiniciarla, porque los permisos rigen desde la siguiente sentencia. Comprobar las páginas y `/admin`.

**Ensayado el 03-11-2026 en el clon**, que es otro clúster. Primero se reprodujeron en él los permisos actuales de la base de trabajo.
- Con esos permisos, la app **podía** modificar y borrar `payload_migrations` y `registro_cambios`.
- `roles.sql` sin contraseñas, ejecutado dos veces, terminó sin errores y con el mismo resultado.
- Las contraseñas quedaron intactas: la huella de `pg_authid` era igual antes y después.
- Los privilegios efectivos salieron como se esperaba (44/44): cada operación se probó conectado como cada rol y se deshizo.

## Migraciones

`payload.config.ts` fija `push: false` en **todos** los entornos. El esquema solo cambia con migraciones versionadas en `migrations/`, que contiene:
- un `.ts` por migración;
- su snapshot `.json`, que es la base del siguiente diff;
- `index.ts`, el registro de migraciones que genera Payload.

| Comando | Qué hace | Conexión |
|---|---|---|
| `pnpm migrate:create <nombre>` | Genera una migración comparando las colecciones con el último snapshot. No se conecta a la base (Payload la arranca con `disableDBConnect`) | Ninguna |
| `pnpm migrate --confirmar=<host:puerto/base>` | Aplica las pendientes, cada una en su propia transacción, las registra en `payload_migrations` y **verifica el resultado** (ver abajo). **Solo en una base desechable autorizada** (ver «Protección del destino») | `DATABASE_URI_MIGRACIONES` (propietario) |
| `pnpm migrate:status` | Lista las migraciones y si están **registradas**. No comprueba el esquema. Misma protección de destino, sin confirmación | `DATABASE_URI_MIGRACIONES` |
| `pnpm verificar:migraciones` | Comprobación estática: carpeta, `index.ts`, snapshots, configuración y deriva entre colecciones y último snapshot. No ejecuta migraciones ni se conecta (README, «Verificación») | Ninguna |

El nombre `migrate:create` es el de Payload y se mantiene (equivale al `migrate:generate` de otros proyectos). **No hay `migrate:down`**: ver «Reversión».

`scripts/migrar.mjs` toma `DATABASE_URI_MIGRACIONES` del entorno o de `.env.migraciones` y la pasa como `DATABASE_URI` solo al proceso de la migración.
- **Si falta:** se niega a ejecutar, y **nunca** recurre a `DATABASE_URI`.
- **Si solo está en `.env` o `.env.local`:** se niega con código 2 y pide moverla, porque esos archivos los carga la app (subfase 3b).

### Protección del destino (subfase 3a)

La base real queda **fuera del alcance** de `pnpm migrate` y `pnpm migrate:status`. Solo trabajan con bases **desechables**, y lo comprueban en capas. Si cualquier comprobación falla, se detienen. No hay ninguna variable que las desactive.

| Capa | Comprobación | Si falla |
|---|---|---|
| 1. Antes de conectarse | El destino de `DATABASE_URI_MIGRACIONES` (`host:puerto/base`) es local: `127.0.0.1` o `::1`. `localhost` **no** basta, porque puede resolver a otra cosa | Código **2**, sin conectarse |
| 2. Antes de conectarse | `MIGRAR_BD_DESECHABLE` es exactamente ese destino. Se lee **solo del entorno del proceso**: escrita en `.env` no cuenta | Código **2**, sin conectarse |
| 3. Antes de conectarse | Solo `migrate`: `--confirmar=<host:puerto/base>` con ese mismo destino | Código **2**, sin conectarse |
| 4. Conectado (solo lectura) | La base lleva la marca `plataforma:desechable` en su comentario (`COMMENT ON DATABASE`). La base real no la tiene y **nunca** debe ponérsele | Código **2** |
| 5. Conectado | Solo `migrate`: cerrojo de Postgres (`pg_try_advisory_lock(4723001)`), que impide dos ejecuciones a la vez en la misma base. Se libera solo al terminar o al interrumpirse el proceso | Código **4** |
| 6. Dentro de Payload | `scripts/guardia-migraciones.ts` envuelve el adaptador (`protegerMigraciones` en `payload.config.ts`): `migrate` repite las capas 1, 2 y 4, también para `pnpm payload migrate`, que no pasa por `migrar.mjs`. `migrate:down`, `:fresh`, `:refresh` y `:reset` se rechazan **siempre** | Error, sin tocar la base |

Una base desechable se prepara así (ilustrativo; las pruebas del 02-11-2026 siguieron estos pasos en un contenedor `--tmpfs`):

```powershell
docker exec <contenedor> createdb -U postgres <base>
# roles.sql en esa base, como en «Instalación nueva», paso 3
"COMMENT ON DATABASE <base> IS 'plataforma:desechable';" | docker exec -i <contenedor> psql -X -q -U postgres -d postgres -f -
$env:DATABASE_URI_MIGRACIONES = 'postgres://plataforma_owner:<clave>@127.0.0.1:<puerto>/<base>'
$env:MIGRAR_BD_DESECHABLE = '127.0.0.1:<puerto>/<base>'
pnpm migrate:status
pnpm migrate --confirmar=127.0.0.1:<puerto>/<base>
Remove-Item Env:DATABASE_URI_MIGRACIONES, Env:MIGRAR_BD_DESECHABLE
```

**Base real y producción.** Migrarlas requiere una decisión y un procedimiento propios, con respaldo previo y la revisión del SQL, y queda pendiente para la preparación del despliegue. La base de trabajo tiene aplicadas las dos primeras migraciones del repositorio, y su esquema es idéntico al que crean desde cero (misma huella, comprobado el 02-11-2026).

> ⚠️ **La base de trabajo está dos migraciones por detrás (desde el 03-11-2026).** Las dos son aditivas: no borran ni
> transforman datos. Están probadas solo en el clon.
> - **`20261103_201313_antispam_4c`** (subfase 4c): añade la opción `posible-spam` al enum de estado de `mensajes` y la
>   columna `duplicado_de_id`, con su clave foránea `ON DELETE SET NULL` y su índice.
> - **`20261103_215923_imagenes_5b`** (subfase 5b): añade a `media` las 24 columnas `sizes_<tamaño>_*` de los tamaños
>   derivados (`tarjeta`, `media`, `grande` y `og`), con un índice por nombre de archivo. Después habría que reprocesar
>   las imágenes existentes («Reprocesar las imágenes»).
> - **Hasta autorizar** migrar la base de trabajo, con respaldo previo, **no** hay que compilar ni arrancar el original
>   con el código actual (`pnpm build`, `pnpm dev`): al leer o crear mensajes fallaría la columna que falta.
> - **La web local** sigue sirviendo el build anterior a la 4c.
> - **Comprobar que no se ha aplicado:** con una consulta de solo lectura a `payload_migrations`.

`pnpm migrate` no da por bueno el código de salida de Payload. Payload termina con 0 sin migrar si encuentra la fila `dev` de `push` y no se acepta su pregunta. Por eso el wrapper:

| Momento | Comprobación | Si falla |
|---|---|---|
| Antes | Protección del destino (capas 1 a 5, arriba) | Código **2** o **4** |
| Antes | Dos migraciones con el mismo nombre en `migrations/` (por ejemplo `x.ts` y `x.js`): Payload ejecutaría las dos | Código **2** |
| Antes | Fila `dev` (batch -1) en `payload_migrations` | Código **2**, Payload no se lanza. Seguir «Base existente creada con `push`» |
| Antes | Migraciones registradas que no están en `migrations/` (código desactualizado) | Código **2** |
| Antes | Tablas en `public` sin `payload_migrations` (estado indeterminado) | Código **2** |
| Durante | Payload se lanza sin entrada estándar: ninguna pregunta puede aceptarse sin querer | — |
| Después | Toda migración de `migrations/` registrada con batch > 0 y ninguna fila `dev` | Código **3** |
| Después | El esquema contiene las tablas, columnas y enums (con sus valores en orden) del snapshot `.json` de la última migración | Código **3** |
| — | Fallo de conexión o variable ausente | Código **1** |

Resultado correcto: código 0 y la línea `[migrar] Aplicadas ahora: … Pendientes: ninguna. Esquema verificado contra <última>.json: 30 tablas, 319 columnas, 16 enums.` (con `20261103_201313_antispam_4c` como última; con `20261030_161656_escuela_grupos`, 318 columnas).

Límite: la verificación posterior comprueba que existe lo que define el snapshot, pero no tipos, índices ni restricciones ni objetos de más. La comprobación completa es la huella (`huella-esquema.sql`), que se usa en la transición.

- **Comandos destructivos:** `migrate:fresh`, `migrate:reset`, `migrate:refresh` y `migrate:down` **no** tienen atajo, y el adaptador los rechaza aunque se llamen con `pnpm payload` (capa 6).
- **El `down` de la inicial** borra **todas** las tablas. Los `down` generados se conservan como documentación del cambio, no como mecanismo de vuelta atrás.

### Reversión

Payload y Drizzle no ofrecen una reversión automática fiable:
- `migrate:down` ejecuta el `down` del último lote, que puede borrar tablas y datos;
- un `down` no recupera datos borrados ni transformados por su `up`.

Por eso no se expone. La vuelta atrás es siempre una de estas dos:
1. **Migración correctiva:** una migración nueva que deshace el cambio de esquema, revisada como cualquier otra.
2. **Restauración del respaldo** tomado antes de migrar, en una base nueva: «Vuelta atrás», «Datos o esquema».

### Revisar una migración antes de aplicarla

1. **Leer el `up` completo** del `.ts`. Buscar `DROP`, `ALTER … TYPE`, `NOT NULL` sin valor por defecto, `TRUNCATE` y `DELETE`.
   `pnpm verificar:migraciones` lista como aviso las sentencias destructivas de `up`.
2. **Comprobar la deriva:** `pnpm verificar:migraciones` debe aprobar, porque el snapshot nuevo tiene que coincidir con las colecciones.
3. **Aplicarla en una base desechable:**
   - en una base vacía, para comprobar que construye el esquema desde cero;
   - en una restauración de la base de trabajo, para comprobar que respeta los datos.
4. **Comprobar el resultado:**
   - `pnpm migrate` dice «Esquema verificado»;
   - `pnpm migrate:status` la marca como aplicada;
   - la huella (`huella-esquema.sql`) de la base desechable es la esperada;
   - `pnpm verificar`, con `VERIFICAR_BD_DESECHABLE` apuntando a esa base, aprueba.

### Cambiar el esquema (desarrollo)

1. Modificar la colección en `payload/collections/`.
2. `pnpm migrate:create descripcion-corta` y **revisar el SQL** generado: «Revisar una migración antes de aplicarla».
3. `pnpm migrate --confirmar=…` en una base **desechable** («Protección del destino») y `pnpm generate` (tipos). `pnpm test:aislamiento`, solo en un entorno desechable (ver «`pnpm test:aislamiento`: solo en un entorno desechable»).
4. Versionar juntos el `.ts`, el `.json` y `index.ts`.
5. **Nunca editar** una migración ya aplicada en otro entorno: se crea una nueva.

Como `pnpm dev` ya no sincroniza el esquema, si se cambia una colección sin migrar, la app fallará con «column … does not exist». Es intencionado.

### `pnpm test:aislamiento`: solo en un entorno desechable

La prueba (`scripts/test-aislamiento.ts`) **escribe**:
- **En la base de `DATABASE_URI`:** crea un subgrupo temporal de LITARTMO con su landing y su editor (contraseña solo en memoria); integrantes, una publicación, una actividad, un evento y dos mensajes (uno en el subgrupo temporal y otro en el grupo de demostración); y dos registros de `media`. Los borra al final, también si una comprobación falla. Las escrituras quedan en el registro de cambios.
- **En el `media/` del proyecto:** sube dos imágenes generadas en memoria, que se borran con sus registros. Si una creación falla después de que Payload escriba el archivo, la prueba borra al final los archivos con su marca única que ningún registro usa.
- **Si el proceso se interrumpe:** los temporales pueden quedarse. Si falla una comprobación de aislamiento, la escritura que debía rechazarse (por ejemplo, renombrar un integrante de otro grupo) sí se aplica.

Además, necesita los grupos y las cuentas **ficticios** de la semilla; no usa contenido real ni lee `.env.credenciales`.

Por eso se ejecuta **solo** contra una base desechable (por ejemplo, una restauración del respaldo en un contenedor aparte) y desde una copia del proyecto con su propio `media/`. **Nunca** contra la base de trabajo ni la de producción.

**Comprobada con los roles el 28-10-2026**, en bases nuevas y desechables de un contenedor aparte, creadas según «Instalación nueva»:
- `pnpm migrate` se ejecutó con `plataforma_owner`, que quedó como dueño de todas las tablas.
- `pnpm seed` y `pnpm test:aislamiento` se ejecutaron con `DATABASE_URI` = `plataforma_app`. En la segunda base, las muestras de `pg_stat_activity` tomadas durante la semilla, el servidor y la prueba solo mostraron conexiones de `plataforma_app`.
- Resultados: 61/61 con la primera versión de esta prueba y 74/74 con la versión actual, que añade controles positivos y solo acepta rechazos 4xx. También se comprobó que, cuando una comprobación falla, la prueba termina con código 1 y borra igualmente sus temporales.

La ejecución de 56/56 del 22-10-2026 corresponde a la versión anterior de la prueba, que usaba contenido real, y a la configuración anterior a los roles.

## Preparación de la sesión (Windows PowerShell 5.1)

Todos los procedimientos siguientes se escriben para **Windows PowerShell 5.1** y se ejecutan **en una sola ventana**, en la raíz del proyecto. Las variables (contraseñas, rutas) existen solo en esa ventana; si se cierra a medias, se repite este bloque y se retoma.

Herramientas: Docker Desktop con Compose v2 o superior (probado con v5.3.1), Node 20.9+, pnpm 11. **No** se usan `psql`, `pg_dump`, `openssl` ni Bash en el equipo: todo lo de Postgres corre dentro del contenedor.

```powershell
# Abrir PowerShell en la raíz del proyecto (la carpeta que contiene package.json y deploy\postgres\)
if (-not ((Test-Path .\package.json) -and (Test-Path .\deploy\postgres\roles.sql))) { throw 'Ejecutar desde la raíz del proyecto' }
$OutputEncoding = New-Object System.Text.UTF8Encoding $false                        # texto UTF-8 hacia docker
function Nueva-Clave {   # 24 bytes aleatorios del generador criptográfico, en hexadecimal (48 caracteres)
  $b = New-Object byte[] 24
  $g = [Security.Cryptography.RandomNumberGenerator]::Create(); $g.GetBytes($b); $g.Dispose()
  -join ($b | ForEach-Object { $_.ToString('x2') })
}
```

Reglas para no estropear comandos ni filtrar secretos:
- **Contraseñas solo por entrada estándar:** `roles.sql` las recibe por la entrada estándar de `psql` (`\set …` + `\i`), nunca con `-v` en la línea de comandos, donde quedarían en la lista de procesos. Se generan en memoria con `Nueva-Clave` y el historial de PowerShell solo guarda el nombre de la variable, no su valor. No ejecutar estos procedimientos bajo `Start-Transcript`.
- **Formato:** hexadecimal, sin caracteres especiales, para que valgan tal cual en una URI y dentro de las comillas de `psql`.
- **Sin comillas dobles dentro de `sh -c '…'`:** PowerShell 5.1 las altera al pasarlas a programas nativos. Por eso el SQL entra por la entrada estándar o desde archivos.
- **Sin `>` para datos binarios:** PowerShell 5.1 corrompe los binarios redirigidos con `>`. El volcado se escribe dentro del contenedor y se copia con `docker compose cp`.

## Instalación nueva (base vacía)

1. Crear `.env` (app y Compose) y `.env.migraciones` (propietario) con contraseñas nuevas. No se muestran:
   ```powershell
   Copy-Item .env.example .env
   $ClaveOwner = Nueva-Clave; $ClaveApp = Nueva-Clave
   $t = [IO.File]::ReadAllText("$PWD\.env")
   $t = $t.Replace('CHANGE_ME_POSTGRES_PASSWORD', (Nueva-Clave)).Replace('CHANGE_ME_PAYLOAD_SECRET', (Nueva-Clave))
   $t = $t.Replace('CHANGE_ME_APP_PASSWORD', $ClaveApp)
   [IO.File]::WriteAllText("$PWD\.env", $t, (New-Object System.Text.UTF8Encoding $false))
   # La conexión del propietario, en su propio archivo (la app carga todo .env; este no)
   [IO.File]::WriteAllText("$PWD\.env.migraciones", "DATABASE_URI_MIGRACIONES=postgres://plataforma_owner:$ClaveOwner@127.0.0.1:5434/giflch`n", (New-Object System.Text.UTF8Encoding $false))
   ```
   Si se cambian `POSTGRES_DB` o `POSTGRES_PORT` en `.env`, ajustar también la base y el puerto en `.env.migraciones`.
2. `pnpm db:up` y esperar a que `docker compose ps postgres` muestre `(healthy)`. La imagen crea la base `POSTGRES_DB` con el superusuario.
3. Roles y privilegios, con las mismas contraseñas que acaban de ir a `.env`:
   ```powershell
   docker compose exec -T postgres rm -rf /tmp/plataforma-sql
   docker compose cp deploy/postgres postgres:/tmp/plataforma-sql
   @("\set owner_password '$ClaveOwner'", "\set app_password '$ClaveApp'", '\i /tmp/plataforma-sql/roles.sql') |
     docker compose exec -T postgres sh -c 'psql -X -q -v ON_ERROR_STOP=1 -U $POSTGRES_USER -d $POSTGRES_DB -f -'
   Remove-Variable ClaveOwner, ClaveApp, t
   ```
   Debe terminar con la tabla de los dos roles (`rolsuper = f`; `rolinherit = f` para la app) y sin `ERROR`.
4. Solo si esta instalación es **desechable** (pruebas, clon): marcarla y migrar, como en «Protección del destino».
   - Correcto si sale con código 0, dice «Aplicadas ahora: 20261022_163428_inicial, 20261030_161656_escuela_grupos, 20261103_201313_antispam_4c» y «Esquema verificado».
   - Una instalación con datos reales, o de producción, no se migra con este comando: queda pendiente (ver
     «Protección del destino»).
5. Solo en local: `pnpm seed` (grupos de demostración y cuentas; el contenido real es opcional: README, «Contenido real (opcional)»).
6. `pnpm build` y `pnpm start`. `pnpm test:aislamiento`, en otra ventana, solo si esta instalación es desechable (ver «`pnpm test:aislamiento`: solo en un entorno desechable»).

`roles.sql` es idempotente: se puede volver a ejecutar en cualquier momento (por ejemplo, para rotar contraseñas o reparar permisos). No borra datos, roles ni objetos, y no toca otras bases del clúster.

## Base existente creada con `push`

> La base local de trabajo ya pasó por este procedimiento el 22-10-2026 (registro interno de la transición, no incluido en el repositorio). Esta sección sirve para cualquier otra base creada con `push`.

Una base creada con el `push` de desarrollo tiene la fila `dev | -1` en `payload_migrations` y todos sus objetos pertenecen al superusuario. `pnpm migrate` se niega a tocarla (código 2). La transición consiste en:
1. registrar la migración inicial **sin ejecutarla** (línea base), solo si el esquema es idéntico al que crea esa migración;
2. crear los roles;
3. cambiar `.env`.

Datos del proyecto que usa el procedimiento:
- servicio de compose `postgres` (contenedor `plataforma-postgres-1`);
- volumen `plataforma_postgres-data`;
- base y superusuario: `POSTGRES_DB` y `POSTGRES_USER` de `.env`, que los comandos leen **dentro** del contenedor;
- puerto: `POSTGRES_PORT`, 5434 por defecto.

Prerrequisitos no garantizados, que hay que comprobar en A:
- Docker Desktop en marcha;
- el puerto 5435 libre para el contenedor desechable;
- espacio en disco para el volcado, más `media/` dos veces.

**Criterio general:** si cualquier comprobación marcada con ⛔ no da el resultado indicado, **detenerse**. No seguir al paso siguiente. Ver «Vuelta atrás».

### A. Comprobaciones previas

```powershell
docker compose ps postgres                                              # ⛔ estado running (healthy)
Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue   # ⛔ sin salida (app detenida)
Get-NetTCPConnection -LocalPort 5435 -State Listen -ErrorAction SilentlyContinue   # ⛔ sin salida (puerto libre)
'SELECT count(*) FROM pg_stat_activity WHERE datname = current_database() AND pid <> pg_backend_pid();' |
  docker compose exec -T postgres sh -c 'psql -X -At -U $POSTGRES_USER -d $POSTGRES_DB -f -'   # ⛔ 0 (nadie más conectado)
'SELECT name, batch FROM payload_migrations ORDER BY id;' |
  docker compose exec -T postgres sh -c 'psql -X -At -U $POSTGRES_USER -d $POSTGRES_DB -f -'   # ⛔ solo dev|-1
Get-PSDrive C | Select-Object Free                                     # espacio libre
```
Si la app está en marcha (`pnpm start` o `pnpm dev`), detenerla con Ctrl+C en su ventana. Debe seguir detenida hasta el paso G.

### B. Respaldo (fuera del repositorio)

```powershell
$Respaldo = Join-Path $env:USERPROFILE ('Respaldos\plataforma\' + (Get-Date -Format 'yyyyMMdd-HHmmss'))
if ($Respaldo.StartsWith((Get-Location).Path, [StringComparison]::OrdinalIgnoreCase)) { throw 'El respaldo debe quedar fuera del repositorio' }
New-Item -ItemType Directory -Path $Respaldo | Out-Null
icacls $Respaldo /inheritance:r /grant:r "${env:USERNAME}:(OI)(CI)F" | Out-Null   # solo el usuario actual
$Respaldo                                                                          # anotar la ruta

# 1. Recuento de filas y esquema ANTES (archivos de texto, sin credenciales)
docker compose exec -T postgres rm -rf /tmp/plataforma-sql
docker compose cp deploy/postgres postgres:/tmp/plataforma-sql
docker compose exec -T postgres sh -c 'psql -X -At -v ON_ERROR_STOP=1 -U $POSTGRES_USER -d $POSTGRES_DB -f /tmp/plataforma-sql/recuento-filas.sql' |
  Out-File -Encoding utf8 "$Respaldo\filas-antes.txt"
docker compose exec -T postgres sh -c 'psql -X -q -v ON_ERROR_STOP=1 -v detalle=1 -U $POSTGRES_USER -d $POSTGRES_DB -f /tmp/plataforma-sql/huella-esquema.sql' |
  Out-File -Encoding utf8 "$Respaldo\esquema-trabajo.txt"
Get-Content "$Respaldo\esquema-trabajo.txt" -Tail 1                                # huella <sha256> lineas <n>

# 2. Volcado (formato custom), comprobado y con su SHA-256 calculado dentro del contenedor
docker compose exec -T postgres sh -c 'pg_dump -U $POSTGRES_USER -d $POSTGRES_DB -Fc -f /tmp/plataforma.dump && pg_restore -l /tmp/plataforma.dump > /dev/null && sha256sum /tmp/plataforma.dump'
docker compose cp postgres:/tmp/plataforma.dump "$Respaldo\plataforma.dump"
docker compose exec -T postgres rm -f /tmp/plataforma.dump
(Get-FileHash -Algorithm SHA256 "$Respaldo\plataforma.dump").Hash.ToLower()       # ⛔ igual al sha256sum anterior
(Get-Item "$Respaldo\plataforma.dump").Length                                      # ⛔ mayor que 0

# 3. media/ y .env (este contiene secretos: queda solo en $Respaldo, protegido por la ACL)
Copy-Item -Recurse media "$Respaldo\media"
Copy-Item .env "$Respaldo\env.respaldo"
function Manifiesto($dir) {
  $base = (Resolve-Path $dir).Path.Length + 1
  Get-ChildItem $dir -Recurse -File | ForEach-Object { '{0}  {1}' -f (Get-FileHash -Algorithm SHA256 $_.FullName).Hash, $_.FullName.Substring($base) }
}
$MediaOrigen = @(Manifiesto media); $MediaCopia = @(Manifiesto "$Respaldo\media")
"media: $($MediaOrigen.Count) archivos; diferencias: $(@(Compare-Object $MediaOrigen $MediaCopia).Count)"   # ⛔ diferencias: 0
$MediaCopia | Out-File -Encoding utf8 "$Respaldo\media-SHA256.txt"
$Sumas = Get-ChildItem $Respaldo -File | Get-FileHash -Algorithm SHA256 |
  ForEach-Object { '{0}  {1}' -f $_.Hash, (Split-Path $_.Path -Leaf) }            # primero calcular, luego escribir
$Sumas | Out-File -Encoding utf8 "$Respaldo\SHA256SUMS.txt"
```

El respaldo nunca va dentro del repositorio. Por si acaso, `.gitignore` excluye `*.dump`, `*.backup`, `*.bak`, comprimidos (`*.zip`, `*.7z`, `*.tar*`, `*.sql.gz`…), `respaldo*/`, `backup*/` y `respaldo*.sql` / `backup*.sql`. **No** excluye `*.sql`, porque `deploy/postgres/*.sql` es código.

### C. Restauración de prueba en un contenedor desechable

Comprueba que el respaldo sirve. **Nunca** se restaura sobre la base de trabajo. El contenedor guarda los datos en memoria (`--tmpfs`) y solo escucha en 127.0.0.1.

```powershell
$env:POSTGRES_PASSWORD = Nueva-Clave           # solo para crear el contenedor; se quita en la línea siguiente
docker run -d --name plataforma-restauracion --tmpfs /var/lib/postgresql/data -p 127.0.0.1:5435:5432 -e POSTGRES_PASSWORD postgres:16-alpine
Remove-Item Env:POSTGRES_PASSWORD               # si quedara, docker compose la usaría en lugar de la de .env
do { Start-Sleep 2; docker exec plataforma-restauracion pg_isready -q -h 127.0.0.1 -U postgres } until ($LASTEXITCODE -eq 0)

docker cp "$Respaldo\plataforma.dump" plataforma-restauracion:/tmp/plataforma.dump
docker cp deploy/postgres plataforma-restauracion:/tmp/plataforma-sql
docker exec plataforma-restauracion createdb -U postgres copia
docker exec plataforma-restauracion pg_restore -U postgres -d copia --no-owner --no-privileges --exit-on-error /tmp/plataforma.dump
$LASTEXITCODE                                                                      # ⛔ 0

docker exec plataforma-restauracion psql -X -At -v ON_ERROR_STOP=1 -U postgres -d copia -f /tmp/plataforma-sql/recuento-filas.sql |
  Out-File -Encoding utf8 "$Respaldo\filas-copia.txt"
"filas que difieren: " + @(Compare-Object (Get-Content "$Respaldo\filas-antes.txt") (Get-Content "$Respaldo\filas-copia.txt")).Count   # ⛔ 0
docker exec plataforma-restauracion psql -X -q -v ON_ERROR_STOP=1 -v detalle=1 -U postgres -d copia -f /tmp/plataforma-sql/huella-esquema.sql |
  Out-File -Encoding utf8 "$Respaldo\esquema-copia.txt"
"lineas de esquema que difieren: " + @(Compare-Object (Get-Content "$Respaldo\esquema-trabajo.txt") (Get-Content "$Respaldo\esquema-copia.txt")).Count   # ⛔ 0
```

### D. Esquema de referencia y comparación

Se crea una base vacía en el mismo contenedor desechable, se le aplican roles y migraciones como en una instalación nueva, y se compara su esquema con el de la base de trabajo.

```powershell
$ClaveOwnerTmp = Nueva-Clave; $ClaveAppTmp = Nueva-Clave       # contraseñas del contenedor desechable
docker exec plataforma-restauracion createdb -U postgres referencia
@("\set owner_password '$ClaveOwnerTmp'", "\set app_password '$ClaveAppTmp'", '\i /tmp/plataforma-sql/roles.sql') |
  docker exec -i plataforma-restauracion psql -X -q -v ON_ERROR_STOP=1 -U postgres -d referencia -f - | Out-Null
"COMMENT ON DATABASE referencia IS 'plataforma:desechable';" | docker exec -i plataforma-restauracion psql -X -q -U postgres -d postgres -f -
$env:DATABASE_URI_MIGRACIONES = "postgres://plataforma_owner:$ClaveOwnerTmp@127.0.0.1:5435/referencia"
$env:MIGRAR_BD_DESECHABLE = '127.0.0.1:5435/referencia'
pnpm migrate --confirmar=127.0.0.1:5435/referencia                                 # ⛔ código 0 y «Esquema verificado»
Remove-Item Env:DATABASE_URI_MIGRACIONES, Env:MIGRAR_BD_DESECHABLE
docker exec plataforma-restauracion psql -X -q -v ON_ERROR_STOP=1 -v detalle=1 -U postgres -d referencia -f /tmp/plataforma-sql/huella-esquema.sql |
  Out-File -Encoding utf8 "$Respaldo\esquema-referencia.txt"
Compare-Object (Get-Content "$Respaldo\esquema-referencia.txt") (Get-Content "$Respaldo\esquema-trabajo.txt")   # ⛔ sin salida
$HuellaEsperada = ((Get-Content "$Respaldo\esquema-referencia.txt" -Tail 1) -split ' ')[1]
$HuellaEsperada
```

**Criterio de aceptación:** `Compare-Object` no muestra ninguna línea, es decir, las dos huellas son iguales. Cada línea que aparezca es un objeto que difiere: `<=` está solo en la referencia y `=>` solo en la base de trabajo. Si aparece alguna, **no** registrar la línea base: hay que entender la diferencia y, si hace falta, crear una migración que la resuelva.

Valor obtenido el 22-10-2026 (PostgreSQL 16.15, migración `20261022_163428_inicial`): `b74a262b1b1434167ba590a84158cab11f74e1bb71ea5eb683e8a979e6be3968`, 666 líneas. Sirve como contraste: si el de hoy es distinto, averiguar por qué antes de seguir.

Lo que la huella **no** compara, a propósito:
- dueños y permisos;
- datos;
- el orden físico de las columnas. En la base creada con `push`, `grupos.padre_id`, `ruta` y `orden` están al final, y Drizzle siempre nombra las columnas.

Todo lo demás del esquema `public` sí entra: tipos, `NOT NULL`, valores por defecto, restricciones, índices, enums, secuencias, vistas, rutinas, disparadores, RLS y extensiones.

`pnpm migrate:status` **no** sirve como comprobación del esquema: solo dice qué nombres hay en `payload_migrations`.

### E. Ensayo completo sobre la copia (recomendado)

Los pasos F y G, ejecutados antes sobre `copia` en el contenedor desechable. Si algo falla aquí, la base de trabajo sigue intacta.

```powershell
docker exec plataforma-restauracion psql -X -q -v ON_ERROR_STOP=1 -U postgres -d copia -v migracion=20261022_163428_inicial -v "huella_esperada=$HuellaEsperada" -f /tmp/plataforma-sql/baseline-desde-push.sql
@("\set owner_password '$ClaveOwnerTmp'", "\set app_password '$ClaveAppTmp'", '\i /tmp/plataforma-sql/roles.sql') |
  docker exec -i plataforma-restauracion psql -X -q -v ON_ERROR_STOP=1 -U postgres -d copia -f - | Out-Null
"COMMENT ON DATABASE copia IS 'plataforma:desechable';" | docker exec -i plataforma-restauracion psql -X -q -U postgres -d postgres -f -
$env:DATABASE_URI_MIGRACIONES = "postgres://plataforma_owner:$ClaveOwnerTmp@127.0.0.1:5435/copia"
$env:MIGRAR_BD_DESECHABLE = '127.0.0.1:5435/copia'
pnpm migrate --confirmar=127.0.0.1:5435/copia                        # ⛔ código 0, «Pendientes antes: ninguna», «Esquema verificado»
Remove-Item Env:DATABASE_URI_MIGRACIONES, Env:MIGRAR_BD_DESECHABLE
```

### F. Línea base en la base de trabajo

```powershell
docker compose exec -T postgres rm -rf /tmp/plataforma-sql
docker compose cp deploy/postgres postgres:/tmp/plataforma-sql
docker compose exec -T postgres sh -c "psql -X -q -v ON_ERROR_STOP=1 -U `$POSTGRES_USER -d `$POSTGRES_DB -v migracion=20261022_163428_inicial -v huella_esperada=$HuellaEsperada -f /tmp/plataforma-sql/baseline-desde-push.sql"
$LASTEXITCODE                                                        # ⛔ 0, con «Huella del esquema: coincide con la esperada.»
```
El script vuelve a calcular la huella **dentro de su transacción**, con el registro bloqueado, y no escribe nada si no coincide o si `payload_migrations` contiene otra cosa que `dev` o la inicial. Las comillas dobles del comando son de PowerShell, que sustituye `$HuellaEsperada`. Los `` `$ `` llegan a `sh` como `$`.

### G. Roles y `.env` en la base de trabajo

```powershell
$ClaveOwner = Nueva-Clave; $ClaveApp = Nueva-Clave
@("\set owner_password '$ClaveOwner'", "\set app_password '$ClaveApp'", '\i /tmp/plataforma-sql/roles.sql') |
  docker compose exec -T postgres sh -c 'psql -X -q -v ON_ERROR_STOP=1 -U $POSTGRES_USER -d $POSTGRES_DB -f -'
$LASTEXITCODE                                                        # ⛔ 0

# .env: DATABASE_URI pasa a plataforma_app (y se retira DATABASE_URI_MIGRACIONES si estaba).
# .env.migraciones: la conexión del propietario, que la app no carga (subfase 3b). No se imprime nada.
$Ruta = "$PWD\.env"; $v = @{}
foreach ($l in [IO.File]::ReadAllLines($Ruta)) { if ($l -match '^\s*(POSTGRES_DB|POSTGRES_PORT)\s*=\s*(.+?)\s*$') { $v[$Matches[1]] = $Matches[2] } }
if (-not $v.POSTGRES_DB) { throw 'Falta POSTGRES_DB en .env' }; if (-not $v.POSTGRES_PORT) { $v.POSTGRES_PORT = '5434' }
$Lineas = @([IO.File]::ReadAllLines($Ruta) | Where-Object { $_ -notmatch '^\s*DATABASE_URI(_MIGRACIONES)?\s*=' })
$Lineas += "DATABASE_URI=postgres://plataforma_app:$ClaveApp@127.0.0.1:$($v.POSTGRES_PORT)/$($v.POSTGRES_DB)"
[IO.File]::WriteAllLines($Ruta, $Lineas, (New-Object System.Text.UTF8Encoding $false))
[IO.File]::WriteAllText("$PWD\.env.migraciones", "DATABASE_URI_MIGRACIONES=postgres://plataforma_owner:$ClaveOwner@127.0.0.1:$($v.POSTGRES_PORT)/$($v.POSTGRES_DB)`n", (New-Object System.Text.UTF8Encoding $false))

# Las contraseñas nuevas no deben estar en el log del servidor
$Log = docker compose logs postgres | Out-String
"en el log: " + ($Log.Contains($ClaveOwner) -or $Log.Contains($ClaveApp))    # ⛔ en el log: False
Remove-Variable ClaveOwner, ClaveApp, Lineas, Log
```
Las contraseñas quedan solo en `.env` (app; ya contenía la del superusuario) y `.env.migraciones` (propietario), los dos ignorados por git. La línea `DATABASE_URI` pasa al final de `.env`.

### H. Comprobaciones posteriores

```powershell
docker compose exec -T postgres sh -c 'psql -X -q -v ON_ERROR_STOP=1 -U $POSTGRES_USER -d $POSTGRES_DB -f /tmp/plataforma-sql/huella-esquema.sql'
#   ⛔ la misma huella que $HuellaEsperada (roles.sql no cambia el esquema)
docker compose exec -T postgres sh -c 'psql -X -q -v ON_ERROR_STOP=1 -U $POSTGRES_USER -d $POSTGRES_DB -f /tmp/plataforma-sql/verificar-permisos.sql'
#   ⛔ dueños = plataforma_owner; app sin CREATE ni TEMP; los tres contadores en 0; 30 / 25
docker compose exec -T postgres sh -c 'psql -X -At -v ON_ERROR_STOP=1 -U $POSTGRES_USER -d $POSTGRES_DB -f /tmp/plataforma-sql/recuento-filas.sql' |
  Out-File -Encoding utf8 "$Respaldo\filas-despues.txt"
Compare-Object (Get-Content "$Respaldo\filas-antes.txt") (Get-Content "$Respaldo\filas-despues.txt")   # ⛔ sin salida
'SELECT name, batch FROM payload_migrations ORDER BY id;' |
  docker compose exec -T postgres sh -c 'psql -X -At -U $POSTGRES_USER -d $POSTGRES_DB -f -'   # ⛔ las migraciones del repositorio, batch > 0, sin `dev`
pnpm build                # ⛔ correcto
```
La base de trabajo tiene datos reales, así que desde la subfase 3a `pnpm migrate` y `pnpm migrate:status` se niegan a tocarla: en H se comprueba el registro con una consulta de solo lectura. Después, `pnpm start` en otra ventana y comprobar que las páginas públicas y `/admin` responden. **No** ejecutar `pnpm test:aislamiento` contra la base de trabajo: escribe en ella y en `media/` (ver «`pnpm test:aislamiento`: solo en un entorno desechable»).

Limpieza: `docker rm -f plataforma-restauracion` (sus datos estaban en memoria) y `docker compose exec -T postgres rm -rf /tmp/plataforma-sql`. Conservar `$Respaldo` hasta haber trabajado con normalidad unos días; después, borrar al menos `env.respaldo`.

### Vuelta atrás

**Configuración (la app falla tras cambiar `.env`, por ejemplo con «permission denied»).** Los datos no se tocan.
- **Diagnóstico:** `verificar-permisos.sql` (paso H).
- **Reparar permisos sin cambiar contraseñas:**
  `'\i /tmp/plataforma-sql/roles.sql' | docker compose exec -T postgres sh -c 'psql -X -q -v ON_ERROR_STOP=1 -U $POSTGRES_USER -d $POSTGRES_DB -f -'`
  Sin `\set`, `roles.sql` solo repara. Comprobado el 02-11-2026 en el clon: la app y las cuentas siguieron entrando.
- **Si falla la autenticación de un rol:** rotar sus contraseñas con el paso G.
- **Ya no se vuelve a conectar la app con el superusuario** (`env.respaldo`). Desde la subfase 3b, la guardia de arranque
  lo impide; la vuelta atrás de configuración es reparar los permisos.
- **Sin `DATABASE_URI_MIGRACIONES`** en el entorno o en `.env.migraciones`, `pnpm migrate` se niega a ejecutar.

**Datos o esquema (falta información o algo quedó mal en la base).** Se restaura el respaldo en una base **nueva** del mismo contenedor, se comprueba y solo entonces se intercambian los nombres. **No usar `pg_restore --clean` sobre la base de trabajo.**
```powershell
# Con la app detenida
docker compose cp "$Respaldo\plataforma.dump" postgres:/tmp/plataforma.dump
docker compose exec -T postgres sh -c 'createdb -U $POSTGRES_USER plataforma_restaurada && pg_restore -U $POSTGRES_USER -d plataforma_restaurada --no-owner --no-privileges --exit-on-error /tmp/plataforma.dump'
$LASTEXITCODE                                                                     # ⛔ 0
docker compose exec -T postgres sh -c 'psql -X -At -v ON_ERROR_STOP=1 -U $POSTGRES_USER -d plataforma_restaurada -f /tmp/plataforma-sql/recuento-filas.sql' |
  Out-File -Encoding utf8 "$Respaldo\filas-restaurada.txt"
Compare-Object (Get-Content "$Respaldo\filas-antes.txt") (Get-Content "$Respaldo\filas-restaurada.txt")   # ⛔ sin salida
# Intercambio: la base actual se conserva con el sufijo _fallida (no se borra)
@('\set fallida :base _fallida', 'ALTER DATABASE :"base" RENAME TO :"fallida";', 'ALTER DATABASE plataforma_restaurada RENAME TO :"base";') |
  docker compose exec -T postgres sh -c 'psql -X -q -v ON_ERROR_STOP=1 -U $POSTGRES_USER -d postgres -v base=$POSTGRES_DB -f -'
Copy-Item "$Respaldo\env.respaldo" .env -Force
docker compose exec -T postgres rm -f /tmp/plataforma.dump
```
- La base restaurada vuelve al estado anterior: dueño, el superusuario; registro, `dev | -1`.
- `media/` se recupera copiando `$Respaldo\media` y comparando con `media-SHA256.txt`.
- La base `<POSTGRES_DB>_fallida` se borra a mano (`DROP DATABASE`) solo cuando se haya confirmado que no hace falta.

## Reprocesar las imágenes (subfase 5b)

Las imágenes subidas antes de la 5b no tienen tamaños derivados y su original no está acotado. Para que tengan los
mismos tamaños que las nuevas, se reprocesan con `scripts/reprocesar-imagenes.ts`.
- **Requisitos:** la migración `20261103_215923_imagenes_5b` aplicada.
- **Qué escribe:** en la base y en `media/`.
- **En la base de trabajo:** solo con autorización expresa, y después de ensayarlo sobre una restauración (paso C).

**Procedimiento:**
1. **Respaldo:** el paso B (`pg_dump` y copia de `media/`) y el inventario:
   `pnpm payload run scripts/reprocesar-imagenes.ts <respaldo>/antes.json`. Es de solo lectura y registra cada archivo
   con su SHA-256 y sus tamaños.
2. **Reproceso:** `pnpm payload run scripts/reprocesar-imagenes.ts <respaldo>/despues.json aplicar <host:puerto/base>`.
   Los argumentos van sin `--`, porque `payload run` no reenvía los que lo llevan.
   - **Destino:** solo una base local, y el último argumento debe coincidir con el destino de `DATABASE_URI`.
   - **Qué hace:** cada imagen se vuelve a subir con su mismo nombre, así que las URL de los originales no cambian. Una
     que supere los límites de la 5a no se toca, y los PDF tampoco.
   - **Si una falla:** el original se vuelve a escribir desde la copia en memoria.
3. **Comprobar:** en `despues.json`, los nombres iguales, los originales de hasta 2400 px y los tamaños presentes (sin
   ampliar las imágenes pequeñas). Las páginas, con `srcset`.
4. **Vuelta atrás:** `pg_restore --clean --if-exists` del volcado sobre la misma base, con la app detenida. Después,
   `media/` restaurado desde la copia y el inventario repetido, que debe coincidir línea a línea con `antes.json`.

**Ensayado el 03-11-2026 en el clon,** con 9 imágenes sintéticas en el estado anterior a la 5b, todas públicas en la
landing demo.
- **Resultado:** 9 reprocesadas; los mismos nombres, ningún huérfano y ninguna referencia rota.
- **Vuelta atrás:** `pg_restore` con código 0; inventario y `media/` idénticos a los del respaldo.
- **Peso en móvil (375 px):** la landing demo pasó de 4345 KB a 745 KB con densidad 2 y a 1217 KB con densidad 3.

## Recuperación

**Una migración falla.** Cada migración se ejecuta en una transacción. Si falla, Postgres deshace todo y no queda en `payload_migrations`: comprobado con un intento de migrar con el rol de la app, que dejó 0 tablas y 0 enums. `pnpm migrate` termina con un código distinto de 0 y **no sigue** con las siguientes.

Comprobado de nuevo el 02-11-2026 en una base desechable:
- una migración con un `CREATE TABLE` seguido de una consulta errónea no dejó la tabla ni el registro, y la migración siguiente no se ejecutó;
- un `pnpm migrate` interrumpido (`taskkill`) a mitad de una migración tampoco dejó nada;
- después, el cerrojo estaba libre y la siguiente ejecución terminó bien.
1. `pnpm migrate:status` para ver el estado.
2. Corregir la migración. Si nunca se aplicó en ningún entorno, se puede regenerar; si no, crear una nueva.
3. Volver a ejecutar `pnpm migrate`.

La versión anterior de la app sigue funcionando con el esquema anterior: no hay que desplegar código nuevo hasta que su migración esté aplicada.

**Una migración se aplicó pero el resultado es incorrecto.**
- Respaldo previo: hacer B antes de cada migración con datos.
- Restauración: «Datos o esquema», de «Vuelta atrás».
- Permisos: volver a ejecutar `roles.sql` sobre la base restaurada.
- No usar `pnpm payload migrate:down` como mecanismo de recuperación en entornos con datos.

**Se pierde la contraseña de un rol, o hay que rotarlas.** Repetir el paso G: `roles.sql` con contraseñas nuevas, generadas en memoria y entregadas por la entrada estándar, y reescribir `.env` y `.env.migraciones`. Después, reiniciar la app.

**Operaciones que necesitan al administrador (superusuario del contenedor):**
- `roles.sql` (crear, rotar o reparar);
- la línea base;
- respaldos y restauraciones;
- crear bases;
- poner la marca de base desechable (solo en bases desechables).

Ninguna se hace con la app ni con `pnpm migrate`.

## Riesgos y límites conocidos

- **El superusuario sigue existiendo:** es el administrador del clúster. Proteger su contraseña y no ponerla en `DATABASE_URI`.
- **Contraseñas en tránsito:** las nuevas viajan por la entrada estándar hasta `psql` y, dentro de la sentencia `ALTER ROLE`, hasta el servidor, que las guarda como scram-sha-256.
  - **El log:** `roles.sql` desactiva, solo en su sesión, el registro de sentencias (`log_statement`, `log_min_error_statement`, `log_min_duration_*`). Sin eso, un `ALTER ROLE` que falla queda en el log con su contraseña, y así ocurrió en una prueba.
  - **La salida de `psql`:** `VERBOSITY terse` impide que muestre la sentencia en caso de error.
  - **Lo que sigue a la vista:** mientras se ejecuta, la sentencia aparece en `pg_stat_activity`, visible para superusuarios.
- **`.env` y `env.respaldo` contienen las credenciales en claro:** `.env` está fuera de git. La copia está en el directorio del respaldo, que tiene una ACL solo para el usuario.
- **`payload run` también usa `DATABASE_URI`:** los scripts (`seed`, `test:aislamiento`, `importar:grupos`) se ejecutan con el rol de la app. `seed` y `test:aislamiento` se comprobaron con `plataforma_app` el 28-10-2026 en una instalación nueva y desechable. `importar:grupos` se probó con `plataforma_app` el 29-10-2026 en una base desechable mediante una copia del script con el mismo código y grupos ficticios: la primera ejecución creó 3 grupos y omitió 1 existente, y la segunda no cambió nada, sin conceder privilegios nuevos. **El script original no se ha ejecutado con `plataforma_app`.** La base de trabajo ya contiene los 31 grupos de su lista distintos de LITARTMO, creados el 21-10-2026, antes de que existieran estos roles; no consta con qué script ni con qué versión se cargaron.
- **Producción:** el procedimiento está ensayado solo en local, sobre réplicas desechables. No hay configuración de servidor en el repositorio (decisión D10 pendiente).
- **Migrar una base con datos reales** (la de trabajo o la de producción) no tiene todavía un procedimiento autorizado: `pnpm migrate` la rechaza por diseño (subfase 3a). Hará falta decidir cómo se autoriza, siempre con un respaldo comprobado antes («Base existente creada con `push`», paso B) y el SQL revisado.
- **Base de trabajo (subfase 3b):**
  - **Credencial del propietario: hecho el 03-11-2026.** `DATABASE_URI_MIGRACIONES` está solo en `.env.migraciones`: se
    retiró de `.env` sin cambiar ninguna otra línea. Ahora Next y Payload cargan solo `DATABASE_URI` (`plataforma_app`).
  - **Permisos: reparados el 03-11-2026**, con autorización expresa, siguiendo «Reparar los permisos de una base
    existente».
    - **Destino:** `127.0.0.1:5434/plataforma`, clúster `7695829010429321251`.
    - **Respaldo previo:** `%USERPROFILE%\Respaldos\plataforma\20261103-125216-antes-roles-3b`, verificado con una
      restauración en un contenedor desechable.
    - **`roles.sql`:** se ejecutó sin contraseñas y terminó con código 0.
    - **Cambios:** solo las ACL de la app en `payload_migrations`, que queda en `SELECT`, y en `registro_cambios`, que queda
      en `INSERT,SELECT`, como se había previsto.
    - **Sin cambios:** contraseñas, esquema, filas y migraciones registradas.
    - **La web:** siguió respondiendo, sin errores de permisos.
- **Para producción (D10):**
  - en el contenedor, `pg_hba` admite `trust` desde su propio loopback; es la vía de `docker exec` como administrador, y
    desde fuera exige scram-sha-256;
  - la app puede conectarse, por los permisos por defecto de `PUBLIC`, a las bases `postgres` y `template1` del clúster,
    sin privilegios sobre los datos; en un clúster dedicado, valorar `REVOKE CONNECT, TEMP ON DATABASE postgres, template1 FROM PUBLIC`;
  - la contraseña del superusuario no debería estar en el equipo de la app.
- **La marca de base desechable es una convención:** un superusuario podría ponérsela a cualquier base. Por eso las capas 1 a 3 exigen además nombrar el destino exacto en cada sesión.
