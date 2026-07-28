-- Migração manual: módulo Compras/Aquisições (Fase 3a do port v1 sgq_aquisicoes).
-- Aplicada em 2026-07-28. Idempotente. Só ADITIVA (2 enums, 6 tabelas).
-- Bloco Qualidade. NÃO toca em drift histórico de outras tabelas.

BEGIN;

-- ── Enums ────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE "StatusCompra" AS ENUM ('NOVO','AGUARDANDO_APROVACAO','APROVADO','REPROVADO','RECEBIDO','AVALIADO','CANCELADO');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "TipoFornecimento" AS ENUM ('NORMAL','CONTRATO_PERMANENTE','CONTRATO_TEMPORARIO','CURSO_TREINAMENTO','MANUTENCAO_SOFTWARE');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ── Pedido de compra (sgq_com) ───────────────────────────────
CREATE TABLE IF NOT EXISTS "compras" (
  "id"                TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "code"              SERIAL,
  "fornecedor_id"     TEXT NOT NULL,
  "solicitante_id"    TEXT,
  "status"            "StatusCompra" NOT NULL DEFAULT 'NOVO',
  "forma_pagamento"   TEXT,
  "prazo_entrega"     TEXT,
  "prazo_pagamento"   TEXT,
  "frete"             NUMERIC(14,2),
  "observacoes"       TEXT,
  "aprovador_id"      TEXT,
  "data_solicitacao"  TIMESTAMPTZ,
  "data_aprovacao"    TIMESTAMPTZ,
  "motivo_reprovacao" TEXT,
  "recebedor_id"      TEXT,
  "data_recebimento"  TIMESTAMPTZ,
  "data_avaliacao"    TIMESTAMPTZ,
  "tipo_fornecimento" "TipoFornecimento",
  "nf_numero"         TEXT,
  "nf_valor"          NUMERIC(14,2),
  "melhoria"          BOOLEAN NOT NULL DEFAULT false,
  "melhoria_obs"      TEXT,
  "setor"             TEXT,
  "empresa_id"        TEXT,
  "is_active"         BOOLEAN NOT NULL DEFAULT true,
  "created_at"        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at"        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "compras_fornecedor_fk" FOREIGN KEY ("fornecedor_id") REFERENCES "fornecedores"("id"),
  CONSTRAINT "compras_empresa_fk" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS "idx_compras_empresa" ON "compras" ("empresa_id");
CREATE INDEX IF NOT EXISTS "idx_compras_fornecedor" ON "compras" ("fornecedor_id");
CREATE INDEX IF NOT EXISTS "idx_compras_status" ON "compras" ("status");

-- ── Itens do pedido (sgq_com_ite) ────────────────────────────
CREATE TABLE IF NOT EXISTS "compra_itens" (
  "id"             TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "compra_id"      TEXT NOT NULL,
  "descricao"      TEXT NOT NULL,
  "unidade"        TEXT,
  "quantidade"     INTEGER NOT NULL DEFAULT 1,
  "valor_unitario" NUMERIC(14,2) NOT NULL DEFAULT 0,
  "is_active"      BOOLEAN NOT NULL DEFAULT true,
  "created_at"     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "compra_itens_compra_fk" FOREIGN KEY ("compra_id") REFERENCES "compras"("id") ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS "idx_compra_itens_compra" ON "compra_itens" ("compra_id");

-- ── Anexos (sgq_com_arq) ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS "compra_anexos" (
  "id"             TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "compra_id"      TEXT NOT NULL,
  "descricao"      TEXT,
  "file_url"       TEXT NOT NULL,
  "file_name"      TEXT NOT NULL,
  "mime_type"      TEXT,
  "tamanho"        INTEGER,
  "uploaded_by_id" TEXT,
  "is_active"      BOOLEAN NOT NULL DEFAULT true,
  "created_at"     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "compra_anexos_compra_fk" FOREIGN KEY ("compra_id") REFERENCES "compras"("id") ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS "idx_compra_anexos_compra" ON "compra_anexos" ("compra_id");

-- ── Mensagens/interações (sgq_com_msg) ───────────────────────
CREATE TABLE IF NOT EXISTS "compra_mensagens" (
  "id"         TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "compra_id"  TEXT NOT NULL,
  "autor_id"   TEXT,
  "texto"      TEXT NOT NULL,
  "is_active"  BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "compra_mensagens_compra_fk" FOREIGN KEY ("compra_id") REFERENCES "compras"("id") ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS "idx_compra_mensagens_compra" ON "compra_mensagens" ("compra_id");

-- ── Critérios de avaliação (sgq_com_cri, P1..P5) ─────────────
CREATE TABLE IF NOT EXISTS "compra_criterios" (
  "id"         TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "empresa_id" TEXT,
  "criterio"   TEXT NOT NULL,
  "ordem"      INTEGER NOT NULL DEFAULT 0,
  "is_active"  BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS "idx_compra_criterios_empresa" ON "compra_criterios" ("empresa_id");

-- ── Respostas da avaliação (P1..P5 por pedido) ───────────────
CREATE TABLE IF NOT EXISTS "compra_avaliacao_respostas" (
  "id"          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "compra_id"   TEXT NOT NULL,
  "criterio_id" TEXT NOT NULL,
  "atende"      BOOLEAN NOT NULL,
  "created_at"  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "compra_aval_compra_fk"   FOREIGN KEY ("compra_id")   REFERENCES "compras"("id") ON DELETE CASCADE,
  CONSTRAINT "compra_aval_criterio_fk" FOREIGN KEY ("criterio_id") REFERENCES "compra_criterios"("id") ON DELETE CASCADE,
  CONSTRAINT "compra_aval_unique" UNIQUE ("compra_id", "criterio_id")
);
CREATE INDEX IF NOT EXISTS "idx_compra_aval_compra" ON "compra_avaliacao_respostas" ("compra_id");

COMMIT;
