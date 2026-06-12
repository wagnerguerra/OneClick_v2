-- FAQ editável pelo master.
-- Artigos gerenciáveis que SOBRESCREVEM os de código (em faq/_articles/<slug>.tsx)
-- quando existe uma linha com o mesmo slug. Idempotente.

CREATE TABLE IF NOT EXISTS faq_artigos (
  id             TEXT PRIMARY KEY,
  slug           TEXT NOT NULL UNIQUE,
  titulo         TEXT NOT NULL,
  descricao      TEXT NOT NULL DEFAULT '',
  modulo         TEXT NOT NULL,
  modulo_color   TEXT NOT NULL,
  icon           TEXT NOT NULL DEFAULT 'HelpCircle',
  categoria      TEXT NOT NULL,
  tags           TEXT[] NOT NULL DEFAULT '{}',
  conteudo_html  TEXT NOT NULL DEFAULT '',
  publicado      BOOLEAN NOT NULL DEFAULT true,
  ordem          INTEGER NOT NULL DEFAULT 0,
  origem_sistema BOOLEAN NOT NULL DEFAULT false,
  criado_por     TEXT,
  created_at     TIMESTAMP(3) NOT NULL DEFAULT now(),
  updated_at     TIMESTAMP(3) NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS faq_artigos_categoria_idx ON faq_artigos (categoria);
