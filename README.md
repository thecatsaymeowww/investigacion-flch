# Plataforma de landings de grupos de investigación

Un solo sitio para todos los grupos de investigación: cada grupo tiene su landing en
`/<grupo>` y su archivo en `/<grupo>/archivo`, y cada editor solo puede editar la suya
desde un panel común (`/admin`). Todos comparten una base de datos; el aislamiento lo
hacen Payload CMS 3 + su plugin multi-tenant y la capa de lectura `lib/cms`.

Diseño: réplica del prototipo aprobado (Astro, que no forma parte de este repositorio) llevado a Next.js.

> Estado: **lista para el primer entregable** en `https://investigacionletras.unmsm.edu.pe`, con Docker (Nginx +
> app + PostgreSQL): ver «Producción con Docker». El panel (`/admin`) es accesible desde Internet, por decisión del
> usuario (09-11-2026); lo protegen el inicio de sesión, el bloqueo de Payload tras 5 fallos y los límites de Nginx.

## Arranque local

Requisitos: Node 20.9+ (probado con 24), pnpm 11, Docker.

```bash
cp .env.example .env        # y sustituir cada CHANGE_ME por un valor aleatorio propio
                            # (PowerShell: docs/BASE-DE-DATOS.md, «Instalación nueva», paso 1)
pnpm install
pnpm db:up                  # Postgres en 127.0.0.1:5434
# roles plataforma_owner / plataforma_app (deploy/postgres/roles.sql): ver docs/BASE-DE-DATOS.md
# (sin contraseñas solo repara permisos: «Reparar los permisos de una base existente»; lo hace el administrador)
# la conexión del propietario va en .env.migraciones, NO en .env (la app carga todo .env): ídem
pnpm migrate --confirmar=<host:puerto/base>   # esquema (migraciones versionadas, rol propietario); SOLO en una
                            # base desechable marcada y con MIGRAR_BD_DESECHABLE: docs/BASE-DE-DATOS.md, «Protección del destino»
pnpm seed                   # grupos de demostración (ficticios) y cuentas (idempotente)
pnpm build && pnpm start    # http://localhost:3000
# o en desarrollo: pnpm dev
```

El contenido real de Prensa y Literatura (integrantes, publicaciones, actividades, galería e imágenes) **no
está en el repositorio** hasta que se autorice su publicación. Sin él, ese subgrupo no se crea; la plataforma y
`pnpm test:aislamiento` funcionan solo con los grupos ficticios. Ver «Contenido real (opcional)».

| URL | Qué es |
|---|---|
| `http://localhost:3000/` | Directorio de grupos |
| `http://localhost:3000/litartmo` | Grupo LITARTMO (landing de **demostración**) |
| `http://localhost:3000/litartmo/subgrupo-demo` | 1.er subgrupo de LITARTMO (**ficticio**) |
| `http://localhost:3000/litartmo/prensa-y-literatura` | 2.º subgrupo: Prensa y Literatura (**solo con el contenido real local autorizado**) |
| `http://localhost:3000/litartmo/prensa-y-literatura/archivo` | Archivo de Prensa y Literatura (**ídem**) |
| `http://localhost:3000/estudios-andinos-demo` | Grupo de demostración **ficticio** |
| `http://localhost:3000/admin` | Panel (español) |

Cuentas creadas por la semilla (contraseñas aleatorias en `.env.credenciales`, ignorado por git):

| Cuenta | Puede |
|---|---|
| `superadmin@plataforma.local` | Todo: crear grupos y usuarios, ver todos los grupos |
| `editor-litartmo@plataforma.local` | Solo la landing del grupo principal LITARTMO (no sus subgrupos) |
| `editor-prensa-literatura@plataforma.local` | Solo el subgrupo Prensa y Literatura (solo si se cargó su contenido real) |
| `editor-demo@plataforma.local` | Solo el grupo de demostración |
| `editor-subgrupo-demo@plataforma.local` | Solo el subgrupo de demostración (no LITARTMO) |

## Contenido real (opcional)

`pnpm seed` crea Prensa y Literatura con su contenido real **solo** si la variable `SEMILLA_PRENSA_DIR`
(en el entorno o en `.env`) apunta a una carpeta **fuera del repositorio** con esta estructura:

```text
data/   sitio.json, integrantes.json, publicaciones.json, actividades.json, galeria.json, aliados.json
img/    imágenes a las que apuntan los JSON (opcionales: la que falte se omite)
```

