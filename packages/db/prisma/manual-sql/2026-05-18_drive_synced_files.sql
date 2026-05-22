-- Rastreia arquivos JÁ processados na pasta Drive de cada cliente.
-- Dedup duplo:
--   1) Por file_id (estável no Drive — não baixa de novo)
--   2) Por sha256 (mesmo conteúdo em outro fileId — copiado/movido)
CREATE TABLE IF NOT EXISTS drive_synced_files (
  id             TEXT PRIMARY KEY,
  cliente_id     TEXT NOT NULL,
  file_id        TEXT NOT NULL,                -- Drive file ID
  sha256         TEXT NOT NULL,                -- hash do conteúdo
  file_name      TEXT,
  path_drive     TEXT,                         -- caminho relativo (debug)
  processado_em  TIMESTAMP(3) NOT NULL DEFAULT NOW(),
  status         TEXT NOT NULL,                -- ok|duplicado|ignorado|erro
  tipo_ignorado  TEXT,                         -- cce|cancelamento|inutilizacao|evento|nao_nfe
  danfe_id       TEXT,                         -- FK opcional (apenas pra status=ok)

  CONSTRAINT drive_synced_files_cliente_fk FOREIGN KEY (cliente_id)
    REFERENCES clientes(id) ON DELETE CASCADE,
  CONSTRAINT drive_synced_files_danfe_fk FOREIGN KEY (danfe_id)
    REFERENCES danfes(id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS drive_synced_files_cliente_fileid_uk
  ON drive_synced_files (cliente_id, file_id);
CREATE INDEX IF NOT EXISTS drive_synced_files_cliente_sha_idx
  ON drive_synced_files (cliente_id, sha256);
