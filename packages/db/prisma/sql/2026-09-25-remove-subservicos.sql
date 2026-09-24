-- Remoção dos SUBSERVIÇOS do catálogo comercial.
--
-- Decisão do Wagner (25/09/2026): o recurso sai do sistema. O catálogo passa a
-- ter dois níveis apenas — SERVIÇO e VARIAÇÃO do serviço. O subserviço era um
-- terceiro nível, criado em 08/2026, e na prática foi usado uma vez: um serviço
-- com cinco filhos e quatro itens de orçamento.
--
-- Roda DEPOIS do `prisma db push`? Não: roda ANTES, como todo SQL cirúrgico do
-- pipeline. Isso importa aqui porque o `db push` também removeria a coluna e a
-- tabela — mas sem o passo 1 abaixo, e aí a informação de o QUE foi vendido nos
-- quatro orçamentos se perderia junto.
--
-- Idempotente: pode rodar de novo sem efeito.

-- ─────────────────────────────────────────────────────────────
-- 1. PRESERVAR antes de destruir
--
-- Quatro itens de orçamento apontam para um subserviço, e é ELE que diz o que
-- o cliente comprou: a descrição guarda "SERVIÇO EXTRA - ÁREA LEGALIZAÇÃO" e o
-- vínculo guarda "ADESÃO COMPETE". Um deles (#4800) já foi enviado ao cliente.
--
-- Dropar a coluna direto deixaria quatro propostas dizendo menos do que diziam.
-- Então o nome do subserviço entra na própria descrição, que é onde ele já
-- aparecia para quem lia a proposta.
--
-- O `POSITION(... ) = 0` evita repetir o nome se este script rodar duas vezes
-- ou se alguém já tiver juntado os dois textos à mão.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'orcamento_itens' AND column_name = 'subservico_id'
  ) THEN
    UPDATE orcamento_itens i
       SET descricao = i.descricao || ' — ' || s.nome
      FROM servicos s
     WHERE s.id = i.subservico_id
       AND i.subservico_id IS NOT NULL
       AND POSITION(s.nome IN i.descricao) = 0;
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────
-- 2. A coluna do item de orçamento
--
-- A FK e o índice caem junto com a coluna; o DROP explícito da constraint vem
-- antes só para o comando não depender da ordem que o Postgres escolhe.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orcamento_itens_subservico_id_fkey') THEN
    ALTER TABLE orcamento_itens DROP CONSTRAINT orcamento_itens_subservico_id_fkey;
  END IF;
END $$;

DROP INDEX IF EXISTS orcamento_itens_subservico_id_idx;

ALTER TABLE orcamento_itens DROP COLUMN IF EXISTS subservico_id;

-- ─────────────────────────────────────────────────────────────
-- 3. A tabela de vínculos pai → filho
DROP TABLE IF EXISTS servico_subservicos;

-- ─────────────────────────────────────────────────────────────
-- 4. Os resíduos de configuração e permissão
--
-- Sem isto, a sub-permissão continuaria marcada no cadastro de dois usuários e
-- apareceria como chave desconhecida em qualquer auditoria de permissões.
DELETE FROM opcoes_cadastro
 WHERE tipo = 'ORCAMENTO_CONFIG' AND valor LIKE 'exigir_subservico=%';

UPDATE user_permissions
   SET sub_permissions = sub_permissions - 'item_sem_subservico'
 WHERE sub_permissions ? 'item_sem_subservico';
