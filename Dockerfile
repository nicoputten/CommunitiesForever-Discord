# syntax=docker/dockerfile:1
# The bot's image (docs/ARCHITECTURE.md "Hosting"): the compiled bot on Node.js 24 LTS, no secrets inside (they
# come from the environment, .env.example). Built by CI; pushed to GHCR only from a release tag.

# ---- build: all dependencies, then tsc ----
FROM node:24-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json tsconfig.build.json ./
COPY src/ ./src/
RUN npm run build

# ---- runtime: production dependencies and the compiled bot ----
FROM node:24-slim
ARG APP_VERSION=dev
LABEL org.opencontainers.image.source="https://github.com/nicoputten/CommunitiesForever-Discord" \
  org.opencontainers.image.description="CommunitiesForever: the WoW: Forever community's Discord bot" \
  org.opencontainers.image.version="${APP_VERSION}"
ENV NODE_ENV=production \
  APP_VERSION=${APP_VERSION}
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
# The image's own unprivileged user (UID/GID 1000).
USER node
# Healthy while connected to Discord: the bot writes a heartbeat file every 15 s (BOT-02, no port needed).
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 CMD ["node", "dist/app/health.js"]
CMD ["node", "dist/app/main.js"]
