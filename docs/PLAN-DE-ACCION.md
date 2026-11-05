# Plan de acción — Plataforma de landings (seguridad, cumplimiento, SEO, rendimiento y UX)

Plan detallado a partir de `docs/PLAN-AUDITORIA.md`.

- **Versión 2 — revalidada el 14-10-2026 (Fase 0, solo lectura).** Contrasta la versión del 13-10-2026 con el
  código, el código fuente instalado de Payload 3.90.2 y del plugin multi-tenant, y una nueva auditoría de
  dependencias. Corrige las instrucciones que eran técnicamente incorrectas (ver «Correcciones respecto a la v1»).
- Ningún cambio de código, configuración, base de datos ni despliegue se hizo durante esta revisión.

Cada punto indica su **estado con evidencia**, la **acción**, el **criterio de aceptación** y su **prioridad**:

- **P0:** obligatorio antes de publicar.
- **P1:** en el primer mes.
- **P2:** mejora continua.

Clasificación de cada afirmación:

| Marca | Significado |
|---|---|
| **[C]** | Confirmada por código o prueba (se indica la fecha si no es de hoy) |
| **[H]** | Hipótesis: requiere una prueba concreta antes de darla por cierta |
| **[O]** | Obsoleta: la v1 la daba por cierta y no lo es |
| **[D]** | Pendiente de decisión humana (no se resuelve con código) |

Leyenda del estado: ✅ cumple · ⚠️ parcial o a verificar · ❌ falta.

> Contexto de publicación: un dominio institucional (previsto `gi.letras.unmsm.edu.pe`) detrás de **Nginx**, con
> **certificado institucional**, y una VM con la app Next.js + Payload y Postgres. La modalidad de despliegue
> (Docker Compose completo o Node como servicio + Postgres) **aún no está decidida** (ver D10).

---

## 0. Estado real del proyecto (14-10-2026)

| Aspecto | Estado |
|---|---|
| Repositorio | `Handoff/proyecto-landings/plataforma`, rama `master`, **sin commits**. Todo el árbol está sin seguimiento (18 entradas). No se mezcla con el repo de Strapi ni con el spike |
| Ignorados | `.env`, `.env.*` (incluye `.env.credenciales`), `media/`, `.next/`, `node_modules/` **[C]** (`git check-ignore`) |
| Versiones exactas | Next 16.3.8 · React 19.2.4 · Payload 3.90.2 (última estable publicada) · `@payloadcms/db-postgres` 3.90.2 · plugin multi-tenant 3.90.2 · sharp 0.35.3 · zod 4.4.3 · TypeScript 5.7.3 · pnpm 11.24.0 |
| Variables de entorno | Existen (no se leyeron sus valores): `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_PORT`, `DATABASE_URI`, `PAYLOAD_SECRET`, `NEXT_PUBLIC_SITE_URL` |
| Despliegue versionado | **Ninguno**: no hay configuración de Nginx, systemd, Dockerfile ni migraciones. `docker-compose.yml` solo levanta Postgres local en `127.0.0.1:5434` |
| Migraciones | **No hay carpeta de migraciones** **[C]**. El esquema actual se creó con el `push` automático de desarrollo de Drizzle. Con `NODE_ENV=production` no hay `push`: una instalación limpia en producción **no crearía las tablas** |
| Renderizado | Las páginas públicas llaman a `connection()` y se generan bajo demanda; `pnpm build` no necesita la BD **[C]** (revalidado en frío, sin `.next/` y con la BD apagada, el 29-10-2026; sí necesita acceso a Google Fonts) |
| Base de datos local | Docker apagado durante esta revisión: los datos de la BD (rol `plataforma`, inventario de medios) son del **13-10-2026** y se revalidan en la subfase 1a |
| Pruebas existentes | `pnpm test:aislamiento` (Local API + HTTP). No cubre: usuarios, registro de cambios por REST, archivos privados por URL, manipulación de campos de `mensajes`, `?draft=true` anónimo, endpoints de autenticación |

---

## Resumen de la revisión

**No se encontraron hallazgos críticos**: en el código revisado nada expone datos privados ni permite editar otro grupo.

### Hallazgos revalidados

| # | Hallazgo | Evidencia | Clase | P |
|---|---|---|---|---|
| H1 | La app se conecta a Postgres con un rol **superusuario** | `pg_roles`: `plataforma` con `rolsuper`, `rolcreaterole` y `rolcreatedb` (13-10). Revalidar con la BD arriba | [C] 13-10 | P0 |
| H2 | **16 avisos** en dependencias de producción: 5 altos, 6 moderados, 5 bajos, 0 críticos | `pnpm audit --prod` del 14-10; detalle y tratamiento en 3.4 | [C] | P0 |
| H3 | **Sin cabeceras de seguridad** | `next.config.mjs` sin `headers()` ni `poweredByHeader: false`; no hay `proxy.ts` | [C] | P0 |
| H4 | Cookie de sesión sin `Secure` y **CSRF sin lista de orígenes** | Payload: `cookies: { sameSite: 'Lax', secure: false }` por defecto; `csrf: []` y sin `serverURL`. Con la lista vacía, `extractJWT` acepta la cookie desde cualquier `Origin`. `SameSite=Lax` mitiga los POST entre sitios, pero no hay segunda barrera | [C] | P0 |
| H5 | El formulario recoge **datos personales sin política de privacidad ni consentimiento** | `Colaborar.tsx`: nombre, correo, institución y mensaje; sin casilla ni enlace | [C] | P0 |
| H6 | **7 de 9 actividades** enlazan al sitio antiguo, que se dará de baja; 1 usa `buff.ly` | `actividades.url` (13-10) | [C] 13-10 | P0 |
| H7 | El límite de envíos **se puede saltar, crece sin tope y puede bloquear a todos** (✅ corregido en la app en la subfase 4b, 03-11-2026; falta desplegar el proxy) | `acciones.ts`: usa el 1.er valor de `X-Forwarded-For` (lo envía el cliente); `Map` sin limpieza; sin cabecera, todas las peticiones comparten la clave `'local'` (3 envíos por minuto para todo el sitio) | [C] | P0 |
| H8 | La **REST anónima** lee lo publicado de todas las colecciones de contenido | Las funciones de acceso no distinguen la Local API de la REST. **Ojo:** `lib/cms` también lee como anónimo; cerrar el `read` anónimo sin más rompería el sitio (ver A) | [C] | P1 |
| H9 | Un editor puede **modificar por la API los datos de un mensaje** (nombre, correo, texto) | `Mensajes`: `admin.readOnly` solo afecta a la interfaz; `update: usuarioDelPanel` sin acceso por campo | [C] | P1 |
| H10 | **Imágenes sin redimensionar**: se sirve el original; la foto principal carga en `lazy` | `Media.upload` sin `imageSizes`; `Imagen.tsx` siempre con `loading="lazy"` (también en `Hero`) | [C] | P0 |
| H11 | **SEO y vista previa incompletos** | Solo `title` y `description`; no existen `sitemap.ts`, `robots.ts`, `icon.*` ni `public/` | [C] | P0 |
| H12 | El **CTA desaparece por debajo de 1200 px** | `Nav.module.css:47-48`: `.links { display: none }`; no hay menú móvil | [C] | P1 |
| H13 | El límite de tamaño de archivos es el **genérico de Payload** (20 MB por archivo, 50 MB por petición), no uno ajustado (✅ ajustado por tipo en la subfase 5a, 03-11-2026) | `fetchAPI-multipart/index.js`: `DEFAULT_UPLOAD_OPTIONS` | [C] (corrige la v1) | P1 |
| H14 | **No hay migraciones versionadas** | Sin `migrations/`; el esquema salió del `push` de desarrollo. ✅ Cerrado: migraciones desde el 22-10-2026, completadas y protegidas en la subfase 3a (02-11-2026) | [C] nuevo | P0 |
| H15 | Si la validación falla, **el formulario pierde lo escrito** | Campos no controlados con `<form action>`: React 19 reinicia el formulario al terminar la acción. Los errores no se asocian al campo ni se anuncian | [C] por código · [H] por prueba manual | P0 |
| H16 | Un editor **ve a otros usuarios** que comparten algún grupo con él (correo, roles, grupos) | Plugin `withTenantAccess` en `usuarios`: `id = yo` **o** algún grupo en común. Si el superadmin tiene grupos asignados, sus editores lo ven. ✅ Cerrado en la subfase 2c (02-11-2026): el editor solo lee su cuenta | [C] código · [H] datos | P1 |
| H17 | No hay **página de error** (500) propia | No existe `error.tsx` ni `global-error.tsx` | [C] | P1 |

### Lo que ya cumple

Mantenerlo y cubrirlo con pruebas:

- **Contraseñas:** PBKDF2-SHA256 con 600 000 iteraciones y sal por usuario [C] 13-10.
- **Login:** bloqueo tras 5 intentos durante 10 minutos; token de 8 h [C].
- **Sesiones en el servidor:** `useSessions: true` por defecto en 3.90.2, así que cerrar sesión invalida la sesión en el servidor [C] (dejaba obsoleta la acción 2.3 de la v1 «cierre que invalida el token»).
- **Endpoints de autenticación:**
  - `/api/usuarios/first-register` se niega (`Forbidden`) si ya existe un usuario [C] (`registerFirstUser.js`).
  - `/api/usuarios/init` solo devuelve `{ initialized: boolean }` [C].
  - Desbloquear una cuenta requiere sesión [C] (`defaultUnlockAccess`).
- **Sin SMTP:** la recuperación de contraseña no envía nada. El adaptador por consola registra solo destinatario y asunto, nunca el enlace [C] (`consoleEmailAdapter.js`).
- **Campos protegidos contra manipulación:**
  - `roles`: acceso de campo, solo el superadmin.
  - Grupos del usuario: el plugin solo deja escribirlos al superadmin.
  - `visibilidad`: solo la escribe el cálculo privilegiado.
  - `ruta`: siempre se recalcula.
- **Archivos privados:** la ruta `/api/media/file/<nombre>` aplica el acceso de lectura de `media` (anónimo: solo `visibilidad = publica`) e impide recorrer directorios con `../` [C] (`checkFileAccess.js`). No hay carpeta `public/` y `media/` no se sirve como estática [C].
- **Tipo real de los archivos:** Payload comprueba el contenido con `file-type`, no solo la extensión [C] (`checkFileRestrictions.js`); falta la prueba (5a).
- **Metadatos de los 26 archivos actuales:** ninguno tiene EXIF [C] (lectura de metadatos con sharp, 14-10).
- **GraphQL** desactivado [C].
- **Red y base de datos:** Postgres solo en `127.0.0.1` con `scram-sha-256` [C] 13-10.
- **Consultas:** sin SQL crudo; todo pasa por Payload/Drizzle, con consultas parametrizadas [C].
- **HTML del CMS:** no se inyecta; el único `dangerouslySetInnerHTML` es un script estático del *typewriter* [C].
- **Formulario:** validación zod en el servidor y campo trampa; el grupo se resuelve en el servidor con `grupoPorRuta`, que solo acepta grupos activos [C].
- **URLs del CMS:** limitadas a `http(s)` [C].
- **Imágenes y diseño:**
  - `alt` obligatorio en los archivos [C].
  - Página 404 propia [C].
  - Contraste AA en todos los pares de color, el más bajo 5,68:1 [C] 13-10.

---

## Correcciones respecto a la v1 (13-10-2026)

| v1 decía | Corrección | Motivo |
|---|---|---|
| 1.1 «Bloquear la REST anónima: `read` anónimo solo donde haga falta» | **Distinguir por canal** en las funciones de acceso: anónimo por Local API (lo usa `lib/cms`) → solo lo publicado; anónimo por REST → denegado; lectura de archivo estático (`isReadingStaticFile`) → solo `publica` | `lib/cms` lee como anónimo con `overrideAccess: false`: cerrar el `read` anónimo dejaría el sitio vacío. Payload expone `req.payloadAPI` (`'local'` / `'REST'`) y `isReadingStaticFile` |
| 1.1 (b) «En Nginx, `/admin` y `/api` solo desde la red institucional» | Restringir **`/admin`** y las rutas de **autenticación y escritura** de `/api`. Las lecturas de `/api/media/file/` deben seguir abiertas, y el panel necesita todo `/api` desde la red permitida | Las imágenes públicas salen de `/api/media/file/`; el panel usa la REST autenticada |
| H13 «Sin límite de tamaño» | Hay un límite genérico de 20 MB por archivo y 50 MB por petición | `DEFAULT_UPLOAD_OPTIONS` de Payload 3.90.2 |
| 1.8 «Quitar EXIF al procesar con sharp» (lógica propia) | No hace falta lógica propia: al activar `resizeOptions`/`formatOptions`, el original pasa por sharp y `withMetadata` (por defecto `false`) elimina los metadatos. Los tamaños derivados ya salen sin ellos | `generateFileData.js` |
| 1.8 «`upload.limits.fileSize`: imágenes 5 MB y PDF 20 MB» | `upload.limits` es **global** (en `buildConfig`), no por colección ni por tipo. El límite por tipo se hace con un hook de `media` que mire `req.file.size` y el MIME | API de Payload 3.90.2 |
| 2.2 «`sameSite: 'Strict'`» | **Evaluarlo antes.** Con `Strict`, al abrir `/admin` desde un enlace externo (correo, chat) la primera carga llega sin cookie y pide iniciar sesión. Recomendación: `Lax` + `csrf` con el origen exacto + `serverURL`; `Strict` solo si la prueba de flujos lo permite | Flujos reales del panel |
| 2.3 «Cierre de sesión que invalida el token» | Ya ocurre (`useSessions: true`). Queda solo bajar la duración a 2 h si se aprueba | `collections/config/defaults.js` |
| 3.4 «`pnpm.overrides` para `undici`, `braces` y `dompurify`» | Solo **`undici`** tiene corrección compatible: override acotado a `payload>undici`. `braces` no tiene versión corregida. `esbuild` (vía `drizzle-kit`) y `dompurify` (vía `monaco`, en el panel) quedan como **excepciones justificadas con fecha de revisión** | Árbol de dependencias inspeccionado (3.4) |
| 4.1 `return 301 https://$host$request_uri` | `return 301 https://<host permitido>$request_uri` con `server_name` explícito, más un `default_server` que cierre los `Host` desconocidos (`return 444`) | Evitar redirecciones construidas desde un `Host` arbitrario |
| 4.2 «`includeSubDomains` si el subdominio no tiene hijos» | No activar `includeSubDomains` sin un inventario de subdominios aprobado por TI (D1) | Riesgo de dejar inaccesibles servicios por HTTP |
| 4.3 CSP con `'nonce-…'` en `next.config.mjs` | Un nonce **por petición** solo se puede generar en `proxy.ts` (Next 16), y con renderizado dinámico (ya lo es). Se empieza con **`Content-Security-Policy-Report-Only`**, se revisan las infracciones y se endurece por ruta (sitio y panel por separado) | Las cabeceras de `next.config.mjs` son estáticas: un nonce fijo no sirve de nada |
| 4.3 «En Nginx o en Next» | **Un solo origen por cabecera**: CSP y cabeceras de la app en Next; HSTS, `server_tokens` y TLS en Nginx. Prueba que detecte cabeceras duplicadas | Evitar duplicadas o contradictorias |
| 4.4 «La app usa `X-Real-IP`» | La app **solo** confía en `X-Real-IP` cuando la petición llega del proxy autorizado: Next escucha en `127.0.0.1` y una variable explícita (`CONFIAR_EN_PROXY=1`) activa la lectura. Nginx **sobrescribe** `X-Real-IP` y `X-Forwarded-For` con `$remote_addr` (no los añade) | El cliente controla esas cabeceras si nadie las sobrescribe |
| 4.5 Roles `plataforma_owner` / `plataforma_app` | Se mantiene, pero **depende de H14**: primero una migración base versionada, después los roles. Incluye secuencias, `ALTER DEFAULT PRIVILEGES` y pruebas en instalación limpia | Con `push` no hay migraciones que ejecutar con el rol dueño |
| 4.7 «Borrar los mensajes atendidos a los 12 meses (tarea programada)» | **No automatizar** la retención hasta que se apruebe la política (D4). Mientras tanto, solo procedimiento manual documentado | Regla del proyecto |
| 4.8 «Servicio systemd con `output: 'standalone'`» | Pasa a **decisión D10** (Docker Compose completo o systemd). No se mezclan ambas modalidades | No hay despliegue versionado que confirme ninguna |
| 5.2 «Rechazar si el envío llega en menos de 3 s o tras más de 2 h» | Marca firmada en el servidor (HMAC con `PAYLOAD_SECRET`) con tolerancia: menos de 2 s → «posible spam», **sin descartar**; más de 24 h → pedir reenviar **conservando el texto**. Sin dependencia del reloj del cliente | No perder propuestas legítimas |
| 5.2 «Deduplicación (mismo correo y texto en 10 min)» | Marcar como duplicado y **no** crear una segunda notificación. Nunca borrar automáticamente | Mismo motivo |
| 5.4 «Nginx `limit_req` para los POST de páginas» | Limitar solo las **Server Actions** (POST con cabecera `Next-Action`) en las rutas públicas, el login y `forgot-password`. El panel y la subida de medios llevan su propia zona, más amplia | Un límite genérico de POST rompería el panel |
| 5.4 «`Map` con tope y limpieza» | Válido **solo** con un único proceso (despliegue actual previsto). Tope de entradas y barrido verificables por prueba. Con varias instancias: tabla en Postgres | Coherencia con la arquitectura (D10) |
| 7.4 `sitemap.ts` dinámico | Reutilizar `listarGrupos()` (solo grupos activos con landing publicada, más sus archivos) y llamar a `connection()` para que el build siga sin necesitar la BD | Requisito «build sin BD» |
| 8.1 «Reprocesar los 26 archivos actuales» | Solo con **respaldo** (`pg_dump` + copia de `media/`), inventario antes y después y una reversión ensayada en la BD de auditoría | Regla: no reprocesar medios sin respaldo |

---

## 1. Control de acceso y protección de datos en la aplicación

