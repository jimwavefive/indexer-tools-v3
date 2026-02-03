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
# Build shared package
# ============================================
FROM deps AS build-shared
COPY packages/shared/ packages/shared/
RUN pnpm --filter @indexer-tools/shared build

# ============================================
# Build frontend
# ============================================
FROM build-shared AS build-frontend
ARG VITE_FEATURE_NOTIFICATIONS=false
ARG VITE_FEATURE_AGENT=false
ENV VITE_FEATURE_NOTIFICATIONS=$VITE_FEATURE_NOTIFICATIONS
ENV VITE_FEATURE_AGENT=$VITE_FEATURE_AGENT
COPY packages/frontend/ packages/frontend/
RUN pnpm --filter @indexer-tools/frontend build

# ============================================
# Build backend
# ============================================
FROM build-shared AS build-backend
COPY packages/backend/ packages/backend/
RUN pnpm --filter @indexer-tools/backend build

# ============================================
# Frontend production image
# ============================================
FROM node:20-slim AS frontend-prod
WORKDIR /app

# Copy node_modules from deps (shamefully-hoisted)
COPY --from=deps /app/node_modules ./node_modules

COPY --from=build-frontend /app/packages/frontend/dist ./packages/frontend/dist
COPY packages/frontend/server.js packages/frontend/
COPY packages/frontend/docker-entrypoint.sh packages/frontend/
RUN chmod +x packages/frontend/docker-entrypoint.sh

EXPOSE 3000

ENTRYPOINT [ "/app/packages/frontend/docker-entrypoint.sh" ]
CMD ["node", "packages/frontend/server.js"]

# ============================================
# Backend production image
# ============================================
FROM node:20-slim AS backend-prod
WORKDIR /app

# Copy node_modules from deps (shamefully-hoisted)
COPY --from=deps /app/node_modules ./node_modules

COPY --from=build-shared /app/packages/shared/dist packages/shared/dist
COPY packages/shared/package.json packages/shared/
COPY --from=build-backend /app/packages/backend/dist packages/backend/dist

EXPOSE 4000

CMD ["node", "packages/backend/dist/index.js"]
