#!/usr/bin/env bash
# Primera carga de producción: restaura el volcado de la base y los archivos subidos (media) en una instalación NUEVA
# de docker-compose.prod.yml, y crea los roles de la aplicación (deploy/postgres/roles.sql). Uso, desde la raíz del repo:
#
#   bash deploy/primera-carga.sh /ruta/a/paquete
#
# El paquete (preparado fuera de git, nunca en el repositorio) contiene:
#   plataforma.dump   volcado de PostgreSQL en formato custom (pg_dump -Fc), ya con todas las migraciones aplicadas
#   media.tar.gz      carpeta media/ (originales y tamaños derivados)
#
# Se niega si la base ya tiene tablas o si media/ no está vacía: solo sirve para la PRIMERA carga. No imprime contraseñas:
# las de los roles se leen de .env y llegan a psql por la entrada estándar (nunca en la línea de comandos).
set -euo pipefail

PAQUETE="${1:?Uso: bash deploy/primera-carga.sh /ruta/a/paquete}"
PAQUETE="$(cd "$PAQUETE" && pwd)"
cd "$(dirname "$0")/.."
ENV_FILE=.env

dc() { docker compose -f docker-compose.prod.yml "$@"; }
fallo() { echo "[primera-carga] ERROR: $*" >&2; exit 1; }
paso() { echo "[primera-carga] $*"; }
valor() { grep -E "^$1=" "$ENV_FILE" | tail -n 1 | cut -d= -f2- || true; }

# --- Comprobaciones previas (sin tocar nada) ---
[ -f "$ENV_FILE" ] || fallo "falta .env (copiar deploy/produccion.env.example y completarlo)."
for v in PUBLIC_SITE_DOMAIN POSTGRES_DB POSTGRES_USER POSTGRES_PASSWORD PLATAFORMA_APP_PASSWORD PLATAFORMA_OWNER_PASSWORD PAYLOAD_SECRET; do
  x="$(valor "$v")"
  [ -n "$x" ] && [ "$x" != CAMBIAR ] || fallo "$v falta en .env o sigue con el valor de la plantilla."
done
for v in PLATAFORMA_APP_PASSWORD PLATAFORMA_OWNER_PASSWORD; do
  [[ "$(valor "$v")" =~ ^[0-9a-f]{32,}$ ]] || fallo "$v debe ser hexadecimal de 32 caracteres o más (openssl rand -hex 32)."
done
[ -f "$PAQUETE/plataforma.dump" ] || fallo "falta $PAQUETE/plataforma.dump"
[ -f "$PAQUETE/media.tar.gz" ] || fallo "falta $PAQUETE/media.tar.gz"
MEDIA_DIR="$(valor MEDIA_DIR)"; MEDIA_DIR="${MEDIA_DIR:-./media}"
mkdir -p "$MEDIA_DIR"
[ -z "$(ls -A "$MEDIA_DIR")" ] || fallo "$MEDIA_DIR no está vacía: esto es solo para la primera carga."

# --- Base de datos ---
paso "Construyendo la imagen de la app (puede tardar varios minutos)…"
dc build app
paso "Arrancando PostgreSQL…"
dc up -d --wait postgres
psql_su() { dc exec -T postgres sh -c 'psql -X -q -At -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" "$@"' psql "$@"; }

tablas="$(psql_su -c "SELECT count(*) FROM pg_tables WHERE schemaname = 'public'")"
[ "$tablas" = 0 ] || fallo "la base ya tiene $tablas tablas: esto es solo para la primera carga."

paso "Restaurando el volcado…"
dc cp "$PAQUETE/plataforma.dump" postgres:/tmp/plataforma.dump
dc exec -T postgres sh -c 'pg_restore --no-owner --no-privileges --exit-on-error -U "$POSTGRES_USER" -d "$POSTGRES_DB" /tmp/plataforma.dump && rm -f /tmp/plataforma.dump'

paso "Creando los roles plataforma_owner y plataforma_app (deploy/postgres/roles.sql)…"
dc exec -T postgres rm -rf /tmp/plataforma-sql
dc cp deploy/postgres postgres:/tmp/plataforma-sql
printf "\\\\set owner_password '%s'\n\\\\set app_password '%s'\n\\\\i /tmp/plataforma-sql/roles.sql\n" \
  "$(valor PLATAFORMA_OWNER_PASSWORD)" "$(valor PLATAFORMA_APP_PASSWORD)" |
  dc exec -T postgres sh -c 'psql -X -q -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -f -' >/dev/null
dc exec -T postgres rm -rf /tmp/plataforma-sql

# --- Archivos subidos ---
paso "Extrayendo media.tar.gz en $MEDIA_DIR…"
dc run --rm --no-deps -T --user root -v "$PAQUETE:/carga:ro" --entrypoint sh app \
  -c 'tar -xzf /carga/media.tar.gz -C /app/media && chown -R node:node /app/media'

# --- Resumen (sin datos personales ni credenciales) ---
paso "Resumen:"
psql_su -F ' ' -c "SELECT 'migraciones', count(*) FROM payload_migrations WHERE batch > 0
  UNION ALL SELECT 'grupos', count(*) FROM grupos
  UNION ALL SELECT 'landings', count(*) FROM landing
  UNION ALL SELECT 'integrantes', count(*) FROM integrantes
  UNION ALL SELECT 'archivos', count(*) FROM media
  UNION ALL SELECT 'usuarios', count(*) FROM usuarios"
echo "  archivos en $MEDIA_DIR: $(find "$MEDIA_DIR" -type f | wc -l)"
paso "Listo. Siguiente paso: colocar el certificado (README, «Certificado SSL») y arrancar todo:"
echo "  docker compose -f docker-compose.prod.yml up -d"
