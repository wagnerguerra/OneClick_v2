-- Número sequencial por empresa (#1, #2...) das oportunidades do CRM.
-- Identificador humano do card, usado pra cruzar com a agenda (vínculo N:N).
-- O model (Oportunidade.numero) existe no schema.prisma; o prisma db push cria a
-- coluna. Este SQL é defensivo (ADD COLUMN IF NOT EXISTS) + faz o BACKFILL dos
-- cards já existentes. Idempotente: numera apenas linhas com numero NULL e começa
-- após o MAX atual de cada empresa, então re-rodar no deploy é no-op.

ALTER TABLE oportunidades ADD COLUMN IF NOT EXISTS numero integer;
CREATE INDEX IF NOT EXISTS oportunidades_empresa_id_numero_idx ON oportunidades (empresa_id, numero);

WITH ranked AS (
  SELECT id, empresa_id,
         ROW_NUMBER() OVER (PARTITION BY empresa_id ORDER BY created_at ASC, id ASC) AS rn
  FROM oportunidades
  WHERE numero IS NULL
),
maxes AS (
  SELECT empresa_id, COALESCE(MAX(numero), 0) AS mx
  FROM oportunidades
  GROUP BY empresa_id
)
UPDATE oportunidades o
SET numero = m.mx + r.rn
FROM ranked r
JOIN maxes m ON m.empresa_id IS NOT DISTINCT FROM r.empresa_id
WHERE o.id = r.id;
