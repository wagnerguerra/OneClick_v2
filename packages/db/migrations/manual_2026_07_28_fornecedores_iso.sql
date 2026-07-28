-- Migração manual: Fornecedores — features ISO (Fase 0 do port v1 cad_fornecedores).
-- Aplicada em 2026-07-28. Idempotente. Só ADITIVA (novo enum, 2 colunas, 4 tabelas).
-- NÃO toca em drift histórico de outras tabelas.
--
-- Estende o model Fornecedor existente (criado p/ o módulo Ativos) com os campos e
-- sub-entidades do módulo de qualidade do v1: risco, flag de avaliação obrigatória,
-- anexos, critérios de seleção/homologação + qualificações, e mensagens/interações.

BEGIN;

-- ── Enum de risco (v1 cad_for.RISCO 1/2/3) ───────────────────
DO $$ BEGIN
  CREATE TYPE "RiscoFornecedor" AS ENUM ('BAIXO', 'MEDIO', 'ALTO');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ── Colunas novas em fornecedores ────────────────────────────
ALTER TABLE "fornecedores" ADD COLUMN IF NOT EXISTS "risco" "RiscoFornecedor" NOT NULL DEFAULT 'MEDIO';
ALTER TABLE "fornecedores" ADD COLUMN IF NOT EXISTS "avaliacao_obrigatoria" BOOLEAN NOT NULL DEFAULT false;

-- ── Anexos (v1 cad_for_arq) ──────────────────────────────────
CREATE TABLE IF NOT EXISTS "fornecedor_anexos" (
  "id"             TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "fornecedor_id"  TEXT NOT NULL,
  "descricao"      TEXT,
  "file_url"       TEXT NOT NULL,
  "file_name"      TEXT NOT NULL,
  "mime_type"      TEXT,
  "tamanho"        INTEGER,
  "uploaded_by_id" TEXT,
  "is_active"      BOOLEAN NOT NULL DEFAULT true,
  "created_at"     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "fornecedor_anexos_fornecedor_fk" FOREIGN KEY ("fornecedor_id") REFERENCES "fornecedores"("id") ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS "idx_fornecedor_anexos_fornecedor" ON "fornecedor_anexos" ("fornecedor_id");

-- ── Critérios de seleção/homologação (v1 cad_for_cri, QA='S') ─
CREATE TABLE IF NOT EXISTS "fornecedor_criterios" (
  "id"              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "empresa_id"      TEXT,
  "tipo_fornecedor" "TipoFornecedor" NOT NULL DEFAULT 'AMBOS',
  "criterio"        TEXT NOT NULL,
  "ordem"           INTEGER NOT NULL DEFAULT 0,
  "is_active"       BOOLEAN NOT NULL DEFAULT true,
  "created_at"      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS "idx_fornecedor_criterios_empresa" ON "fornecedor_criterios" ("empresa_id");

-- ── Qualificações — resposta Sim/Não do fornecedor (v1 cad_for_qua) ─
CREATE TABLE IF NOT EXISTS "fornecedor_qualificacoes" (
  "id"                TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "fornecedor_id"     TEXT NOT NULL,
  "criterio_id"       TEXT NOT NULL,
  "atende"            BOOLEAN NOT NULL,
  "respondido_por_id" TEXT,
  "created_at"        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "fornecedor_qualif_fornecedor_fk" FOREIGN KEY ("fornecedor_id") REFERENCES "fornecedores"("id") ON DELETE CASCADE,
  CONSTRAINT "fornecedor_qualif_criterio_fk"   FOREIGN KEY ("criterio_id")   REFERENCES "fornecedor_criterios"("id") ON DELETE CASCADE,
  CONSTRAINT "fornecedor_qualif_unique" UNIQUE ("fornecedor_id", "criterio_id")
);
CREATE INDEX IF NOT EXISTS "idx_fornecedor_qualif_fornecedor" ON "fornecedor_qualificacoes" ("fornecedor_id");

-- ── Mensagens/interações (v1 cad_for_msg) ────────────────────
CREATE TABLE IF NOT EXISTS "fornecedor_mensagens" (
  "id"            TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "fornecedor_id" TEXT NOT NULL,
  "autor_id"      TEXT,
  "texto"         TEXT NOT NULL,
  "is_active"     BOOLEAN NOT NULL DEFAULT true,
  "created_at"    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at"    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "fornecedor_mensagens_fornecedor_fk" FOREIGN KEY ("fornecedor_id") REFERENCES "fornecedores"("id") ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS "idx_fornecedor_mensagens_fornecedor" ON "fornecedor_mensagens" ("fornecedor_id");

COMMIT;
