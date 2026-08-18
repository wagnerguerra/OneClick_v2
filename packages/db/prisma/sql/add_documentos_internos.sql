-- Migração manual: módulo Documentos Internos da Qualidade (port v1 `sgq_documentos`).
-- Idempotente e SÓ ADITIVA — 5 tabelas, nenhum enum novo.
-- Levantamento do legado: docs/migracao-documentos-internos-v1.md

-- Mora em packages/db/prisma/sql/ porque e ESTA a pasta que o Service Manager
-- aplica no deploy (stage 4.5, em ordem alfabetica). A packages/db/migrations/
-- nao e lida por ninguem — SQL colocado la simplesmente nao roda em producao.

BEGIN;

-- ── Mapa de processos da ISO (sgq_proc) ──────────────────────
CREATE TABLE IF NOT EXISTS "documento_processos" (
  "id"         TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "empresa_id" TEXT,
  "legacy_id"  INTEGER,
  "nome"       TEXT NOT NULL,
  "ordem"      INTEGER NOT NULL DEFAULT 0,
  "ativo"      BOOLEAN NOT NULL DEFAULT true,
  "criado_em"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "documento_processos_empresa_id_ativo_idx" ON "documento_processos" ("empresa_id", "ativo");
CREATE INDEX IF NOT EXISTS "documento_processos_legacy_id_idx"        ON "documento_processos" ("legacy_id");

-- ── Tipo do documento (sgq_doc_cod) ─────────────────────────
-- Cadastro, e não lista fixa: a relação cresce (Instrução de Trabalho,
-- Política, Manual) e o pessoal precisa acrescentar sem passar por deploy.
CREATE TABLE IF NOT EXISTS "documento_tipos" (
  "id"         TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "empresa_id" TEXT,
  "legacy_id"  INTEGER,
  "nome"       TEXT NOT NULL,
  "ordem"      INTEGER NOT NULL DEFAULT 0,
  "ativo"      BOOLEAN NOT NULL DEFAULT true,
  "criado_em"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "documento_tipos_empresa_id_ativo_idx" ON "documento_tipos" ("empresa_id", "ativo");
CREATE INDEX IF NOT EXISTS "documento_tipos_legacy_id_idx"        ON "documento_tipos" ("legacy_id");

-- ── Documento (a identidade que atravessa as revisões) ───────
CREATE TABLE IF NOT EXISTS "documentos_internos" (
  "id"              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "empresa_id"      TEXT,
  "legacy_id"       INTEGER,
  "nome"            TEXT NOT NULL,
  "tipo_id"         TEXT,
  "processo_id"     TEXT,
  -- Ponteiro para a revisão vigente: é o que a listagem mostra e o que se baixa.
  "versao_atual_id" TEXT,
  "criado_em"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "atualizado_em"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
-- ── Convergência ────────────────────────────────────────────
-- Cobre o ambiente que chegou a rodar a versão anterior deste script, quando
-- `tipo` era texto e existia `responsavel_id`. O campo de responsável saiu por
-- decisão do Wagner: no v1 ele estava zerado nas 265 linhas e ninguém sentiu
-- falta em oito anos.
ALTER TABLE "documentos_internos" ADD COLUMN IF NOT EXISTS "tipo_id" TEXT;
ALTER TABLE "documentos_internos" DROP COLUMN IF EXISTS "tipo";
ALTER TABLE "documentos_internos" DROP COLUMN IF EXISTS "responsavel_id";
DROP INDEX IF EXISTS "documentos_internos_empresa_id_tipo_idx";

CREATE UNIQUE INDEX IF NOT EXISTS "documentos_internos_versao_atual_id_key" ON "documentos_internos" ("versao_atual_id");
CREATE INDEX IF NOT EXISTS "documentos_internos_empresa_id_tipo_id_idx" ON "documentos_internos" ("empresa_id", "tipo_id");
CREATE INDEX IF NOT EXISTS "documentos_internos_processo_id_idx"     ON "documentos_internos" ("processo_id");
CREATE INDEX IF NOT EXISTS "documentos_internos_legacy_id_idx"       ON "documentos_internos" ("legacy_id");

-- ── Revisão ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "documento_interno_versoes" (
  "id"                TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "documento_id"      TEXT NOT NULL,
  "legacy_id"         INTEGER,
  "revisao"           INTEGER NOT NULL DEFAULT 0,
  -- NOVO | EM_APROVACAO | APROVADO | SUBSTITUIDO | CANCELADO | REJEITADO
  "situacao"          TEXT NOT NULL DEFAULT 'NOVO',
  "data_versao"       DATE NOT NULL,
  "arquivo_path"      TEXT NOT NULL,
  "arquivo_nome"      TEXT,
  "mime"              TEXT,
  "bytes"             INTEGER,
  "alteracao"         TEXT,
  "justificativa"     TEXT,
  "registrado_por_id" TEXT,
  "aprovado_por_id"   TEXT,
  "aprovado_em"       TIMESTAMP(3),
  "criado_em"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "atualizado_em"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
-- Indice NAO unico de proposito: em 7 documentos o v1 gravou duas linhas com o
-- mesmo numero de revisao, e esse numero e o que sai impresso no documento em
-- papel — renumerar quebraria a correspondencia com as copias que circulam.
-- O drop cobre ambiente que chegou a receber a versao unique deste script.
DROP INDEX IF EXISTS "documento_interno_versoes_documento_id_revisao_key";
CREATE INDEX IF NOT EXISTS "documento_interno_versoes_documento_id_revisao_idx" ON "documento_interno_versoes" ("documento_id", "revisao");
CREATE INDEX IF NOT EXISTS "documento_interno_versoes_documento_id_situacao_idx" ON "documento_interno_versoes" ("documento_id", "situacao");
CREATE INDEX IF NOT EXISTS "documento_interno_versoes_legacy_id_idx" ON "documento_interno_versoes" ("legacy_id");

-- ── Elaboradores (por ID; nome só como resíduo do legado) ────
CREATE TABLE IF NOT EXISTS "documento_interno_elaboradores" (
  "id"         TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "versao_id"  TEXT NOT NULL,
  "usuario_id" TEXT,
  "nome"       TEXT
);
CREATE INDEX IF NOT EXISTS "documento_interno_elaboradores_versao_id_idx"  ON "documento_interno_elaboradores" ("versao_id");
CREATE INDEX IF NOT EXISTS "documento_interno_elaboradores_usuario_id_idx" ON "documento_interno_elaboradores" ("usuario_id");

-- ── Trilha de auditoria ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS "documento_interno_logs" (
  "id"           TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "documento_id" TEXT NOT NULL,
  "usuario_id"   TEXT,
  "evento"       TEXT NOT NULL,
  "detalhe"      TEXT,
  "criado_em"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "documento_interno_logs_documento_id_idx" ON "documento_interno_logs" ("documento_id");

-- ── Chaves estrangeiras ──────────────────────────────────────
-- Em bloco DO por causa do IF NOT EXISTS: o Postgres não aceita esse
-- modificador em ADD CONSTRAINT, e sem ele reaplicar o script quebraria.
DO $$ BEGIN
  ALTER TABLE "documentos_internos" ADD CONSTRAINT "documentos_internos_tipo_id_fkey"
    FOREIGN KEY ("tipo_id") REFERENCES "documento_tipos"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "documentos_internos" ADD CONSTRAINT "documentos_internos_processo_id_fkey"
    FOREIGN KEY ("processo_id") REFERENCES "documento_processos"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "documento_interno_versoes" ADD CONSTRAINT "documento_interno_versoes_documento_id_fkey"
    FOREIGN KEY ("documento_id") REFERENCES "documentos_internos"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Depois de a tabela de versões existir: o ponteiro da vigente fecha o ciclo.
-- SET NULL, e não CASCADE: apagar a revisão vigente não pode levar junto o
-- documento inteiro com todo o histórico.
DO $$ BEGIN
  ALTER TABLE "documentos_internos" ADD CONSTRAINT "documentos_internos_versao_atual_id_fkey"
    FOREIGN KEY ("versao_atual_id") REFERENCES "documento_interno_versoes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "documento_interno_elaboradores" ADD CONSTRAINT "documento_interno_elaboradores_versao_id_fkey"
    FOREIGN KEY ("versao_id") REFERENCES "documento_interno_versoes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "documento_interno_logs" ADD CONSTRAINT "documento_interno_logs_documento_id_fkey"
    FOREIGN KEY ("documento_id") REFERENCES "documentos_internos"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

COMMIT;