- **Validación previa, sin escribir nada:** comprueba que existen los seis JSON, que se pueden leer y que tienen
  la forma básica esperada. Si falta o falla alguno, omite el subgrupo entero, lo explica en la consola y termina
  con código 1 (los grupos ficticios se crean igual).
- **Datos mal formados** dentro de un JSON (por ejemplo, un integrante sin nombre) se detectan durante la carga. El
  grupo y su contenido se crean en una sola transacción, así que ese error la deshace entera: no queda nada del
  subgrupo y la semilla termina con código 1.
- **Imágenes:** se suben después de la transacción, cada una con un nombre propio y único. Si una falla, se borra
  lo que dejó (su registro o, si Payload llegó a escribir el archivo sin crear el registro, ese archivo), el
  contenido queda sin esa imagen y la semilla termina con código 1.
- **Interrupción:** si el proceso se corta entre la transacción y el final de las imágenes, el contenido queda sin
  las restantes y una nueva ejecución no las añade (el subgrupo ya existe): se completan desde el panel.
- Si el subgrupo ya existe, no se toca (idempotente).

Esa carpeta, sus datos personales y sus imágenes no se versionan.

## Alta de un grupo nuevo (superadmin)

1. Panel → **Grupos** → crear (nombre y slug: la landing quedará en `/<slug>`).
2. **Usuarios** → crear el editor y asignarle ese grupo.
3. El editor entra, crea la **Landing del grupo** (una por grupo) y su contenido, y publica.

No hace falta desplegar nada: el grupo aparece en `/` cuando su landing está publicada.

## Subgrupos

Un subgrupo es un grupo con **Grupo padre** elegido (un solo nivel). Su landing queda en
`/<grupo>/<subgrupo>` y su archivo en `/<grupo>/<subgrupo>/archivo`.

- La jerarquía es **solo visual**: el subgrupo aparece listado bajo su grupo en `/` y su
  menú enlaza al grupo padre.
- A nivel de CMS es **independiente**: su propia landing, contenido, archivos y editor.
  El editor del grupo no ve ni edita el subgrupo, y viceversa (cubierto por `pnpm test:aislamiento`).
- La ruta se calcula sola (campo *Ruta*); si el grupo padre cambia de slug, se actualizan
  las de sus subgrupos. Un subgrupo no puede llamarse `archivo` ni tener subgrupos.

Alta: Panel → **Grupos y subgrupos** → crear, elegir el *Grupo padre* → crear su editor en
**Usuarios** asignándole ese subgrupo.

## Estructura

```text
app/
  (sitio)/              sitio público (layout, estilos globales, directorio, 404)
    [grupo]/            landing de cada grupo + acciones.ts (formulario Colaborar)
    [grupo]/archivo/    archivo del grupo
  (payload)/            panel y API REST de Payload (archivos oficiales de la plantilla)
components/
  landing/              secciones de la landing (una por componente, con CSS Module)
  archivo/              búsqueda y filtros del archivo
lib/
  cms/                  ÚNICA capa de lectura pública (grupo + publicado + overrideAccess:false)
  access/index.ts       políticas de acceso
  access/privileged.ts  ÚNICO lugar con overrideAccess:true (lista cerrada)
payload/
  collections/          modelo: landing, integrantes, publicaciones, actividades, agenda,
                        archivos, mensajes, grupos, usuarios, registro de cambios
payload.config.ts       Postgres (sin push: solo migraciones), plugin multi-tenant, panel en español, GraphQL desactivado
migrations/             migraciones versionadas de Payload (.ts + snapshot .json + index.ts)
deploy/postgres/        roles.sql (privilegios mínimos), baseline-desde-push.sql, huella-esquema.sql,
                        recuento-filas.sql, verificar-permisos.sql
scripts/                seed.ts, test-aislamiento.ts, importar-grupos-2026.ts, migrar.mjs
                        (los datos reales y sus imágenes se mantienen fuera del repositorio)
  verificar.mjs         orquestador de `pnpm verificar`; sus comprobaciones propias en verificar/
```

## Garantías y cómo se comprueban

