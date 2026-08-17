-- Migração manual: módulo Reuniões (Fase 1 do port v1 `sgq_reunioes`).
-- Bloco Qualidade. Idempotente e SÓ ADITIVA — 6 tabelas, nenhum enum novo.
-- Não toca em nada existente além de criar as FKs para clientes/areas/users.
-- Levantamento do legado: docs/migracao-reunioes-v1.md

BEGIN;

-- ── Reunião (sgq_reu) ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "reunioes" (
  "id"            TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "empresa_id"    TEXT,
  -- Número visível. Nos migrados é o sgq_reu.id do v1, para o pessoal continuar
  -- achando a reunião pelo número que já conhece.
  "numero"        INTEGER,
  -- ANALISE_CRITICA | SETORIAL | OUTROS (os 3 valores chumbados no <select> do v1)
  "tipo"          TEXT NOT NULL DEFAULT 'OUTROS',
  "titulo"        TEXT NOT NULL,
  "cliente_id"    TEXT,
  "area_id"       TEXT,
  "data"          DATE NOT NULL,
  "hora_inicio"   TEXT,
  "hora_fim"      TEXT,
  "local"         TEXT,
  "pauta"         TEXT,
  "ata"           TEXT,
  "autor_id"      TEXT,
  "criado_em"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "atualizado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "reunioes_empresa_id_data_idx"      ON "reunioes" ("empresa_id", "data");
CREATE INDEX IF NOT EXISTS "reunioes_empresa_id_tipo_data_idx" ON "reunioes" ("empresa_id", "tipo", "data");
CREATE INDEX IF NOT EXISTS "reunioes_cliente_id_idx"           ON "reunioes" ("cliente_id");

-- ── Participantes ────────────────────────────────────────────
-- Um caminho só: guarda o ID quando existe usuário; o nome fica para o
-- convidado externo (gente do cliente) e para o que a migração não casar.
CREATE TABLE IF NOT EXISTS "reuniao_participantes" (
  "id"         TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "reuniao_id" TEXT NOT NULL,
  "usuario_id" TEXT,
  "nome"       TEXT,
  "presente"   BOOLEAN NOT NULL DEFAULT true,
  "criado_em"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "reuniao_participantes_reuniao_id_idx" ON "reuniao_participantes" ("reuniao_id");
CREATE INDEX IF NOT EXISTS "reuniao_participantes_usuario_id_idx" ON "reuniao_participantes" ("usuario_id");

-- ── Plano de ação (sgq_reu_aca) ──────────────────────────────
CREATE TABLE IF NOT EXISTS "reuniao_acoes" (
  "id"                TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "reuniao_id"        TEXT NOT NULL,
  "descricao"         TEXT NOT NULL,
  "responsavel_id"    TEXT,
  -- Resíduo do legado: 133 das 140 ações tinham só o nome em texto.
  "responsavel_nome"  TEXT,
  "prazo"             DATE,
  -- PENDENTE | CONCLUIDA (no v1, situacao '1' e '2')
  "status"            TEXT NOT NULL DEFAULT 'PENDENTE',
  "concluido_em"      TIMESTAMP(3),
  "concluido_por_id"  TEXT,
  "observacao"        TEXT,
  "criado_em"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "atualizado_em"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "reuniao_acoes_reuniao_id_idx"            ON "reuniao_acoes" ("reuniao_id");
CREATE INDEX IF NOT EXISTS "reuniao_acoes_responsavel_id_status_idx" ON "reuniao_acoes" ("responsavel_id", "status");
CREATE INDEX IF NOT EXISTS "reuniao_acoes_status_prazo_idx"          ON "reuniao_acoes" ("status", "prazo");

-- ── Anexos (sgq_reu_arq) ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS "reuniao_arquivos" (
  "id"           TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "reuniao_id"   TEXT NOT NULL,
  "autor_id"     TEXT,
  "nome"         TEXT NOT NULL,
  "arquivo_path" TEXT NOT NULL,
  "mime"         TEXT,
  "bytes"        INTEGER,
  "criado_em"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "reuniao_arquivos_reuniao_id_idx" ON "reuniao_arquivos" ("reuniao_id");

-- ── Mensagens (sgq_reu_msg) ──────────────────────────────────
CREATE TABLE IF NOT EXISTS "reuniao_mensagens" (
  "id"         TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "reuniao_id" TEXT NOT NULL,
  "autor_id"   TEXT,
  "texto"      TEXT NOT NULL,
  "criado_em"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "reuniao_mensagens_reuniao_id_idx" ON "reuniao_mensagens" ("reuniao_id");

-- ── Trilha de auditoria (sgq_reu_log) ────────────────────────
CREATE TABLE IF NOT EXISTS "reuniao_logs" (
  "id"         TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "reuniao_id" TEXT NOT NULL,
  "usuario_id" TEXT,
  "evento"     TEXT NOT NULL,
  "detalhe"    TEXT,
  "criado_em"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "reuniao_logs_reuniao_id_idx" ON "reuniao_logs" ("reuniao_id");

-- ── Chaves estrangeiras ──────────────────────────────────────
-- Em bloco DO por causa do IF NOT EXISTS: o Postgres não aceita esse modificador
-- em ADD CONSTRAINT, e sem ele reaplicar o script quebraria.
DO $$ BEGIN
  ALTER TABLE "reunioes" ADD CONSTRAINT "reunioes_cliente_id_fkey"
    FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "reunioes" ADD CONSTRAINT "reunioes_area_id_fkey"
    FOREIGN KEY ("area_id") REFERENCES "areas"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "reunioes" ADD CONSTRAINT "reunioes_autor_id_fkey"
    FOREIGN KEY ("autor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "reuniao_participantes" ADD CONSTRAINT "reuniao_participantes_reuniao_id_fkey"
    FOREIGN KEY ("reuniao_id") REFERENCES "reunioes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "reuniao_participantes" ADD CONSTRAINT "reuniao_participantes_usuario_id_fkey"
    FOREIGN KEY ("usuario_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "reuniao_acoes" ADD CONSTRAINT "reuniao_acoes_reuniao_id_fkey"
    FOREIGN KEY ("reuniao_id") REFERENCES "reunioes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "reuniao_acoes" ADD CONSTRAINT "reuniao_acoes_responsavel_id_fkey"
    FOREIGN KEY ("responsavel_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "reuniao_arquivos" ADD CONSTRAINT "reuniao_arquivos_reuniao_id_fkey"
    FOREIGN KEY ("reuniao_id") REFERENCES "reunioes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "reuniao_mensagens" ADD CONSTRAINT "reuniao_mensagens_reuniao_id_fkey"
    FOREIGN KEY ("reuniao_id") REFERENCES "reunioes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "reuniao_logs" ADD CONSTRAINT "reuniao_logs_reuniao_id_fkey"
    FOREIGN KEY ("reuniao_id") REFERENCES "reunioes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

COMMIT;
