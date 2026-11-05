# Estado: inciso de entrega funcional intermedia (desde el 04-11-2026)

Documento complementario. **No modifica `docs/PLAN-DE-ACCION.md` ni sus criterios de aceptación.**

## Punto de reanudación

**PARCHE A2: PASO 5 DE 5C.4**

- El plan de acción queda **suspendido temporalmente**. No está cancelado ni cerrado.
- Al terminar el inciso se retoma exactamente en este punto:
  1. revisar A2, ya aplicado al original en este inciso (ver «A2» más abajo);
  2. seguir con el plan de remediación en el orden establecido.

## Motivo y alcance del inciso

Hace falta una primera versión funcional y versionada sobre la que seguir trabajando con commits pequeños. El alcance es el siguiente:

1. Consolidar en este proyecto los cambios aprobados que estaban en el clon de validación y retirar el clon cuando se autorice.
2. Crear el repositorio Git local y hacer el commit inicial. Sin push hasta confirmar el remoto.
3. Hacer un rediseño visual breve para escritorio: directorio, LITARTMO, Prensa y Literatura y los elementos propios del panel.
4. Dejar funcionales el directorio, LITARTMO, el subgrupo Prensa y Literatura y `/admin` con las cuentas existentes, validados en un entorno aislado.
5. Documentar la preparación para la VM institucional, sin desplegar.

## Estado del plan que NO cambia con este inciso

- **5C: NO APTA.**
- **Fase 6: no iniciada.**
- Los hallazgos de seguridad pendientes siguen abiertos. Superar las pruebas de aislamiento no equivale a un sistema seguro ni listo para producción.
- **Parches B, C y D:** no aplicados ni aprobados.
  - D es la corrección documental de `pnpm verificar:estatico`: ese comando hace el build y usa la red.
- **Decisiones vigentes:**
  - Hero en 960 px (las variantes de 720 px se descartaron);
  - sin `inlineCss`;
  - se mantiene el eje `opsz`;
  - se mantiene la animación tipográfica de Prensa.
- **Pendientes de decidir:**
  - «ciclo» y «PDF – 2026»;
  - el criterio de 150 KB de la 5b;
  - el borrado no atómico de archivos y filas.

## A2 (restricción de `PRUEBAS_URL`)

Se aplicó el 04-11-2026, copiando tres archivos idénticos a los del clon, donde se validó:

| Archivo | SHA-256 |
|---|---|
| `scripts/pruebas-url.ts` | `4bfeb238c8eee9c4f656ba3b0b00d0e44fa3f3ccae4e08ee02f93aaeef223192` |
| `scripts/test-pruebas-url.mjs` | `aeefcc87766a715ef8d22fb0b7fdced10f0e88de5def8137e48e9b57a6afc65c` |
| `README.md` | `afe1c3adc06e8299b099960ffd477997035b6efa2b2667fc324401311895aff4` |

- **Regla:** solo `http`; solo 127.0.0.1, localhost o [::1]; solo los puertos 3000 y 3001; sin credenciales ni ruta. Sin la variable, el destino es `http://127.0.0.1:3000`.
- **Validación en el clon:**
  - pruebas 8/8 y 89/89;
  - TypeScript, ESLint, Prettier y Knip sin errores;
  - rechazo de `PRUEBAS_URL=http://127.0.0.1:5439` con código 2, sin tocar la base;
  - `test:aislamiento` contra el puerto 3001: 74/74.
- **Registro en el plan:** la fila del registro de la 5C en `PLAN-DE-ACCION.md` (línea 1363 del clon) **no** se ha transferido. Debe incorporarse al reanudar, si se aprueba.

## Dependencias de migraciones y media (bloquean el original con la base real)

- **El código espera 4 migraciones y la base real tiene 2.**
  - Aplicadas en la base real: `20261022_163428_inicial` y `20261030_161656_escuela_grupos`.
  - Pendientes:
    - `20261103_201313_antispam_4c`: añade el valor `posible-spam` al enum, la columna `mensajes.duplicado_de_id` y su índice;
    - `20261103_215923_imagenes_5b`: añade 24 columnas `media.sizes_*` y 4 índices.
  - Las dos solo añaden.
