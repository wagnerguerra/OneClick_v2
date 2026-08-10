-- Subserviços do catálogo comercial.
--
-- "Serviço Extra Legalização" passa a ter COMPETE, INVEST, Renovação como
-- filhos — e cada um deles continua sendo um serviço inteiro, que entra
-- sozinho num orçamento e tem as próprias variações.
--
-- Tabela à parte, e não a coluna servicos.servico_pai_id: aquela já significa
-- item interno do fluxo de trabalho, apaga o filho junto com o pai e admite um
-- pai só. Aqui o filho sobrevive ao pai e pode ter vários.
--
-- Idempotente: pode rodar de novo sem efeito.

CREATE TABLE IF NOT EXISTS servico_subservicos (
  pai_id     TEXT NOT NULL,
  filho_id   TEXT NOT NULL,
  ordem      INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT servico_subservicos_pkey PRIMARY KEY (pai_id, filho_id)
);

-- Cascade nos dois lados apaga o VÍNCULO, nunca o outro serviço.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'servico_subservicos_pai_id_fkey'
  ) THEN
    ALTER TABLE servico_subservicos
      ADD CONSTRAINT servico_subservicos_pai_id_fkey
      FOREIGN KEY (pai_id) REFERENCES servicos(id) ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'servico_subservicos_filho_id_fkey'
  ) THEN
    ALTER TABLE servico_subservicos
      ADD CONSTRAINT servico_subservicos_filho_id_fkey
      FOREIGN KEY (filho_id) REFERENCES servicos(id) ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS servico_subservicos_filho_id_idx
  ON servico_subservicos (filho_id);

-- ── Item de orçamento guarda o subserviço escolhido ──
-- SetNull, e não Cascade: apagar um serviço do catálogo não pode levar junto o
-- item de um orçamento já enviado ao cliente.
--
-- O `IF NOT EXISTS` do ALTER evita o erro, mas NÃO evita o lock: o comando pede
-- acesso exclusivo à tabela mesmo quando não há o que alterar, e toda consulta a
-- orcamento_itens fica na fila atrás dele. Num deploy com o sistema no ar, isso
-- congelou a tela de orçamentos por dois minutos (10/08). Perguntando antes, o
-- caso normal — coluna já existente — não emite ALTER nenhum.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'orcamento_itens' AND column_name = 'subservico_id'
  ) THEN
    ALTER TABLE orcamento_itens ADD COLUMN subservico_id TEXT;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'orcamento_itens_subservico_id_fkey'
  ) THEN
    ALTER TABLE orcamento_itens
      ADD CONSTRAINT orcamento_itens_subservico_id_fkey
      FOREIGN KEY (subservico_id) REFERENCES servicos(id) ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS orcamento_itens_subservico_id_idx
  ON orcamento_itens (subservico_id);
