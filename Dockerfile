# syntax=docker/dockerfile:1
# Imagen de producción de la plataforma (Next.js + Payload en un mismo proceso). La usa docker-compose.prod.yml.
#   deps   dependencias exactas del lockfile (pnpm de packageManager, vía corepack)
#   build  `next build` con output standalone (next.config.mjs)
#   app    imagen final: solo el servidor standalone, los estáticos y public/, con el usuario sin privilegios `node`
# Los secretos no entran en la imagen: llegan en tiempo de ejecución desde el .env del servidor (docker-compose.prod.yml).

ARG NODE_IMAGE=node:24-bookworm-slim

FROM ${NODE_IMAGE} AS base
ENV PNPM_HOME=/pnpm \
    NEXT_TELEMETRY_DISABLED=1 \
    COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile

FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# NEXT_PUBLIC_SITE_URL se incrusta en el código del navegador al compilar: debe ser el dominio definitivo.
ARG NEXT_PUBLIC_SITE_URL=https://investigacionletras.unmsm.edu.pe
ENV NEXT_PUBLIC_SITE_URL=${NEXT_PUBLIC_SITE_URL} \
    CONFIAR_EN_PROXY=1 \
    NODE_ENV=production
# La configuración de Payload exige un PAYLOAD_SECRET válido al cargarse (lib/entorno.ts). El build no firma nada ni
# conecta con la base (todas las páginas son dinámicas): se usa uno aleatorio desechable que no queda en la imagen.
RUN PAYLOAD_SECRET="$(node -e "process.stdout.write(require('node:crypto').randomBytes(36).toString('base64url'))")" pnpm build

FROM ${NODE_IMAGE} AS app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
WORKDIR /app
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public
# Archivos subidos (staticDir 'media', relativo a /app): volumen del compose, escribible por `node`.
RUN mkdir -p /app/media && chown node:node /app/media
USER node
EXPOSE 3000
CMD ["node", "server.js"]
