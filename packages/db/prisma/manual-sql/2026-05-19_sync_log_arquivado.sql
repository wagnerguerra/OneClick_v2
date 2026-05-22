-- Adiciona flag de arquivamento aos logs de sincronização.
-- Quando há mais de 10 logs ativos por cliente, os antigos viram arquivado=true
-- e somem do painel "Últimas sincronizações" — mas continuam no banco para auditoria.

ALTER TABLE drive_sync_logs
  ADD COLUMN IF NOT EXISTS arquivado BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS drive_sync_logs_cliente_arquivado_iniciado_idx
  ON drive_sync_logs (cliente_id, arquivado, iniciado_em DESC);
