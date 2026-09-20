-- Semeia o checklist sugerido por categoria de chamado (HelpDesk → Serviços)
--
-- A coluna helpdesk_categorias.servico_id aponta para o template de Servico
-- que o agente inicia pelo card do chamado. Esta é a primeira categoria a
-- receber mapeamento: "Acesso › Conta nova / desligamento".
--
-- Por que por id e não por nome: existe um serviço interno chamado
-- literalmente "Acesso · Conta nova / desligamento" (id cmh9dc6e56b...), mas
-- ele tem ZERO etapas — é casca. Dos 37 serviços internos da área "TI",
-- nenhum tem etapas. O checklist real é "Cadastro de novo colaborador"
-- (cmrjboxhh0001pf076m5pq1e4), na área "Tecnologia da Informação", com 7
-- etapas e 32 passos. Casar por nome acertaria a casca e erraria o conteúdo.
--
-- Idempotente: só grava onde ainda está nulo, e só se os dois registros
-- existirem. Rodar de novo não sobrescreve mapeamento feito à mão depois.
--
-- IMPORTANTE: rodar como o usuário `oneclick` (não como `postgres`), senão o
-- db push do deploy quebra com permission denied.

-- 1) Estado antes
SELECT c.id, c.nome, c.servico_id
  FROM helpdesk_categorias c
 WHERE c.nome = 'Conta nova / desligamento';

-- 2) Mapeamento
UPDATE helpdesk_categorias c
   SET servico_id = 'cmrjboxhh0001pf076m5pq1e4'
 WHERE c.nome = 'Conta nova / desligamento'
   AND c.servico_id IS NULL
   AND EXISTS (SELECT 1 FROM servicos s WHERE s.id = 'cmrjboxhh0001pf076m5pq1e4' AND s.ativo);

-- 3) Conferência — categorias com checklist mapeado
SELECT c.nome AS categoria,
       COALESCE(p.nome, '(raiz)') AS pai,
       s.nome AS checklist,
       (SELECT COUNT(*) FROM servico_etapas e WHERE e.servico_id = s.id) AS etapas
  FROM helpdesk_categorias c
  LEFT JOIN helpdesk_categorias p ON p.id = c.parent_id
  JOIN servicos s ON s.id = c.servico_id
 WHERE c.ativo
 ORDER BY 2, 1;
