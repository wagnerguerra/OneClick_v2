-- Acessórias — remove do espelho as entregas de clientes que saíram da carteira.
--
-- A sincronização só grava entregas de cliente MENSAL ATIVO, mas não apagava
-- as de quem foi inativado (ou virou avulso/paralisado) depois: em 30/09/2026
-- eram 2.914 entregas de 108 clientes. As telas já deixaram de mostrá-las
-- (recorte-carteira.ts) e a sincronização passa a limpá-las a cada execução;
-- este SQL faz a limpeza do que já existe. Só dados — nenhum DDL.
-- Nada referencia acessorias_entregas (sem FK de entrada). Idempotente.

DELETE FROM acessorias_entregas e
USING clientes c
WHERE c.id = e.cliente_id
  AND (c.status::text <> 'ATIVO' OR c.situacao::text <> 'MENSAL');
