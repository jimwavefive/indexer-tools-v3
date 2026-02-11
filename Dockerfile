# ============================================
# Base: Install pnpm
# ============================================
FROM node:20-slim AS base
RUN corepack enable && corepack prepare pnpm@9 --activate
WORKDIR /app

# ============================================
# Dependencies: Install all workspace deps
# ============================================
FROM base AS deps
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*
COPY package.json pnpm-workspace.yaml .npmrc ./
COPY packages/shared/package.json packages/shared/
COPY packages/frontend/package.json packages/frontend/
COPY packages/backend/package.json packages/backend/
RUN pnpm install

# ============================================
# Build & test shared package
# ============================================
FROM deps AS build-shared
COPY packages/shared/src/ packages/shared/src/
COPY packages/shared/tsup.config.ts packages/shared/
COPY packages/shared/tsconfig.json packages/shared/
COPY packages/shared/vitest.config.ts packages/shared/
COPY packages/shared/package.json packages/shared/
RUN pnpm --filter @indexer-tools/shared build
RUN pnpm --filter @indexer-tools/shared test

# ============================================
# Build frontend
# ============================================
FROM build-shared AS build-frontend
ARG VITE_FEATURE_NOTIFICATIONS=false
ENV VITE_FEATURE_NOTIFICATIONS=$VITE_FEATURE_NOTIFICATIONS
COPY packages/frontend/src/ packages/frontend/src/
COPY packages/frontend/index.html packages/frontend/
COPY packages/frontend/vite.config.ts packages/frontend/
COPY packages/frontend/tsconfig.json packages/frontend/
COPY packages/frontend/env.d.ts packages/frontend/
COPY packages/frontend/package.json packages/frontend/
RUN pnpm --filter @indexer-tools/frontend build

# ============================================
# Build backend
# ============================================
FROM build-shared AS build-backend
COPY packages/backend/src/ packages/backend/src/
COPY packages/backend/tsup.config.ts packages/backend/
COPY packages/backend/tsconfig.json packages/backend/
COPY packages/backend/package.json packages/backend/
RUN pnpm --filter @indexer-tools/backend build

# ============================================
# Frontend production image
# ============================================
FROM node:20-slim AS frontend-prod
WORKDIR /app

RUN addgroup --system appgroup && adduser --system --ingroup appgroup appuser

# Copy node_modules from deps (shamefully-hoisted)
COPY --from=deps /app/node_modules ./node_modules

COPY --from=build-frontend /app/packages/frontend/dist ./packages/frontend/dist
COPY packages/frontend/server.js packages/frontend/
COPY packages/frontend/docker-entrypoint.sh packages/frontend/
RUN chmod +x packages/frontend/docker-entrypoint.sh

# Entrypoint writes config files into dist — ensure writable by appuser
RUN chown -R appuser:appgroup /app/packages/frontend/dist
RUN mkdir -p /app/packages/frontend/public && chown appuser:appgroup /app/packages/frontend/public

EXPOSE 3000
USER appuser

ENTRYPOINT [ "/app/packages/frontend/docker-entrypoint.sh" ]
CMD ["node", "packages/frontend/server.js"]

# ============================================
# Backend production image
# ============================================
FROM node:20-slim AS backend-prod
WORKDIR /app

RUN addgroup --system appgroup && adduser --system --ingroup appgroup appuser

# Copy node_modules from deps (shamefully-hoisted)
COPY --from=deps /app/node_modules ./node_modules

COPY --from=build-shared /app/packages/shared/dist packages/shared/dist
COPY packages/shared/package.json packages/shared/
COPY --from=build-backend /app/packages/backend/dist packages/backend/dist

# Create data directory owned by appuser (Docker volume mount overrides this,
# so docker-compose must ensure the volume is writable — see example compose file)
RUN mkdir -p /app/data && chown -R appuser:appgroup /app/data

EXPOSE 4000
USER appuser

CMD ["node", "packages/backend/dist/index.js"]