- **Aislamiento entre grupos** — `pnpm test:aislamiento` (con `pnpm start` corriendo):
  lectura, edición, borrado, creación, referencias a archivos de otro grupo, usuarios,
  REST y visitante anónimo. Usa solo los grupos ficticios de la semilla y sus propios temporales.
  > ⚠️ **Solo en un entorno desechable.**
  > - **Qué escribe:** crea un subgrupo temporal con su landing y su editor; integrantes, una publicación, una actividad, un evento y mensajes de prueba; y dos archivos generados en memoria (en `media/`). Los borra al final aunque falle, incluidos los archivos con su marca que una creación fallida dejara sin registro. Quedan sus entradas en el registro de cambios. Si el proceso se interrumpe, pueden quedar temporales.
  > - **Dónde ejecutarla:** contra una base desechable y desde una copia del proyecto con su propio `media/`; nunca contra la base de trabajo ni la de producción.
  > - **Rol de la app:** comprobada con `plataforma_app` el 28-10-2026 en una instalación nueva y desechable. Detalles en `docs/BASE-DE-DATOS.md`.
- **Solo lo publicado llega a la web**; los borradores se ven solo en el panel.
- **Archivos**: un archivo es público solo si lo usa contenido publicado de su grupo
  (se calcula solo) y el grupo está activo; lo demás no se entrega a visitantes.
- **Límites de archivos** (subfase 5a, `lib/archivos.ts`):
  - **Tamaño:** imágenes (JPEG, PNG, WebP, GIF) hasta 5 MB y PDF hasta 20 MB (MB = 1024 × 1024 bytes). Por encima
    de 20 MB, Payload corta la subida (413).
  - **Cómo se decide el tipo:** por el contenido, no por el nombre ni por lo que declara el navegador. Solo lo que
    empieza por `%PDF-` puede usar el límite de los PDF, y Payload comprueba el tipo real contra la lista admitida.
  - **Qué se rechaza:** contenido falso (un `.exe` renombrado o un HTML como imagen), SVG, archivos vacíos y truncados.
  - **Por dónde se aplican:** al crear y al sustituir, por REST y por la Local API. Al sustituir, el límite se comprueba
    antes de que Payload borre el archivo anterior.
  - **Cabeceras al servirlos:** `nosniff` y una CSP con `sandbox` (`next.config.mjs` y `modifyResponseHeaders`).
  - **Nombres:** Payload los sanea; no quedan rutas ni caracteres especiales.
  - **Pruebas:** `pnpm test:archivos` y la sección `archivos` de `pnpm test:seguridad`.
- **Imágenes derivadas** (subfase 5b, `lib/archivos.ts`):
  - **Tamaños:** al subir una imagen, Payload genera con sharp `tarjeta` (480 px de ancho), `media` (960), `grande`
    (1600) y `og` (1200×630, recortada al centro, para compartir), todos en WebP de calidad 75. No amplía: un tamaño
    mayor que el original no se genera.
  - **Original:** se conserva, acotado a 2400 px de lado y sin metadatos (EXIF incluido).
  - **En el sitio:** `src` es el tamaño `media` y `srcset` lista los tres primeros, con un `sizes` propio en cada
    `<img>`. `lib/cms` solo los expone si el archivo es público.
  - **Acceso:** el de su original. Un derivado de un archivo privado da 403, y un editor no ve los de otro grupo.
  - **Imágenes anteriores a la 5b:** se reprocesan con `scripts/reprocesar-imagenes.ts`, con respaldo previo
    (`docs/BASE-DE-DATOS.md`, «Reprocesar las imágenes»).
  - **Pruebas:** la sección `imagenes` de `pnpm test:seguridad` y `pnpm test:archivos`.
  - ⚠️ **Necesita la migración `20261103_215923_imagenes_5b`**, que no está aplicada en la base de trabajo.
- **Carga inicial: LCP y fuentes** (subfase 5c):
  - **Imagen principal:** solo la foto del Hero va sin carga diferida y con `fetchPriority="high"`, mediante la prop
    `prioridad` de `Imagen` (tema de Prensa) y de `Foto` (tema FLCH). Las demás imágenes siguen diferidas.
  - **Fuentes:** solo se precarga Public Sans, común a todas las páginas. Newsreader (FLCH), Old Standard TT y
    Source Serif 4 (Prensa) se piden cuando la página las pinta, con `display: swap` y reserva de métricas ajustadas.
    Next junta las `@font-face` de los dos temas y, precargadas, se descargaban en todas las páginas.
  - **Medir:** con el servidor de pruebas en otro puerto, `PRUEBAS_URL` vale para `pnpm test:aislamiento` igual que
    para `pnpm test:seguridad`. En `test:aislamiento` solo admite un servidor local: http en 127.0.0.1, localhost
    o [::1], puerto 3000 o 3001, sin credenciales ni ruta (sin la variable, `http://127.0.0.1:3000`); cualquier otro
    destino detiene la prueba antes de tocar la base (`scripts/pruebas-url.ts`).
  - ⚠️ **El LCP en móvil aún supera 2,5 s en la landing demo y en Prensa** (`docs/PLAN-DE-ACCION.md`, registro de la 5c).
