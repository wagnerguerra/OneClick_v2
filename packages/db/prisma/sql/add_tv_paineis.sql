-- ============================================================
-- Painéis de Gestão à Vista (TV) — builder dinâmico
-- Painel → Folhas (slides) → Blocos. Aplicada via `psql`/`prisma db execute`
-- (o build do Service Manager só roda `prisma generate`, não db push).
-- Idempotente: CREATE TABLE IF NOT EXISTS.
-- ============================================================

CREATE TABLE IF NOT EXISTS "tv_painel" (
  "id"           TEXT PRIMARY KEY,
  "slug"         TEXT NOT NULL UNIQUE,
  "nome"         TEXT NOT NULL,
  "accent"       TEXT NOT NULL DEFAULT '#22d3ee',
  "icon"         TEXT,
  "ativo"        BOOLEAN NOT NULL DEFAULT true,
  "slide_ms"     INTEGER NOT NULL DEFAULT 18000,
  "periodo_dias" INTEGER NOT NULL DEFAULT 30,
  "ordem"        INTEGER NOT NULL DEFAULT 0,
  "empresa_id"   TEXT,
  "created_at"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "tv_painel_empresa_id_idx" ON "tv_painel" ("empresa_id");

CREATE TABLE IF NOT EXISTS "tv_folha" (
  "id"         TEXT PRIMARY KEY,
  "painel_id"  TEXT NOT NULL REFERENCES "tv_painel"("id") ON DELETE CASCADE,
  "titulo"     TEXT NOT NULL,
  "ordem"      INTEGER NOT NULL DEFAULT 0,
  "cols"       INTEGER NOT NULL DEFAULT 12,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "tv_folha_painel_id_idx" ON "tv_folha" ("painel_id");

CREATE TABLE IF NOT EXISTS "tv_bloco" (
  "id"         TEXT PRIMARY KEY,
  "folha_id"   TEXT NOT NULL REFERENCES "tv_folha"("id") ON DELETE CASCADE,
  "ordem"      INTEGER NOT NULL DEFAULT 0,
  "visual"     TEXT NOT NULL,
  "metric_id"  TEXT NOT NULL,
  "config"     JSONB NOT NULL DEFAULT '{}',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "tv_bloco_folha_id_idx" ON "tv_bloco" ("folha_id");
