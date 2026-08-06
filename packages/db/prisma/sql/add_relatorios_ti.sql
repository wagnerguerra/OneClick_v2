-- Módulo "Relatórios da TI": rotina diária da equipe, consolidação em PDF,
-- envio à diretoria e as novidades curadas que alimentam o painel inicial.
--
-- Idempotente: pode rodar de novo sem efeito.

-- ── Relatório de cada colaborador ──
-- `data` é o DIA a que o relatório se refere, e não o instante em que foi
-- postado: lançar hoje o relatório de ontem é rotina.
CREATE TABLE IF NOT EXISTS relatorios_diarios (
  id            TEXT PRIMARY KEY,
  empresa_id    TEXT,
  autor_id      TEXT NOT NULL,
  data          DATE NOT NULL,
  titulo        TEXT NOT NULL,
  formato       TEXT NOT NULL,
  conteudo_html TEXT,
  arquivo_path  TEXT,
  arquivo_nome  TEXT,
  arquivo_mime  TEXT,
  arquivo_bytes INTEGER,
  criado_em     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS relatorios_diarios_empresa_data_idx ON relatorios_diarios (empresa_id, data);
CREATE INDEX IF NOT EXISTS relatorios_diarios_autor_data_idx   ON relatorios_diarios (autor_id, data);

-- ── Envios à diretoria ──
CREATE TABLE IF NOT EXISTS relatorios_envios (
  id             TEXT PRIMARY KEY,
  empresa_id     TEXT,
  data           DATE NOT NULL,
  assunto        TEXT NOT NULL,
  pdf_nome       TEXT NOT NULL,
  pdf_path       TEXT,
  destinatarios  TEXT[] NOT NULL DEFAULT '{}',
  relatorio_ids  TEXT[] NOT NULL DEFAULT '{}',
  enviado_por_id TEXT,
  enviado_em     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS relatorios_envios_empresa_data_idx ON relatorios_envios (empresa_id, data);

-- ── Novidades do painel inicial ──
CREATE TABLE IF NOT EXISTS novidades (
  id               TEXT PRIMARY KEY,
  empresa_id       TEXT,
  relatorio_id     TEXT,
  titulo           TEXT NOT NULL,
  descricao        TEXT,
  tipo             TEXT NOT NULL DEFAULT 'NOVO',
  modulo_slug      TEXT,
  ordem            INTEGER NOT NULL DEFAULT 0,
  ativo            BOOLEAN NOT NULL DEFAULT TRUE,
  publicado_em     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  publicado_por_id TEXT
);

CREATE INDEX IF NOT EXISTS novidades_empresa_ativo_publicado_idx ON novidades (empresa_id, ativo, publicado_em);

-- ── Configuração do módulo ──
CREATE TABLE IF NOT EXISTS relatorios_ti_config (
  id                   TEXT PRIMARY KEY,
  empresa_id           TEXT UNIQUE,
  area_id              TEXT,
  destinatarios_ids    TEXT[] NOT NULL DEFAULT '{}',
  destinatarios_emails TEXT[] NOT NULL DEFAULT '{}',
  assunto_padrao       TEXT,
  atualizado_em        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ── Chaves estrangeiras ──
-- Autor apagado leva os relatórios junto (Cascade); relatório apagado NÃO leva
-- a novidade (SetNull), que já foi lida por todo mundo no painel.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'relatorios_diarios_autor_id_fkey') THEN
    ALTER TABLE relatorios_diarios
      ADD CONSTRAINT relatorios_diarios_autor_id_fkey
      FOREIGN KEY (autor_id) REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'novidades_relatorio_id_fkey') THEN
    ALTER TABLE novidades
      ADD CONSTRAINT novidades_relatorio_id_fkey
      FOREIGN KEY (relatorio_id) REFERENCES relatorios_diarios(id) ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
