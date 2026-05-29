# syntax=docker/dockerfile:1.6
# ============================================================
# OneClick API (NestJS + tRPC) — multi-stage build
# Context: raiz do monorepo (.)
# ============================================================

FROM node:22-alpine AS base
WORKDIR /app
RUN apk add --no-cache python3 make g++ openssl libc6-compat \
 && corepack enable \
 && corepack prepare pnpm@10.33.0 --activate

# ─── Stage 1: deps ─────────────────────────────────────────
# Camada cacheada quando o lockfile não muda.
FROM base AS deps
# Puppeteer não consegue rodar Chrome bundled em Alpine (musl ≠ glibc).
# Pulamos o download durante install — runtime usa o chromium do apk.
ENV PUPPETEER_SKIP_DOWNLOAD=true
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/db/package.json packages/db/
COPY packages/types/package.json packages/types/
COPY packages/ui/package.json packages/ui/
COPY packages/config/package.json packages/config/
RUN pnpm install --frozen-lockfile

# ─── Stage 2: build ────────────────────────────────────────
FROM deps AS builder
COPY packages packages
COPY apps/api apps/api
# Prisma generate precisa do schema + node_modules — gera client em packages/db/src/generated
# (`exec prisma generate` porque prisma é binário, não script do package.json)
RUN pnpm --filter @saas/db exec prisma generate
# Nest build (webpack). Limita heap pra caber na VPS de 4GB RAM.
ENV NODE_OPTIONS=--max-old-space-size=2048
RUN pnpm --filter @saas/api build

# ─── Stage 3: runtime ──────────────────────────────────────
FROM node:22-alpine AS runtime
# Chromium do Alpine (puppeteer não consegue rodar o Chrome bundled em musl,
# então usamos o /usr/bin/chromium-browser do apk). Fontes pra render PDF
# de certidões CND/CNDT/CRF/etc. Ver PUPPETEER_EXECUTABLE_PATH abaixo.
RUN apk add --no-cache openssl libc6-compat tini \
      chromium nss freetype harfbuzz ttf-freefont ttf-liberation font-noto-emoji \
      ca-certificates \
 && corepack enable \
 && corepack prepare pnpm@10.33.0 --activate
ENV PUPPETEER_SKIP_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser
WORKDIR /app

# Workspace files necessários pra pnpm resolver workspace links em runtime
COPY package.json pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/

# Node modules (deps de produção apenas) e workspace packages
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=deps /app/packages/db/node_modules ./packages/db/node_modules

# Output do build
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/apps/api/assets ./apps/api/assets
COPY --from=builder /app/packages/db/src/generated ./packages/db/src/generated
COPY --from=builder /app/packages/db/prisma ./packages/db/prisma
COPY --from=builder /app/packages/db/package.json ./packages/db/
COPY --from=builder /app/packages/types ./packages/types

ENV NODE_ENV=production
EXPOSE 4000

WORKDIR /app/apps/api
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "dist/main"]
