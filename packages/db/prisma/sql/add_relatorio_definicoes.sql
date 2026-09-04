-- Relatorios salvos do modulo Clientes.
--
-- Guarda a DEFINICAO (quais campos, quais filtros, que ordem), nunca o
-- resultado: o relatorio sempre roda contra os dados de agora. Guardar linhas
-- faria um relatorio de setembro continuar mostrando setembro em dezembro.
--
-- `origem` separa os dois tipos que moram aqui:
--   SISTEMA — semeados por deploy; aparecem para todos e nao se apagam pela
--             tela. "Editar" um deles cria uma copia com origem USUARIO.
--   USUARIO — criados por alguem, com dono em `criado_por`.
--
-- O relatorio montado na hora nao chega nesta tabela: vive na memoria da tela.

CREATE TABLE IF NOT EXISTS relatorio_definicoes (
  id           TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  empresa_id   TEXT,
  modulo       TEXT NOT NULL,
  nome         TEXT NOT NULL,
  descricao    TEXT,
  campos       TEXT[] NOT NULL DEFAULT '{}',
  filtros      JSONB  NOT NULL DEFAULT '{}'::jsonb,
  ordenacao    JSONB,
  origem       TEXT NOT NULL DEFAULT 'USUARIO',
  visibilidade TEXT NOT NULL DEFAULT 'PRIVADO',
  criado_por   TEXT,
  favorito_de  TEXT[] NOT NULL DEFAULT '{}',
  created_at   TIMESTAMP(3) NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMP(3) NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS relatorio_definicoes_empresa_modulo_idx
  ON relatorio_definicoes (empresa_id, modulo);
CREATE INDEX IF NOT EXISTS relatorio_definicoes_criado_por_idx
  ON relatorio_definicoes (criado_por);
