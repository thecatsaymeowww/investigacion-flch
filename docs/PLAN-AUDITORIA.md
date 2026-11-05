# Plan de auditoría — Plataforma de landings

Auditoría de **seguridad, rendimiento, calidad de código, accesibilidad/SEO y operación** de
`proyecto-landings/plataforma` (Next.js 16 + Payload 3.90 multi-tenant + Postgres 16), para dejarla
lista para publicarse con un estándar profesional.

## 0. Reglas de la auditoría

- **Primero se mide, después se corrige.** Cada fase empieza en modo lectura y termina con un
  informe; las correcciones se hacen solo después de revisar ese informe y con autorización.
- **Solo localhost.** Nada contra producción, Strapi ni el dominio público. Las pruebas que escriben
  datos usan una base aparte (`plataforma_auditoria`), que se puede borrar al terminar.
- **Sin secretos en informes.** No se imprimen `.env` ni `.env.credenciales`.
- **Una herramienta pesada a la vez.** El equipo se queda sin memoria con frecuencia, así que build,
  Lighthouse y la prueba de carga no se ejecutan en paralelo.
- **Severidad de los hallazgos:**
  - **Crítica:** expone datos o permite editar otro grupo.
  - **Alta:** riesgo real o fallo visible.
  - **Media:** debilidad sin explotación directa o mala práctica relevante.
  - **Baja:** estilo o mejora.
- **Cada hallazgo** registra: ID, severidad, archivo:línea, evidencia, cómo reproducirlo, corrección
  propuesta y cómo se verifica.

## Fase 0 — Preparación (½ día)

| # | Tarea | Resultado |
|---|---|---|
| 0.1 | **Primer commit** del repo (hoy `master` no tiene commits) con el estado actual | Línea base para comparar cada corrección |
| 0.2 | Inventario: dependencias y versiones, rutas públicas, endpoints `/api/*`, colecciones, hooks, Server Actions, todos los usos de `overrideAccess` | `docs/auditoria/00-inventario.md` |
| 0.3 | Base de datos de auditoría `plataforma_auditoria` + `pnpm seed` sobre ella | Datos reproducibles sin tocar la base de trabajo |
| 0.4 | Herramientas (solo dev): `knip`, `prettier`, `@axe-core/cli` o Playwright + axe, `autocannon`, Lighthouse CLI | Comandos documentados en el informe |
| 0.5 | Medir el punto de partida: tiempo de build, tamaño de `.next`, JS por ruta, RAM en reposo y en carga | Números con los que comparar al final |

## Fase 1 — Seguridad (2–3 días)

### 1.1 Aislamiento entre grupos (lo más importante)
- Revisar **cada** acceso a datos:
  - `lib/cms` (capa pública): siempre `overrideAccess: false`, filtro por `grupo` y `_status: published`.
  - `lib/access/privileged.ts`: la lista cerrada de `overrideAccess: true`. Justificar cada uso.
- Ampliar `test:aislamiento` con la REST API de **todas** las colecciones:
  - Operaciones `find`, `findByID`, `create`, `update`, `delete`, `versions`, `count` y `duplicate`, con `where`, `depth` y `select` manipulados.
  - Casos: editor A sobre B, editor de un grupo sobre su subgrupo, visitante anónimo.
- Comprobar que un editor no pueda cambiarse de grupo, ni cambiar `roles` ni el `grupo` de un documento, editando el JSON a mano.
- Borradores: `?draft=true` y `/versions` sin sesión deben devolver 401 o 403 (lección del D17).
- `registro-cambios` y `mensajes`: nadie del panel salvo superadmin. El formulario público solo crea mensajes del grupo de la ruta.

**Criterio:** cero hallazgos críticos; la prueba ampliada pasa completa.

### 1.2 Autenticación y sesión
- Cookies de Payload: `HttpOnly`, `SameSite` y `Secure` al publicar.
- Tiempo de vida del token y cierre de sesión.
- Bloqueo por intentos (`maxLoginAttempts` / `lockTime`).
- Recuperación de contraseña: el enlace debe caducar y la respuesta no debe revelar si el correo existe.
- CSRF del panel (`csrf` / `cors` / `serverURL` en `payload.config.ts`).
- Política de contraseñas: largo mínimo y prohibir las triviales.
- 2FA: no existe en Payload. Decidir entre panel solo por VPN o red interna, o un proxy con autenticación.

### 1.3 Archivos subidos
- Tipos permitidos: solo imágenes y PDF, comprobando el contenido real del archivo y no solo la extensión.
- Tamaño máximo por archivo.
- Bloquear SVG y HTML.
- Nombres de archivo sin rutas peligrosas.
- `media/file/*`:
  - Un archivo privado o de otro grupo debe devolver 403.
  - `Content-Type` correcto y `X-Content-Type-Options: nosniff`.
  - Los PDF no deben ejecutar nada en el origen del sitio.
