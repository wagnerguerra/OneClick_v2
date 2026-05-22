CREATE TABLE IF NOT EXISTS nfse_importadas (
  id                   TEXT PRIMARY KEY,
  chave                TEXT UNIQUE,
  numero               TEXT NOT NULL,
  serie                TEXT,
  codigo_verificacao   TEXT,
  prestador_cnpj       TEXT NOT NULL,
  prestador_razao      TEXT NOT NULL,
  prestador_municipio  TEXT,
  tomador_cnpj_cpf     TEXT,
  tomador_razao        TEXT,
  valor_servicos       DECIMAL(14, 2) NOT NULL,
  valor_iss            DECIMAL(14, 2),
  valor_liquido        DECIMAL(14, 2),
  aliquota_iss         DECIMAL(7, 4),
  item_lista_servico   TEXT,
  cnae                 TEXT,
  discriminacao        TEXT,
  data_emissao         TIMESTAMP(3) NOT NULL,
  competencia          TIMESTAMP(3),
  status               TEXT NOT NULL DEFAULT 'EMITIDA',
  xml_key              TEXT NOT NULL,
  pdf_key              TEXT,
  padrao               TEXT NOT NULL DEFAULT 'NACIONAL',
  municipio            TEXT,
  cliente_id           TEXT,
  empresa_id           TEXT,
  uploaded_by_id       TEXT NOT NULL,
  created_at           TIMESTAMP(3) NOT NULL DEFAULT NOW(),

  CONSTRAINT nfse_importadas_cliente_fk FOREIGN KEY (cliente_id) REFERENCES clientes(id) ON DELETE SET NULL,
  CONSTRAINT nfse_importadas_user_fk    FOREIGN KEY (uploaded_by_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS nfse_importadas_prestador_cnpj_idx ON nfse_importadas (prestador_cnpj);
CREATE INDEX IF NOT EXISTS nfse_importadas_tomador_idx ON nfse_importadas (tomador_cnpj_cpf);
CREATE INDEX IF NOT EXISTS nfse_importadas_cliente_idx ON nfse_importadas (cliente_id);
CREATE INDEX IF NOT EXISTS nfse_importadas_emissao_idx ON nfse_importadas (data_emissao);
CREATE INDEX IF NOT EXISTS nfse_importadas_empresa_idx ON nfse_importadas (empresa_id);
