-- Histórico de PDFs assinados pela ferramenta de assinatura.
--
-- Serve para não reassinar o mesmo documento: a busca é pelo hash do arquivo
-- original, então renomear o PDF não engana a checagem.
--
-- Idempotente: pode rodar de novo sem efeito.

CREATE TABLE IF NOT EXISTS assinatura_pdf_historico (
  id             TEXT PRIMARY KEY,
  empresa_id     TEXT,
  usuario_id     TEXT NOT NULL,
  nome           TEXT NOT NULL,
  hash_original  TEXT NOT NULL,
  arquivo_path   TEXT NOT NULL,
  bytes          INTEGER NOT NULL,
  titular        TEXT NOT NULL,
  certificado_id TEXT NOT NULL,
  pades_level    TEXT NOT NULL,
  criado_em      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Listagem da tela: as assinaturas de quem está olhando, mais recentes antes.
CREATE INDEX IF NOT EXISTS assinatura_pdf_historico_dono_idx
  ON assinatura_pdf_historico (empresa_id, usuario_id, criado_em);

-- Reconhecer o documento que chega arrastado.
CREATE INDEX IF NOT EXISTS assinatura_pdf_historico_hash_idx
  ON assinatura_pdf_historico (hash_original);
