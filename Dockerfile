# syntax=docker/dockerfile:1.7

# ---------- build stage ----------
# Keep the Node version aligned with .nvmrc (v22). Using -bullseye (glibc)
# keeps better-sqlite3 / node-pty happy without the musl gymnastics alpine
# would otherwise require for native modules.
FROM node:22-bullseye AS build
WORKDIR /app

# Build tools are needed by better-sqlite3, bcrypt and node-pty postinstall.
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

# Install dependencies first so Docker can cache this layer when only source
# files change. We install full deps (not --production) because the build
# needs Vite + tsc.
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

# Copy the rest of the source and build both frontend (dist/) and backend
# (dist-server/).
COPY . .
RUN npm run build

# Strip dev dependencies once the build is done so the runtime image can
# copy a lean node_modules tree.
RUN npm prune --omit=dev


# ---------- runtime stage ----------
# Keep runtime on the same major Node version the repo supports so native
# modules (better-sqlite3, node-pty) don't mismatch ABI at load time.
FROM node:22-bullseye-slim AS runtime
WORKDIR /app

# Runtime-only deps: git (for clone/pull in plugin-loader and project ops),
# tini (proper PID 1 signal handling), curl (/health probes from other
# containers / compose stacks).
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        git curl tini \
    && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production \
    SERVER_PORT=3001 \
    HOST=0.0.0.0 \
    PIXCODE_NO_DAEMON=1

# Copy only what the runtime actually reads: built output, static assets,
# and pruned node_modules.
COPY --from=build /app/dist-server ./dist-server
COPY --from=build /app/dist ./dist
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/public ./public
COPY --from=build /app/shared ./shared

# Auth DB + install sandbox both live under ~/.pixcode. Mount this as a
# volume in compose/Kubernetes so login state and installed provider CLIs
# survive container rebuilds.
VOLUME ["/root/.pixcode"]

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=3s --start-period=20s --retries=3 \
    CMD curl -fsS http://localhost:3001/health || exit 1

# tini reaps zombie children (provider-CLI spawns) and forwards SIGTERM
# cleanly during `docker stop`.
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "dist-server/server/cli.js", "start", "--no-daemon"]
