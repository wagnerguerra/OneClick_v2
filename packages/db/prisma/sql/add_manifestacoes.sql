-- Qualidade: Elogios, Reclamações e Sugestões.
--
-- Uma tabela só, com `tipo`: os três são a mesma coisa por baixo — alguém
-- relata, a Qualidade tria, trata e encerra. No menu são três módulos, com três
-- permissões.
--
-- Anônima NÃO guarda autor: `autor_id` fica nulo, sem exceção. Quem acompanha o
-- registro é o `protocolo`, que a pessoa leva embora.
--
-- Idempotente: pode rodar de novo sem efeito.

CREATE TABLE IF NOT EXISTS manifestacoes (
  id                  TEXT PRIMARY KEY,
  empresa_id          TEXT,
  protocolo           TEXT NOT NULL,
  tipo                TEXT NOT NULL,
  origem              TEXT NOT NULL DEFAULT 'INTERNA',
  anonima             BOOLEAN NOT NULL DEFAULT FALSE,
  autor_id            TEXT,
  cliente_id          TEXT,
  informante_nome     TEXT,
  informante_email    TEXT,
  informante_telefone TEXT,
  canal               TEXT,
  area_id             TEXT,
  elogiados_ids       TEXT[] NOT NULL DEFAULT '{}',
  titulo              TEXT,
  descricao           TEXT NOT NULL,
  data_ocorrido       DATE,
  status              TEXT NOT NULL DEFAULT 'RECEBIDA',
  prazo_retorno       TIMESTAMP(3),
  publica             BOOLEAN NOT NULL DEFAULT FALSE,
  retorno_cliente     TEXT,
  retorno_em          TIMESTAMP(3),
  retorno_por_id      TEXT,
  procede             BOOLEAN,
  causa_descricao     TEXT,
  justificativa       TEXT,
  retorno_final       TEXT,
  resposta            TEXT,
  respondido_em       TIMESTAMP(3),
  respondido_por_id   TEXT,
  encerrado_em        TIMESTAMP(3),
  encerrado_por_id    TEXT,
  criado_em           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS manifestacoes_protocolo_key ON manifestacoes (protocolo);
CREATE INDEX IF NOT EXISTS manifestacoes_tipo_status_idx ON manifestacoes (empresa_id, tipo, status);
CREATE INDEX IF NOT EXISTS manifestacoes_tipo_criado_idx ON manifestacoes (empresa_id, tipo, criado_em);
CREATE INDEX IF NOT EXISTS manifestacoes_autor_idx        ON manifestacoes (autor_id);

CREATE TABLE IF NOT EXISTS manifestacao_mensagens (
  id              TEXT PRIMARY KEY,
  manifestacao_id TEXT NOT NULL,
  autor_id        TEXT,
  texto           TEXT NOT NULL,
  interna         BOOLEAN NOT NULL DEFAULT TRUE,
  criado_em       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS manifestacao_mensagens_reg_idx ON manifestacao_mensagens (manifestacao_id);

CREATE TABLE IF NOT EXISTS manifestacao_arquivos (
  id              TEXT PRIMARY KEY,
  manifestacao_id TEXT NOT NULL,
  autor_id        TEXT,
  nome            TEXT NOT NULL,
  arquivo_path    TEXT NOT NULL,
  mime            TEXT,
  bytes           INTEGER,
  criado_em       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS manifestacao_arquivos_reg_idx ON manifestacao_arquivos (manifestacao_id);

CREATE TABLE IF NOT EXISTS manifestacao_logs (
  id              TEXT PRIMARY KEY,
  manifestacao_id TEXT NOT NULL,
  usuario_id      TEXT,
  evento          TEXT NOT NULL,
  detalhe         TEXT,
  criado_em       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS manifestacao_logs_reg_idx ON manifestacao_logs (manifestacao_id);

-- ── Chaves estrangeiras ──
-- Autor, cliente e área saem para NULL quando apagados: a manifestação é
-- registro de auditoria e não pode sumir junto com um cadastro. As satélites,
-- ao contrário, morrem com o registro a que pertencem.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'manifestacoes_autor_id_fkey') THEN
    ALTER TABLE manifestacoes ADD CONSTRAINT manifestacoes_autor_id_fkey
      FOREIGN KEY (autor_id) REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'manifestacoes_cliente_id_fkey') THEN
    ALTER TABLE manifestacoes ADD CONSTRAINT manifestacoes_cliente_id_fkey
      FOREIGN KEY (cliente_id) REFERENCES clientes(id) ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'manifestacoes_area_id_fkey') THEN
    ALTER TABLE manifestacoes ADD CONSTRAINT manifestacoes_area_id_fkey
      FOREIGN KEY (area_id) REFERENCES areas(id) ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'manifestacao_mensagens_reg_fkey') THEN
    ALTER TABLE manifestacao_mensagens ADD CONSTRAINT manifestacao_mensagens_reg_fkey
      FOREIGN KEY (manifestacao_id) REFERENCES manifestacoes(id) ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'manifestacao_arquivos_reg_fkey') THEN
    ALTER TABLE manifestacao_arquivos ADD CONSTRAINT manifestacao_arquivos_reg_fkey
      FOREIGN KEY (manifestacao_id) REFERENCES manifestacoes(id) ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'manifestacao_logs_reg_fkey') THEN
    ALTER TABLE manifestacao_logs ADD CONSTRAINT manifestacao_logs_reg_fkey
      FOREIGN KEY (manifestacao_id) REFERENCES manifestacoes(id) ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- Convergência (19/08): colunas de rastreio do legado para a carga do v1
-- (elo/rec/sug têm ids que colidem entre si — o par source+id identifica).
ALTER TABLE "manifestacoes" ADD COLUMN IF NOT EXISTS "legacy_source" TEXT;
ALTER TABLE "manifestacoes" ADD COLUMN IF NOT EXISTS "legacy_id" INTEGER;
ALTER TABLE "manifestacoes" ADD COLUMN IF NOT EXISTS "elogiados_texto" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "manifestacoes_legacy_source_legacy_id_key"
  ON "manifestacoes" ("legacy_source", "legacy_id");

-- Default de atualizado_em (lição de 18/08, §3.3 do runbook): o @updatedAt é
-- do cliente Prisma; em produção a tabela nasceu do db push SEM default e o
-- INSERT cru da carga quebrava.
ALTER TABLE "manifestacoes"           ALTER COLUMN "atualizado_em" SET DEFAULT CURRENT_TIMESTAMP;