- Imagen con metadatos EXIF (ubicación GPS): decidir si se eliminan al subir (sharp).

### 1.4 Formulario «Colaborar» (Server Action)
- Validación zod en el servidor, honeypot y límites de longitud.
- El límite de envíos está en memoria: se pierde al reiniciar y no sirve con varias instancias. Definir uno persistente (tabla o proxy).
- La acción solo acepta el grupo de la ruta; probar con `ruta` alterada.
- Revisar la protección de origen de las Server Actions (`serverActions.allowedOrigins` al tener dominio).

### 1.5 Cabeceras y configuración HTTP
- Hoy `next.config.mjs` no define cabeceras de seguridad. Añadir:
  - `Content-Security-Policy`, distinta para el sitio y para `/admin`.
  - `Strict-Transport-Security` (al publicar).
  - `X-Frame-Options` / `frame-ancestors`.
  - `Referrer-Policy`.
  - `Permissions-Policy`.
- `poweredByHeader: false`.
- Comprobar que no se expongan *source maps* ni mensajes de error con trazas en producción.
- Verificar con `curl -I` y con Mozilla Observatory local (o equivalente).

### 1.6 Dependencias y secretos
- `pnpm audit --prod` y revisión de licencias.
- Fijar versiones exactas: ya están fijadas, así que solo comprobar que el lockfile esté al día.
- Buscar secretos en el repo (`gitleaks` o grep) antes de cada commit.
- `PAYLOAD_SECRET` largo y distinto por entorno.
- Postgres: usuario de la app sin permisos de superusuario; puerto solo en 127.0.0.1 (ya cumplido).

### 1.7 Entradas y salidas
- Todo texto del CMS se pinta como texto, sin `dangerouslySetInnerHTML`. Revisar el script inline del *typewriter*.
- Las URLs que escriben los editores (aliados, publicaciones) solo pueden ser `http:` o `https:`. Revisar que los enlaces externos lleven `rel="noopener noreferrer"`.
- Slugs y rutas reservadas: probar `admin`, `api`, `_next`, `archivo`, mayúsculas, acentos y `..`.

## Fase 2 — Rendimiento (1–2 días)

| # | Qué se revisa | Cómo | Objetivo |
|---|---|---|---|
| 2.1 | Core Web Vitals de `/`, una landing, una de subgrupo y su archivo, en móvil y escritorio | Lighthouse CLI sobre `pnpm build && pnpm start` | Rendimiento ≥ 90, LCP < 2,5 s, CLS < 0,1, INP < 200 ms |
| 2.2 | **Imágenes**: hoy `images.unoptimized` y `<img>` con el archivo original | Peso por página; tamaños de Payload (`imageSizes`), `srcset`/`sizes`, `loading="lazy"`, `width`/`height`, WebP/AVIF | Ninguna imagen > 200 KB en móvil; sin saltos de diseño (CLS) |
| 2.3 | JavaScript enviado al navegador | `next build` (tamaño por ruta), revisar qué componentes son `'use client'` | Mínimo de JS en las landings; sin librerías del panel en el sitio público |
| 2.4 | Fuentes | `next/font` (ya está): subsets, `display: swap`, cuántas variantes se cargan | Solo los pesos que se usan |
| 2.5 | Caché y revalidación | Revisar las etiquetas (`g:<id>`, `grupos`, `directorio`); comprobar que publicar en un grupo no invalida a los demás; cabeceras `Cache-Control` de páginas y de `media/file` | Caché caliente en todas las rutas públicas; archivos con caché larga |
| 2.6 | Base de datos | Registrar las consultas por página (log de Drizzle); buscar consultas repetidas en bucle (N+1), `depth` excesivo e índices faltantes (`grupo`, `_status`, `ruta`, `fecha`) | ≤ ~10 consultas por landing sin caché |
| 2.7 | Carga y memoria | `autocannon` como la prueba anterior (93 landings sintéticas en `plataforma_carga`) | Igual o mejor que la medición previa (p95 < 120 ms; RAM pico < 600 MB) |
| 2.8 | Panel | Tiempo de carga de las listas con muchos documentos; `defaultColumns` y búsquedas | Listas < 1 s con 500 documentos |

## Fase 3 — Calidad de código y sintaxis (1–2 días)

- **Tipos:** `pnpm typecheck` sin errores. Eliminar `as` innecesarios, como el cast de `filterOptions`. Regenerar `payload-types.ts` y comprobar que no haya diferencias.
- **Lint:** `pnpm lint` sin errores ni avisos. Reglas para hooks de React, imports sin usar y `no-console` (salvo scripts).
- **Formato:** Prettier con una configuración única (comillas, punto y coma, ancho 120) y aplicarlo a todo; añadir `pnpm format`.
- **Código muerto:** `knip` (exports, archivos y dependencias sin uso).
- **Duplicación:**
  - Las páginas de `[grupo]` y `[grupo]/[subgrupo]` deben delegar en `components/paginas`.
  - Unificar helpers repetidos (fechas, `idDe`/`grupoDe`).
