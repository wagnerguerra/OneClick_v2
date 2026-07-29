-- Backfill: converte o texto-livre "categoria" dos fornecedores em categorias (tags) + vínculos.
-- As TABELAS são criadas pelo `prisma db push` (estão no schema.prisma); aqui só migramos os dados.
-- Idempotente: só cria a categoria se ainda não existir e só vincula com ON CONFLICT DO NOTHING,
-- então pode rodar a cada deploy sem duplicar. Informa created_at/updated_at porque o db push
-- não cria default no banco para a coluna @updatedAt.
DO $$
DECLARE
  r RECORD;
  tok TEXT;
  cat_id TEXT;
BEGIN
  -- Se as tabelas ainda não existirem (db push não rodou), não faz nada em vez de abortar.
  IF to_regclass('"fornecedor_categorias"') IS NULL
     OR to_regclass('"fornecedor_categoria_links"') IS NULL THEN
    RAISE NOTICE 'Tabelas de categorias ainda não existem — backfill ignorado.';
    RETURN;
  END IF;

  FOR r IN
    SELECT id AS fornecedor_id, empresa_id, categoria
    FROM "fornecedores"
    WHERE categoria IS NOT NULL AND btrim(categoria) <> ''
  LOOP
    FOREACH tok IN ARRAY string_to_array(r.categoria, ',')
    LOOP
      tok := btrim(tok);
      CONTINUE WHEN tok = '';

      SELECT id INTO cat_id
      FROM "fornecedor_categorias"
      WHERE nome = tok AND (empresa_id IS NOT DISTINCT FROM r.empresa_id)
      LIMIT 1;

      IF cat_id IS NULL THEN
        cat_id := gen_random_uuid()::text;
        INSERT INTO "fornecedor_categorias" ("id", "nome", "empresa_id", "created_at", "updated_at")
        VALUES (cat_id, tok, r.empresa_id, now(), now());
      END IF;

      INSERT INTO "fornecedor_categoria_links" ("fornecedor_id", "categoria_id")
      VALUES (r.fornecedor_id, cat_id)
      ON CONFLICT DO NOTHING;
    END LOOP;
  END LOOP;
END $$;
