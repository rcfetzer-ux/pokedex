# Single-image deployment: the API serves the web build, so one process and
# one origin — no CORS, no mixed content, no second URL to configure.

# ---------- build ----------
FROM node:22-bookworm-slim AS build

# node-gyp needs these to compile better-sqlite3 when no prebuild matches.
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ ca-certificates \
 && rm -rf /var/lib/apt/lists/*

# The desktop workspace is not installed here, but belt and braces: nothing in
# a server image should ever pull a ~100MB Electron binary.
ENV ELECTRON_SKIP_BINARY_DOWNLOAD=1

WORKDIR /build

# Manifests first, so a source-only change reuses the install layer.
# Every workspace manifest is copied even though only three are installed:
# npm reads the whole lockfile, and a workspace it cannot find on disk is an
# error. `npm ci -w` then limits what actually gets installed — editing
# package.json to drop a workspace would instead break ci's sync check
# against the lockfile.
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/server/package.json packages/server/
COPY packages/app/package.json packages/app/
COPY packages/desktop/package.json packages/desktop/

RUN npm ci --include-workspace-root \
      -w @pokedex/shared -w @pokedex/server -w @pokedex/app

COPY packages/shared packages/shared
COPY packages/server packages/server
COPY packages/app packages/app

RUN npm run build -w @pokedex/shared \
 && npm run build -w @pokedex/server \
 && npm run export:web -w @pokedex/app

# ---------- runtime ----------
FROM node:22-bookworm-slim AS runtime

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=8080 \
    DATABASE_PATH=/data/pokedex.db \
    WEB_ROOT=/app/web \
    ELECTRON_SKIP_BINARY_DOWNLOAD=1

WORKDIR /app

COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/server/package.json packages/server/
COPY packages/app/package.json packages/app/
COPY packages/desktop/package.json packages/desktop/

# Production dependencies only, compiled against this image's Node ABI, with
# the toolchain removed afterwards so it does not ship in the final layer.
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ ca-certificates \
 && npm ci --omit=dev --include-workspace-root -w @pokedex/shared -w @pokedex/server \
 && apt-get purge -y python3 make g++ \
 && apt-get autoremove -y \
 && rm -rf /var/lib/apt/lists/* /root/.npm

COPY --from=build /build/packages/shared/dist packages/shared/dist
COPY --from=build /build/packages/server/dist packages/server/dist
COPY --from=build /build/packages/app/dist /app/web

# SQLite lives on a mounted volume. Without one the database is lost on every
# deploy, taking the price history with it — and no provider sells history
# back, so those recorded swings are gone for good.
VOLUME ["/data"]

EXPOSE 8080

# The server refuses to start in production without API_TOKEN, so a
# misconfigured deploy fails loudly here rather than serving an open API.
CMD ["node", "packages/server/dist/index.js"]
