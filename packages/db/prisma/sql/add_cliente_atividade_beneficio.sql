-- ============================================================
-- Migration cirúrgica: Atividades e Benefícios do Cliente (#5/#6)
-- + coluna descricao em cliente_arquivos (#2)
-- Aplicada via `psql` / `prisma db execute` (NÃO `db push`) pra não
-- dropar tabelas legadas. Totalmente idempotente.
-- ============================================================

-- #5 — Atividades do cliente (1:N)
CREATE TABLE IF NOT EXISTS "cliente_atividades" (
  "id"         TEXT PRIMARY KEY,
  "cliente_id" TEXT NOT NULL,
  "valor"      TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL
);

DO $$ BEGIN
  ALTER TABLE "cliente_atividades"
    ADD CONSTRAINT "cliente_atividades_cliente_id_fkey"
    FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE INDEX IF NOT EXISTS "cliente_atividades_cliente_id_idx" ON "cliente_atividades"("cliente_id");

-- #6 — Benefícios fiscais do cliente (1:N)
CREATE TABLE IF NOT EXISTS "cliente_beneficios" (
  "id"         TEXT PRIMARY KEY,
  "cliente_id" TEXT NOT NULL,
  "valor"      TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL
);

DO $$ BEGIN
  ALTER TABLE "cliente_beneficios"
    ADD CONSTRAINT "cliente_beneficios_cliente_id_fkey"
    FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE INDEX IF NOT EXISTS "cliente_beneficios_cliente_id_idx" ON "cliente_beneficios"("cliente_id");

-- #2 — Coluna descricao em cliente_arquivos (editar arquivos + detalhes)
ALTER TABLE "cliente_arquivos" ADD COLUMN IF NOT EXISTS "descricao" TEXT;
