-- Pasta local do cliente (PC do escritório) monitorada pelo Launcher Electron.
-- Aditivo — compatível com Drive (cliente pode ter Drive + Local simultaneamente).
ALTER TABLE clientes
  ADD COLUMN IF NOT EXISTS local_folder_path     TEXT,
  ADD COLUMN IF NOT EXISTS local_sync_enabled    BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS local_synced_at       TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS local_sync_status     TEXT;
