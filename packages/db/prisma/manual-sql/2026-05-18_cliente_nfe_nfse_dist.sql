-- Campos pra NFe SEFAZ (NFeDistribuicaoDFe) — entradas de mercadorias
ALTER TABLE clientes
  ADD COLUMN IF NOT EXISTS nfe_dist_enabled            BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS nfe_dist_ultimo_nsu         BIGINT,
  ADD COLUMN IF NOT EXISTS nfe_dist_synced_at          TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS nfe_dist_sync_status        TEXT,
  ADD COLUMN IF NOT EXISTS nfe_dist_sync_requested_at  TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS nfe_dist_certificado_id     TEXT;  -- FK opcional; null = pega cert ativo do cliente

-- Campos pra NFS-e Nacional (ADN) — entradas de serviços
ALTER TABLE clientes
  ADD COLUMN IF NOT EXISTS nfse_dist_enabled           BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS nfse_dist_ultimo_nsu        BIGINT,
  ADD COLUMN IF NOT EXISTS nfse_dist_synced_at         TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS nfse_dist_sync_status       TEXT,
  ADD COLUMN IF NOT EXISTS nfse_dist_sync_requested_at TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS nfse_dist_certificado_id    TEXT;

-- FK opcionais — SET NULL pra não cascatear delete
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'clientes_nfe_dist_cert_fk') THEN
    ALTER TABLE clientes ADD CONSTRAINT clientes_nfe_dist_cert_fk
      FOREIGN KEY (nfe_dist_certificado_id) REFERENCES certificados_digitais(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'clientes_nfse_dist_cert_fk') THEN
    ALTER TABLE clientes ADD CONSTRAINT clientes_nfse_dist_cert_fk
      FOREIGN KEY (nfse_dist_certificado_id) REFERENCES certificados_digitais(id) ON DELETE SET NULL;
  END IF;
END $$;
