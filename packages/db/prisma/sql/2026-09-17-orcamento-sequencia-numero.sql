-- Conserto da sequência de numeração de orçamentos
--
-- Sintoma: duplicar o orçamento #4778 gerou o #4540.
--
-- Causa: `orcamentos.numero` é `@default(autoincrement())`, ou seja, tem uma
-- sequência do Postgres por trás — mas ela nunca é usada. O caminho normal de
-- criação grava o número explicitamente (max(numero_inicial, último + 1), sob
-- advisory lock) e a importação do legado preserva o número original. Resultado:
-- a sequência ficou parada em um valor antigo. A duplicação era o único caminho
-- que não passava `numero`, então caía no default e recebia esse valor velho.
--
-- O código já foi corrigido (duplicar passou a alocar o número como o create).
-- Este SQL alinha a sequência ao maior número existente, para que qualquer
-- caminho futuro que esqueça de informar `numero` não volte a gerar número
-- baixo. É idempotente e pode rodar mais de uma vez.
--
-- IMPORTANTE: rodar como o usuário `oneclick` (não como `postgres`), senão o
-- db push do deploy quebra com permission denied.

-- 1) Onde a sequência está e onde deveria estar
SELECT
  pg_get_serial_sequence('orcamentos', 'numero')          AS sequencia,
  last_value                                              AS valor_atual,
  (SELECT MAX(numero) FROM orcamentos)                    AS maior_numero
FROM pg_sequences
WHERE schemaname || '.' || sequencename = pg_get_serial_sequence('orcamentos', 'numero');

-- 2) Alinha a sequência: o próximo nextval() devolve MAX(numero) + 1
SELECT setval(
  pg_get_serial_sequence('orcamentos', 'numero'),
  COALESCE((SELECT MAX(numero) FROM orcamentos), 0) + 1,
  false
);

-- 3) Conferência — números repetidos que já existam na base.
--    `numero` NÃO tem índice único, então duplicata entra calada. Se esta
--    consulta devolver linhas, decidir caso a caso qual renumerar (há
--    precedente: os pares 4536/4537/4538 do #HLP0278).
SELECT numero, COUNT(*) AS vezes, array_agg(id) AS ids, array_agg(created_at) AS criados_em
FROM orcamentos
GROUP BY numero
HAVING COUNT(*) > 1
ORDER BY numero;