- **La API REST no es pública**: un visitante sin sesión no lee ninguna colección por `/api/...`. El sitio lee en el
  servidor con la Local API (`lib/cms`); por REST solo recibe los archivos públicos de `/api/media/file/`. Lo comprueba
  la sección `rest` de `pnpm test:seguridad` (subfase 2b).
- **Cuentas**: un editor solo ve su propia cuenta, no la de sus compañeros de grupo; en el aviso «está editando» del
  panel aparece el número de la cuenta, no su correo. Solo el superadmin ve y administra cuentas, y solo él desbloquea
  una cuenta bloqueada tras 5 intentos fallidos (si no, se desbloquea sola a los 10 minutos). Los bloqueos de edición
  y los mensajes de cada grupo solo los ven sus editores. Lo comprueba la sección `usuarios` de `pnpm test:seguridad`
  (subfase 2c).
- **Límite de envíos del formulario** (subfase 4b): en el servidor, en memoria de un solo proceso
  (`app/(sitio)/[grupo]/acciones.ts`, `lib/limite-envios.ts`).
  - **Límites:** por cliente, 3 intentos por minuto; por cliente y grupo, 5 envíos válidos por hora; por grupo, 20
    envíos válidos cada 10 minutos. Cada estructura tiene un tope de claves, con barrido una vez por ventana.
  - **IP del cliente:** con `CONFIAR_EN_PROXY=1`, solo `X-Real-IP`, que el Nginx de `deploy/nginx/` sobrescribe con la
    IP real. Debe ser exactamente una IP: IPv6 cuenta por su /64. Si falta o no es válida, el envío se rechaza.
  - **`X-Forwarded-For`:** no se lee nunca.
  - **Sin la variable** (en local): no se confía en ninguna cabecera y todos comparten el límite. Un sitio `https` exige
    la variable y la aplicación no arranca sin ella.
  - **De qué depende la confianza:** de que la aplicación solo escuche en `127.0.0.1` (`pnpm start`).
  - **Plantilla de Nginx** (`deploy/nginx/`): zonas `limit_req` con 429 para las Server Actions públicas, el login y la
    recuperación de contraseña, una zona amplia para el panel y `limit_conn`. **No está desplegada**: sus tasas son una
    propuesta sin calibrar (subfases 6c y 6d).
  - **Pruebas:** `pnpm test:limite` y la sección `proxy` de `pnpm test:seguridad`, con un servidor con
    `CONFIAR_EN_PROXY=1`.
- **Antispam del formulario** (subfase 4c, `lib/formulario.ts`, `crearMensajeContacto`): nada se descarta en
  silencio.
  - **Se rechazan**, con el error genérico y sin guardar, los envíos con el campo trampa lleno y los que no traen la
    marca firmada o la traen alterada.
  - **Se guardan como «Posible spam»**, con su contenido intacto, los enviados en menos de 2 s y los que tienen más de 3
    enlaces (`http://`, `https://` o `www.`). La lista de términos que prevé el plan está pendiente de definir.
  - **Duplicados:** un envío con el mismo correo (sin distinguir mayúsculas) y el mismo mensaje que otro del mismo
    grupo en 10 minutos se guarda con **Duplicado de**. El anterior no cambia y nada se borra.
  - **Quien envía** ve siempre la misma confirmación.
  - **El editor del grupo** puede cambiar el estado, pero no el duplicado ni lo que escribió la persona.
  - **El campo trampa** está en un contenedor oculto, sin `aria-hidden`.
  - **Pruebas:** la sección `antispam` de `pnpm test:seguridad`, con un servidor con `CONFIAR_EN_PROXY=1`.
  - ⚠️ **Necesita la migración `20261103_201313_antispam_4c`**, que aún no está aplicada en la base de trabajo (ver
    `docs/BASE-DE-DATOS.md`).
