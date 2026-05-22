-- Backfill: arquivos já processados em sync anteriores entram na tabela
-- de dedup pra que NÃO sejam reprocessados na próxima execução. Usa o JSON
-- `itens` dos drive_sync_logs antigos. Sem o SHA original — placeholder que
-- só serve pra dedup #1 (file_id). Dedup por SHA será ativada a partir de agora.
INSERT INTO drive_synced_files
  (id, cliente_id, file_id, sha256, file_name, path_drive, status, danfe_id, processado_em)
SELECT
  -- cuid-like id (md5 hex)
  md5(random()::text || clock_timestamp()::text || (item->>'fileId')),
  l.cliente_id,
  item->>'fileId',
  '__backfill_no_sha__',
  COALESCE(item->>'nome', item->>'name', '(desconhecido)'),
  COALESCE(item->>'nome', item->>'name', '(desconhecido)'),
  CASE
    WHEN item->>'status' = 'ok' THEN 'ok'
    WHEN item->>'status' = 'duplicado' THEN 'duplicado'
    WHEN item->>'status' = 'ignorado' THEN 'ignorado'
    ELSE 'ok'
  END,
  item->>'danfeId',
  l.iniciado_em
FROM drive_sync_logs l,
     jsonb_array_elements(l.itens) AS item
WHERE item->>'status' IN ('ok', 'duplicado', 'ignorado')
  AND item->>'fileId' IS NOT NULL
ON CONFLICT (cliente_id, file_id) DO NOTHING;
