-- Migração manual: módulo Melhorias da Qualidade (port v1 sgq_melhorias).
-- Idempotente e SÓ ADITIVA — 1 tabela, sem enum.
-- Levantamento do legado: docs/migracao-melhorias-v1.md
--
-- Mora em packages/db/prisma/sql/ porque e ESTA a pasta que o Service Manager
-- aplica no deploy (stage 4.5, em ordem alfabetica). A packages/db/migrations/
-- nao e lida por ninguem.

BEGIN;

CREATE TABLE IF NOT EXISTS "melhorias" (
  "id"              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "empresa_id"      TEXT,
  "legacy_id"       INTEGER,
  "titulo"          TEXT NOT NULL,
  "descricao"       TEXT,
  "area_id"         TEXT,
  "prevista_para"   DATE,
  -- REGISTRADA | IMPLEMENTADA | CANCELADA
  "status"          TEXT NOT NULL DEFAULT 'REGISTRADA',
  "implementada_em" DATE,
  "autor_id"        TEXT,
  "criado_em"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "atualizado_em"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "melhorias_empresa_id_status_idx" ON "melhorias" ("empresa_id", "status");
CREATE INDEX IF NOT EXISTS "melhorias_legacy_id_idx"         ON "melhorias" ("legacy_id");

DO $$ BEGIN
  ALTER TABLE "melhorias" ADD CONSTRAINT "melhorias_area_id_fkey"
    FOREIGN KEY ("area_id") REFERENCES "areas"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Default de atualizado_em: o @updatedAt do Prisma e aplicado pelo cliente;
-- quando a tabela nasce do prisma db push a coluna vem sem default e qualquer
-- INSERT cru quebra (licao de 18/08 na carga dos documentos).
ALTER TABLE "melhorias" ALTER COLUMN "atualizado_em" SET DEFAULT CURRENT_TIMESTAMP;

COMMIT;