- **Caché por grupo**: publicar en un grupo regenera solo sus páginas, sin rebuild.
- **Cifras calculadas**: año de fundación, integrantes, publicaciones y actividades.
- **Registro de cambios**: las altas, cambios y borrados de la landing, el contenido editorial y los archivos, y los
  cambios en los mensajes, quedan registrados en la misma transacción. **No se registran** los cambios en grupos y
  usuarios ni el borrado de mensajes.
- **`pnpm build` funciona con la base de datos apagada**: comprobado el 29-10-2026 en frío (sin `.next/`) en una
  instalación limpia. Necesita acceso a internet para descargar las fuentes de Google (`next/font/google`).

## Verificación (`pnpm verificar`)

Ejecuta en secuencia las comprobaciones de calidad, seguridad y compilación, y termina con una línea inequívoca:

| Resultado final | Significa | Código |
|---|---|---|
| `VERIFICACIÓN APROBADA` | Todas se ejecutaron y ninguna falló (puede haber avisos documentados) | 0 |
| `VERIFICACIÓN FALLIDA` | Alguna falló **o no se pudo ejecutar**: una comprobación no ejecutada nunca cuenta como aprobada | 1 |
| `VERIFICACIÓN ESTÁTICA APROBADA` | Solo con `pnpm verificar:estatico`: aprobadas las que no necesitan base ni servidor. **No sustituye** a `pnpm verificar` | 0 |

Estado de cada comprobación: `APROBADO`, `AVISOS` (avisos documentados, visibles, que no hacen fallar), `FALLIDO`,
`NO EJECUTADA` (con el motivo) u `OMITIDA` (fuera del perfil estático).

| # | Comprobación | Comando suelto | Necesita |
|---|---|---|---|
| 1 | TypeScript | `pnpm typecheck` | — |
| 2 | ESLint | `pnpm lint` | — |
| 3 | Formato (Prettier, solo `--check`) | `pnpm formato:comprobar` (corregir: `pnpm formato`) | — |
| 4 | Código muerto (Knip) | `pnpm knip` | — |
| 5 | Migraciones | `pnpm verificar:migraciones` | — (no ejecuta migraciones ni se conecta a ninguna base) |
| 6 | Roles y conexiones | `pnpm verificar:roles` | — (no se conecta ni lee `.env`) |
| 7 | SQL peligroso | `pnpm verificar:sql` | — |
| 8 | HTML peligroso | `pnpm verificar:html` | — |
| 9 | Secretos (Gitleaks) | `pnpm verificar:secretos` | Binario `gitleaks` 8.30.1 en el PATH (o `GITLEAKS_BIN`) |
| 10 | Auditoría de dependencias | `pnpm verificar:auditoria` | Acceso al registro de npm |
| 11 | Pruebas unitarias (formulario, límite de envíos y archivos) | `pnpm test:unitarias` | — (`node --test`, sin base ni servidor) |
| 12 | Build | `pnpm build` | Acceso a Google Fonts (no necesita la base) |
| 13 | Aislamiento | `pnpm test:aislamiento` | Base **desechable** + servidor |
| 14 | Seguridad | `pnpm test:seguridad` | Base **desechable** + servidor |
| 15 | Enlaces | `pnpm verificar:enlaces` | Servidor (solo lecturas GET) |

El build va antes de las pruebas y de los enlaces porque los tres últimos pasos necesitan un servidor con el código
recién compilado.

**Pruebas con base de datos (13 y 14).** Escriben en la base de `DATABASE_URI`, así que solo se ejecutan si se
confirma que es desechable, con su destino exacto:

```powershell
$env:VERIFICAR_BD_DESECHABLE = '127.0.0.1:5439/plataforma'   # host:puerto/base de la base DESECHABLE
pnpm verificar
```

Si la variable falta o no coincide con `DATABASE_URI`, las dos pruebas quedan `NO EJECUTADA` y el resultado es
`FALLIDA`. Nunca se apunta a la base con contenido real; en este equipo, `pnpm verificar` completo se ejecuta en una
copia del proyecto conectada a una base con datos sintéticos (la semilla), con su propio `media/`.

**Servidor.** Para los pasos 13 a 15, `pnpm verificar` arranca su propio `next start` en `127.0.0.1:3000` (puerto
fijo en las pruebas) y lo detiene al terminar. Si el puerto está ocupado **no reutiliza** ese servidor, que podría estar
conectado a otra base: los pasos quedan `NO EJECUTADA`. Hay que detener antes cualquier `pnpm start` o `pnpm dev`.
El registro del servidor queda en la carpeta temporal del sistema (`verificar-servidor-<pid>.log`).

