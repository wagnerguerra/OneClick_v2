-- Adiciona contador de arquivos ignorados (CCe, cancelamento, inutilização —
-- XMLs que não são NFe mas são esperados na pasta do cliente).
ALTER TABLE drive_sync_logs
  ADD COLUMN IF NOT EXISTS arquivos_ignorados INT NOT NULL DEFAULT 0;
