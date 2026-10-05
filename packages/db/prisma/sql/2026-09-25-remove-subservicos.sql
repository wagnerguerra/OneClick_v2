-- Remoção dos SUBSERVIÇOS do catálogo comercial.
--
-- Decisão do Wagner (25/09/2026): o recurso sai do sistema. O catálogo passa a
-- ter dois níveis apenas — SERVIÇO e VARIAÇÃO do serviço. O subserviço era um
-- terceiro nível, criado em 08/2026, e na prática foi usado uma vez: um serviço
-- com cinco filhos e quatro itens de orçamento.
--
-- ORDEM DO PIPELINE — o que decide a forma deste script:
--
-- o deploy roda `prisma db push --accept-data-loss` (Stage 4) ANTES dos SQLs
-- desta pasta (Stage 4.5). Por isso a coluna `orcamento_itens.subservico_id`
-- CONTINUA no schema.prisma neste deploy, marcada como descontinuada: se ela
-- saísse junto, o db push a derrubaria primeiro e o passo 1 abaixo encontraria
-- a coluna já apagada — os quatro orçamentos perderiam o nome do que foi
-- vendido. A primeira versão deste script tinha exatamente esse defeito.
--
-- Então são dois deploys:
--   1. este: o db push derruba a TABELA (os 5 vínculos pai → filho não
--      carregam informação que precise sobreviver) e a FK da coluna; este SQL
--      copia os nomes para a descrição;
--   2. o seguinte: a coluna sai do schema e o db push a derruba.
--
-- Idempotente: pode rodar de novo sem efeito.

-- ─────────────────────────────────────────────────────────────
-- 1. PRESERVAR antes de destruir
--
-- Quatro itens de orçamento apontam para um subserviço, e é ELE que diz o que
-- o cliente comprou: a descrição guarda "SERVIÇO EXTRA - ÁREA LEGALIZAÇÃO" e o
-- vínculo guarda "ADESÃO COMPETE". Um deles (#4800) já foi enviado ao cliente.
--
-- Apagar o vínculo sem isto deixaria quatro propostas dizendo menos do que
-- diziam. Então o nome do subserviço entra na própria descrição, que é onde ele
-- já aparecia para quem lia a proposta.
--
-- O `servicos` do JOIN continua existindo: o subserviço era um serviço inteiro,
-- e só o VÍNCULO pai → filho é que sai.
--
-- O `POSITION(...) = 0` evita repetir o nome se este script rodar duas vezes
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
-- 2. A coluna do item NÃO é derrubada aqui.
--
-- Ela sai pelo db push do deploy seguinte, quando deixar o schema.prisma.
-- Derrubá-la neste script faria o db push daquele deploy recriá-la vazia,
-- porque ela ainda estaria no schema. A FK já caiu no db push deste deploy
-- (a relação saiu do schema); o índice cai junto com a coluna.

-- ─────────────────────────────────────────────────────────────
-- 3. A tabela de vínculos pai → filho
--
-- Normalmente já derrubada pelo db push deste deploy (o modelo saiu do
-- schema). O `IF EXISTS` é para o script também servir a um banco em que o db
-- push não tenha rodado.
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