| # | Tema | Estado | Acción | Criterio de aceptación | P |
|---|---|---|---|---|---|
| 1.1 | **REST anónima** (A) | ✅ Panel y escritura con sesión [C]. ✅ H8 cerrado en la subfase 2b (02-11-2026, ver su registro al final) | Funciones de acceso por canal (`lib/access`): `publicadoOPanel` y `archivoPublicoOPanel` devuelven `false` para el anónimo cuando `req.payloadAPI === 'REST'`, salvo `isReadingStaticFile` en `media`. Lista cerrada de operaciones anónimas: lectura de archivos públicos, `login`, `logout`, `forgot-password` y `reset-password`. Se documenta qué responden `/api/access` y `/api/usuarios/me` sin sesión [H] | Anónimo: `GET /api/integrantes`, `/api/landing`, `/api/grupos`, `/api/media` → 403 o lista vacía. `GET /api/media/file/<público>` → 200; `<privado>` → 403. El sitio sigue mostrando todo. Panel sin cambios | P1 |
| 1.2 | **Restringir acceso a registros** (B) | ✅ `registro-cambios`: solo superadmin [C]. ✅ `mensajes` por grupo [C]. ✅ H16 cerrado en la subfase 2c (02-11-2026): `read: yo` para editores; ver su registro al final | El editor solo lee su propio usuario (`read: yo` para editores) o solo `email` de compañeros, según D11. El superadmin sin grupos asignados | Pruebas: el editor no lista al superadmin ni a usuarios de otros grupos; `registro-cambios` por REST → 403 | P1 |
| 1.3 | **Bloquear la manipulación de campos** (B) | ✅ `roles`, grupos del usuario, `visibilidad`, `ruta` [C]. ❌ H9. [H] cambio de `grupo` de un documento propio a otro grupo | `mensajes`: acceso de campo `update: () => false` en `nombre`, `correo`, `institucion`, `tipo` y `mensaje`; solo `estado` editable. Pruebas `PATCH` con `grupo` ajeno, `id`, `createdAt`, `_status` y `visibilidad` en cada colección | Cada intento → 403 o campo sin cambios (verificado al releer de la BD) | P1 |
| 1.4 | **Row-Level Security** | ❌ No hay; el aislamiento lo hace la app y está probado [C] | **Sin RLS completo por ahora**: Payload usa un pool compartido sin variable de grupo por petición. Defensa en profundidad: rol mínimo (4.5) + pruebas de aislamiento. *Spike* opcional solo en `mensajes` y `registro_cambios` | Documento de decisión en `docs/` | P2 |
| 1.5 | **Parametrizar consultas** | ✅ [C] | Regla en `pnpm verificar` que falle si aparece `sql.raw`, `` sql` `` o `.execute(` en código propio | El chequeo falla con un ejemplo plantado y pasa sin él | P1 |
| 1.6 | **Validar entradas** | ✅ zod, slug y URLs [C]. ✅ `tipo` en lista blanca (subfase 4a, 03-11-2026); `mensajes` solo se crea por esa acción. ⚠️ `maxLength` de los textos del CMS: sin subfase asignada, pendiente | `tipo` validado contra `tiposColaboracion` de la landing de ese grupo (o «Otro»). `maxLength` en los textos del CMS (títulos ≤ 200, resúmenes ≤ 600, biografías ≤ 4000) | Pruebas del esquema; texto de 100 000 caracteres → error de validación | P1 |
| 1.7 | **Sanitizar contenido** | ✅ React escapa; texto plano; URLs `http(s)` [C]. ✅ Caracteres de control e invisibles del formulario (subfase 4a, 03-11-2026). ⚠️ *Typewriter*: queda para 6b | Quitar caracteres de control e invisibles (`U+0000–U+001F` salvo salto de línea, `U+202A–U+202E`) en el formulario. Mover el script del *typewriter* a un archivo o protegerlo con *nonce* o *hash* (6b) | Prueba con `<script>`, `javascript:` y RTL override → se muestran como texto o se rechazan | P1 |
| 1.8 | **Restringir archivos** (G) | ✅ MIME por contenido [C]. ✅ Límite global de 20 MB e imágenes ≤ 5 MB / PDF ≤ 20 MB; `nosniff` y CSP con `sandbox` en los archivos servidos (subfase 5a, 03-11-2026). ⚠️ `client_max_body_size` en Nginx: 6c | `upload.limits.fileSize` global de 20 MB y hook en `media`: imágenes ≤ 5 MB, PDF ≤ 20 MB. `modifyResponseHeaders` de `media` (existe en 3.90.2): `X-Content-Type-Options: nosniff` y, en PDF, `Content-Security-Policy: sandbox`. `client_max_body_size 21m` en Nginx | Subir un `.exe` renombrado a `.jpg` → rechazo; imagen de 6 MB → rechazo; PDF servido con `application/pdf` y `nosniff` | P1 |
| 1.9 | **Devolver solo lo necesario** | ✅ `lib/cms` devuelve objetos mínimos [C]. ⚠️ REST con documentos completos (se cierra en 1.1) | Revisar la respuesta RSC de una landing; errores sin trazas en producción | La carga RSC no contiene correos de usuarios, `createdAt` ni campos internos | P1 |

## 2. Autenticación, sesiones y credenciales

| # | Tema | Estado | Acción | Criterio de aceptación | P |
|---|---|---|---|---|---|
| 2.1 | **Hashear contraseñas** | ✅ [C] 13-10 | Política: mínimo 12 caracteres y rechazo de las comunes (hook `beforeValidate` en `usuarios`, lista local sin dependencia nueva) | Crear un usuario con `12345678` → rechazo | P1 |
| 2.2 | **Cookies y CSRF** (E) | ⚠️ H4 | `Usuarios.auth.cookies`: `secure` activado en producción, sin `domain`. `serverURL` desde `NEXT_PUBLIC_SITE_URL` (Payload añade ese origen a `csrf`). `SameSite`: probar `Strict` en los flujos de inicio de sesión, recuperación, enlace externo a `/admin`, vista previa y cierre de sesión; adoptarlo solo si todos funcionan, si no `Lax` | Por HTTPS, `Set-Cookie: payload-token=…; HttpOnly; Secure; SameSite=…`. Petición con cookie y `Origin` ajeno → sin sesión. Todos los flujos del panel pasan | P0 |
| 2.3 | **Duración de la sesión** | ✅ 8 h y sesiones en el servidor [C] | Bajar a 2 h si se aprueba (D11) | Pasado el tiempo, el panel pide iniciar sesión | P2 |
| 2.4 | **Segundo factor / acceso al panel** | ❌ Payload no tiene 2FA | `/admin` y las rutas de escritura y autenticación de `/api` solo desde la red o VPN autorizada (D3). Riesgo: el bloqueo por intentos permite a un atacante bloquear cuentas de editores; lo mitigan la restricción de red y `limit_req` | Desde una IP externa: `/admin` → 403; imágenes públicas → 200 | P0 |
| 2.5 | **Alta de cuentas y recuperación** | ⚠️ La semilla escribe contraseñas en `.env.credenciales` (solo local) [C]. Sin SMTP la recuperación no envía nada [C] | En producción no hay `.env.credenciales`. Alta: el superadmin crea la cuenta y el editor fija su contraseña con el enlace de recuperación (requiere SMTP, D6). Comprobar que la respuesta de `forgot-password` no revela si el correo existe [H] | Flujo completo en el entorno de prueba; el enlace caduca | P0 |
| 2.6 | **Secreto de la app** | ⚠️ `payload.config.ts` usa `PAYLOAD_SECRET \|\| ''` y `DATABASE_URI \|\| ''` [C] | Fallar al arrancar si faltan, o si `PAYLOAD_SECRET` tiene menos de 32 caracteres (sin imprimir el valor) | Arrancar sin la variable → error claro que no revela valores | P0 |

## 3. Secretos, APIs y dependencias

| # | Tema | Estado | Acción | Criterio de aceptación | P |
|---|---|---|---|---|---|
| 3.1 | **Secretos hardcodeados** | ✅ Solo `process.env` en el código [C] | Detector de secretos (gitleaks, binario fijado y verificado por *checksum*, sin dependencia npm) sobre el árbol antes del primer commit. Buscar en `.next/static` los nombres de las variables privadas y patrones de secreto, sin leer ni imprimir valores | Informe sin hallazgos; ninguna variable privada en el *bundle* del cliente | P0 |
| 3.2 | **Inventario de APIs** (A) | ⚠️ | Inventario real: endpoints REST de Payload por colección, endpoints de autenticación, `/api/access` y la Server Action `enviarPropuesta`. Respuesta anónima de cada uno | Tabla en `docs/auditoria/` con método, ruta, anónimo y autenticado | P0 |
| 3.3 | **Eliminar secretos de git** | ✅ `plataforma` sin historial [C]. ⚠️ El repo de Strapi sí tiene historial | (a) `plataforma`: escaneo previo al primer commit. (b) Repo de Strapi: escaneo del historial (solo lectura). Si aparece algo: **rotar primero** (con autorización) y después limpiar el historial de forma coordinada | Informe sin hallazgos o con secretos rotados | P0 |
| 3.4 | **Escanear dependencias** (D) | ❌ H2 | Ver la tabla de tratamiento | `pnpm audit --prod`: 0 críticas; 0 altas sin corrección o sin excepción aprobada | P0 |
| 3.5 | **Licencias** | ⚠️ | `pnpm licenses list --prod` | Listado adjunto | P2 |

**Tratamiento de H2** (auditoría del 14-10-2026):

| Paquete | Severidad | Instalado → corregido | Ruta | Tratamiento propuesto |
|---|---|---|---|---|
| `sharp` | 2 altas (libheif, librsvg) | 0.35.3 → ≥ 0.35.5 (última: 0.35.5) | Directa | Subir a `0.35.5` exacta. Probar la subida de JPEG, PNG, WebP y GIF y los `imageSizes` |
| `undici` | 2 altas, 4 moderadas, 3 bajas | 7.29.0 → ≥ 7.29.1 (7.30.0 en la rama 7) | `payload` la fija **exacta** en 7.29.0; solo la usa `uploads/safeFetch.js` (subida desde URL) | Override **acotado** `"payload>undici": "7.30.0"`: misma versión mayor, solo parche y menor. Probar la subida desde URL si se usa, el build y el panel. Si Payload publica una 3.x con undici corregido, quitar el override |
| `braces` | 1 alta (DoS con patrones anidados) | 3.0.3, sin versión corregida | `@payloadcms/next` → `sass` → `chokidar` → `braces` | **Excepción** temporal: los patrones de `chokidar` no los controla ningún usuario (vigilancia de archivos en build o desarrollo). Revisar el 14-11-2026 o cuando salga una versión corregida |
| `esbuild` | 1 moderada (servidor de desarrollo) | ≤ 0.24.2 | `db-postgres` → `drizzle-kit` → `@esbuild-kit` | **Excepción**: solo afecta a `esbuild serve`, que no se usa en producción. Revisar el 14-11-2026 |
| `dompurify` | 2 bajas (modo `IN_PLACE`) | ≤ 3.4.15 → ≥ 3.4.16 | `@payloadcms/ui` → `monaco-editor` (solo panel) | **Excepción** si Monaco no usa `IN_PLACE` [H, se verifica en 1c]; si lo usa, override acotado a `monaco-editor>dompurify` |

No se declarará resuelta ninguna vulnerabilidad sin el lockfile actualizado, `pnpm audit` repetido y build y pruebas en verde.

## 4. Infraestructura, HTTPS y cifrado (Nginx + certificado institucional)

Todo lo de esta sección se **prepara y versiona** en `deploy/` y se prueba en local o en una VM de prueba. Aplicarlo en el servidor real requiere autorización explícita.

| # | Tema | Estado | Acción | Criterio de aceptación | P |
|---|---|---|---|---|---|
| 4.1 | **Forzar HTTPS** (J) | ❌ Sin publicar | `server :80` con `server_name` explícito → `return 301 https://<host>$request_uri`. `default_server` en 80 y 443 que cierre los `Host` desconocidos. `:443` con la cadena completa del certificado institucional (PEM; si llega en `.pfx`, conversión documentada) y clave con permisos `600`. Solo TLS 1.2 y 1.3; OCSP stapling si la CA lo soporta; aviso de vencimiento 30 días antes | `curl -I http://<host>` → 301 a `https://<host>`; `Host: otro` → conexión cerrada; `openssl s_client` muestra la cadena completa y el nombre coincide con D1 | P0 |
| 4.2 | **HSTS** (J) | ❌ | En Nginx: `max-age=300` hasta comprobar HTTPS en todos los hosts afectados; después `31536000`. Sin `includeSubDomains` sin inventario aprobado; **sin `preload`** | Cabecera en todas las respuestas HTTPS, una sola vez | P0 |
| 4.3 | **Cabeceras de seguridad** (E) | ❌ H3 | **Next** (`headers()` + `proxy.ts`): `X-Content-Type-Options`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy`, `X-Frame-Options: DENY` / `frame-ancestors 'none'`, `Cross-Origin-Opener-Policy: same-origin`, `poweredByHeader: false`. **CSP**: nonce por petición en `proxy.ts`, primero `Report-Only` en el sitio y, por separado, en `/admin`; endurecer tras revisar las infracciones. **Nginx**: HSTS, `server_tokens off` | Ninguna cabecera duplicada (prueba automática); cero infracciones CSP en el recorrido del sitio y en las operaciones editoriales; después, CSP aplicada | P0 |
| 4.4 | **Proxy e IP real** (F) | ✅ App: `CONFIAR_EN_PROXY` y solo `X-Real-IP` (subfase 4b, 03-11-2026). ⚠️ Nginx: plantilla en `deploy/nginx/`, no desplegada (6c/6d) | Nginx: `proxy_set_header X-Real-IP $remote_addr;` y `X-Forwarded-For $remote_addr` (sobrescribe), `X-Forwarded-Proto $scheme`, `Host $host` limitado por `server_name`. App en `127.0.0.1:3000`; lee `X-Real-IP` solo con `CONFIAR_EN_PROXY=1`. Si la cabecera falta en producción, la petición no comparte cubo con las demás | `X-Forwarded-For` falsificado no cambia la clave del límite; sin proxy, la cabecera se ignora | P0 |
| 4.5 | **Roles de base de datos** (C) | ❌ H1, H14 | (1) Migración base (`payload migrate:create`) y `push: false` explícito. (2) `plataforma_owner`: dueño del esquema, solo para migraciones. (3) `plataforma_app`: `LOGIN`, sin `SUPERUSER`, `CREATEROLE`, `CREATEDB` ni `BYPASSRLS`; `USAGE` en el esquema; `SELECT/INSERT/UPDATE/DELETE` en las tablas; `USAGE, SELECT` en las secuencias; `ALTER DEFAULT PRIVILEGES FOR ROLE plataforma_owner` para tablas y secuencias futuras; sin `CREATE` en el esquema; `REVOKE ALL ON SCHEMA public FROM PUBLIC`. (4) `pnpm migrate` usa la conexión del dueño (`DATABASE_URI_MIGRACIONES`); la app nunca la recibe | En una BD de auditoría limpia: migrar como dueño → OK; app → pasa `test:aislamiento`; `CREATE TABLE` y `DROP TABLE` como app → error; `\du` muestra `plataforma_app` sin atributos. Credenciales de producción intactas | P0 |
| 4.6 | **«Public key» para la BD** | ⚠️ Local en `127.0.0.1` [C] | Postgres sin puerto público; `pg_hba` solo local. Administración por SSH con llave (`PasswordAuthentication no`, `PermitRootLogin no`) y túnel para `psql`. Si la BD pasara a otro servidor: TLS `verify-full` con la CA institucional | Desde fuera: 5432 cerrado y SSH sin contraseñas, comprobado por TI. No se escanean redes sin autorización | P0 |
| 4.7 | **Cifrado de datos sensibles** | ⚠️ Mensajes y correos de usuarios. Contraseñas ✅ | En tránsito: 4.1. En reposo: disco de la VM cifrado (coordinar con TI). Backups cifrados (`age` o `gpg`) antes de salir de la VM. **Retención: sin borrado automático** hasta aprobar D4. `pgcrypto` no recomendado (impide buscar y protege poco con la clave en la misma VM) | Restaurar un backup cifrado en una BD limpia | P1 |
| 4.8 | **Servicio y aislamiento del proceso** (J) | ❌ [D] D10 | Según D10: (a) Docker Compose con la app en un contenedor sin root y solo `127.0.0.1:3000`; o (b) `output: 'standalone'` + systemd con usuario sin privilegios. Firewall: 80 y 443 públicos; 22 desde la red institucional | `ss -tlnp`: 3000 y 5432 solo en local; reinicio automático probado | P0 |
| 4.9 | **Backups y restauración** | ❌ | `pg_dump` + `media/` diario, con retención según D4 y copia fuera de la VM. **Restauración probada** con tiempo medido | Simulacro documentado | P0 |

## 5. Formularios, spam, bots y límites de uso

| # | Tema | Estado | Acción | Criterio de aceptación | P |
|---|---|---|---|---|---|
| 5.1 | **Validar el formulario** (H) | ✅ zod en el servidor [C]. ✅ H15, errores por campo, `maxLength` y `tipo` en lista blanca: cerrado en la subfase 4a (03-11-2026) | Campos con los valores devueltos por la acción (o `defaultValue` desde el estado) para no perder lo escrito; errores por campo desde zod con `aria-invalid`, `aria-describedby` y un resumen `role="alert"`; `maxLength` iguales a zod; `tipo` en lista blanca (1.6) | Vacío, correo inválido, 5000 caracteres y `tipo` inventado → mensajes claros por campo, **sin perder texto**, anunciados por el lector de pantalla | P0 |
| 5.2 | **Spam** (H) | ✅ Subfase 4c (03-11-2026): marca de menos de 2 s y más de 3 enlaces → «posible spam»; duplicados marcados; campo trampa en un contenedor `display:none`. ⚠️ Lista de términos sin definir. ⚠️ Migración pendiente en la base de trabajo | Marca de tiempo firmada (ver la corrección de la v1); filtro de contenido (más de 3 enlaces o lista de términos) → se guarda con estado «posible spam», **no se descarta**; deduplicación que marca y no borra. Ajustar el campo trampa: sin `aria-hidden` sobre un campo de formulario; oculto con `display:none` en un contenedor | Script robot → marcado o rechazado; un envío humano a los 5 s y otro a las 3 h → aceptados | P0 |
| 5.3 | **Protección contra bots** | ⚠️ | Turnstile **solo si el spam persiste** y con aprobación (servicio externo, D8) | Dos semanas sin spam en el panel | P2 |
| 5.4 | **Rate limiting** (F) | ✅ App: IP y grupo, 5 por hora, con tope y barrido (subfase 4b, 03-11-2026). Login ✅ bloquea a los 5 intentos. ⚠️ Nginx: plantilla `limit_req` preparada, no desplegada; tasas sin calibrar | **App:** clave = IP de confianza (4.4) + grupo; 5 envíos por hora; estructura con tope (10 000 claves) y barrido periódico, en un único proceso (D10). **Nginx:** zonas separadas para las Server Actions públicas (`$http_next_action` no vacío y método POST), `/api/usuarios/login`, `forgot-password` y `reset-password`; el panel y las subidas con límites amplios propios; `limit_conn` por IP | Ráfaga sobre la acción → 429; el panel y las subidas siguen funcionando; la memoria se mantiene estable con 100 000 IP falsas (prueba unitaria del tope) | P0 |
| 5.5 | **Notificación al grupo** | ❌ | Aviso por correo (D6) sin el contenido del mensaje | Llega el aviso | P2 |

## 6. Cumplimiento legal y privacidad (K)

> Marco: Perú, **Ley 29733** y su Reglamento (D.S. 016-2024-JUS). Todo texto que se redacte aquí es un **borrador
> técnico pendiente de aprobación institucional** (D2), no asesoría jurídica. Ninguna página legal se publica sin esa
> aprobación.

| # | Tema | Estado | Acción | Criterio de aceptación | P |
|---|---|---|---|---|---|
| 6.1 | **Política de privacidad** | ❌ H5 | Página `/privacidad` común, ruta reservada, con: responsable y contacto (D2), datos recogidos, finalidad, base legal y versión (D2), plazo de conservación (D4), destinatarios, derechos ARCO, banco de datos ante la ANPD si corresponde (D2), cookies y analítica (D7), fecha y versión | Borrador aprobado por escrito; enlazado desde el pie y el formulario | P0 [D] |
| 6.2 | **Consentimiento en el formulario** | ❌ | Casilla obligatoria no marcada, con el texto aprobado (D2). `mensajes` guarda la fecha y la versión de la política aceptada (nuevo campo, solo lectura para todos) | Sin marcar → error accesible; el mensaje guardado incluye la versión | P0 [D] |
| 6.3 | **Términos y condiciones** | ❌ | `/terminos` y acuerdo de uso para editores, con los textos aprobados (D2) | Publicados y enlazados | P0 [D] |
| 6.4 | **Banner de cookies** | ✅ Hoy los visitantes no reciben cookies [C] (solo el panel usa la de sesión, esencial) | Solo si D7 elige una analítica con cookies | Sin consentimiento, ninguna petición de analítica ni cookies `_ga` | P0 si hay GA4 |
| 6.5 | **Sección de cookies** | ❌ | Dentro de `/privacidad` | Coincide con lo que muestra el navegador | P0 si hay GA4 |

## 7. SEO, vista previa al compartir y enlaces (I)

| # | Tema | Estado | Acción | Criterio de aceptación | P |
|---|---|---|---|---|---|
| 7.1 | **Metadescripciones** | ⚠️ Las landings usan el lema; directorio y archivos sin descripción [C] | Campo opcional «Descripción para buscadores» (máx. 160) con el lema de respaldo; descripción fija para `/` y plantilla para `/archivo`; plantilla de título | Cada ruta con un `description` único de 70 a 160 caracteres | P0 |
| 7.2 | **Vista previa al compartir** | ❌ H11 | `og:*`, `twitter:card` y `alternates.canonical` por ruta, desde `NEXT_PUBLIC_SITE_URL`. `og:image` 1200×630 del tamaño `og` (5b) o una imagen genérica | Etiquetas presentes en local; validadores externos solo con el dominio público | P0 |
| 7.3 | **Favicon** | ❌ [C] | `app/icon.svg`, `app/apple-icon.png`, `manifest` y `admin.meta.icons` | Icono en escritorio y móvil | P0 |
| 7.4 | **`sitemap.xml` y `robots.txt`** | ❌ [C] | `app/sitemap.ts` con `connection()` + `listarGrupos()`: solo grupos activos con landing publicada y sus archivos. `app/robots.ts`: `Disallow: /admin` y `/api/` (salvo `/api/media/file/`). Fuera de producción: `X-Robots-Tag: noindex`. **`robots.txt` no protege nada**: el control es el de 1.1 y 2.4 | El sitemap lista exactamente los grupos visibles (prueba contra la BD); `pnpm build` sin BD sigue funcionando; sin `force-dynamic` | P0 |
| 7.5 | **Enlaces rotos** | ❌ H6 [D] D9 | Según D9: página de detalle `/<grupo>/actividades/<slug>` o retirar los enlaces. Sustituir `buff.ly` por la URL final. Comprobador de enlaces sobre el sitio local (herramienta a justificar en la subfase) | Informe sin errores 4xx o 5xx | P0 |
| 7.6 | **Datos estructurados** | ❌ | JSON-LD `ResearchOrganization` y `Event` (con *nonce* de la CSP) | Prueba de resultados enriquecidos sin errores | P2 |

## 8. Rendimiento y carga (G)

| # | Tema | Estado | Acción | Criterio de aceptación | P |
|---|---|---|---|---|---|
| 8.1 | **Comprimir imágenes** | ✅ Tamaños derivados, original acotado, `srcset` y script de reproceso (subfase 5b, 04-11-2026; ensayado en el clon). ⚠️ Base local sin migrar ni reprocesar. ⚠️ Con densidad 3, algunas imágenes a todo el ancho superan 150 KB | `imageSizes` en WebP, calidad 75: `tarjeta` 480, `media` 960, `grande` 1600 y `og` 1200×630. `resizeOptions` (máx. 2400 px, `withoutEnlargement`), que de paso elimina EXIF del original. `Imagen` con `srcset`/`sizes`; `lib/cms` solo expone los tamaños de archivos públicos. Reprocesar los 26 actuales con respaldo, inventario y reversión ensayada | Ninguna imagen > 150 KB en móvil; la reversión deja el inventario idéntico al de antes; los tamaños de un archivo privado → 403 | P0 |
| 8.2 | **Imagen principal (LCP)** | ⚠️ Prioridad en el Hero de los dos temas (subfase 5c). LCP < 2,5 s no cumplido en la landing demo ni en Prensa | Prop `prioridad` en `Imagen`: `loading="eager"` + `fetchPriority="high"` solo en el Hero | LCP < 2,5 s en móvil | P0 |
| 8.3 | **Carga web** | ⚠️ Medido antes: p50 39 ms, 223 peticiones/s, HTML 90 KB. Subfase 5c: solo Public Sans precargada (de 440 KB de fuentes por página a 154–298 KB). Lighthouse móvil: Rendimiento ≥ 90 en 3 de 6 páginas y LCP > 2,5 s en las 6 | Lighthouse móvil en `/`, una landing, un subgrupo y un archivo. Fuentes: 3 familias, 7 pesos y cursivas; reducir las que no se usen | Rendimiento ≥ 90, LCP < 2,5 s, CLS < 0,1 | P0 |
| 8.4 | **Caché** | ✅ Por grupo [C]. ⚠️ Archivos | `Cache-Control` de `/api/media/file/*` con `max-age` moderado (los archivos pueden pasar a privados, así que no `immutable`); `/_next/static/*` inmutable | `curl -I` muestra las cabeceras previstas | P1 |
| 8.5 | **Prueba de carga en la VM** | ⚠️ Solo en el portátil | Repetirla detrás de Nginx y TLS | p95 < 150 ms con 20 concurrentes | P1 |

## 9. Accesibilidad, interfaz y móvil

| # | Tema | Estado | Acción | Criterio de aceptación | P |
|---|---|---|---|---|---|
| 9.1 | **ALT y placeholders** | ✅ `alt` obligatorio. ⚠️ Los placeholders muestran pistas de diseño («foto del grupo») [C] | Fondo neutro con `aria-hidden` o iniciales; revisar la calidad de los `alt` | axe sin `image-alt` | P0 |
| 9.2 | **Contraste y foco** | ✅ AA [C] 13-10. ⚠️ `outline: none` en campos | Foco visible de 2 px en enlaces, botones y chips | axe = 0 errores; recorrido con teclado visible | P0 |
| 9.3 | **Vista en móvil** | ⚠️ H12 | Menú compacto accesible o barra con «Colaborar»; zonas táctiles ≥ 44 px; campos ≥ 16 px | Revisión a 360, 375, 414 y 768 px y en dispositivo real | P1 |
| 9.4 | **CTA claro** | ⚠️ | Botón de CTA en el Hero, además del menú y la sección final | Visible sin desplazarse | P1 |
| 9.5 | **404 y error** | ✅ 404. ❌ H17 | `error.tsx` y `global-error.tsx` sin trazas; 404 con `noindex` | 404 y 500 con su diseño y su código | P1 |
| 9.6 | **Teclado y movimiento** | ⚠️ | Ficha con foco atrapado y Esc; «Saltar al contenido»; `prefers-reduced-motion` | Recorrido con teclado y NVDA | P1 |

## 10. Analítica (D7)

| # | Tema | Estado | Acción | Criterio de aceptación | P |
|---|---|---|---|---|---|
| 10.1 | **GA4** | ✅ No hay analítica [C] | Solo tras D7: una propiedad, dimensión `grupo`, Consent Mode v2 denegado por defecto, carga tras aceptar, CSP actualizada | Eventos solo con consentimiento | P1 [D] |
| 10.2 | **Alternativa sin cookies** | — | Autoalojada en la VM, si D7 lo prefiere | — | P2 [D] |

## 11. Calidad de código y verificación continua

`pnpm verificar` crece por subfase, sin instalar todo de una vez y justificando cada herramienta:

| Paso | Cuándo entra | Herramienta | Nueva dependencia |
|---|---|---|---|
| TypeScript, ESLint | 1b | Ya instaladas | No |
| Auditoría de dependencias (`--audit-level=high` + lista de excepciones con fecha) | 1b | `pnpm audit` | No |
| Build de producción | 1b | `next build` | No |
| Detección de secretos | 1b | gitleaks (binario fijado) | No (binario externo, se pide aprobación) |
| Aislamiento y acceso anónimo y autenticado | 2a | `test-aislamiento.ts` ampliado | No |
| Pruebas unitarias (formulario, límite, acceso) | 4a (integrado el 03-11-2026: formulario) | `node --test` (Node 24 lee el TypeScript); Vitest no se aprobó | No |
| Formato | 1b (integrado el 02-11-2026, aprobado) | Prettier 3.9.10 + Knip 6.42.0 (código muerto) | Sí (devDependencies exactas) |
| Cabeceras (presentes y sin duplicados) | 6a | Script propio con `fetch` | No |
| Playwright (landing, archivo, formulario, panel) | 8 | Playwright | Sí: se justifica en 8 |
| Enlaces e imágenes | 1b: enlaces internos (externos opcionales, sin fallar); 7: resto | Script propio con `fetch` (`scripts/verificar/enlaces.mjs`) | No |
| Accesibilidad | 8 | axe (con Playwright) | Sí |

**Criterio de publicación:**
- Ninguna vulnerabilidad crítica o alta sin resolver o sin excepción aprobada con fecha.
- Todos los P0 cerrados y verificados **en el entorno real**: un riesgo comprobado solo en local no se da por corregido.
- Restauración probada.
- Panel protegido por red.
- Textos legales aprobados.
- `pnpm verificar` en verde.
- Riesgos residuales documentados.

---

## Secuencia revisada de subfases

Cada subfase tiene un alcance cerrado, pruebas escritas **antes** del cambio y se detiene con el informe
«FASE — RESULTADO» hasta recibir aprobación.

**Cambios de orden respecto a la propuesta original:**
- **Migraciones antes que roles:** sin migraciones no hay un rol dueño que las ejecute.
- **Pruebas de acceso antes de tocar el acceso:** dejan constancia del comportamiento actual y detectan regresiones.
- **REST anónima en P1 en lugar de P0:** no expone nada que el sitio no muestre ya.

| Subfase | Alcance | Archivos previstos | Depende de | Autorización necesaria |
|---|---|---|---|---|
| **1a. Línea base** | Levantar la BD local, `typecheck`, `lint`, `build`, `audit`, `test:aislamiento`; revalidar H1, H6 y el inventario de medios; primer commit del estado actual (sin cambios de código) | `docs/auditoria/2026-10-linea-base.md` | — | Arrancar Docker; **primer commit** |
| **1b. `pnpm verificar` mínimo** — ✅ 02-11-2026 | Script que encadena typecheck, lint, audit con lista de excepciones, búsqueda de SQL crudo y `dangerouslySetInnerHTML`, y build; escaneo de secretos. **Hecho:** además Prettier (`--check`), Knip, pruebas de aislamiento y seguridad (solo con base desechable confirmada) y enlaces internos; uso y requisitos en el README («Verificación») | `package.json`, `scripts/verificar.mjs`, `scripts/verificar/` (las excepciones de la auditoría, en `excepciones-auditoria.json`), `.prettierrc.json`, `.prettierignore`, `knip.json` | 1a | Uso del binario gitleaks |
| **1c. Dependencias** | `sharp` 0.35.5; override `payload>undici`; comprobar el uso de `IN_PLACE` en Monaco; excepciones con fecha | `package.json`, `pnpm-lock.yaml` | 1b | — |
| **2a. Pruebas de acceso** | Ampliar `test-aislamiento`: usuarios, `registro-cambios` por REST, `PATCH` de campos de `mensajes`, archivo privado por URL, `?draft=true` anónimo, `/api/access`, `/me`, `/init`, `/first-register`, cambio de `grupo`. Los fallos conocidos (H9, H16) se marcan como esperados | `scripts/test-aislamiento.ts` | 1a | — |
| **2b. REST anónima por canal** — ✅ 02-11-2026 | Funciones de acceso que distinguen Local API y REST; archivos estáticos públicos. Registro completo al final del documento | `lib/access/index.ts`, colecciones | 2a | — |
| **2c. Mensajes y usuarios** — ✅ 02-11-2026 | Acceso de campo en `mensajes`; lectura de `usuarios` para editores (D11). Registro completo al final del documento | `payload/collections/plataforma.ts`, `lib/access`, `payload.config.ts` | 2a | D11 |
| **3a. Migración base** — ✅ 02-11-2026 | `payload migrate:create`, `push: false`, `pnpm migrate`; instalación limpia en `plataforma_auditoria`. Registro completo al final del documento | `migrations/`, `payload.config.ts`, `package.json` | 1a | Crear la BD de auditoría local |
| **3b. Roles de Postgres** — ✅ **APTO** 03-11-2026. Observaciones cerradas: credencial en `.env.migraciones` y permisos de la base de trabajo reparados con `roles.sql`, con autorización (registro al final) | Script SQL de roles y privilegios (incluidos los futuros); app con `plataforma_app` en local | `deploy/postgres/roles.sql`, `.env.example` | 3a | — (nunca credenciales de producción) |
| **3c. Cookies y configuración segura** | `secure`, `serverURL`/`csrf`, evaluación de `SameSite`, arranque que falla sin secretos | `payload.config.ts`, `plataforma.ts` | 2a | — |
| **4a. Validación del formulario** — ✅ 03-11-2026 (registro al final) | Conservar valores, errores accesibles, `maxLength`, `tipo` en lista blanca, limpieza de caracteres | `acciones.ts`, `Colaborar.tsx`, `lib/formulario.ts` | 2a | Vitest (si se aprueba). Sin aprobación, se usa `node --test`, sin dependencias nuevas |
| **4b. Rate limiting** — ✅ 03-11-2026, con observaciones: plantilla de Nginx preparada, no desplegada y con tasas sin calibrar (registro al final) | Clave de IP de confianza, estructura con tope, plantilla de `limit_req` | `acciones.ts`, `lib/limite-envios.ts` (el plan preveía `lib/limite.ts`), `lib/entorno.ts`, `deploy/nginx/` | 4a | — |
| **4c. Anti-spam** — ✅ 03-11-2026, con observaciones: lista de términos sin definir; migración `20261103_201313_antispam_4c` aplicada solo en el clon (registro al final) | Marca de tiempo firmada, estado «posible spam», duplicados marcados | `acciones.ts`, `mensajes`, `lib/formulario.ts`, `lib/antispam.ts`, `lib/access/privileged.ts`, `Colaborar.tsx` | 4a | Migrar la base de trabajo |
| **5a. Límites de archivos** — ✅ 03-11-2026, con observaciones: borrado del archivo anterior al fallar una sustitución por otro motivo (comportamiento de Payload); `client_max_body_size` queda para 6c (registro al final) | Límite global, hook por tipo, `modifyResponseHeaders` y pruebas de MIME falso | `plataforma.ts`, `payload.config.ts`, `lib/archivos.ts`, `next.config.mjs` | 2b | — |
| **5b. Imágenes derivadas** — ✅ 04-11-2026, con observaciones: ensayado solo en el clon; migración y reproceso de la base local pendientes de autorización; criterio de 150 KB no cumplido con densidad 3 (registro al final) | `imageSizes`, `resizeOptions`, `srcset`; respaldo, reprocesamiento y reversión ensayados en la BD de auditoría, y después en la local | `plataforma.ts`, `Imagen.tsx`, `lib/cms`, script de reproceso | 5a, 3a | Reprocesar medios locales |
| **5c. LCP y fuentes** — ⚠️ 04-11-2026, NO APTA: cambios hechos y sin regresiones, pero el LCP móvil de la landing demo y de Prensa sigue por encima de 2,5 s. Descartados `inlineCss` (5c.1) y el Hero de 720 px (5c.2): se mantiene el de 960 px (registro al final) | `prioridad` en el Hero; pesos de fuente | `Imagen.tsx`, `Hero.tsx`, `layout.tsx` | 5b | — |
| **6a. Cabeceras en Next** | Cabeceras estáticas, `poweredByHeader`, `proxy.ts` con nonce y CSP en `Report-Only`; script del *typewriter*; prueba de duplicados | `next.config.mjs`, `proxy.ts`, `Hero.tsx` | 5c | — |
| **6b. CSP aplicada** | Endurecer la CSP según las infracciones observadas, por ruta | `proxy.ts` | 6a + recorrido | — |
| **6c. Plantillas de despliegue** | Nginx (HTTPS, `default_server`, cabeceras de IP, `limit_req`, `client_max_body_size`, HSTS corto), servicio según D10, backups | `deploy/` | 4b, D1, D3, D10 | — (solo archivos) |
| **6d. Despliegue** | Aplicar en la VM con TI | — | 6c | **Explícita** (producción) |
| **7a. Borradores legales** | `/privacidad` y `/terminos` como borrador no publicado; casilla y versión de consentimiento | `app/(sitio)/…`, `mensajes` | 4a | D2, D4 |
| **7b. SEO** | Metadatos, OG, favicon, `sitemap.ts`, `robots.ts` | `app/`, `PaginaLanding.tsx` | 5b | — |
| **7c. Actividades antiguas** | Según D9 | Según la decisión | 7b | D9 |
| **8a. Móvil y CTA** | Menú compacto, CTA en el Hero | `Nav.*`, `Hero.*` | 6a | — |
| **8b. Accesibilidad y errores** | Foco, teclado, `reduced-motion`, `error.tsx`, `global-error.tsx`, placeholders; Playwright + axe (si se aprueban) | componentes, `app/(sitio)/` | 8a | Playwright |
| **9. Prepublicación** | Backups y restauración probados, auditorías finales, *smoke tests* en el entorno real | `docs/auditoria/` | todo | **Explícita** |

**Riesgos y regresiones posibles por subfase:**

| Subfase | Riesgo o regresión | Cómo se controla |
|---|---|---|
| 2b | Un error en el acceso por canal puede vaciar el sitio | `test:aislamiento` + comprobación HTTP de las landings |
| 3b | Un privilegio que falte rompe el panel en tiempo de ejecución, sobre todo con tablas nuevas | `ALTER DEFAULT PRIVILEGES` + prueba tras una migración |
| 3c | `Strict` o `serverURL` mal fijados rompen el inicio de sesión | Matriz de flujos del panel |
| 5b | El reprocesamiento puede cambiar los nombres de archivo | Inventario y reversión ensayada |
| 6a/6b | Una CSP aplicada rompe el panel (Monaco, estilos en línea) | Fase `Report-Only` |
| 4b | Un límite mal calibrado bloquea a usuarios reales tras NAT institucional | Límite por IP y grupo, con margen y revisado tras publicar |

---

## Decisiones pendientes (bloqueantes cuando se indica)

| # | Decisión | Bloquea |
|---|---|---|
| D1 | **Certificado y host:** formato (PEM o `.pfx`), cadena intermedia, nombre exacto o *wildcard*, vencimiento; inventario de subdominios si se quiere `includeSubDomains` | 4.1, 4.2, 6c |
| D2 | **Textos legales:** quién redacta y aprueba; responsable del tratamiento; base legal; texto y versión del consentimiento; correo ARCO; inscripción del banco de datos | 6.1–6.3, 7a |
| D3 | **Acceso al panel:** VPN o rangos de IP autorizados | 2.4, 6c |
| D4 | **Conservación de los mensajes:** plazo y procedimiento (sin borrado automático hasta aprobarlo) | 4.7, 4.9, 6.1 |
| D5 | **Primer commit** del estado actual como línea base | 1a |
| D6 | **SMTP:** proveedor y cuenta, con credenciales fuera del repositorio | 2.5, 5.5 |
| D7 | **Analítica:** ninguna, GA4 con consentimiento o alternativa sin cookies | 6.4, 6.5, 10 |
| D8 | **Turnstile** u otro servicio externo anti-bots (solo si hay spam) | 5.3 |
| D9 | **Actividades antiguas:** página de detalle propia o retirar los enlaces | 7.5, 7c |
| D10 | **Modalidad de despliegue:** Docker Compose completo o Node como servicio + Postgres; una sola instancia o varias | 4.8, 5.4, 6c |
| D11 | **Visibilidad entre editores** y duración de la sesión (8 h → 2 h). La 2c aplicó la opción mínima (cada editor, solo su cuenta); queda decidir si se amplía a ver el correo de los compañeros, y la duración de la sesión | 1.2, 2.3, 2c |

---

## Registro de la subfase 2b — REST anónima por canal (02-11-2026)

**Objetivo.** Que un visitante anónimo reciba por la API REST solo lo que el sitio necesita, sin tocar el aislamiento
multi-tenant, el esquema ni los datos.

**Estado inicial (medido en el clon sintético).** Un anónimo leía por REST todo lo publicado de **todos** los grupos,
**inactivos incluidos**: `landing`, `integrantes`, `publicaciones`, `actividades`, `eventos`, `grupos` (y metadatos de
`media`). Funcionaban `/count`, `/:id`, `depth`, `where`, `select` y `draft`. El sitio no usa nada de eso: lee con la
Local API en el servidor (`lib/cms`), y el formulario es una Server Action.

**Hallazgos**

- **H8:** la REST anónima era una segunda vía al contenido de todos los grupos, sin el filtro por grupo activo de
  `lib/cms`. Con las funciones anteriores, la prueba nueva lee por id el integrante de un grupo inactivo (HTTP 200).
- **Archivos de un grupo inactivo:** seguían descargándose por `/api/media/file/` si se conocía el nombre.
- **Byte nulo en el nombre de archivo** (`%00`): provocaba un 500 (sin filtrar información) en lugar de un 4xx.
- **Ya protegidos antes de la subfase:**
  - `usuarios`, `mensajes`, `registro-cambios`, `payload-locked-documents`, `payload-kv` y las versiones devolvían 403
    a un anónimo;
  - las escrituras anónimas ya devolvían 403;
  - `paste-url` exige sesión y no está activado;
  - GraphQL está desactivado y `payload-migrations` no tiene REST;
  - el traversal (`../`) se rechaza.

**Endpoints inventariados** (Payload 3.90.2, verificados en el código instalado y con peticiones reales)

| Endpoint | Antes (anónimo) | Después (anónimo) | Con sesión |
|---|---|---|---|
| `GET /api/{landing,integrantes,publicaciones,actividades,eventos,grupos}` (+ `/count`, `/:id`) | 200, todos los grupos | **403** | Sin cambios: el editor, solo su grupo |
| `GET /api/media` (+ `/count`, `/:id`) | 200 (metadatos de los públicos) | **403** | Sin cambios |
| `GET /api/media/file/:nombre` | Público si `visibilidad=publica` | Público si `visibilidad=publica` **y su grupo está activo**; los nombres con caracteres de control dan 403 | Editor: los de su grupo |
| `GET /api/{usuarios,mensajes,registro-cambios,payload-locked-documents,payload-kv,payload-preferences}` y `*/versions` | 403 | 403 | Sin cambios |
| `POST/PATCH/DELETE` (incluidos masivos y `/:id/duplicate`) | 403 | 403 | Sin cambios |
| `/api/usuarios/{login,logout,me,init,forgot-password,reset-password,refresh-token,unlock,first-register}` | Funcionan | Sin cambios | Sin cambios |
| `GET /api/access` | Declaraba lectura en 7 colecciones | No concede ninguna | Sin cambios |
| `/api/media/paste-url`, `/api/graphql`, `/api/payload-migrations`, `/api/globals/*` | 403 / 404 / 501 / 404 | Igual | — |

No hay globals, rutas propias en `app/api`, middleware ni proxy.

**Matriz de acceso final** (`lib/access/index.ts`)

- **Anónimo por Local API** (`payloadAPI: 'local'`, solo `lib/cms`): sin cambios.
  - Contenido publicado, grupos activos, archivos públicos de grupos activos.
  - Siempre filtrado por el grupo de la URL.
- **Anónimo por REST:**
  - nada de colecciones;
  - solo `/api/media/file/` (`isReadingStaticFile`) para archivos públicos de grupos activos.
- **Cualquier otro canal:** denegado.
- **Editor:** sin cambios; el plugin lo limita a sus grupos (también en `grupos`). No puede cambiar su rol ni sus grupos.
- **Superadmin:** sin cambios; acceso a todos los grupos y al registro de cambios.

**Cambios**

- `lib/access/index.ts`:
  - `publicadoOPanel`, `archivoPublicoOPanel` y la nueva `grupoActivoOPanel` distinguen el canal;
  - los archivos exigen además grupo activo;
  - se rechazan los nombres de archivo con caracteres de control.
- `payload/collections/plataforma.ts`: `grupos.read` usa `grupoActivoOPanel`, la misma regla de antes, ahora en el
  módulo de políticas.
- `scripts/test-seguridad.ts`: sección `rest`, con 41 comprobaciones nuevas.
- `scripts/test-aislamiento.ts`: la comprobación de borradores por REST anónima ahora exige 403 y ningún documento.
  Antes bastaba una lista vacía.

**Pruebas** (clon con datos sintéticos; grupos A, B y un grupo inactivo temporal; editor, superadmin y cuenta sin
grupos temporales)

- `pnpm verificar` completo: **APROBADA**, con aislamiento 74/74 y seguridad 146/146 (105 anteriores + 41 nuevas).
- Regresión:
  - HTTP 41/41;
  - formulario en navegador sin fallos;
  - panel 24/24;
  - 0 llamadas peligrosas a deepmerge;
  - sin conexiones externas.
- **Contraprueba:** con las funciones de acceso anteriores, la sección `rest` falla en 11 comprobaciones. Detecta la
  fuga, no solo la configuración.
- **Original** (base real, solo lectura):
  - `pnpm verificar` deja sin ejecutar las pruebas que escriben, como debe;
  - el resto aprueba, con 52 URL internas, imágenes incluidas;
  - el sondeo anónimo da 57×403 y ningún documento;
  - el directorio, sus filtros, las landings, el archivo y el login cargan;
  - 0 diferencias en la base.

**Riesgos residuales**

- `/api/access` y `/api/usuarios/init` siguen respondiendo a un anónimo: estructura de permisos sin datos, e
  «inicializado».
- `payload-preferences/*` responde 200 con `value: null`.
- La recuperación de contraseña y el login dan la misma respuesta exista o no la cuenta (comprobado), pero el tiempo de
  respuesta no se ha medido.
- El panel y los endpoints de autenticación siguen expuestos hasta restringirlos por red (2.4, D3). El límite de
  intentos en Nginx queda para 4b/6c.
- Un editor ve a otros usuarios que comparten su grupo (H16): subfase 2c, D11.
- Los PDF se sirven sin `Content-Disposition` ni `sandbox` (1.8, subfase 5a).
- Todo está verificado en local; en el entorno real queda para la prepublicación (subfase 9).

**Decisiones pendientes:** ninguna nueva. Siguen D3 (acceso al panel) y D11 (visibilidad entre editores).

## Registro de la subfase 2c — Usuarios, mensajes y datos personales (02-11-2026)

**Objetivo.** Que cada cuenta acceda solo a los datos personales y mensajes que necesita para su función, dentro de sus
grupos, sin tocar la arquitectura multi-tenant, el esquema ni los datos.

**Hallazgos iniciales** (medidos en el clon sintético con el código anterior)

- **Vulnerabilidades confirmadas:**
  - **H16:** un editor leía las cuentas de quienes comparten algún grupo con él: correo, roles y grupos, incluso los de
    los otros grupos de esas cuentas. Valía por lista, `/count`, filtros (`where[roles]=superadmin`, `where[email]`),
    `select`, `depth` e id. También leía al superadmin, si este tenía un grupo asignado.
  - **Desbloqueo de cuentas:** `POST /api/usuarios/unlock` sin regla propia. El plugin dejaba a un editor desbloquear
    las cuentas de su grupo, lo que anula la protección contra fuerza bruta (5 intentos, 10 minutos).
  - **Fecha de recepción de un mensaje:** un editor podía cambiar `createdAt` de los mensajes de su grupo por REST.
    Payload añade ese campo sin control de acceso.
  - **Bloqueos de edición** (`payload-locked-documents`, colección interna de Payload): un editor veía los bloqueos de
    **todos** los grupos (qué documento se edita, cuándo y con qué cuenta), y podía tomarlos, crearlos sobre documentos
    de otros grupos, moverlos y borrarlos. Con `depth=1`, el panel y la REST mostraban el correo de quien edita.
- **Riesgos potenciales:** ver «Riesgos residuales».
- **Comportamientos correctos, ya antes de la subfase:**
  - un anónimo no lee cuentas, mensajes, bloqueos ni el registro (403);
  - el editor no cambia su rol ni sus grupos (acceso de campo y `arrayFieldAccess` del plugin);
  - no edita cuentas ajenas, no crea ni borra cuentas;
  - los mensajes se filtran por grupo y sus datos personales no se pueden editar;
  - las respuestas no incluyen `hash`, `salt`, tokens, intentos ni bloqueo (campos `hidden` de Payload);
  - `sessions` solo la ve la propia cuenta;
  - `/api/grupos/populate-tenant-options` exige sesión y devuelve solo los grupos propios;
  - el registro de cambios guarda `usuario:<id>`, no el correo;
  - los logs del código propio no llevan datos personales.
- **Falsos positivos descartados:**
  - `/api/usuarios/init` solo responde `{"initialized": true}`;
  - `first-register` se rechaza porque ya existen cuentas;
  - `api-key/reveal` no aplica: no hay claves de API activadas;
  - no hay endpoints propios de usuarios ni de mensajes; el único endpoint propio es el del plugin.

**Modelo de usuarios auditado** (`usuarios`, Payload 3.90.2)

| Campo | Categoría | Necesario para | Lee | Modifica |
|---|---|---|---|---|
| `id` | Identificación | Sesión, relaciones | La propia cuenta; superadmin | Nadie |
| `email` | Contacto / identificación | Login | La propia cuenta; superadmin | La propia cuenta; superadmin |
| `roles` | Autorización | Permisos | La propia cuenta; superadmin | Solo superadmin |
| `grupos[].grupo` | Pertenencia | Aislamiento por grupo | La propia cuenta; superadmin | Solo superadmin |
| `createdAt`, `updatedAt` | Auditoría | — | La propia cuenta; superadmin | Payload |
| `hash`, `salt`, `resetPasswordToken`, `resetPasswordExpiration` | Autenticación | Login y recuperación | Nadie (ocultos) | Solo Payload |
| `loginAttempts`, `lockUntil` | Autenticación | Bloqueo tras intentos | Nadie (ocultos) | Payload; desbloqueo: superadmin |
| `sessions[]` | Autenticación | Sesiones en servidor | Solo la propia cuenta | Solo Payload |

No hay nombre, teléfono ni otros datos personales en las cuentas. No hay claves de API ni verificación por correo.

**Modelo de mensajes auditado** (`mensajes`): `grupo`, `nombre`, `correo`, `institucion`, `tipo`, `mensaje` (datos de
quien escribe), `estado` (`nuevo`/`atendido`), `createdAt`, `updatedAt`.

- Son **privados del grupo**: los atienden sus editores, que necesitan el nombre y el correo para responder.
- Se crean solo por la Server Action del formulario (`crearMensajeContacto`), con antispam y límite de envíos.
- No se pueden crear por la API.
- No hay mensajes enviados, respuestas ni relaciones con cuentas.

**Matriz de permisos final**

| Recurso | Anónimo | Editor | Cuenta sin grupos | Superadmin |
|---|---|---|---|---|
| `usuarios`: leer (lista, id, `/count`, filtros) | 403 | **Solo su cuenta** | Solo su cuenta | Todas |
| `usuarios`: editar | 403 | Su correo y contraseña; rol y grupos no | Igual | Todo |
| `usuarios`: crear, borrar, `unlock` | 403 | 403 | 403 | Sí |
| `/api/usuarios/me`, `logout`, `refresh-token` | `user: null` | Su sesión | Su sesión | Su sesión |
| `login`, `forgot-password`, `reset-password` | Funcionan, sin revelar si la cuenta existe | — | — | — |
| `mensajes`: leer | 403 | Los de sus grupos | 403 | Todos |
| `mensajes`: editar | 403 | Solo `estado`, solo en sus grupos | 403 | Solo `estado` |
| `mensajes`: crear por la API, duplicar | 403 | 403 | 403 | 403 (solo el formulario) |
| `mensajes`: borrar | 403 | 403 | 403 | Sí |
| `payload-locked-documents`: leer, tomar, liberar | 403 | **Los de documentos de sus grupos**; solo puede ponerse a sí mismo como dueño | Ninguno (lista vacía) | Todos |
| `payload-locked-documents`: crear por la API | 403 | 403 (el panel los crea en el servidor) | 403 | Sí |
| `/api/grupos/populate-tenant-options` (plugin) | 401 | Sus grupos | Ninguno | Todos |
| `registro-cambios` | 403 | 403 | 403 | Lectura |

**Datos personales por rol**

- **Anónimo:** ninguno.
- **Editor:** los suyos (correo, rol, grupos) y los de quienes escriben a sus grupos (nombre, correo, institución,
  mensaje), que necesita para atenderlos. De sus compañeros, ninguno: en el aviso «está editando» del panel ve el
  número de la cuenta, no su correo.
- **Superadmin:** los de todas las cuentas, sin campos de autenticación, y todos los mensajes.

**Cambios**

- `lib/access/index.ts`: nueva `cuentaPropiaOSuperadmin` (anónimo `false`, editor `id = yo`, superadmin todo).
- `payload/collections/plataforma.ts`:
  - `usuarios.read` usa `cuentaPropiaOSuperadmin`;
  - `usuarios.unlock` pasa a `soloSuperadmin`;
  - `mensajes` tiene un hook `beforeChange` que conserva `createdAt` en cada actualización.
- `lib/access/privileged.ts`: acceso por grupo a `payload-locked-documents` (`protegerBloqueos`).
  - Un editor solo ve, toma y libera los bloqueos de documentos de sus grupos, y de su cuenta o sus grupos.
  - No puede asignarlos a otra cuenta, moverlos ni crearlos por la API.
  - Sin bloqueos visibles, recibe una lista vacía, no un 403: el panel consulta esa colección al abrir un documento.
- `payload.config.ts`: `onInit` aplica `protegerBloqueos`, junto a `protegerEscrituras`. Esa colección la añade
  Payload después de `collections` y `plugins`.
- `scripts/test-seguridad.ts`:
  - nueva sección `usuarios`, con 59 comprobaciones;
  - la comprobación de deepmerge sobre `payload-locked-documents` ahora usa un superadmin temporal, porque el editor ya
    recibe 403 antes de validar; sigue exigiendo el 400 del rechazo de la clave.
- `README.md`: garantía «Cuentas».

Sin cambios de esquema, de datos, de diseño ni de la arquitectura multi-tenant. El plugin sigue aplicando su filtro por
grupo encima de estas reglas.

**Pruebas** (clon con datos sintéticos)

- **Datos de prueba:**
  - dos grupos nuevos (A y B);
  - editores a1 y a2 de A, b1 de B, ab de A y B;
  - una cuenta sin grupos y una cuenta bloqueada tras 5 intentos;
  - un superadmin con grupo A;
  - mensajes `nuevo` y `atendido` en A y `nuevo` en B;
  - un bloqueo de edición en cada grupo.
- **`pnpm verificar` completo:** **APROBADA**, con aislamiento 74/74 y seguridad **205/205** (146 anteriores y 59
  nuevas).
- **Regresión:**
  - HTTP 41/41;
  - formulario en navegador sin fallos (antispam y límite incluidos);
  - panel 24/24;
  - 0 llamadas peligrosas a deepmerge;
  - sin conexiones externas.
- **Bloqueo en el panel, con dos navegadores:**
  - el editor 1 edita y el editor 2, del mismo grupo, ve el aviso sin el correo;
  - el editor 2 toma el control y edita;
  - un editor de otro grupo no ve el bloqueo.
- **Contraprueba con el acceso anterior:**
  - la sección `usuarios` falla en 21 comprobaciones: compañeros, superadmin con grupo, bloqueos ajenos, desbloqueo y
    `createdAt`;
  - en la prueba del panel, el aviso mostraba el correo del compañero.
- **Original** (base real, solo lectura):
  - `pnpm verificar` deja sin ejecutar las pruebas que escriben, como debe; el resto aprueba, con 52 URL internas;
  - la sonda anónima GET de cuentas, mensajes, bloqueos, registro y grupos asignables da 16/16 sin datos;
  - el directorio, las landings, el archivo de grupo y el login cargan;
  - 0 diferencias en el recuento exacto de filas.

**Riesgos residuales**

- **Liberación del bloqueo:** en la prueba headless, el bloqueo no se liberó al salir del documento por el menú. Pasa
  igual con el código anterior: es comportamiento de Payload. El bloqueo caduca a los 5 minutos o se toma el control.
- **Aviso de bloqueo:** muestra «Usuario: <número>» en lugar del correo, consecuencia de D11. Si se decide que los
  editores vean el correo de sus compañeros, hay que ampliar `cuentaPropiaOSuperadmin` solo a `email` (D11).
- **Recuperación de contraseña:**
  - sin adaptador de correo, no envía nada (2.5, D6);
  - el adaptador de consola de Payload escribe en el log del servidor el destinatario y el asunto de cada intento,
    sin el enlace ni el token; al configurar SMTP (D6) desaparece.
- **Autoservicio de la cuenta:** el editor puede cambiar su propio correo sin confirmación. Es el comportamiento estándar
  de Payload y no da privilegios; queda para decidir con D11.
- **`createdAt` editable:** en las colecciones de contenido sigue siendo editable por su editor. Es información
  editorial, no personal, y queda en 1.3.
- **Exposición del panel y la autenticación:** siguen expuestos hasta restringirlos por red (D3). El límite de intentos
  en Nginx queda para 4b/6c, y el tiempo de respuesta del login no se ha medido.
- **Entorno real:** todo está verificado en local; en el entorno real queda para la prepublicación (subfase 9).

**Decisiones pendientes:** D11, ya acotada: se aplicó la opción mínima; quedan la posible ampliación al correo de los
compañeros y la duración de la sesión. Sigue D3.

## Registro de la subfase 3a — Migraciones versionadas (02-11-2026)

**Objetivo.** Un sistema de migraciones versionado, reproducible y controlado, con `pnpm migrate`, que no pueda tocar
la base real.

**Auditoría inicial.** Ya existía la mayor parte, desde la transición del 22-10-2026:
- `push: false` y `migrationDir` en `payload.config.ts`;
- dos migraciones (`20261022_163428_inicial` y `20261030_161656_escuela_grupos`), con sus snapshots e `index.ts`;
- el registro en `payload_migrations`;
- una transacción por migración (Payload 3.90.2), con parada en el primer error;
- `scripts/migrar.mjs`, con el rol propietario y comprobaciones antes y después;
- los scripts de roles, huella y línea base, y `docs/BASE-DE-DATOS.md`.

Lo que faltaba:

| Elemento | Estado | Problema | Acción |
|---|---|---|---|
| Destino de `pnpm migrate` y `migrate:status` | Cualquier base | En el original, `DATABASE_URI_MIGRACIONES` apunta a la base real: un `pnpm migrate` accidental la migraría | Protección del destino en capas |
| `pnpm payload migrate…` | Sin control | Salta el envoltorio. `:fresh`/`:down`/`:reset`/`:refresh` borran tablas o datos | Guardia dentro del adaptador |
| Ejecuciones simultáneas | Sin cerrojo | Payload no toma ninguno: dos ejecuciones podían aplicar la misma migración | `pg_try_advisory_lock` |
| Nombres repetidos (`x.ts` y `x.js`) | Sin control | Payload ejecutaría las dos | Rechazo antes de migrar |
| `pnpm verificar` | Sin comprobación de migraciones | Una colección podía cambiar sin migración y nadie lo veía hasta el despliegue | `verificar:migraciones`, con deriva sin conexión |
| `migrate:down` | No expuesto | Sin reversión fiable | Se mantiene así; reversión por respaldo o migración correctiva, documentada |

**Cambios**

| Archivo | Cambio |
|---|---|
| `scripts/guardia-migraciones.ts` (nuevo) | `protegerMigraciones`: envuelve el adaptador. `migrate` exige destino local, `MIGRAR_BD_DESECHABLE` y la marca de base desechable; los comandos destructivos se rechazan siempre. Está en `scripts/` porque es una herramienta de operación: la regla de SQL de la 1b solo admite ahí su consulta, un literal fijo |
| `payload.config.ts` | `db: protegerMigraciones(postgresAdapter(...))` |
| `scripts/migrar.mjs` | Capas 1 a 5: destino local, `MIGRAR_BD_DESECHABLE` solo del entorno del proceso, `--confirmar`, marca y cerrojo. Además, rechazo de nombres repetidos |
| `scripts/verificar/migraciones.mjs` (nuevo) y `scripts/verificar/deriva-esquema.ts` (nuevo) | Comprobación estática de carpeta, `index.ts`, snapshots y configuración, más la deriva con el cálculo oficial de `migrate:create`, sin escribir ni conectarse |
| `scripts/verificar.mjs` | Paso «Migraciones» tras Knip |
| `package.json` | `verificar:migraciones` |
| `knip.json` | `deriva-esquema.ts` como punto de entrada |
| `README.md`, `docs/BASE-DE-DATOS.md` | Protección del destino, revisión, reversión, procedimientos actualizados y pasos pendientes |

Sin cambios de esquema, datos, migraciones existentes, acceso, multi-tenant ni diseño. Sin dependencias nuevas.

**Pruebas**

Clon con datos sintéticos y un contenedor Postgres desechable (`--tmpfs`, `127.0.0.1:5441`, eliminado al terminar).

- **Protecciones, 12 casos, todos con el código y el mensaje esperados:**
  - destino de la base real sin autorización: no se conecta;
  - la autorización de otro destino;
  - `migrate:status` hacia la base real;
  - un host no local;
  - `localhost`;
  - sin confirmación, o con la confirmación de otro destino;
  - la variable solo en `.env`;
  - una base sin marca;
  - conexión rechazada;
  - `pnpm payload migrate` directo, sin marca y sin autorización.
- **F.1 base vacía:**
  - aplica las 2 migraciones con `plataforma_owner` como dueño;
  - «Esquema verificado»: 30 tablas, 318 columnas, 16 enums.
  - **Huella idéntica (668 líneas, `3e159e22…`) en la base nueva, el clon y la base real**, leída esta última con una
    consulta de solo lectura: las migraciones reproducen exactamente el esquema real.
- **F.2 repetición:** «Aplicadas ahora: ninguna»; 0 diferencias de filas y de esquema.
- **Comandos destructivos por `pnpm payload`:** `down`, `fresh`, `reset` y `refresh` rechazados; las 30 tablas y el registro
  intactos.
- **F.3 migración nueva:**
  - `migrate:create` (sin conexión) la genera;
  - `verificar:migraciones` aprueba;
  - `migrate:status` la muestra pendiente;
  - `migrate` la aplica en el lote 2.
- **F.4 fallos:**
  - una migración con error se detiene sin dejar tabla ni registro, y la siguiente no se ejecuta;
  - el nombre duplicado se rechaza;
  - una segunda ejecución simultánea se rechaza por el cerrojo (código 4);
  - una interrupción con `taskkill` a mitad de migración no deja nada y libera el cerrojo;
  - una base con migraciones que el código no tiene se rechaza;
  - `verificar:migraciones` detecta deriva, snapshot copiado, duplicado, nombre no válido, archivo vacío e `index.ts` desalineado.
- **F.6 integridad:** sobre la base creada solo con migraciones, `pnpm seed` y `pnpm verificar` completo dan aislamiento
  74/74 y seguridad 205/205.
- **Regresión en el clon:**
  - `pnpm verificar` **APROBADA** (aislamiento 74/74, seguridad 205/205);
  - HTTP 41/41;
  - formulario sin fallos;
  - panel 24/24;
  - sin conexiones externas.
- **Original** (base real, solo lectura):
  - `pnpm verificar` aprueba todo lo que no escribe, incluida «Migraciones»;
  - aislamiento y seguridad quedan `NO EJECUTADA`, como deben;
  - páginas, archivo, login y sonda anónima (16/16) como antes;
  - 0 diferencias de filas y de esquema;
  - registro sin cambios y sin marca de desechable.
  - **No se ejecutó ningún `pnpm migrate` en el original.**

**Riesgos y pendientes**

- **Bloqueante antes de producción:** decidir y documentar cómo se autoriza migrar una base con datos reales.
  - Hoy `pnpm migrate` la rechaza por diseño.
  - Hará falta respaldo comprobado, SQL revisado y ensayo previo sobre una restauración.
  - Relacionado con D10 y las subfases de despliegue.
- **La marca es una convención:** un superusuario podría ponérsela a cualquier base. Las capas 1 a 3 exigen además nombrar
  el destino exacto en cada sesión.
- **La verificación posterior de `pnpm migrate`** comprueba tablas, columnas y enums del snapshot, no índices ni
  restricciones. La comprobación completa es la huella, que se usa en los ensayos.
- **Los `down` generados se conservan** pero no se usan como mecanismo de reversión.

**Decisiones pendientes:** cómo se autoriza migrar una base con datos reales (nueva, antes de producción). Siguen D3,
D10 y D11.

## Registro de la subfase 3b — Roles y privilegios de PostgreSQL (02-11-2026)

**Resultado: APTO CON OBSERVACIONES**, cerrado como **APTO** el 03-11-2026 (ver «Cierre de observaciones»).
- La separación está implementada y validada en el clon.
- La app real ya no tiene privilegios administrativos.
- Falta aplicar dos ajustes a la base de trabajo, que requieren autorización (ver «Pendientes»).

**Auditoría** (base real, consultas de solo lectura al catálogo, sin credenciales)

| Elemento | Estado | Riesgo | Acción |
|---|---|---|---|
| Rol de Payload (`DATABASE_URI`) | `plataforma_app`: sin SUPERUSER, CREATEROLE, CREATEDB, BYPASSRLS ni REPLICATION; NOINHERIT; sin membresías; sin CREATE ni TEMP | — (el hallazgo histórico, una app con superusuario, ya estaba corregido desde la transición del 22-10) | Conservar; guardia de arranque para que no vuelva a pasar |
| Rol de migraciones | `plataforma_owner`, dueño del esquema y de las 30 tablas, 25 secuencias y enums; sin atributos administrativos | — | Conservar |
| Administración | Superusuario del contenedor (`plataforma`), solo por `docker exec` | — | Documentar las operaciones que lo necesitan |
| `payload_migrations` | La app tiene INSERT, UPDATE y DELETE | Una app comprometida podría falsear el registro de migraciones | Solo SELECT |
| `registro_cambios` | La app tiene UPDATE y DELETE | Podría alterar o borrar la auditoría | Solo SELECT e INSERT |
| Credenciales del propietario y del superusuario | En `.env`, que Next y Payload cargan en el proceso de la app (comprobado) | Expuestas a cualquier código de la app | `.env.migraciones` y retirada al arrancar |
| Arranque con un rol privilegiado | Nada lo impedía | Volver a la situación del hallazgo histórico por un cambio de `.env` | Guardia de arranque |
| `roles.sql` | Exigía rotar contraseñas en cada ejecución | No se podía reparar sin rotar | Modo de reparación sin contraseñas |
| Otras bases del clúster | La app puede conectarse a `postgres` (con TEMP) y `template1`, por `PUBLIC` | Bajo: sin acceso a datos | Recomendación para producción (D10) |
| `pg_hba` | `trust` en el loopback interno del contenedor; scram desde fuera | Cualquiera con acceso a Docker es administrador | Documentar para producción |

**Matriz de privilegios efectivos** (verificada en el clon y en una base desechable)

| Operación | `plataforma_app` | `plataforma_owner` | Superusuario |
|---|---|---|---|
| Conectar a la base | Sí | Sí | Sí |
| SELECT / INSERT / UPDATE / DELETE | Sí (`payload_migrations`: solo SELECT; `registro_cambios`: SELECT, INSERT) | Sí (dueño) | Sí |
| Secuencias | USAGE y SELECT (sin `setval`) | Sí | Sí |
| CREATE / ALTER / DROP de tablas, índices y esquemas | **No** (42501) | Sí | Sí |
| TRUNCATE, tablas temporales | **No** | Sí / según base | Sí |
| Cambiar dueños, GRANT de roles, SET ROLE al dueño | **No** | No (no administra roles) | Sí |
| CREATE ROLE, CREATE DATABASE, ALTER ROLE | **No** | **No** | Sí |
| SUPERUSER, BYPASSRLS, REPLICATION | **No** | **No** | Sí (solo administración) |

**Cambios**

| Archivo | Cambio |
|---|---|
| `scripts/guardia-conexion.ts` (nuevo) | Guardia de arranque en `onInit`: retira del entorno `DATABASE_URI_MIGRACIONES` y `POSTGRES_PASSWORD`, y se niega a arrancar si el rol tiene privilegios de administración o de estructura |
| `payload.config.ts` | `onInit` empieza por `exigirConexionDeAplicacion` |
| `scripts/migrar.mjs` | La conexión del propietario sale del entorno o de `.env.migraciones`; si solo está en `.env`/`.env.local`, se niega |
| `deploy/postgres/roles.sql` | Modo de reparación sin contraseñas; `payload_migrations` solo SELECT y `registro_cambios` solo SELECT, INSERT para la app |
| `deploy/postgres/verificar-permisos.sql` | Membresías, CREATE en la base, SET ROLE, `setval`, tablas restringidas y otras bases del clúster |
| `scripts/verificar/roles.mjs` (nuevo), `scripts/verificar.mjs`, `package.json` | Paso «Roles y conexiones» y `verificar:roles`, estáticos |
| `scripts/test-seguridad.ts` | Sección `privilegios`: atributos, 17 operaciones prohibidas (cada una deshecha) y controles positivos |
| `.env.example`, `README.md`, `docs/BASE-DE-DATOS.md` | `.env.migraciones`, qué conexión usa cada componente, reparar y rotar, administración, pendientes |

**Pruebas**

- **Contenedor desechable** (`127.0.0.1:5442`, en memoria, eliminado al terminar): bloque de 17 casos.
  - **`roles.sql`:** sin contraseñas en un clúster sin roles se niega; con una sola, también; con las dos, crea los roles;
    ni la salida ni el log contienen las claves.
  - **Migraciones con `plataforma_owner`:** las 2 del proyecto y una de prueba con CREATE TABLE, CREATE INDEX y ALTER
    TABLE, registrada. La tabla nueva es del dueño; la app recibe solo DML y secuencia por los privilegios por defecto, y
    no puede alterarla.
  - **Reparación sin contraseñas tras migrar:** inventario como se esperaba.
  - **Guardia de arranque:** con `plataforma_owner` y con el superusuario, la app se niega a arrancar; con
    `plataforma_app`, arranca y retira de su entorno las credenciales ajenas.
  - **`migrar.mjs`:** se niega si la conexión está en `.env` y funciona con `.env.migraciones`.
- **F.6, misma base, solo con migraciones y `roles.sql`:** semilla y `pnpm verificar` completo **APROBADA**.
  - Aislamiento 74/74 y seguridad **208/208** (3 nuevas de `privilegios`).
  - `ON DELETE SET NULL` en `registro_cambios` siguió funcionando sin UPDATE para la app: 90 entradas anuladas.
- **Contraprueba en el clon:**
  - con los permisos anteriores, `privilegios` falla en INSERT en `payload_migrations`, y UPDATE y DELETE en
    `registro_cambios`;
  - tras `roles.sql` sin contraseñas, pasa, y la app y las cuentas siguen entrando.
- **Comprobación estática:** detecta 6 de 6 errores introducidos a propósito.
- **Regresión en el clon:**
  - `pnpm verificar` **APROBADA**, con aislamiento 74/74 y seguridad 208/208;
  - HTTP 41/41;
  - formulario sin fallos;
  - panel 24/24;
  - sin conexiones externas.
- **Original** (base real, solo lectura):
  - `pnpm verificar` aprueba todo lo que no escribe;
  - la web arrancó con la guardia sin errores, porque `plataforma_app` está limpio;
  - páginas, archivo, login y sonda anónima (16/16) como antes;
  - 0 diferencias de filas y de esquema; permisos sin cambios.

**Pendientes**

- **Observaciones de esta subfase:** son operaciones sobre la base de trabajo y su configuración, que requieren
  autorización y no se hicieron.
  1. Ejecutar `roles.sql` **sin contraseñas** en la base de trabajo, para restringir `payload_migrations` y
     `registro_cambios`. **Hecho el 03-11-2026**, con autorización: ver «Cierre de observaciones».
  2. Mover `DATABASE_URI_MIGRACIONES` de `.env` a `.env.migraciones`. **Hecho el 03-11-2026.**
- **Producción (D10):**
  - quitar `CONNECT`/`TEMP` de `PUBLIC` en `postgres` y `template1` si el clúster es dedicado;
  - revisar `pg_hba`;
  - no tener la contraseña del superusuario en el equipo de la app;
  - credenciales propias de producción, nunca las de local.

**Decisiones pendientes:** ninguna nueva. Siguen D3, D10 y D11, y la autorización para migrar bases con datos reales
(3a).

### Cierre de observaciones (03-11-2026)

**Resultado final: APTO.** Las dos observaciones quedan cerradas:
- la B, al trasladar la credencial a `.env.migraciones`;
- la A, al ensayarla en el clon y aplicarla en la base de trabajo, con autorización expresa (ver «Aplicación en la base de
  trabajo», al final).

**Observación A: reparar los permisos con `roles.sql`, sin contraseñas.**
- **Revisión del script:** sin `\set` no cambia contraseñas ni crea o borra roles, y no toca datos. Tampoco imprime secretos.
- **Base de trabajo** (`127.0.0.1:5434/plataforma`): **no se ejecutó**. No lleva la marca de desechable y guarda los
  datos reales, y el encargo solo permitía aplicarlo en un destino aislado y descartable. Inventario de solo lectura: la
  app sigue con `DELETE,INSERT,SELECT,UPDATE` en `payload_migrations` y `registro_cambios`; todo lo demás, como se espera.
- **Clon** (`127.0.0.1:5439`, otro clúster), 44/44:
  - se reprodujeron los permisos de la base de trabajo, y la contraprueba confirmó que la app podía modificar y borrar
    las dos tablas;
  - `roles.sql` sin contraseñas, ejecutado dos veces, dio el mismo resultado; las contraseñas quedaron intactas (huella
    de `pg_authid`);
  - `verificar-permisos.sql` dio lo esperado;
  - privilegios efectivos de `plataforma_app`: no puede modificar ni borrar esas tablas, ni crear objetos, TRUNCATE,
    tablas temporales, roles o bases; tampoco cambiar dueños, SET ROLE, `setval` ni GRANT;
  - lo que sí puede la app: leer `payload_migrations`, añadir a `registro_cambios`, trabajar con las filas de negocio y
    usar las secuencias;
  - `plataforma_owner` puede crear y alterar tablas e índices y escribir el registro de migraciones; no puede crear roles
    ni bases, alterar roles ni hacer SET ROLE.
- **Procedimiento:** «Reparar los permisos de una base existente» (`docs/BASE-DE-DATOS.md`).

**Observación B: credencial del propietario en `.env.migraciones`. Cerrada.**
- **Traslado en el original:** la línea `DATABASE_URI_MIGRACIONES` (rol `plataforma_owner`) pasó de `.env` a
  `.env.migraciones`, sin mostrar valores. Las demás líneas de `.env` quedaron idénticas byte a byte. `.env.migraciones`
  tiene los mismos permisos de archivo que `.env` y lo excluyen `.gitignore` (`.env.*`) y el escaneo de Gitleaks.
- **Entorno de la app** (original y clon), comprobado con el cargador de Next y el de Payload, en desarrollo y producción:
  solo `DATABASE_URI`, con `plataforma_app`, y `DATABASE_URI_MIGRACIONES` ausente.
- **Comandos en el original:** `pnpm migrate` y `migrate:status` toman la credencial de `.env.migraciones`. Se detienen
  antes de conectar, por la protección de la 3a.
- **Comandos en el clon**, 13/13:
  - `migrate:status` funciona y se conecta solo como `plataforma_owner`, según el registro de conexiones del servidor;
  - `migrate` sin `--confirmar` no migra;
  - sin `.env.migraciones` no encuentra la credencial, y si vuelve a `.env.local` se niega;
  - `migrate:create --skip-empty` termina sin conexión, con la `DATABASE_URI` apuntando a un puerto sin servidor;
  - la guardia de arranque deja arrancar con la app y se niega con el propietario.

**Regresión en el clon**, ya con la credencial trasladada:
- `pnpm verificar` **APROBADA**, con aislamiento 74/74 y seguridad 208/208, incluida `privilegios`;
- ronda: HTTP 41/41, formulario correcto, panel 24/24, sin conexiones externas.

**Base real, durante el ensayo y el traslado de la credencial:** ni escrituras, ni cambios de roles, permisos o
contraseñas, ni migraciones. Solo consultas de lectura con `default_transaction_read_only`.

#### Aplicación en la base de trabajo (03-11-2026, con autorización expresa)

**Etapa 1, sin escrituras.**
- **Destino:** confirmado por dos vías: desde el equipo por `127.0.0.1:5434`, con el rol de la app, y dentro de
  `plataforma-postgres-1`. Base `plataforma`, PostgreSQL 16.15, clúster `7695829010429321251`.
- **`roles.sql`:** revisado (SHA-256 `5b5fae5e…`).
- **Línea base:** atributos, membresías, dueños, ACL y privilegios efectivos de los dos roles, incluidos los de `PUBLIC`
  y la herencia.
- **Previsión:** solo cambiarían las ACL de `payload_migrations` y `registro_cambios`; el resto ya coincidía con el estado
  objetivo.
- **Respaldo:** `%USERPROFILE%\Respaldos\plataforma\20261103-125216-antes-roles-3b`, con ACL solo para el usuario.
  - Volcado `-Fc` con el mismo SHA-256 dentro y fuera del contenedor.
  - Índice con los `GRANT` anteriores de las dos tablas.
  - Restauración de prueba en un contenedor desechable: mismas filas y misma huella de esquema (`3e159e22…`).

**Etapa 2, tras la autorización.**
- **Comprobaciones previas:** destino, respaldo (`SHA256SUMS`) y `roles.sql` eran los revisados.
- **Ejecución:** `roles.sql` sin contraseñas, código 0.
- **Cambios:** solo los previstos.
  - App en `payload_migrations`: de `DELETE,INSERT,SELECT,UPDATE` a `SELECT`.
  - App en `registro_cambios`: de `DELETE,INSERT,SELECT,UPDATE` a `INSERT,SELECT`.
  - El resto de la línea base, sin cambios: atributos, membresías (ninguna), base, esquema, dueños, las otras 28 tablas,
    secuencias, privilegios por defecto y capacidades de `plataforma_owner`.
- **Sin cambios:** contraseñas (huella de `pg_authid`), esquema, filas de las 30 tablas y migraciones registradas (las 2
  del repositorio). No se ejecutó ninguna migración.
- **Después:**
  - la web siguió respondiendo, sin errores de permisos en su registro ni en el de Postgres;
  - los privilegios de la base de trabajo son idénticos a los del clon, donde pasaron hoy `pnpm verificar` (seguridad
    208/208, con `privilegios`) y la ronda de HTTP, formulario y panel.
- **Vuelta atrás, si hiciera falta:**
  `GRANT INSERT, UPDATE, DELETE ON public.payload_migrations TO plataforma_app; GRANT UPDATE, DELETE ON public.registro_cambios TO plataforma_app;`.
  Deja las ACL guardadas en el respaldo.

## Registro de la subfase 4a — Validación del formulario (03-11-2026)

**Resultado: APTO.**

**Alcance** (fila 4a, con 5.1, 1.6 y 1.7): conservar valores, errores accesibles, `maxLength`, `tipo` en lista blanca y
limpieza de caracteres. No entran 4b (límite con IP de confianza y `limit_req`), 4c (marca firmada, «posible spam»,
duplicados y el ajuste del campo trampa) ni el consentimiento (7a, D2 y D4).

**Auditoría inicial**

| Requisito | Estado antes | Evidencia |
|---|---|---|
| Conservar lo escrito (H15) | Cerrado | `valores` en el estado y `defaultValue`; probado con y sin JavaScript |
| Errores accesibles | Parcial | Solo el primer error; el campo apuntaba al aviso general, no a su mensaje |
| `maxLength` en el navegador | Abierto | Ningún campo lo tenía |
| `tipo` en lista blanca | Abierto | `z.string().max(80)`: cualquier texto |
| Limpieza de caracteres | Abierto | Sin tratamiento; además, `\r\n` contaba doble frente al navegador |
| Protecciones que se conservan | — | Validación en el servidor, campo trampa, marca firmada por ruta, límites por cliente y por grupo, grupo activo resuelto en el servidor, error genérico sin detalles, `mensajes` solo por `crearMensajeContacto` |

**Cambios**

| Archivo | Cambio |
|---|---|
| `lib/formulario.ts` (nuevo) | `LIMITES`, compartidos por el servidor y los `maxLength`, `limpiarTexto`, `leerValores`, `validarPropuesta` y `resumenDeErrores` |
| `app/(sitio)/[grupo]/acciones.ts` | Valida con `lib/formulario`, todos los errores por campo; el grupo se comprueba antes de validar y el `tipo` se valida contra la landing de ese grupo (o «Otro») |
| `components/landing/Colaborar.tsx` | Etiqueta, campo y error hermanos (`htmlFor`/`id`); cada campo con error lleva `aria-invalid` y `aria-describedby` a su mensaje; el aviso `role="alert"` resume y se vuelve a anunciar en cada intento; `maxLength`; el tipo elegido se conserva también sin JavaScript |
| `components/{landing,flch}/Colaborar.module.css` | `.errorCampo`, con el color del aviso existente; borde del campo con error en el tema de periódico |
| `scripts/test-formulario.mjs` (nuevo), `package.json`, `scripts/verificar.mjs` | 33 pruebas unitarias (`pnpm test:formulario`); paso 11 de `pnpm verificar` |
| `scripts/test-seguridad.ts` | Sección `formulario`: aviso y enlace al mensaje del campo, `maxLength`, varios errores, limpieza con `\r\n` en el límite y mensaje de 4001 |
| `README.md` | Tabla de `pnpm verificar` (15 pasos) y detalle de la prueba |

**Decisiones**
- **Caracteres:** se quitan, como dice 1.7, en vez de rechazar el envío: C0 (salvo saltos), DEL, C1, controles
  bidireccionales, U+200B y BOM. Se conservan U+200C y U+200D, que usan escrituras y emojis.
- **Saltos de línea:** `\r\n` pasa a `\n` antes de validar, para que el límite coincida con el `maxLength` del navegador.
- **Sin `minLength` en el navegador:** así el error de longitud mínima es el mensaje accesible del servidor y no la
  burbuja nativa.
- **Lo devuelto al formulario se acota a los límites:** solo alguien que salte el `maxLength` puede pasarse.

**Pruebas**
- **Unitarias** (`node --test`): 33/33. Cuatro errores introducidos a propósito en `lib/formulario.ts` fueron detectados:
  sin normalizar `\r\n`, sin quitar invisibles, sin «Otro» y tipo libre.
- **Clon**, `pnpm verificar` completo: **APROBADA**, con unitarias 33/33, aislamiento 74/74 y seguridad **213/213** (5 nuevas).
- **Clon, ronda:** HTTP 41/41 y panel 24/24, sin conexiones externas. Formulario en Edge headless, 13/13:
  - `maxLength` de 4000;
  - error del servidor anunciado y enlazado a su campo;
  - valores y tipo conservados;
  - envío válido.
- **Cliente:** el código de cliente no contiene zod ni los mensajes de validación del servidor, solo `LIMITES`.
- **Original:**
  - `pnpm verificar` aprueba todo lo que no escribe, unitarias y build incluidos; aislamiento y seguridad quedan **NO
    EJECUTADA**, como corresponde con la base real;
  - la web arrancó con el código nuevo: páginas y `/admin/login` responden 200, el formulario sale con sus `maxLength`
    y sus `label for` en los dos temas, y el servidor no registró errores;
  - base real, antes y después: 0 diferencias en filas, mensajes, esquema, permisos, roles y migraciones.

**Riesgos residuales**
- El diseño gana el texto del error bajo cada campo y, en el tema de periódico, el borde rojo del campo con error.
- `maxLength` de los textos del CMS (1.6) no tiene subfase asignada: sigue pendiente.
- Sigue pendiente lo de 4b y 4c, sin cambios:
  - el campo trampa con `aria-hidden` sobre un campo de formulario (5.2);
  - el límite compartido sin proxy de confianza (5.4).
- El consentimiento y la política de privacidad siguen bloqueados por D2 y D4 (7a).

## Registro de la subfase 4b — Límite de envíos con proxy de confianza (03-11-2026)

**Resultado: APTO CON OBSERVACIONES.**
- La aplicación queda corregida y verificada en el clon, también detrás de un Nginx local con la plantilla.
- La plantilla de Nginx no está desplegada y sus tasas están sin calibrar.
- El proxy real de la VM solo se podrá comprobar en las subfases 6c y 6d.

**Alcance** (fila 4b, puntos 4.4 y 5.4 y sus correcciones de la v1):
- clave de IP de confianza (`CONFIAR_EN_PROXY=1`, solo `X-Real-IP`, que Nginx sobrescribe);
- IP y grupo, 5 envíos por hora;
- estructura con tope de 10 000 claves y barrido periódico, en un solo proceso (D10);
- plantilla de `limit_req` con zonas para las Server Actions públicas, el login, la recuperación y el panel, y
  `limit_conn`.

No entran 4c (marca firmada, «posible spam», duplicados, campo trampa) ni el resto de Nginx (HTTPS, cabeceras,
`client_max_body_size`: 6c).

**Auditoría inicial**

| Punto | Estado antes |
|---|---|
| IP del cliente | Variable `IP_CABECERA_CONFIABLE` con un nombre de cabecera libre (configurable incluso como `X-Forwarded-For`); IP validada con `isIP`, sin forma canónica. Sin la variable, todos compartían una clave. No estaba configurada en ningún `.env` |
| Valores inválidos con proxy | Todos compartían la clave `ip-no-valida`: un cliente sin cabecera válida limitaba a los demás |
| Límites | Por cliente, 3 por minuto; por grupo, 20 cada 10 minutos. Faltaba el de IP y grupo (5 por hora) |
| Estructura | Tope de claves, pero el barrido solo al saturarse |
| IPv6 | Cada dirección era un cliente distinto: rotar dentro de una /64 saltaba el límite |
| Nginx | No existía `deploy/nginx/` |
| Pruebas | Unitarias de la API anterior y una sección opcional `limite-grupo` |

**Modelo de confianza implementado**
- **Quién es el proxy de confianza:** la aplicación solo escucha en `127.0.0.1` (`start` y `dev`, comprobado por
  `test:limite`), así que solo puede hablar con ella un proceso de la misma máquina, el Nginx. No hay rangos de IP
  configurados, porque Next no expone la IP del socket.
- **Qué hace Nginx** (`deploy/nginx/cabeceras-proxy.conf`): sobrescribe `X-Real-IP` y `X-Forwarded-For` con
  `$remote_addr`, fija `X-Forwarded-Host` y vacía `Forwarded`.
- **Qué hace la aplicación** (`lib/limite-envios.ts`, `clienteDe`, con `CONFIAR_EN_PROXY=1`):
  - usa SOLO `X-Real-IP`, si es exactamente una IP;
  - forma canónica: IPv6 por su /64 y una IPv4 mapeada como IPv4;
  - rechaza listas o cabeceras repetidas, puertos, corchetes, zonas, espacios y ceros a la izquierda;
  - si la IP falta o no es válida, rechaza el envío con el error genérico y lo registra sin datos personales;
  - no lee nunca `X-Forwarded-For`.
- **Sin la variable** (en local): no se lee ninguna cabecera y todos comparten un límite.
- **Validación al arrancar** (`lib/entorno.ts`): `CONFIAR_EN_PROXY` solo admite `1` o `0`, y un sitio `https` exige `1`.
  En ambos casos, si no se cumple, la aplicación no arranca.

**Límites de la aplicación** (`acciones.ts`):

| Límite | Ventana | Cuenta | Al superarlo |
|---|---|---|---|
| Por cliente | 3 por minuto | Todos los intentos | Error del formulario: «Espere un minuto» |
| Por cliente y grupo (nuevo) | 5 por hora | Solo envíos válidos, para no bloquear a quien corrige errores | Error del formulario: «… en la última hora» |
| Por grupo | 20 cada 10 minutos | Solo envíos válidos | Error genérico |

El de cliente y grupo va antes que el de grupo, así que un mismo cliente no puede gastar más de 5 de los 20. La
aplicación responde con el estado del formulario (HTTP 200); el **429** lo da Nginx.

**Plantilla** (`deploy/nginx/`: `limites.conf`, `upstream.conf`, `cabeceras-proxy.conf`, `ubicaciones.conf`)
- **Zonas:**
  - `acciones`, solo para POST con `Next-Action` en las rutas públicas; las del panel van a la zona `panel`;
  - `login`, `recuperacion` (`forgot-password` y `reset-password`) y `panel` (`/admin` y `/api/`, amplia);
  - `limit_conn` de 30 por IP.
- **Respuesta:** 429 al superar cualquier límite.
- **Tasas:** son una **propuesta sin calibrar** y están marcadas así en la plantilla.

**Pruebas**

| Prueba | Entorno | Resultado |
|---|---|---|
| `pnpm test:limite` (nuevo, `node --test`) | Sin base | **23/23**: IP (válidas, IPv6, mapeadas y 28 formatos rechazados), `clienteDe`, ventana, barrido, tope con 100 000 IP, concurrencia, `CONFIAR_EN_PROXY` y premisas estáticas. Errores introducidos a propósito: 4 de 4 detectados (el quinto era equivalente) |
| `pnpm verificar` completo, sin proxy | Clon | **APROBADA**: unitarias 56/56, aislamiento 74/74, seguridad 213/213 |
| Ronda: HTTP, formulario en navegador, panel | Clon | 41/41 · correcto · 24/24, sin conexiones externas |
| Sección `proxy` de `test:seguridad` (servidor con `CONFIAR_EN_PROXY=1`) | Clon | **14/14** (ver el detalle debajo) |
| `nginx -t` de la plantilla | Imagen local `nginx:stable-alpine` 1.30.6 | Sintaxis correcta |
| Nginx con la plantilla delante del clon | Contenedor desechable, ya eliminado | **7/7** (ver el detalle debajo) |
| `pnpm verificar` | Original | Aprueba todo lo que no escribe; aislamiento y seguridad **NO EJECUTADA**, como corresponde con la base real |

Detalle de la sección `proxy` (14/14):
- sin `X-Real-IP`, o con un valor malformado o repetido: rechazado y sin guardar;
- `X-Forwarded-For` falsificado no cambia la clave;
- la misma /64 de IPv6 y una IPv4 mapeada cuentan como el mismo cliente;
- IP y grupo: 5 envíos aceptados en la hora y el 6.º limitado; cambiar de grupo no salta el límite por minuto;
- 6 envíos simultáneos: 3 aceptados;
- 21 envíos válidos de IPs distintas: 20 aceptados.

Detalle de la prueba con Nginx (7/7):
- las cabeceras de IP falsificadas, `Forwarded` incluida, no cambian la clave;
- ráfagas de Server Actions y de login: 429;
- páginas, panel y API siguen respondiendo durante el bloqueo.

El cliente de esta prueba dejó una vez 30 respuestas sin leer, y `limit_conn` las cortó. Fue un error del cliente,
corregido, y de paso confirmó que el límite de conexiones funciona.

**Base real:** 0 diferencias antes y después, en filas, mensajes, esquema, permisos, roles y migraciones.

**Observaciones y riesgos residuales**
- **Plantilla:** no desplegada; tasas y ráfagas por calibrar con TI. Detrás de un NAT institucional muchas personas
  comparten IP (riesgo de la fila 4b).
- **Otro proxy delante de Nginx:** si lo hubiera (balanceador institucional), `$remote_addr` sería el suyo para todos.
  Haría falta `set_real_ip_from` con sus direcciones, que no se conocen: decisión de TI, D10. No se inventaron rangos.
- **Docker en la VM:** la confianza depende de que solo Nginx alcance `127.0.0.1:3000`. En este equipo (Docker
  Desktop), un contenedor llega a ese puerto por `host.docker.internal`; en Linux, no por defecto. Si D10 elige
  contenedores en la VM, hay que revisarlo.
- **Memoria del proceso:** el límite se reinicia con el proceso y no se comparte entre instancias. Es válido con un solo
  proceso (D10); con varios, haría falta un almacén común.
- **Saturación:** con 10 000 clientes vigentes a la vez, los nuevos se rechazan hasta que caduquen las ventanas. Se
  prefiere eso a crecer sin límite, pero un atacante con muchas IP reales podría provocarlo.
- **El límite por grupo** (20 cada 10 minutos) puede agotarlo alguien con muchas IP. Ya era así antes de la 4b.
- **Envíos con proxy rechazados** (sin cabecera o con IP inválida): se registran en la consola, una línea por envío y
  sin datos personales.

## Registro de la subfase 4c — Antispam: «posible spam», duplicados y campo trampa (03-11-2026)

**Resultado: APTO CON OBSERVACIONES.** Todo lo que define el plan está implementado y probado en el clon. Quedan dos
observaciones:
- la lista de términos de 5.2 no está definida;
- la migración no está aplicada en la base de trabajo, por decisión del usuario, así que la web local sigue con el
  build anterior.

**Alcance** (fila 4c, punto 5.2 y sus correcciones de la v1):
- marca de tiempo firmada: menos de 2 s → «posible spam», sin descartar; más de 24 h → reenviar conservando el texto;
- filtro de contenido: más de 3 enlaces o lista de términos → «posible spam»;
- deduplicación «mismo correo y texto en 10 min» que marca y no borra, sin una segunda notificación (no hay
  notificaciones: 5.5, D6);
- campo trampa sin `aria-hidden` sobre un campo, oculto con `display:none` en un contenedor.

**Decisiones del usuario (03-11-2026)**
1. **Envío rápido:** seguir el plan. Antes, menos de 3 s → rechazo; ahora, menos de 2 s → «posible spam».
2. **Filtro de contenido:** solo enlaces; la lista de términos queda pendiente.
3. **Duplicado:** el correo sin distinguir mayúsculas y el mensaje tal como queda tras la limpieza de la 4a.
4. **Migración:** solo en el clon; la web local sigue con el build de la 4b.

**Estado inicial**

| Requisito | Antes |
|---|---|
| Marca firmada | Menos de 3 s → rechazo genérico sin guardar; más de 24 h → aviso conservando el texto |
| Posible spam | No existía. `estado`: `nuevo` o `atendido` |
| Duplicados | No existía |
| Campo trampa | `sitio_web` con `aria-hidden`, `tabIndex=-1` y `sr-only`; lleno → rechazo genérico |

**Cambios**

| Archivo | Cambio |
|---|---|
| `lib/antispam.ts` | `TIEMPO_MINIMO_MS` 2000; `rapida` ya no se rechaza |
| `lib/formulario.ts` | `contarEnlaces` y `demasiadosEnlaces` (más de 3 en nombre, institución y mensaje); `mismoEnvio`; `VENTANA_DUPLICADOS_MS` de 10 min |
| `app/(sitio)/[grupo]/acciones.ts` | Acepta `rapida`; pasa `posibleSpam` a la creación; la misma respuesta en todos los casos |
| `lib/access/privileged.ts` | `crearMensajeContacto`: estado según `posibleSpam` y `duplicadoDe` buscado solo en el mismo grupo y en 10 minutos (apunta al original). Cola por grupo en memoria (un proceso, D10) para que dos envíos simultáneos no escapen |
| `payload/collections/plataforma.ts` | `estado` con `posible-spam` (el editor lo sigue pudiendo cambiar); `duplicadoDe` de solo lectura para todos, en la barra lateral y en la lista |
| `migrations/20261103_201313_antispam_4c.*`, `migrations/index.ts`, `payload-types.ts` | Valor nuevo del enum y columna `duplicado_de_id`, con clave foránea `ON DELETE SET NULL` e índice. Aditiva. Tipos generados en el clon |
| `components/landing/Colaborar.tsx`, `components/{landing,flch}/Colaborar.module.css` | Campo trampa en `div.trampa { display: none }`, con etiqueta «Deje este campo en blanco», sin `aria-hidden` ni `tabIndex` |
| `scripts/test-formulario.mjs`, `scripts/test-seguridad.ts` | 7 unitarias nuevas; en la sección `formulario`, el campo trampa (marcado y rechazo); nueva sección `antispam` (opcional, con `CONFIAR_EN_PROXY=1`) |
| `README.md`, `docs/BASE-DE-DATOS.md` | Antispam y aviso de la migración pendiente en la base de trabajo |

**Pruebas**

| Prueba | Entorno | Resultado |
|---|---|---|
| `pnpm test:unitarias` | Sin base | 63/63 (7 nuevas de la 4c) |
| `pnpm migrate --confirmar=127.0.0.1:5439/plataforma` | Clon (otro clúster, con la marca solo durante la migración) | Aplicada y esquema verificado: 30 tablas, 319 columnas, 16 enums |
| `pnpm verificar` completo | Clon | Todo aprobado: aislamiento 74/74, seguridad **215/215**. Prettier falló por una copia desfasada de `acciones.ts` en el clon; resincronizada, pasa |
| Ronda: HTTP, formulario en navegador, panel | Clon | 41/41 · correcto · 24/24, sin conexiones externas |
| Sección `proxy` (regresión 4b) | Clon con `CONFIAR_EN_PROXY=1` | 14/14 |
| Sección `antispam` | Clon con `CONFIAR_EN_PROXY=1` | **19/19** |
| Comprobaciones sin build | Original | TypeScript, ESLint, Prettier, Knip, migraciones (3), roles, SQL, HTML, Gitleaks, auditoría y unitarias: aprobadas. **Sin build**, para no sustituir el que sirve la web |

Lo que cubre la sección `antispam`:
- **Posible spam:** el envío normal queda «nuevo»; a menos de 2 s, «posible spam» con la misma confirmación; 3 enlaces,
  «nuevo»; 4, «posible spam» con el texto intacto.
- **Campo trampa:** lleno, rechazado también sin esperar.
- **Duplicados:**
  - el duplicado exacto, con otras mayúsculas en el correo, se marca, y un tercero apunta al original;
  - el original no cambia y la respuesta no deja ver nada del envío anterior;
  - no cuentan las coincidencias parciales, otro grupo ni un envío fuera de la ventana;
  - de dos envíos simultáneos, exactamente uno queda como duplicado.
- **Permisos:**
  - el editor ve el estado y el duplicado de su grupo, pero no los mensajes de otro;
  - se rechaza un estado inválido;
  - puede cambiar el estado, pero no el duplicado ni el texto;
  - no puede tocar los de otro grupo.

**Base real:** 0 diferencias antes y después. Sigue con 2 migraciones y no recibió escrituras.

**Observaciones y pendientes**
- **Lista de términos de 5.2:** sin definir; decisión pendiente.
- **Migración en la base de trabajo:** requiere autorización, con respaldo previo. Hasta entonces, no compilar ni
  arrancar el original con el código actual (`docs/BASE-DE-DATOS.md`).
- **Cola de duplicados:** solo vale para un proceso (D10). Con varias instancias haría falta un bloqueo en la base.
- **Prueba de concurrencia:** pasa, pero no se comprobó que falle sin la cola (habría exigido otro build). El diseño la
  garantiza en un proceso.
- **Estados:** las transiciones no están definidas en el plan; el editor elige libremente entre las tres opciones.
- **Notificaciones (5.5, D6):** no existen; cuando se hagan, un duplicado no debe generar una segunda.

## Registro de la subfase 5a — Límites de archivos (03-11-2026)

**Resultado: APTO CON OBSERVACIONES.** Lo que define la fila está implementado y probado en el clon: límite global,
límite por tipo, `modifyResponseHeaders` y pruebas de MIME falso. Quedan dos observaciones:
- un comportamiento de Payload que borra el archivo anterior cuando falla una sustitución por otro motivo;
- `client_max_body_size`, que es de la 6c.

**Alcance** (fila 5a y punto 1.8 con su corrección de la v1):
- `upload.limits.fileSize` global de 20 MB;
- un hook de `media` para imágenes de hasta 5 MB y PDF de hasta 20 MB;
- `modifyResponseHeaders` con `nosniff` y, en los PDF, `Content-Security-Policy: sandbox`.

**Criterio de aceptación:** `.exe` renombrado a `.jpg` → rechazo; imagen de 6 MB → rechazo; PDF servido con
`application/pdf` y `nosniff`.

**Estado inicial**, medido con una sonda de la Local API en el clon:
- Payload ya rechazaba el contenido falso (texto o HTML renombrados, `.exe` como `.jpg`), SVG, vacíos y truncados, y saneaba
  los nombres (`../`, `..\`, caracteres especiales).
- **Una imagen de 6 MB se aceptaba**: solo regía el límite genérico de 20 MB, y la Local API no pasa por él.
- Los archivos se servían con la CSP general de `next.config.mjs` y `nosniff`, sin `sandbox`.

**Cambios**

| Archivo | Cambio |
|---|---|
| `lib/archivos.ts` (nuevo) | `LIMITE_GLOBAL_BYTES` (20 MB), `LIMITES_POR_TIPO` (imagen 5 MB, PDF 20 MB; MB = 1024 × 1024), `errorDeTamano`, `tipoParaLimite` (por el contenido: solo `%PDF-` usa el límite de los PDF) y `cabecerasDeArchivo` |
| `payload.config.ts` | `upload: { limits: { fileSize: LIMITE_GLOBAL_BYTES } }` |
| `payload/collections/plataforma.ts` (`Media`) | Hook `beforeOperation`: el límite por tipo con `req.file` al crear y al sustituir. Va antes porque Payload borra el archivo anterior antes de `beforeValidate`; con el hook allí, un rechazo dejaba el documento sin archivo. Hook `beforeValidate` al crear, con el `filesize` y el `mimeType` que calcula Payload (cubre la subida desde URL). `modifyResponseHeaders`. Errores con `name` propio, para que el motivo llegue a la respuesta REST en el build minificado |
| `next.config.mjs` | Regla para `/api/media/file/:path*` con la CSP general más `sandbox`. Next aplica sus cabeceras sobre las de la respuesta, así que sin ella el `sandbox` se perdía. Va en todos los archivos, no por extensión: el tipo servido sale del contenido |
| `scripts/test-archivos.mjs` (nuevo), `package.json` | 17 pruebas unitarias; `test:archivos`, incluidas en `test:unitarias` (paso 11 de `pnpm verificar`) |
| `scripts/test-seguridad.ts` | Sección `archivos` (18 comprobaciones), con un grupo y un editor temporales propios. `PRUEBAS_URL` para usar otro servidor del entorno desechable |
| `README.md` | Límites de archivos |

No hay cambios de esquema ni migraciones.

**Pruebas**

| Prueba | Entorno | Resultado |
|---|---|---|
| `pnpm test:unitarias` | Sin base | 76/76 (17 de archivos) |
| Sección `archivos` | Clon, servidor en el puerto 3001, sin parar la web local | 18/18 |
| `pnpm verificar` completo | Clon | **APROBADA**: aislamiento 74/74, seguridad **232/232**, enlaces correctos |
| Ronda: HTTP, formulario en navegador y panel | Clon | 41/41 · correcto · 24/24, sin conexiones externas |
| Secciones `proxy` y `antispam` (regresión de 4b y 4c) | Clon con `CONFIAR_EN_PROXY=1` | 33/33, la misma lista que en la 4c |
| PDF con `sandbox` en Edge headless | Servidor mínimo desechable | Se muestra igual que sin `sandbox` |
| Comprobaciones sin build | Original | Todas aprobadas; **sin build**, el servido sigue siendo el anterior a la 4c |

Lo que cubre la sección `archivos`:
- **Tamaños:** imagen de casi 5 MB aceptada y de 6 MB rechazada con su motivo, sin archivo en disco; PDF de 6 MB
  aceptado; PDF de más de 20 MB cortado con 413; una imagen de 6 MB declarada como PDF, rechazada como imagen.
- **Contenido:** `.exe` como `.jpg`, HTML como PNG, texto como PDF, `.html`, SVG, JPEG y PDF truncados y archivo vacío
  dan 400, sin documento y sin rutas internas en el error.
- **Nombres:** con `../` y caracteres especiales se guardan saneados en `media/`.
- **Sustitución (PATCH) por una imagen de 6 MB:** rechazada; el documento y su archivo siguen intactos.
- **Local API:** los mismos límites.
- **Permisos:** sin sesión, 403; a otro grupo, rechazado.
- **Cabeceras:** PDF con `application/pdf`, `nosniff` y CSP con `sandbox`, también en peticiones parciales; imagen con
  `nosniff`; las páginas, sin `sandbox`.
- **Acceso:** el PDF nuevo es privado (sin sesión, 403), y en `media/` solo quedan los aceptados.

Hubo tres fallos en las primeras ejecuciones, corregidos sin rebajar ninguna comprobación:
- **Cabeceras:** la CSP de `next.config.mjs` pisaba la del archivo. Se resolvió con la regla de `/api/media/file/`.
- **Formato del error:** el motivo no llegaba a la respuesta REST. Se resolvió con el `name` propio del error.
- **Caché de la landing demo:** las subidas REST al grupo demo la invalidaban, y la limpieza (Local API) no puede
  hacerlo, así que quedaba un enlace a una imagen temporal. Se resolvió con el grupo temporal propio.

**Base real:** 0 diferencias antes y después, con sus 2 migraciones. La web local se detuvo, con autorización, durante
la regresión y se volvió a levantar con el mismo build.

**Observaciones y riesgos**
- **Sustitución que falla por otro motivo** (hallazgo, comprobado en el clon): al sustituir el archivo de un documento,
  Payload borra el anterior antes de validar. Si la petición falla por otro campo (por ejemplo, la descripción vacía),
  el documento sigue apuntando a un archivo que ya no existe. La 5a lo evita solo para el límite de tamaño. Corregirlo
  en general (validar el documento entero antes, o sustituir de otra forma) queda pendiente de decidir.
- **`client_max_body_size` 21m en Nginx (1.8):** subfase 6c.
- **Extensión y contenido:** pueden no coincidir (un PNG llamado `.pdf` se guarda como imagen). Se sirve por su
  contenido y con `nosniff`; el plan no pide rechazarlo.
- **Firefox:** no se probó la visualización de PDF con `sandbox`.
- **Malware:** no se analiza; ningún componente lo hace.
- **Petición multipart:** su límite total sigue siendo el de Payload (50 MB), con 3 archivos como máximo por petición.

## Registro de la subfase 5b — Imágenes derivadas (03/04-11-2026)

**Resultado: APTO CON OBSERVACIONES.**
- **Hecho y probado en el clon:** la configuración, el `srcset`, el script de reproceso y su ensayo con respaldo y
  reversión.
- **Pendiente de autorización:** la migración y el reproceso de la base local, como prevé la fila.
- **Criterio de 150 KB:** se cumple con densidad 2, no con densidad 3, y necesita una decisión.

**Alcance** (fila 5b y punto 8.1 con sus correcciones de la v1):
- `imageSizes` en WebP de calidad 75: `tarjeta` 480, `media` 960, `grande` 1600 y `og` 1200×630;
- `resizeOptions` del original (máx. 2400 px, `withoutEnlargement`), que quita el EXIF;
- `Imagen` con `srcset`/`sizes`; `lib/cms` solo expone los tamaños de archivos públicos;
- reprocesar los existentes con respaldo, inventario y reversión ensayada.

**Criterio de aceptación:** ninguna imagen de más de 150 KB en móvil; la reversión deja el inventario idéntico; los
tamaños de un archivo privado → 403.

**Estado inicial**
- Sin tamaños derivados: el sitio servía el original en todos los `<img>`, unos 13.
- Originales sin acotar, con su EXIF.
- No había script de reproceso.

**Cambios**

| Archivo | Cambio |
|---|---|
| `lib/archivos.ts` | `TAMANOS_DERIVADOS` (los 4 del plan), `ORIGINAL_MAXIMO` y `srcSetDe` (tarjeta, media y grande con su ancho real; nunca og) |
| `payload/collections/plataforma.ts` (`Media`) | `resizeOptions` e `imageSizes` desde `lib/archivos`. Los derivados son del mismo documento: heredan grupo y acceso |
| `migrations/20261103_215923_imagenes_5b.*`, `migrations/index.ts`, `payload-types.ts` | 24 columnas `sizes_*` y 4 índices, solo aditivas. Aplicada **solo en el clon**; tipos generados allí |
| `lib/cms/index.ts` | `imagen()`: `src` = tamaño `media` y `srcSet`, solo si el archivo es público |
| `components/landing/Imagen.tsx`, `components/flch/Foto.tsx` | `srcSet` y prop `sizes` |
| Los demás `<img>` del contenido (galerías, integrantes, aliados, actividades, portadas, directorio) | `srcSet` y `sizes` según el ancho que ocupan; el aspecto no cambia |
| `scripts/reprocesar-imagenes.ts` (nuevo) | Inventario (solo lectura) y reproceso con protección: base local y confirmación del destino exacto; mismo nombre (`overwriteExistingFiles`); respeta los límites de la 5a; si falla, vuelve a escribir el original desde memoria |
| `scripts/test-archivos.mjs`, `scripts/test-seguridad.ts` | 5 unitarias nuevas; sección `imagenes` (10); el recuento de `archivos` cuenta también los derivados |
| `README.md`, `docs/BASE-DE-DATOS.md` | Imágenes derivadas, «Reprocesar las imágenes» y migración pendiente |

**Comportamiento**
- **Variantes:** las de la fila y ninguna más. Payload no amplía: con `withoutEnlargement` sin fijar, un tamaño
  mayor que el original no se genera; `og` solo se omite si la imagen es menor en los dos lados.
- **Original:** se conserva; solo se acota y pierde los metadatos. Nunca se sustituye por un derivado.
- **Nombres:** los derivados se llaman `<original>-<ancho>x<alto>.webp`, junto al original en `media/`.
- **Regenerar:** al sustituir el archivo se regeneran los tamaños y se borran los anteriores.

**Pruebas**

| Prueba | Entorno | Resultado |
|---|---|---|
| `pnpm test:unitarias` | Sin base | 81/81 |
| Secciones `imagenes` y `archivos` | Clon, servidor en el puerto 3001, sin parar la web local | 10/10 y 18/18 |
| Ensayo del reproceso con 9 imágenes sintéticas en el estado anterior a la 5b | Clon | Ver el detalle debajo |
| Peso en móvil, Edge emulando 375 px | Clon, puerto 3001 | Ver el detalle debajo |
| `pnpm verificar` completo | Clon | **APROBADA**: aislamiento 74/74, seguridad **241/241**, enlaces 44 internos |
| Ronda: HTTP, formulario en navegador y panel | Clon | 41/41 · correcto · 24/24, sin conexiones externas |
| Secciones `proxy` y `antispam` (4b y 4c) | Clon con `CONFIAR_EN_PROXY=1` | 33/33 |
| Comprobaciones sin build | Original | Todas aprobadas; el build servido sigue siendo el anterior a la 4c |

Lo que cubre la sección `imagenes`:
- JPEG, PNG, WebP y GIF con los 4 tamaños en WebP y sus dimensiones exactas, ni uno más;
- un original de 3000×2000 con EXIF queda en 2400×1600, sin EXIF y en JPEG;
- una imagen de 300×200 no genera tamaños;
- las imágenes truncadas, no decodificables o SVG se rechazan sin dejar archivos;
- al sustituir, los tamaños se regeneran y se borran los anteriores;
- un derivado privado da 403 sin sesión; su grupo lo ve con `nosniff` y `sandbox`; otro grupo, sin acceso, igual que al
  original;
- con rutas manipuladas o tamaños inventados no hay contenido.

Detalle del ensayo del reproceso:
- **Protección:** sin confirmación o con otro destino, código 2 y nada escrito.
- **Reproceso:** 9 reprocesadas, con los mismos nombres, originales de hasta 2400 px y tamaños sin ampliar; ningún
  huérfano ni referencia rota.
- **Vuelta atrás:** `pg_restore` con código 0; inventario y `media/` idénticos.

Peso en móvil (11 imágenes de la landing demo, el directorio y el archivo):

| | Antes | Después, densidad 2 | Después, densidad 3 |
|---|---|---|---|
| Más de 150 KB | 11 de 11 (hasta 1025 KB) | 0 (la mayor, 145 KB) | 5 (161–259 KB) |
| Total en la landing demo | 4345 KB | 745 KB | 1217 KB |

Fallos encontrados por el camino, todos de la herramienta de prueba y no del producto:
- **Windows bloqueaba archivos:** la prueba abría los derivados con `sharp(ruta)`, que deja el archivo abierto, y
  Payload no podía borrarlos. Ahora se leen a memoria.
- **Argumentos del script:** `payload run` no reenvía los que empiezan por `--`; pasaron a ser posicionales.
- **Medición en móvil:** las URL usan el `serverURL` del clon, que apunta al 3000. Las peticiones a la web local fueron
  solo lecturas de archivos que allí no existen; la medición pide ahora el archivo al servidor de la prueba.
- **Caché de datos de Next:** se vacía en el clon antes de medir.

**Base real:** 0 diferencias, con sus 2 migraciones; nada escrito, ni en la base ni en `media/`. La web local se detuvo,
con autorización, durante la regresión, y se volvió a levantar con el mismo build.

**Observaciones y pendientes**
- **Criterio de 150 KB:** con densidad 3, las imágenes a todo el ancho (hero, galería) eligen `grande` (1600 px) y
  pesan 161–259 KB en el ensayo sintético. Con densidad 2 se cumple. Con los tamaños fijados por el plan no hay un ajuste
  neutral: bajar la calidad de `grande`, añadir un tamaño de unos 1200 px o limitar el `srcset` en móvil son decisiones
  pendientes. Con fotos reales el resultado puede variar.
- **Base local:** la migración `20261103_215923_imagenes_5b` y el reproceso necesitan autorización expresa, como la
  migración de la 4c. Hasta entonces no se compila ni arranca el original con el código actual.
- **Archivos y filas no se borran de forma atómica** (Payload): si borrar los archivos falla a mitad, la fila puede
  quedar sin archivo. Lo provocó en el clon un bloqueo de Windows en la prueba. Es de la misma familia que el hallazgo
  de la 5a sobre sustituir archivos, y sigue pendiente de decidir.
- **URL absolutas:** las de los archivos usan `serverURL` (`NEXT_PUBLIC_SITE_URL`). Ya era así con `src`.
- **`og`:** se genera pero aún no se usa (7b).
- **Imágenes reales:** el ensayo se hizo con imágenes sintéticas. Las 26 de la base local no se han procesado.

## Registro de la subfase 5c — LCP y fuentes (04-11-2026)

**Resultado: NO APTA.** Los cambios mejoran todas las páginas medidas, sin regresiones, pero el criterio de 8.2 y 8.3
(LCP < 2,5 s en móvil) no se cumple en la landing demo ni en Prensa, y Lighthouse móvil queda por debajo de 90 en tres
páginas. Las causas están medidas y las salidas posibles necesitan decisiones de diseño (pendientes, al final).

**Alcance** (fila 5c, puntos 8.2 y 8.3): `prioridad` en el Hero y pesos de fuente. Criterios: LCP < 2,5 s en móvil;
Lighthouse móvil en `/`, una landing, un subgrupo y un archivo con Rendimiento ≥ 90, LCP < 2,5 s y CLS < 0,1.

**Estado inicial**
- **Fuentes:** Next junta en un solo CSS las `@font-face` de los dos temas y precargaba las 8 en todas las páginas
  (440 KB): Public Sans; Newsreader normal y cursiva (FLCH, 129 + 144 KB por el eje óptico `opsz`); Old Standard TT y
  Source Serif 4 (Prensa). Cada página bajaba también las del otro tema.
- **Imágenes:** la foto del Hero de FLCH ya tenía prioridad (`Foto`); la de Prensa (`Imagen`) iba diferida.

**Cambios**

| Archivo | Cambio |
|---|---|
| `components/landing/Imagen.tsx`, `components/landing/Hero.tsx` | Prop `prioridad` (`loading="eager"` y `fetchPriority="high"`), solo en la foto del Hero de Prensa |
| `components/temas/TemaFlch.tsx`, `components/temas/TemaPrensa.tsx` | `preload: false` en Newsreader, Old Standard TT y Source Serif 4: cada página pide las que pinta |
| `app/(sitio)/layout.tsx` | Comentario: Public Sans es la única fuente precargada |
| `scripts/test-aislamiento.ts` | `PRUEBAS_URL` opcional (por defecto, el 3000), como en `test-seguridad`, para probar contra otro puerto |
| `scripts/pruebas-url.ts` (nuevo), `scripts/test-pruebas-url.mjs` (nuevo), `package.json` | (paso 5C.3) `PRUEBAS_URL` solo admite un servidor local: http o https en 127.0.0.1, localhost o [::1], sin credenciales ni ruta, comprobado con el parser de URL; si no, la prueba se detiene antes de tocar la base. 7 pruebas unitarias, en `test:unitarias` |

Sin cambios: las familias, pesos, estilos y ejes de cada fuente (los estilos calculados son idénticos antes y después),
los tamaños derivados de la 5b y la máquina de escribir.

**Metodología**
- **Entorno:** clon con datos sintéticos (Prensa incluida, sin su contenido real), `next start` en 127.0.0.1:3001; la
  web local no se tocó.
- **Medidor propio** (Edge 156 sin interfaz por DevTools, con la emulación de los perfiles de Lighthouse): móvil
  412×823 a densidad 1,75, 150 ms, 1,6 Mbps y CPU ×4; escritorio 1350×940, 40 ms y 10 Mbps. Caché desactivada, visita
  previa sin medir, 6 páginas × 2 perfiles × 5 repeticiones; mediana. LCP y CLS del navegador, desglose del LCP,
  fuentes y descargas repetidas; capturas para comparar.
- **Lighthouse 13.5.0** (herramienta temporal fuera del proyecto; sin dependencias nuevas): perfiles por defecto
  (móvil simulado y `--preset=desktop`), 5 ejecuciones por página y perfil. Sus tiempos son simulados: no son
  comparables 1:1 con los del medidor.

**LCP en móvil, medidor propio** (mediana de 5, ms; los rangos de antes y después no se solapan en ninguna página)

| Página | Antes | Después | Elemento LCP |
|---|---:|---:|---|
| `/` | 1528 | 664 | texto |
| Landing demo | 4632 | **3568** | foto del Hero |
| Subgrupo | 1368 | 648 | texto |
| Archivo | 3332 | 1996 | portada |
| Prensa | 6072 | **4896** | texto del editorial |
| Archivo de Prensa | 1484 | 660 | texto |

En escritorio, todas por debajo de 900 ms antes y de 750 ms después. CLS máximo 0,045 antes y después.

**Lighthouse, después** (mediana de 5)

| Página | Móvil: Rendimiento · LCP | Escritorio: Rendimiento · LCP |
|---|---|---|
| `/` | 91 · 3,2 s | 100 · 0,6 s |
| Landing demo | 75 · 5,4 s | 99 · 1,0 s |
| Subgrupo | 84 · 3,8 s | 99 · 0,7 s |
| Archivo | 91 · 3,2 s | 100 · 0,7 s |
| Prensa | 83 · 4,4 s | 100 · 0,8 s |
| Archivo de Prensa | 91 · 3,1 s | 100 · 0,6 s |

CLS ≤ 0,031 y TBT ≤ 95 ms en todas. Lighthouse simula también el CSS bloqueante (4–5 archivos) y sitúa el primer
pintado en móvil hacia 2,1–2,9 s: con su modelo, ninguna página baja de 2,5 s.

**Causas de lo que no cumple**
- **Landing demo:** la foto del Hero (125 KB) se descubre a tiempo, pero comparte 1,6 Mbps con Newsreader normal y
  cursiva (273 KB, que la página usa), 143 KB de JavaScript y las fotos de los dos primeros integrantes. Probado en el
  clon: quitar `opsz` deja Newsreader en 146 KB, pero solo baja a 3,1 s y **cambia el diseño** (el titular pasa de dos
  líneas a una y cambian las alturas de página). Descartado sin aprobación de diseño. Las imágenes sintéticas pesan más
  que fotos reales del mismo tamaño.
- **Prensa:** el texto y los botones del editorial están ocultos hasta que termina la máquina de escribir (empieza
  tras la hidratación, 350 ms de espera y 30 ms por letra). Con el titular sintético (66 letras) da 4,9 s; el real
  tiene 109 letras, así que con contenido real el LCP sería mayor. Aun arrancando la animación en el primer pintado
  (sin esperar a React, mismo aspecto) quedaría hacia 4,3 s. Con movimiento reducido el texto aparece al instante.
  No hay variante que conserve la animación tal como es y baje de 2,5 s.

**Pruebas (clon)**
- Comprobaciones estáticas y 81 unitarias; build; rutas públicas 9/9; `test:aislamiento` contra el 3001 74/74;
  `test:seguridad` (`imagenes`, `archivos`) 27/27.
- Capturas antes/después: idénticas en 10 de 12 y con las mismas dimensiones en todas; las otras dos difieren solo
  dentro de imágenes de ruido sintético.
- Base real: sin escrituras. Web local: sin tocar.

**Pendientes y decisiones**
- **Landing demo:** se mantiene el eje `opsz` de Newsreader (decisión de la 5c.1). El derivado intermedio del Hero se
  evaluó en la 5c.2 y no se adopta: se mantiene el de 960 px (registro de la 5c.2). Repetir la medida con fotos reales.
- **Prensa:** se mantiene la máquina de escribir tal como es (decisión de la 5c.1); el criterio de LCP sigue sin
  cumplirse en esa página.
- **Lighthouse móvil < 90** en la landing demo, el subgrupo y Prensa; CSS bloqueante y JavaScript sin usar figuran
  entre sus auditorías. `experimental.inlineCss` se evaluó en la 5c.1 y no se adopta.
- **Imágenes sin dimensiones** (`unsized-images`) en la landing demo (logotipo de aliado): sin CLS medido; fuera de
  esta subfase.

### Subfase 5c.1 — CSS en línea (`experimental.inlineCss`), descartado (04-11-2026)

Ensayo solo en el clon, revertido después (`next.config.mjs` vuelve a ser idéntico).
- **Medidor propio, móvil:** mejora el texto como LCP (`/` 664 → 392 ms, subgrupo 648 → 412 ms, archivo de Prensa
  660 → 400 ms), pero apenas la landing demo (3568 → 3480 ms), el archivo (1996 → 1916 ms) y Prensa (4896 → 4924 ms).
- **Lighthouse móvil:** el CSS bloqueante pasa a 0, pero ni la puntuación ni el LCP mejoran (`/` 91 · 3,5 s; landing
  demo 74 · 5,6 s; subgrupo 82 · 4,1 s; archivo 91 · 3,3 s; Prensa 86 · 3,9 s; archivo de Prensa 92 · 3,1 s).
- **Costes:** unos 36 KB más por página (el CSS va en cada HTML y no se cachea), el HTML de `/admin/login` llega a
  695 KB y la opción es experimental en Next 16.
- **Decisión:** no adoptar `experimental.inlineCss` ni configuraciones equivalentes. Se mantienen `opsz` y la máquina
  de escribir de Prensa.

### Subfase 5c.2 — Variantes intermedias del Hero (04-11-2026)

Experimento solo en el clon, revertido después. Mismo origen (`pre5b-hero.jpg`, 2400×1600, sintético) y tres brazos:
el derivado actual de 960 px (control), WebP 720 px (calidad 75, 88 KB) y AVIF 720 px (calidad 50, 57 KB), con
`sizes` `(max-width: 900px) calc(100vw - 32px), 50vw` en los experimentales. Medidor propio con 10 repeticiones y
Lighthouse 13.5.0 con 5 ejecuciones, por página y perfil.

| Landing demo | 960 (control) | WebP 720 | AVIF 720 |
|---|---|---|---|
| LCP móvil, medidor propio | 3370 ms | 2482 ms | 1640 ms |
| Lighthouse móvil: Rendimiento · LCP | 75 · 5,4 s | 76 · 5,2 s | 76 · 5,0 s |
| Lighthouse escritorio: Rendimiento · LCP | 99 · 0,96 s | 99 · 0,93 s | 99 · 0,94 s |

- **Selección:** el navegador descargó la variante prevista en todos los casos; sin descargas repetidas, mismo CLS y
  sin regresiones en las otras cinco páginas. El 720 solo se elige con densidad ≤ 1,9: con densidad 2 o 3 se seguiría
  descargando 960 o 1600.
- **Calidad:** a tamaño real no se distinguen; ampliadas, WebP 720 suaviza el detalle fino y AVIF 720 algo menos.
  La imagen es ruido sintético: no sirve para juzgar fotos reales.
- **Arquitectura:** AVIF necesitaría `<picture>` con alternativa WebP; cualquiera de las dos, un tamaño nuevo en la
  5b y reprocesar las imágenes reales.
- **Decisión:** se mantiene el derivado de 960 px. Con Lighthouse la mejora es de 0,2–0,4 s y la página sigue lejos de
  2,5 s; el ahorro de transferencia no justifica todavía una variante distinta sin evidencia suficiente de mejora real
  del LCP y de calidad visual con fotos reales. WebP 720 y AVIF 720 quedan solo como alternativas experimentales.
- **Límites de la medida:** clon local con datos sintéticos, no producción (sin Nginx, TLS ni red real). Los tres brazos
  se sirvieron desde `public/` para compararlos entre sí, así que sus valores absolutos no son comparables con los de
  la 5c (servidos por `/api/media/file/`). Los tiempos de Lighthouse son simulados y no equivalen 1:1 a los del medidor.
- **Entorno:** Edge genera un 307 en la primera navegación de un perfil nuevo (la URL hacia sí misma; el servidor
  responde 200). Lighthouse lo cuenta en `redirects`; es un artefacto del entorno de medida, no de la aplicación.