**Detalle de cada comprobación**

- **Prettier**: `.prettierrc.json` (sin punto y coma, comillas simples, 160 columnas). `.prettierignore` excluye lo
  generado por Payload (`payload-types.ts`, `app/(payload)/`, `migrations/`), el lockfile, `public/` y los `.md`
  (tablas mantenidas a mano). El formato se adoptó el 02-11-2026 con un único reformateo, sin cambios de comportamiento.
- **Knip** (`knip.json`): los scripts de `scripts/` y las migraciones son puntos de entrada (los lanzan
  `payload run` y Payload). `payload-types.ts` se ignora porque es generado. Con `ignoreExportsUsedInFile` no se
  marcan los exports que se usan en su propio archivo, pero sí los que no se usan en ninguna parte. El plugin de
  Payload está desactivado porque ejecutaría `payload.config.ts`. Knip solo informa: nunca borra nada.
- **Migraciones** (`scripts/verificar/migraciones.mjs`):
  - **Carpeta:** nombres `AAAAMMDD_HHMMSS_nombre` únicos; cada `.ts` (no vacío, con `up` y `down`) con su snapshot
    `.json` válido; `index.ts` con las mismas migraciones en el mismo orden.
  - **Configuración:** `migrate` y `migrate:status` pasan por `scripts/migrar.mjs`; ningún script expone
    `down`/`fresh`/`refresh`/`reset`; `payload.config.ts` usa `push: false` y `protegerMigraciones`.
  - **Deriva:** las colecciones no definen un esquema distinto del último snapshot. Es el cálculo de
    `migrate:create`, sin escribir nada y con una `DATABASE_URI` que no lleva a ninguna base.
  - **Avisos:** las sentencias destructivas en `up` (`DROP`, `TRUNCATE`, `DELETE`, cambio de tipo) salen como aviso.
- **Roles y conexiones** (`scripts/verificar/roles.mjs`):
  - **Aplicación:** el código de la aplicación solo conoce `DATABASE_URI`, nunca la conexión del propietario ni la del
    superusuario; `payload.config.ts` empieza su `onInit` por la guardia de conexión.
  - **Migraciones:** `scripts/migrar.mjs` toma la conexión del propietario del entorno o de `.env.migraciones`.
  - **Plantilla:** `.env.example` usa `plataforma_app`.
  - **`roles.sql`:** mantiene los atributos mínimos y no concede a la aplicación ni estructura ni `TRUNCATE`.
  - **Privilegios efectivos:** los comprueba la sección `privilegios` de `pnpm test:seguridad`, con una base desechable.
- **SQL peligroso** (`scripts/verificar/sql.mjs`): en todo el código propio prohíbe `sql.raw` y los literales con SQL
  interpolados (`${}`) o concatenados (`+`). En la aplicación prohíbe además `` sql`…` ``, `.execute(` y `.query(`, porque
  todo pasa por Payload. En `migrations/` y `scripts/` solo admite consultas con un literal fijo. No mira dependencias,
  build ni archivos generados.
- **HTML peligroso** (`scripts/verificar/html.mjs`): prohíbe `dangerouslySetInnerHTML`, `innerHTML`/`outerHTML =`,
  `insertAdjacentHTML` y `document.write`. Solo se admite `dangerouslySetInnerHTML` con una constante de su lista
  `PERMITIDOS` declarada como literal fijo; hoy, solo `ACTIVAR_TW` de `components/landing/Hero.tsx`.
- **Gitleaks** (`scripts/verificar/secretos.mjs`): escanea el árbol de trabajo, no el historial, y no ejecuta git. No
  abre `.env`, `.env.*` (salvo `.env.example`), `node_modules`, `.next`, `media`, `.git` ni la caché de TypeScript.
  Usa `--redact` y solo muestra archivo, línea y regla. La versión está fijada (8.30.1) y el resultado muestra la ruta
  y el SHA-256 del binario. Instalación en Windows: `winget install Gitleaks.Gitleaks`.
