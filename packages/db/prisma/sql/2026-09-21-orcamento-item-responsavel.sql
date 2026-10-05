-- Responsavel pela EXECUCAO de um servico, escolhido a mao no orcamento.
--
-- Contexto: o responsavel da execucao vem da configuracao do servico-template
-- (campos `atribuicao*`). Quando a fonte e SETOR, a atribuicao e claim-first —
-- a execucao nasce sem dono e o primeiro do setor que marcar um passo
-- reivindica. Em 150 dos 242 orcamentos com servico e esse o caso, e ate
-- alguem assumir ninguem sabe de quem e o trabalho.
--
-- Esta coluna guarda a escolha manual POR ITEM (e nao por orcamento): um
-- orcamento pode ter servicos de areas diferentes, cada um com seu dono.
-- NULO = sem escolha manual; vale o que o template resolver.
--
-- Idempotente e aditivo: nenhuma coluna e alterada ou removida, nenhum dado e
-- migrado. Todo item existente fica com NULL, que e exatamente o significado
-- de "nao houve escolha manual" — o comportamento atual continua igual.
--
-- Sem indice de proposito: a coluna e lida junto com o item (pelo orcamento),
-- nunca filtrada sozinha. Indice aqui so custaria escrita.

ALTER TABLE orcamento_itens
  ADD COLUMN IF NOT EXISTS responsavel_id TEXT;
