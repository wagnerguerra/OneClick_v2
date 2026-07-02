-- ============================================================
-- Popula a aba "Grupos" (opcoes_cadastro tipo='GRUPO') a partir dos grupos já
-- usados no campo livre `clientes.grupo`. Assim a lista gerenciável começa com o
-- que já existe, sem digitar tudo de novo.
--
-- Idempotente: só insere grupos que ainda NÃO existem em opcoes_cadastro
-- (comparação case-insensitive + trim). Pode rodar a cada deploy sem duplicar —
-- clientes com grupos novos vão sendo incorporados nas próximas rodadas.
--
-- Dedup na origem: agrupa por LOWER(TRIM(grupo)) pra não criar duas entradas por
-- variação de caixa/espaço; mantém uma grafia representativa (MAX).
-- ============================================================
INSERT INTO opcoes_cadastro (id, tipo, valor, ordem, ativo, created_at)
SELECT
  gen_random_uuid()::text,
  'GRUPO',
  g.valor,
  (SELECT COALESCE(MAX(ordem), 0) FROM opcoes_cadastro WHERE tipo = 'GRUPO')
    + ROW_NUMBER() OVER (ORDER BY g.valor),
  true,
  NOW()
FROM (
  SELECT MAX(TRIM(grupo)) AS valor
  FROM clientes
  WHERE grupo IS NOT NULL
    AND TRIM(grupo) <> ''
    AND deleted_at IS NULL
  GROUP BY LOWER(TRIM(grupo))
) g
WHERE NOT EXISTS (
  SELECT 1 FROM opcoes_cadastro o
  WHERE o.tipo = 'GRUPO'
    AND LOWER(TRIM(o.valor)) = LOWER(g.valor)
);
