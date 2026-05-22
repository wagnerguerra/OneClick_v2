-- Backfill: DANFEs já importadas via Drive sync ficaram com cliente_id null.
-- Associa-los ao cliente que dono da pasta sync_log onde foram processados.
UPDATE danfes d
SET cliente_id = sub.cliente_id
FROM (
  SELECT
    (item->>'danfeId') AS danfe_id,
    l.cliente_id
  FROM drive_sync_logs l,
       jsonb_array_elements(l.itens) AS item
  WHERE item->>'status' IN ('ok', 'duplicado')
    AND item->>'danfeId' IS NOT NULL
) sub
WHERE d.id = sub.danfe_id
  AND d.cliente_id IS NULL;
