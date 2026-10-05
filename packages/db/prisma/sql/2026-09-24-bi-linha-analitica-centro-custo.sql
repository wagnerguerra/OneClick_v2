-- Colunas que o SCI sempre devolveu e nos nunca pegamos.
--
-- RODAR ANTES DO DEPLOY (antes do `prisma db push`), como usuario `oneclick`.
--
-- Por que antes: a chave unica de `cliente_bi_linhas` passa a incluir o centro
-- de custo. A chave ANTIGA foi criada pelo Prisma como CONSTRAINT, e o
-- `db push` tenta remove-la com `DROP INDEX` — o Postgres recusa, porque um
-- indice que serve a uma constraint so sai junto com ela:
--
--   ERROR: cannot drop index cliente_bi_linhas_cliente_id_periodo_conta_key
--   because constraint ... requires it
--   HINT: You can drop constraint ... instead.
--
-- Este script faz o `DROP CONSTRAINT` que o `db push` nao sabe emitir, e ja
-- cria o indice novo COM O NOME QUE O PRISMA ESPERA — assim o `db push`
-- encontra o estado desejado e nao mexe em nada.
--
-- Contexto das colunas: a VSUC_SP_RETORNA_BALANCETE devolve 45 colunas; o
-- nosso SELECT lia 8. Tres delas resolvem o que o modulo vinha adivinhando:
--
--   BDTIPCTA  (0 sintetica / 1 analitica) — conferido na base: no 08/2026 da
--             Finatto, 257 linhas tipo 0 comecando em "01" e 148 tipo 1
--             comecando em "01.1.1.01.001". Substitui contar pontos e procurar
--             descendente.
--   BDCODTPCC / BDNOMTPCC — centro de custo. Entra na chave unica: a mesma
--             conta pode voltar uma vez por centro de custo, e era isso que
--             obrigava o importador a deduplicar por conta escolhendo um
--             `movimento` entre as linhas.
--
-- Aditivo e idempotente. Linhas ja importadas ficam com analitica NULL (o
-- calculo cai na heuristica antiga) e cc_codigo 0, que e exatamente o valor que
-- o SCI devolve para empresa sem centro de custo.

-- 1. Colunas novas.
ALTER TABLE cliente_bi_linhas
  ADD COLUMN IF NOT EXISTS analitica BOOLEAN;

ALTER TABLE cliente_bi_linhas
  ADD COLUMN IF NOT EXISTS cc_codigo INTEGER NOT NULL DEFAULT 0;

ALTER TABLE cliente_bi_linhas
  ADD COLUMN IF NOT EXISTS cc_nome TEXT NOT NULL DEFAULT '';

-- 2. Indice unico novo, com o nome que o Prisma gera para
--    @@unique([clienteId, periodo, conta, ccCodigo]) — ele usa os nomes
--    MAPEADOS das colunas. Criar antes de remover o antigo para a tabela nunca
--    ficar sem protecao contra duplicata.
CREATE UNIQUE INDEX IF NOT EXISTS cliente_bi_linhas_cliente_id_periodo_conta_cc_codigo_key
  ON cliente_bi_linhas (cliente_id, periodo, conta, cc_codigo);

-- 3. A chave antiga sai como CONSTRAINT, nao como indice.
ALTER TABLE cliente_bi_linhas
  DROP CONSTRAINT IF EXISTS cliente_bi_linhas_cliente_id_periodo_conta_key;

-- 4. Limpeza: a primeira versao deste script criava o indice com um nome
--    proprio, que o Prisma nao reconhece e trataria como indice a mais.
DROP INDEX IF EXISTS cliente_bi_linhas_cliente_periodo_conta_cc_key;
