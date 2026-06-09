-- ============================================================
-- Múltiplos textos por item do catálogo de orçamentos
-- (título + descrição + valor) + vínculo do texto escolhido no item
-- Aplicada via `psql` / `prisma db execute` (idempotente) — nunca `db push`,
-- pra não dropar tabelas legadas.
-- ============================================================

-- Tabela de textos do registro do catálogo (servicos_catalogo)
CREATE TABLE IF NOT EXISTS "orcamento_catalogo_textos" (
  "id"          TEXT PRIMARY KEY,
  "catalogo_id" TEXT NOT NULL,
  "titulo"      TEXT NOT NULL,
  "descricao"   TEXT,
  "valor"       DECIMAL(12,2),
  "ordem"       INTEGER NOT NULL DEFAULT 0,
  "created_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- FK: texto → servicos_catalogo (cascade ao excluir o item do catálogo)
DO $$ BEGIN
  ALTER TABLE "orcamento_catalogo_textos"
    ADD CONSTRAINT "orcamento_catalogo_textos_catalogo_id_fkey"
    FOREIGN KEY ("catalogo_id") REFERENCES "servicos_catalogo"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE INDEX IF NOT EXISTS "orcamento_catalogo_textos_catalogo_id_idx"
  ON "orcamento_catalogo_textos"("catalogo_id");

-- Coluna no item do orçamento: qual texto do catálogo foi escolhido
ALTER TABLE "orcamento_itens"
  ADD COLUMN IF NOT EXISTS "catalogo_texto_id" TEXT;

-- FK: item → texto escolhido (SetNull se o texto for excluído)
DO $$ BEGIN
  ALTER TABLE "orcamento_itens"
    ADD CONSTRAINT "orcamento_itens_catalogo_texto_id_fkey"
    FOREIGN KEY ("catalogo_texto_id") REFERENCES "orcamento_catalogo_textos"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
