-- Drive Sync: campos no Cliente + tabela de logs.
-- Aditivo, idempotente — não toca em dados existentes.

ALTER TABLE clientes
  ADD COLUMN IF NOT EXISTS drive_folder_id   TEXT,
  ADD COLUMN IF NOT EXISTS drive_folder_name TEXT,
  ADD COLUMN IF NOT EXISTS drive_sync_token  TEXT,
  ADD COLUMN IF NOT EXISTS drive_synced_at   TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS drive_sync_status TEXT;

CREATE TABLE IF NOT EXISTS drive_sync_logs (
  id              TEXT PRIMARY KEY,
  cliente_id      TEXT NOT NULL,
  tipo            TEXT NOT NULL DEFAULT 'automatico',
  iniciado_por    TEXT,
  iniciado_em     TIMESTAMP(3) NOT NULL DEFAULT NOW(),
  finalizado_em   TIMESTAMP(3),
  status          TEXT NOT NULL DEFAULT 'running',
  arquivos_vistos INT NOT NULL DEFAULT 0,
  arquivos_novos  INT NOT NULL DEFAULT 0,
  arquivos_ok     INT NOT NULL DEFAULT 0,
  arquivos_erro   INT NOT NULL DEFAULT 0,
  erro_mensagem   TEXT,
  itens           JSONB NOT NULL DEFAULT '[]'::jsonb,
  CONSTRAINT drive_sync_logs_cliente_fk FOREIGN KEY (cliente_id)
    REFERENCES clientes(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS drive_sync_logs_cliente_iniciado_idx
  ON drive_sync_logs (cliente_id, iniciado_em DESC);
