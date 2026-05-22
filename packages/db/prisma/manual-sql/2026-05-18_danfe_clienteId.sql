-- Vincula DANFEs ao cliente quando importadas via Drive sync ou outras
-- integrações que conhecem o cliente. Opcional — uploads manuais ficam null.
ALTER TABLE danfes
  ADD COLUMN IF NOT EXISTS cliente_id TEXT;

ALTER TABLE danfes
  DROP CONSTRAINT IF EXISTS danfes_cliente_fk;

ALTER TABLE danfes
  ADD CONSTRAINT danfes_cliente_fk FOREIGN KEY (cliente_id)
    REFERENCES clientes(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS danfes_cliente_idx ON danfes (cliente_id);