- **Estructura y nombres:**
  - Revisar la estructura de carpetas: separar `app/`, `components/`, `lib/` y `payload/`, y que no haya lógica de datos en los componentes.
  - Nombres en español, coherentes.
  - Un componente por archivo, con su CSS Module.
- **Codificación:** todos los archivos en UTF-8 sin BOM y con finales de línea LF (`.editorconfig` + `.gitattributes`). Revisar que no queden textos con caracteres rotos.
- **Comentarios y documentación:**
  - Que cada módulo sensible (`privileged.ts`, `lib/cms`, hooks) explique sus invariantes.
  - README al día.
  - Un `docs/ARQUITECTURA.md` breve.
- **Errores:** manejo uniforme en `lib/cms`. Si la base de datos falla, debe mostrarse una página amable y no un 500 con traza; añadir `error.tsx` en `(sitio)`.

## Fase 4 — Accesibilidad, SEO y acabado profesional (1 día)

- **Accesibilidad (WCAG 2.2 AA):**
  - axe sobre las rutas públicas.
  - Navegación solo con teclado: menú, ficha de integrante (`<dialog>`: foco atrapado y devuelto, Esc), agenda y formulario.
  - Contraste de la paleta.
  - `alt` en todas las imágenes; obligatorio en `media`.
  - Jerarquía de encabezados.
  - `prefers-reduced-motion` en el *typewriter* y las animaciones.
  - Etiquetas y errores del formulario anunciados (`aria-live`).
- **SEO y metadatos:**
  - `generateMetadata` por grupo: título, descripción, Open Graph e imagen.
  - URL canónica.
  - `sitemap.xml` y `robots.txt` generados desde los grupos activos.
  - `lang="es"`.
  - Datos estructurados `Organization` / `ResearchOrganization`.
  - `/admin` con `noindex`.
- **Acabado:**
  - Favicon e iconos.
  - Página 404 y de error con el diseño del sitio.
  - Estado vacío de cada sección (ya se ocultan las vacías: verificar).
  - Impresión.
  - Revisión visual a 375, 768, 1280 y 1920 px.

## Fase 5 — Pruebas automatizadas y operación (1–2 días)

- **Pruebas:**
  - Convertir `test:aislamiento` en una suite (Vitest para la Local API).
  - Playwright para los flujos públicos: directorio, landing, archivo con filtros, formulario y ficha.
  - Playwright para el panel: el editor solo ve su grupo.
- **CI local:** `pnpm verificar` = typecheck + lint + format check + knip + pruebas + build. Se ejecuta antes de cada commit; cuando haya repositorio remoto, en GitHub Actions.
- **Backups:** `pg_dump` + copia de `media/`, con una **restauración probada** en una base limpia. Documentar la frecuencia y la retención.
- **Registro y monitoreo:**
  - Logs estructurados del servidor, sin datos personales.
  - Alerta de caída.
  - Revisión periódica de `registro-cambios`.
- **Despliegue (preparación, sin publicar):**
  - `output: 'standalone'`.
  - Proceso con reinicio automático (pm2 o systemd), Nginx delante con TLS y límites de tamaño y velocidad.
  - Panel restringido por red.

## Entregables

1. `docs/auditoria/00-inventario.md`
2. Un informe por fase (`01-seguridad.md` … `05-operacion.md`) con sus hallazgos, ordenados por severidad.
3. `docs/auditoria/RESUMEN.md`:
   - Tabla de hallazgos con estado (abierto / corregido / aceptado).
   - Números de antes y después.
   - Riesgos que quedan.
4. Las correcciones aprobadas, en commits pequeños, uno por hallazgo o grupo de hallazgos, cada uno verificado.

## Criterio de «listo para publicar»

- Cero hallazgos críticos o altos abiertos; los medios corregidos o aceptados por escrito.
- `pnpm verificar` pasa completo.
- Lighthouse ≥ 90 en rendimiento, accesibilidad, buenas prácticas y SEO en las rutas clave.
- Restauración de backup probada.

## Orden y duración estimada

| Fase | Días | Depende de |
|---|---|---|
| 0. Preparación | 0,5 | — |
| 1. Seguridad | 2–3 | 0 |
| 2. Rendimiento | 1–2 | 0 |
| 3. Código y sintaxis | 1–2 | 0 (mejor después de 1, para no reformatear dos veces) |
| 4. Accesibilidad y SEO | 1 | 3 |
| 5. Pruebas y operación | 1–2 | 1–4 |
| **Total** | **≈ 7–10 días** | |

Las fases 1 y 2 se pueden auditar en paralelo, pero sus correcciones se aplican en orden: primero
seguridad, luego rendimiento y al final formato, para que los diffs sean legibles.
