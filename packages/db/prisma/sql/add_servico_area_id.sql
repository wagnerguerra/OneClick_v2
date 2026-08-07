-- Área do serviço: de NOME (servicos.categoria, texto livre) para ID
-- (servicos.area_id → areas.id). O casamento por nome era frágil: renomear a
-- área órfãava todos os serviços, e um nome sem Area correspondente não
-- vinculava nada (HLP0271). A multiplicidade de execução continua em
-- atribuicao_areas ("Setores"); a área do serviço é UMA.
--
-- ETAPA 1 de 2 — cria a coluna + backfill. O DROP da coluna antiga fica em
-- drop_servico_categoria.sql, aplicado só DEPOIS de conferir o backfill.
--
-- Idempotente: pode rodar de novo sem efeito.

-- Coluna + índice + FK (SET NULL: apagar a área não apaga o serviço).
ALTER TABLE servicos ADD COLUMN IF NOT EXISTS area_id TEXT;
CREATE INDEX IF NOT EXISTS servicos_area_id_idx ON servicos (area_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'servicos_area_id_fkey' AND table_name = 'servicos'
  ) THEN
    ALTER TABLE servicos
      ADD CONSTRAINT servicos_area_id_fkey
      FOREIGN KEY (area_id) REFERENCES areas (id) ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- Backfill: casa categoria (nome) com a Area da MESMA empresa (ou global,
-- empresa_id IS NULL) por nome normalizado (trim + lower). Empresa-scoped de
-- propósito: o mesmo nome "Fiscal" pode existir em empresas diferentes, com ids
-- diferentes — casar sem escopo vincularia à área errada. Só preenche o que
-- ainda está nulo (idempotente) e onde há categoria.
UPDATE servicos s
SET area_id = a.id
FROM areas a
WHERE s.area_id IS NULL
  AND s.eh_obrigacao_acessoria = false   -- obrigações usam categoria_obrigacao, nunca area_id
  AND s.categoria IS NOT NULL
  AND btrim(s.categoria) <> ''
  AND lower(btrim(a.name)) = lower(btrim(s.categoria))
  AND (a.empresa_id = s.empresa_id OR a.empresa_id IS NULL);

-- Obrigações Acessórias: a "categoria" delas é um enum próprio (Fiscal/
-- Trabalhista/Contábil), não uma Área — registros globais sem Area equivalente.
-- Preserva o valor antigo numa coluna dedicada antes do drop.
ALTER TABLE servicos ADD COLUMN IF NOT EXISTS categoria_obrigacao TEXT;
UPDATE servicos
SET categoria_obrigacao = categoria
WHERE eh_obrigacao_acessoria = true
  AND categoria IS NOT NULL
  AND categoria_obrigacao IS NULL;

-- Diagnóstico (não falha): categorias não-nulas que não casaram com nenhuma
-- Area da própria empresa — ficam como "sem área". Registre a Area (no cadastro
-- de Áreas) e rode de novo para vincular, ANTES do drop.
DO $$
DECLARE n INTEGER;
BEGIN
  -- Exclui obrigações acessórias: a categoria delas virou categoria_obrigacao,
  -- não precisa de Area.
  SELECT count(*) INTO n FROM servicos s
  WHERE s.area_id IS NULL AND s.categoria IS NOT NULL AND btrim(s.categoria) <> ''
    AND s.eh_obrigacao_acessoria = false;
  IF n > 0 THEN
    RAISE NOTICE '[add_servico_area_id] % serviço(s) com categoria sem Area correspondente na empresa — ficaram sem área. Confira antes do drop.', n;
  END IF;
END $$;