- **Auditoría** (`scripts/verificar/auditoria.mjs`): ejecuta `pnpm audit --prod --audit-level=high`, que falla con
  cualquier aviso alto o crítico, y lista **todos** los avisos sin filtrar ninguno. Cada aviso bajo o moderado necesita
  una entrada en `scripts/verificar/excepciones-auditoria.json` con motivo y fecha de revisión. Sin entrada, o con la
  fecha vencida, la comprobación falla. Hoy hay dos excepciones visibles, con revisión el 29-11-2026: **esbuild**
  (moderado, solo afecta al servidor de desarrollo de esbuild) y **deepmerge** (bajo, sin versión corregida; las claves
  peligrosas se rechazan antes con `lib/claves-peligrosas.ts`).
- **Formulario** (`scripts/test-formulario.mjs`, subfase 4a): pruebas unitarias de `lib/formulario.ts` con el
  ejecutor de pruebas de Node, que lee el TypeScript directamente, sin dependencias nuevas.
  - **Limpieza de caracteres:** controles, marcas bidireccionales, espacio de ancho cero y BOM; saltos `\r\n` como uno.
  - **Validación:** límites exactos y superados, correos inválidos, campos vacíos, valores que no son texto, tipo en
    lista blanca y varios errores a la vez.
  - **De punta a punta:** las pruebas del formulario con servidor y sin JavaScript están en la sección `formulario` de
    `pnpm test:seguridad`.
  - **Antispam (4c):** recuento de enlaces y criterio de duplicado.
- **Límite de envíos** (`scripts/test-limite.mjs`, subfase 4b), también con `node --test`:
  - **IP:** validación y forma canónica; IPv4 mapeada y /64 de IPv6; rechazo de listas, puertos, zonas, espacios y
    ceros a la izquierda.
  - **`clienteDe`:** solo con el proxy de confianza, solo `X-Real-IP` y nunca `X-Forwarded-For`.
  - **Limitador:** ventana, barrido, tope con 100 000 IP y concurrencia.
  - **`CONFIAR_EN_PROXY`:** valores admitidos, rechazados y su exigencia con un sitio `https`.
  - **Premisas del modelo:** comprobaciones estáticas de que `start` y `dev` escuchan en `127.0.0.1` y de que la
    plantilla de Nginx sobrescribe las cabeceras de IP.
  - **De punta a punta:** la sección `proxy` de `pnpm test:seguridad` no entra en `pnpm verificar`; necesita su propio
    servidor con `CONFIAR_EN_PROXY=1` (ver su comentario).
- **Enlaces** (`scripts/verificar/enlaces.mjs`): recorre el sitio desde la portada, sin entrar en `/admin` ni `/api`.
  Pide cada URL interna, incluidos los recursos de `/_next/` y los archivos de `/api/media/file/`, y falla con
  cualquier 4xx, 5xx o error de red. Los enlaces externos solo se listan y no se contacta ningún sitio ajeno, salvo
  con `VERIFICAR_ENLACES_EXTERNOS=1`. En ese caso un externo caído es solo un aviso. Suelto, necesita el sitio en
  marcha en `VERIFICAR_URL` (por defecto `http://127.0.0.1:3000`).

Conexiones externas de `pnpm verificar`: el registro de npm (auditoría) y Google Fonts (build). La telemetría de
Next está desactivada para todos los procesos.

## Producción con Docker

Tres contenedores en una red interna (`docker-compose.prod.yml`): **nginx** (único con puertos publicados, 80 y 443,
con el certificado institucional), **app** (Next.js + Payload, imagen del `Dockerfile`, standalone) y **postgres**
(PostgreSQL 16, volumen `postgres-data`). La app y Postgres no son accesibles desde fuera de la máquina. Los archivos
subidos al CMS viven en `./media` del servidor (volumen de la app).

Requisitos en la VM: Docker Engine con Compose v2, `git`, `openssl`; el DNS de `investigacionletras.unmsm.edu.pe`
apuntando a la VM y los puertos 80 y 443 abiertos.

### 1. Código y credenciales

```bash
git clone git@github.com:thecatsaymeowww/investigacion-flch.git   # repositorio privado: clave de despliegue
cd investigacion-flch
cp deploy/produccion.env.example .env && chmod 600 .env
```

Editar `.env` **en la VM** y sustituir cada `CAMBIAR` por un valor nuevo, solo de producción:

```bash
openssl rand -hex 32                          # POSTGRES_PASSWORD, PLATAFORMA_APP_PASSWORD, PLATAFORMA_OWNER_PASSWORD (uno distinto cada vez)
openssl rand -base64 48 | tr -d '\n/+='       # PAYLOAD_SECRET
```

