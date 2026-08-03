-- Vínculos entre o Acessórias e o nosso cadastro, e os IDs de origem no espelho.
--
-- O espelho guardava o responsável e o departamento apenas como TEXTO, e os
-- nomes divergem entre as bases ("Millian de Souza" lá, "Millian Souza" aqui).
-- O Acessórias devolve os identificadores junto dos nomes (Config.RespPrazoID,
-- RespEntregaID, DptoID) e nós os descartávamos: passam a ser espelhados, para
-- que o vínculo se apoie no ID e não na grafia do nome.
--
-- Idempotente: pode rodar quantas vezes for preciso.

-- ── IDs de origem no espelho de entregas ──
ALTER TABLE acessorias_entregas ADD COLUMN IF NOT EXISTS resp_prazo_id   TEXT;
ALTER TABLE acessorias_entregas ADD COLUMN IF NOT EXISTS resp_entrega_id TEXT;
ALTER TABLE acessorias_entregas ADD COLUMN IF NOT EXISTS dpto_id         TEXT;

CREATE INDEX IF NOT EXISTS acessorias_entregas_resp_prazo_id_idx ON acessorias_entregas (resp_prazo_id);
CREATE INDEX IF NOT EXISTS acessorias_entregas_dpto_id_idx       ON acessorias_entregas (dpto_id);

-- ── Colaborador do Acessórias ↔ usuário do OneClick ──
CREATE TABLE IF NOT EXISTS acessorias_colaboradores (
  id            TEXT PRIMARY KEY,
  empresa_id    TEXT,
  -- Identificador da pessoa no Acessórias. Só existe depois de uma
  -- sincronização com os IDs; o nome cobre o período de transição.
  acessorias_id TEXT,
  nome          TEXT NOT NULL,
  user_id       TEXT REFERENCES users(id) ON DELETE SET NULL,
  -- AUTO = casado por proximidade de nome; MANUAL = alguém corrigiu à mão.
  -- A rotina automática nunca sobrescreve MANUAL.
  origem        TEXT NOT NULL DEFAULT 'AUTO',
  created_at    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- NULL não colide com NULL em UNIQUE, então cada caso de empresa_id vira um
-- índice parcial próprio.
CREATE UNIQUE INDEX IF NOT EXISTS acessorias_colab_nome_empresa_uk
  ON acessorias_colaboradores (empresa_id, lower(nome)) WHERE empresa_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS acessorias_colab_nome_global_uk
  ON acessorias_colaboradores (lower(nome)) WHERE empresa_id IS NULL;
CREATE INDEX IF NOT EXISTS acessorias_colab_user_idx ON acessorias_colaboradores (user_id);

-- ── Departamento do Acessórias ↔ área do OneClick ──
CREATE TABLE IF NOT EXISTS acessorias_departamentos (
  id            TEXT PRIMARY KEY,
  empresa_id    TEXT,
  acessorias_id TEXT,
  nome          TEXT NOT NULL,
  area_id       TEXT REFERENCES areas(id) ON DELETE SET NULL,
  origem        TEXT NOT NULL DEFAULT 'AUTO',
  created_at    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS acessorias_dpto_nome_empresa_uk
  ON acessorias_departamentos (empresa_id, lower(nome)) WHERE empresa_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS acessorias_dpto_nome_global_uk
  ON acessorias_departamentos (lower(nome)) WHERE empresa_id IS NULL;
CREATE INDEX IF NOT EXISTS acessorias_dpto_area_idx ON acessorias_departamentos (area_id);
