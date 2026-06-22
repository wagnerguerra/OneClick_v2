-- Acessos a portais/sistemas por cliente (aba Legalização). Idempotente.
CREATE TABLE IF NOT EXISTS cliente_acessos (
  id          text PRIMARY KEY,
  cliente_id  text NOT NULL,
  portal      text NOT NULL,
  usuario     text,
  senha       text,
  observacoes text,
  created_at  timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS cliente_acessos_cliente_idx ON cliente_acessos (cliente_id);

-- FK (cascade ao excluir o cliente) — só cria se ainda não existir.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cliente_acessos_cliente_id_fkey') THEN
    ALTER TABLE cliente_acessos ADD CONSTRAINT cliente_acessos_cliente_id_fkey
      FOREIGN KEY (cliente_id) REFERENCES clientes(id) ON DELETE CASCADE;
  END IF;
END $$;
