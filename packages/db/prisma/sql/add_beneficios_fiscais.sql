-- ============================================================
-- Benefícios Fiscais (port do v1 crp_beneficios) — bloco Legalização.
-- Catálogo de benefícios + vínculo cliente↔benefício. Idempotente.
-- ============================================================

CREATE TABLE IF NOT EXISTS beneficio_fiscal_catalogo (
  id                         text PRIMARY KEY,
  nome                       text NOT NULL,
  servico_id                 text,
  notifica_vencimento_dias   integer,
  obs                        text,
  ativo                      boolean NOT NULL DEFAULT true,
  empresa_id                 text,
  created_at                 timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at                 timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS beneficio_fiscal_catalogo_empresa_ativo_idx
  ON beneficio_fiscal_catalogo (empresa_id, ativo);

-- FK pro serviço (SET NULL se o serviço sumir). Adiciona só se ainda não existe.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'beneficio_fiscal_catalogo_servico_id_fkey') THEN
    ALTER TABLE beneficio_fiscal_catalogo
      ADD CONSTRAINT beneficio_fiscal_catalogo_servico_id_fkey
      FOREIGN KEY (servico_id) REFERENCES servicos(id) ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS beneficio_fiscal_cliente (
  id              text PRIMARY KEY,
  cliente_id      text NOT NULL,
  catalogo_id     text NOT NULL,
  orcamento_id    text,
  data_vencimento date,
  portaria        text,
  processo        text,
  obs             text,
  ativo           boolean NOT NULL DEFAULT true,
  empresa_id      text,
  created_at      timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS beneficio_fiscal_cliente_cliente_catalogo_key
  ON beneficio_fiscal_cliente (cliente_id, catalogo_id);
CREATE INDEX IF NOT EXISTS beneficio_fiscal_cliente_empresa_ativo_idx
  ON beneficio_fiscal_cliente (empresa_id, ativo);
CREATE INDEX IF NOT EXISTS beneficio_fiscal_cliente_cliente_idx
  ON beneficio_fiscal_cliente (cliente_id);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'beneficio_fiscal_cliente_cliente_id_fkey') THEN
    ALTER TABLE beneficio_fiscal_cliente
      ADD CONSTRAINT beneficio_fiscal_cliente_cliente_id_fkey
      FOREIGN KEY (cliente_id) REFERENCES clientes(id) ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'beneficio_fiscal_cliente_catalogo_id_fkey') THEN
    ALTER TABLE beneficio_fiscal_cliente
      ADD CONSTRAINT beneficio_fiscal_cliente_catalogo_id_fkey
      FOREIGN KEY (catalogo_id) REFERENCES beneficio_fiscal_catalogo(id) ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;
