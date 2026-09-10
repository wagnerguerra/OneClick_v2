-- ============================================================================
-- Portal do Cliente — Fase 1: porta-arquivos e solicitações.
--
-- `prisma db push` roda ANTES destes arquivos no deploy, então as colunas e a
-- tabela já vão existir. Os IF NOT EXISTS são para a instalação que aplicar o
-- SQL sem o push, e para rodar duas vezes sem quebrar.
--
-- ATENÇÃO ao `visivel_para_cliente`: o DEFAULT é FALSE, e é a decisão mais
-- importante deste arquivo. `cliente_arquivos` já guarda milhares de arquivos
-- INTERNOS — contratos, documentos de análise, coisas que o escritório guardou
-- SOBRE o cliente e não PARA ele. Um default true publicaria tudo isso de uma
-- vez, no instante do deploy, para todo cliente com acesso ao portal.
-- ============================================================================

-- ── Solicitações (o escritório pede um documento) ───────────────────────────
CREATE TABLE IF NOT EXISTS portal_solicitacoes (
  id            text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  cliente_id    text NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  titulo        text NOT NULL,
  descricao     text,
  competencia   varchar(6),
  categoria     text,
  prazo         timestamp(3),
  situacao      text NOT NULL DEFAULT 'PENDENTE',
  atendida_em   timestamp(3),
  atendida_por  text,
  criada_por_id text,
  criada_em     timestamp(3) NOT NULL DEFAULT NOW(),
  atualizada_em timestamp(3) NOT NULL DEFAULT NOW()
);

-- A consulta do portal e a do escritório partem das duas da mesma forma:
-- "o que está pendente para este cliente".
CREATE INDEX IF NOT EXISTS portal_solicitacoes_cliente_id_situacao_idx
  ON portal_solicitacoes (cliente_id, situacao);

-- ── Porta-arquivos sobre `cliente_arquivos` ─────────────────────────────────
ALTER TABLE cliente_arquivos ADD COLUMN IF NOT EXISTS competencia          varchar(6);
ALTER TABLE cliente_arquivos ADD COLUMN IF NOT EXISTS categoria            text;
ALTER TABLE cliente_arquivos ADD COLUMN IF NOT EXISTS origem               text NOT NULL DEFAULT 'ESCRITORIO';
ALTER TABLE cliente_arquivos ADD COLUMN IF NOT EXISTS visivel_para_cliente boolean NOT NULL DEFAULT false;
ALTER TABLE cliente_arquivos ADD COLUMN IF NOT EXISTS lido_em              timestamp(3);
ALTER TABLE cliente_arquivos ADD COLUMN IF NOT EXISTS lido_por_id          text;
ALTER TABLE cliente_arquivos ADD COLUMN IF NOT EXISTS solicitacao_id       text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'cliente_arquivos_solicitacao_id_fkey'
  ) THEN
    ALTER TABLE cliente_arquivos
      ADD CONSTRAINT cliente_arquivos_solicitacao_id_fkey
      FOREIGN KEY (solicitacao_id) REFERENCES portal_solicitacoes(id) ON DELETE SET NULL;
  END IF;
END $$;

-- O portal lista sempre por cliente + competência (a pasta do mês).
CREATE INDEX IF NOT EXISTS cliente_arquivos_cliente_id_competencia_idx
  ON cliente_arquivos (cliente_id, competencia);
CREATE INDEX IF NOT EXISTS cliente_arquivos_solicitacao_id_idx
  ON cliente_arquivos (solicitacao_id);

-- ── Pastas do porta-arquivos (modelo Drive) ─────────────────────────────────
-- A Fase 1 nasceu com a competência fazendo as vezes de pasta. Funcionava para
-- guia mensal e não para o resto: o cliente quer "Contratos" e "Societário", e
-- essas não têm mês. `competencia` e `categoria` continuam na linha do arquivo,
-- mas como ATRIBUTO — a categoria é quem decide o recorte por área.
CREATE TABLE IF NOT EXISTS portal_pastas (
  id            text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  cliente_id    text NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  nome          text NOT NULL,
  pai_id        text REFERENCES portal_pastas(id) ON DELETE CASCADE,
  origem        text NOT NULL DEFAULT 'ESCRITORIO',
  criada_por_id text,
  criada_em     timestamp(3) NOT NULL DEFAULT NOW()
);

-- Duas pastas de mesmo nome lado a lado é o que faz o cliente criar "Notas"
-- três vezes sem perceber. O índice é parcial porque no Postgres NULL nunca é
-- igual a NULL: sem a segunda variante, a raiz não seria protegida.
CREATE UNIQUE INDEX IF NOT EXISTS portal_pastas_nome_no_pai_key
  ON portal_pastas (cliente_id, pai_id, nome) WHERE pai_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS portal_pastas_nome_na_raiz_key
  ON portal_pastas (cliente_id, nome) WHERE pai_id IS NULL;

CREATE INDEX IF NOT EXISTS portal_pastas_cliente_id_pai_id_idx ON portal_pastas (cliente_id, pai_id);

ALTER TABLE cliente_arquivos ADD COLUMN IF NOT EXISTS pasta_id text;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cliente_arquivos_pasta_id_fkey') THEN
    ALTER TABLE cliente_arquivos
      ADD CONSTRAINT cliente_arquivos_pasta_id_fkey
      FOREIGN KEY (pasta_id) REFERENCES portal_pastas(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS cliente_arquivos_cliente_id_pasta_id_idx ON cliente_arquivos (cliente_id, pasta_id);