El `.env` está en `.gitignore` (igual que cualquier `.env.*` y la carpeta del certificado): nunca se sube al repositorio
ni entra en la imagen. Nunca imprimir el `.env` completo para depurar.

### 2. Certificado SSL

El certificado es institucional: se coloca a mano y **no se renueva solo**. Nginx lo lee de `deploy/nginx/certs/`
(ignorada por git). De lo que entrega la entidad (`.key`, dos `.crt` y un `.pfx` que no hace falta):

```bash
# 1. Identificar cada .crt: el del dominio tiene subject = el dominio; el intermedio es su «issuer».
openssl x509 -noout -subject -issuer -dates -in ARCHIVO.crt
# 2. Comprobar que la clave es la del certificado (los dos resultados deben ser idénticos).
openssl x509 -noout -pubkey -in DOMINIO.crt | openssl md5
openssl pkey -pubout -in CLAVE.key | openssl md5
# 3. Armar los dos archivos (dominio primero, intermedio después).
mkdir -p deploy/nginx/certs
cat DOMINIO.crt INTERMEDIO.crt > deploy/nginx/certs/fullchain.pem
cp CLAVE.key deploy/nginx/certs/privkey.pem && chmod 600 deploy/nginx/certs/privkey.pem
```

Si la clave viene cifrada (pide contraseña), quitársela antes: `openssl pkey -in CLAVE.key -out privkey.pem`.
**Renovación:** antes de la fecha `notAfter`, repetir los pasos y `docker compose -f docker-compose.prod.yml restart nginx`.

### 3. Primera carga de datos (solo la primera vez)

El contenido inicial (grupos, landings, integrantes, usuarios del panel y fotos) llega en un **paquete fuera de git**
(contiene datos personales y los usuarios del panel): `plataforma.dump` (volcado de PostgreSQL, con todas las
migraciones aplicadas) y `media.tar.gz`. Copiarlo a la VM (por ejemplo con `scp`) y, desde la raíz del repositorio:

```bash
bash deploy/primera-carga.sh /ruta/al/paquete
```

Construye la imagen, arranca Postgres, restaura el volcado, crea los roles `plataforma_owner` y `plataforma_app`
(`deploy/postgres/roles.sql`, con las contraseñas del `.env`, sin mostrarlas) y extrae las fotos en `./media`. Se niega
si la base ya tiene tablas o `./media` no está vacía. Después, borrar el paquete de la VM.

### 4. Arrancar

```bash
docker compose -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.prod.yml ps        # los tres «healthy» / «running»
```

Abrir `https://investigacionletras.unmsm.edu.pe` y `https://investigacionletras.unmsm.edu.pe/admin`. **En cuanto
esté arriba, cambiar desde el panel la contraseña de cada cuenta** (vienen del entorno de pruebas).

### Actualizar a una versión nueva

```bash
git pull
docker compose -f docker-compose.prod.yml up -d --build
```

Si la versión nueva trae **migraciones** (carpeta `migrations/`), la app no debe arrancar sin aplicarlas: `pnpm migrate`
está limitado a bases desechables locales (`scripts/migrar.mjs`) y la migración de producción necesita un procedimiento
propio, revisado y autorizado. Hasta entonces, no desplegar versiones con migraciones nuevas.

### Diagnóstico

- `docker compose -f docker-compose.prod.yml logs -f app` (o `nginx`, `postgres`).
- **nginx no arranca:** casi siempre el certificado (faltan `fullchain.pem`/`privkey.pem` o la clave no corresponde).
  `docker compose -f docker-compose.prod.yml run --rm --no-deps nginx nginx -t` muestra el error.
- **app no llega a healthy:** una variable de `.env` vacía o con el valor de la plantilla (la app se niega a arrancar
  con un `PAYLOAD_SECRET` de ejemplo o corto: `lib/entorno.ts`), o la base sin los roles (falta la primera carga).

## Pendiente (siguientes etapas)

- Calibrar con TI las tasas de `deploy/nginx/limites.conf`.
- Procedimiento de migraciones en producción (ver «Actualizar a una versión nueva»).
- Backups automáticos de base + `media/` con restauración probada.
- Migración del contenido de producción desde Strapi.
- Archivo con Meilisearch (hoy filtra en el navegador, como el prototipo).
- Sesión de prueba del panel con un editor real (D11).
