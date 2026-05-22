# syntax=docker/dockerfile:1.6
# ============================================================
# OneClick Web (Next.js 15 + standalone) — multi-stage build
# Context: raiz do monorepo (.)
# ============================================================

FROM node:22-alpine AS base
WORKDIR /app
RUN apk add --no-cache libc6-compat \
 && corepack enable \
 && corepack prepare pnpm@10.33.0 --activate

# ─── Stage 1: deps ─────────────────────────────────────────
FROM base AS deps
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
COPY apps/web apps/web
# Build args do Next (variáveis NEXT_PUBLIC_* viram embedded no bundle).
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_APP_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL
ENV NODE_OPTIONS=--max-old-space-size=2048
RUN pnpm --filter @saas/web build

# ─── Stage 3: runtime (standalone) ─────────────────────────
FROM node:22-alpine AS runtime
RUN apk add --no-cache libc6-compat tini
WORKDIR /app

# Next standalone gera um server.js que inclui só o que precisa.
# Copia também .next/static e public (não vão no standalone).
COPY --from=builder /app/apps/web/.next/standalone ./
COPY --from=builder /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder /app/apps/web/public ./apps/web/public

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
EXPOSE 3000

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "apps/web/server.js"]