- **Consecuencia:** el código actual no puede servir la base real hasta que se apliquen. El `.next` del original es anterior a la 4c.
- **Media:** las 26 imágenes reales no se han reprocesado. Sus tamaños derivados (`tarjeta`, `media`, `grande` y `og`) solo existen tras `scripts/reprocesar-imagenes.ts`.
- **Requisitos para aplicar migraciones y reproceso en la base real:**
  - autorización expresa;
  - respaldo previo (`pg_dump` y copia de `media/`);
  - una vuelta atrás ensayada, según `docs/BASE-DE-DATOS.md`.
- **Mientras tanto,** la validación funcional se hará en una copia desechable (ver abajo).

## Copia desechable de la base real (procedimiento; NO ejecutado)

Necesita una **autorización independiente**, porque crea copias de datos institucionales. Los comandos detallados están en `docs/BASE-DE-DATOS.md`: secciones B (respaldo), C (restauración) y «Reprocesar las imágenes».

1. **Respaldo de la base real:** con `pg_dump -Fc` dentro del contenedor.
   - Es una operación de solo lectura.
   - Se verifica con `pg_restore -l` y SHA-256.
   - Se guarda fuera del repositorio, en una carpeta con acceso restringido al usuario.
2. **Base desechable aislada:**
   - un contenedor nuevo de `postgres:16-alpine`, que solo escuche en 127.0.0.1;
   - con datos en `--tmpfs` y la marca `COMMENT ON DATABASE … 'plataforma:desechable'`;
   - con roles creados con `deploy/postgres/roles.sql`.
   - Se carga con `pg_restore --no-owner --no-privileges --exit-on-error`.
   - Se comprueba con el recuento de filas y la huella del esquema frente al respaldo.
   - Observación: el procedimiento documentado crea el contenedor con `docker run -d`, que lo deja ejecutándose separado de la terminal. Es un servicio y no un proceso de la tarea, pero choca con la regla de «nada en segundo plano», así que hay que autorizarlo expresamente.
3. **Media:** copiar `media/` a una carpeta de pruebas **fuera del repositorio**, con un manifiesto SHA-256 comparado antes y después. El original no se toca.
4. **Migraciones:** aplicar `antispam_4c` e `imagenes_5b` **solo** en la base desechable.
   - Se ejecuta `pnpm migrate --confirmar=<host:puerto/base>`.
   - Requiere que `MIGRAR_BD_DESECHABLE` y `DATABASE_URI_MIGRACIONES` estén solo en el entorno del proceso.
5. **Reproceso:**
   - primero `pnpm payload run scripts/reprocesar-imagenes.ts <inventario> aplicar <host:puerto/base>` contra la base desechable;
   - La carpeta de media es fija: `staticDir: 'media'` en `payload/collections/plataforma.ts`, relativa al directorio de trabajo, y no hay variable para cambiarla.
   - Por eso el reproceso y el servidor de pruebas deben ejecutarse desde un **entorno de pruebas nuevo y desechable**, creado a partir de un commit identificado del repositorio, con la copia de media en su `media/`.
   - **Nunca** desde este proyecto, para no escribir en su `media/`.
6. **Validación:**
   - un servidor de pruebas en el puerto 3001 contra la base desechable;
   - comprobar el directorio, `/litartmo`, `/litartmo/prensa-y-literatura` y `/archivo`;
   - comprobar `/admin` con las cuentas existentes de la copia;
   - pruebas de aislamiento con datos sintéticos.
   - Al terminar, detener el servidor por PID y retirar el contenedor y las copias con autorización.

## Grupo ficticio en la base real

`estudios-andinos-demo` («Grupo de demostración (ficticio)») está activo y tiene landing en la base real.

- **No se modifica en la base real.**
- Su exclusión del directorio se probará **solo en la copia desechable**.
- Llevar esa exclusión a la base real requiere una decisión y una autorización aparte.

## Datos personales y repositorio

- `scripts/semilla/prensa-y-literatura/` contiene 7 JSON y 21 fotografías de personas reales.
  - Queda excluida de Git en `.gitignore`.
  - No se ha movido ni modificado.
  - Según el README, esa carpeta debería estar fuera del proyecto, indicada con `SEMILLA_PRENSA_DIR`.
- No se versionan:
  - `.env*` (salvo `.env.example`), credenciales, bases de datos y respaldos;
  - `media/`, `visual.png` (captura de la 5c.2), `node_modules/`, `.next/`, temporales e imágenes sintéticas.
