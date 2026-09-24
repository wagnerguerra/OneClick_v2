-- Colunas que o SCI sempre devolveu e nos nunca pegamos.
--
-- A VSUC_SP_RETORNA_BALANCETE tem 45 colunas de saida; o nosso SELECT lia 8.
-- Tres delas resolvem problemas que o modulo vinha resolvendo por adivinhacao:
--
--   BDTIPCTA  (0 sintetica / 1 analitica) — conferido na base: no 08/2026 da
--             Finatto, 257 linhas tipo 0 comecando em "01" e 148 tipo 1
--             comecando em "01.1.1.01.001". Substitui contar pontos e procurar
--             descendente.
--   BDCODTPCC / BDNOMTPCC — centro de custo. Entra na CHAVE UNICA: a mesma
--             conta pode voltar uma vez por centro de custo, e era isso que
--             obrigava o importador a deduplicar por conta escolhendo um
--             `movimento` entre as linhas (heuristica do "menor em valor
--             absoluto", que produzia movimento != creditos - debitos).
--
-- Aditivo e idempotente. Linhas ja importadas ficam com analitica NULL (o
-- calculo cai na heuristica antiga) e cc_codigo 0 (default), que e exatamente
-- o valor que o SCI devolve para empresa sem centro de custo.

ALTER TABLE cliente_bi_linhas
  ADD COLUMN IF NOT EXISTS analitica BOOLEAN;

ALTER TABLE cliente_bi_linhas
  ADD COLUMN IF NOT EXISTS cc_codigo INTEGER NOT NULL DEFAULT 0;

ALTER TABLE cliente_bi_linhas
  ADD COLUMN IF NOT EXISTS cc_nome TEXT NOT NULL DEFAULT '';

-- A chave unica passa a incluir o centro de custo. Remove a antiga so depois de
-- criar a nova, para nunca ficar sem protecao contra duplicata.
CREATE UNIQUE INDEX IF NOT EXISTS cliente_bi_linhas_cliente_periodo_conta_cc_key
  ON cliente_bi_linhas (cliente_id, periodo, conta, cc_codigo);

ALTER TABLE cliente_bi_linhas
  DROP CONSTRAINT IF EXISTS cliente_bi_linhas_cliente_id_periodo_conta_key;
