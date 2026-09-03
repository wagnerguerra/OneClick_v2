-- Curtidas nas novidades do painel.
--
-- Um registro por (novidade, usuario): quem garante "uma curtida por pessoa" e
-- o UNIQUE, nao a tela. Descurtir e apagar a linha.
--
-- ON DELETE CASCADE na novidade: apagada a novidade, as curtidas dela nao tem
-- mais sentido. O usuario NAO tem FK (id solto, como no resto do modulo), para
-- nao travar a exclusao de um usuario por causa de uma curtida.

CREATE TABLE IF NOT EXISTS novidade_reacoes (
  id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  novidade_id TEXT NOT NULL REFERENCES novidades(id) ON DELETE CASCADE,
  user_id     TEXT NOT NULL,
  created_at  TIMESTAMP(3) NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS novidade_reacoes_novidade_user_key
  ON novidade_reacoes (novidade_id, user_id);

CREATE INDEX IF NOT EXISTS novidade_reacoes_novidade_idx
  ON novidade_reacoes (novidade_id);
