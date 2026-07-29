-- Categorias (tags) de fornecedor — cadastro por empresa + vínculo N:N.
-- Idempotente: pode rodar mais de uma vez sem erro.

-- 1) Tabela de categorias
CREATE TABLE IF NOT EXISTS "fornecedor_categorias" (
  "id"         TEXT PRIMARY KEY,
  "nome"       TEXT NOT NULL,
  "empresa_id" TEXT,
  "is_active"  BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- unicidade por (empresa, nome) — NULLS NOT DISTINCT p/ empresa nula
CREATE UNIQUE INDEX IF NOT EXISTS "fornecedor_categorias_empresa_nome_key"
  ON "fornecedor_categorias" ("empresa_id", "nome");
CREATE INDEX IF NOT EXISTS "fornecedor_categorias_empresa_idx"
  ON "fornecedor_categorias" ("empresa_id");

-- 2) Vínculo N:N fornecedor <-> categoria
CREATE TABLE IF NOT EXISTS "fornecedor_categoria_links" (
  "fornecedor_id" TEXT NOT NULL,
  "categoria_id"  TEXT NOT NULL,
  CONSTRAINT "fornecedor_categoria_links_pkey" PRIMARY KEY ("fornecedor_id", "categoria_id")
);
CREATE INDEX IF NOT EXISTS "fornecedor_categoria_links_categoria_idx"
  ON "fornecedor_categoria_links" ("categoria_id");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fornecedor_categoria_links_fornecedor_fkey') THEN
    ALTER TABLE "fornecedor_categoria_links"
      ADD CONSTRAINT "fornecedor_categoria_links_fornecedor_fkey"
      FOREIGN KEY ("fornecedor_id") REFERENCES "fornecedores"("id") ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fornecedor_categoria_links_categoria_fkey') THEN
    ALTER TABLE "fornecedor_categoria_links"
      ADD CONSTRAINT "fornecedor_categoria_links_categoria_fkey"
      FOREIGN KEY ("categoria_id") REFERENCES "fornecedor_categorias"("id") ON DELETE CASCADE;
  END IF;
END $$;

-- 3) Backfill: transforma o texto-livre "categoria" existente em categorias + vínculos.
--    Divide por vírgula, tira espaços, ignora vazios. Só roda se o vínculo ainda não existir.
DO $$
DECLARE
  r RECORD;
  tok TEXT;
  cat_id TEXT;
BEGIN
  FOR r IN
    SELECT id AS fornecedor_id, empresa_id, categoria
    FROM "fornecedores"
    WHERE categoria IS NOT NULL AND btrim(categoria) <> ''
  LOOP
    FOREACH tok IN ARRAY string_to_array(r.categoria, ',')
    LOOP
      tok := btrim(tok);
      CONTINUE WHEN tok = '';

      -- acha a categoria existente (mesma empresa, mesmo nome) ou cria
      SELECT id INTO cat_id
      FROM "fornecedor_categorias"
      WHERE nome = tok
        AND (empresa_id IS NOT DISTINCT FROM r.empresa_id)
      LIMIT 1;

      IF cat_id IS NULL THEN
        cat_id := gen_random_uuid()::text;
        INSERT INTO "fornecedor_categorias" ("id", "nome", "empresa_id")
        VALUES (cat_id, tok, r.empresa_id);
      END IF;

      INSERT INTO "fornecedor_categoria_links" ("fornecedor_id", "categoria_id")
      VALUES (r.fornecedor_id, cat_id)
      ON CONFLICT DO NOTHING;
    END LOOP;
  END LOOP;
END $$;
