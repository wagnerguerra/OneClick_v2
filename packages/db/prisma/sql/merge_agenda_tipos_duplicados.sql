-- ============================================================
-- Mescla tipos de evento DUPLICADOS (mesmo nome, ignorando caixa/espaços).
-- Mantém 1 canônico por nome, reatribui TUDO que aponta pros duplicados e remove
-- os duplicados. Canônico = prioriza o default global (id LIKE 'agtipo_g_%'),
-- depois ativo, depois o mais antigo.
--
-- Idempotente: depois de rodar não há mais duplicados, então a tabela temporária
-- fica vazia e os UPDATE/DELETE viram no-op.
-- ============================================================
BEGIN;

CREATE TEMP TABLE _dup_tipos AS
SELECT id AS dup_id, canonico
FROM (
  SELECT id,
         first_value(id) OVER w AS canonico,
         row_number()    OVER w AS rn
    FROM agenda_tipos
  WINDOW w AS (
    PARTITION BY lower(btrim(nome))
    ORDER BY (id LIKE 'agtipo_g_%') DESC, is_active DESC, created_at ASC
  )
) r
WHERE rn > 1;

-- 1) Eventos → canônico (FK obrigatória antes do DELETE)
UPDATE agenda_eventos e
   SET tipo_id = d.canonico
  FROM _dup_tipos d
 WHERE e.tipo_id = d.dup_id;

-- 2) Grupos do modelo de e-mail: troca ids duplicados pelo canônico dentro do
--    array tipos_ids (com dedup, preservando os demais).
UPDATE agenda_email_grupos g
   SET tipos_ids = sub.novo
  FROM (
    SELECT g2.id,
           (SELECT array_agg(DISTINCT COALESCE(d.canonico, x))
              FROM unnest(g2.tipos_ids) AS x
              LEFT JOIN _dup_tipos d ON d.dup_id = x) AS novo
      FROM agenda_email_grupos g2
     WHERE EXISTS (SELECT 1 FROM _dup_tipos d WHERE d.dup_id = ANY(g2.tipos_ids))
  ) sub
 WHERE g.id = sub.id;

-- 3) Config do funil de lead: tipo de reunião → canônico
UPDATE lead_funil_config c
   SET tipo_evento_reuniao_id = d.canonico
  FROM _dup_tipos d
 WHERE c.tipo_evento_reuniao_id = d.dup_id;

-- 4) Remove os tipos duplicados
DELETE FROM agenda_tipos t
 USING _dup_tipos d
 WHERE t.id = d.dup_id;

DROP TABLE _dup_tipos;

COMMIT;
