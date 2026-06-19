-- Funil de captação de leads por IA (chat público → qualificação → CRM). Idempotente.
CREATE TABLE IF NOT EXISTS lead_funil_config (
  id                   text PRIMARY KEY,
  empresa_id           text,
  slug                 text NOT NULL,
  ativo                boolean NOT NULL DEFAULT true,
  trilha_prompt        text NOT NULL DEFAULT '',
  rubrica              text NOT NULL DEFAULT '',
  limiar_medio         integer NOT NULL DEFAULT 40,
  limiar_alto          integer NOT NULL DEFAULT 70,
  mensagem_boas_vindas text,
  aviso_lgpd           text,
  whatsapp_comercial   text,
  tipo_evento_reuniao_id text,
  created_at           timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at           timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS lead_funil_config_slug_key ON lead_funil_config (slug);
CREATE INDEX IF NOT EXISTS lead_funil_config_emp_idx ON lead_funil_config (empresa_id);

CREATE TABLE IF NOT EXISTS lead_sessao (
  id             text PRIMARY KEY,
  token          text NOT NULL,
  slug           text,
  origem         text,
  ip             text,
  status         text NOT NULL DEFAULT 'em_andamento', -- em_andamento | registrado | abandonado
  score          integer,
  temperatura    text,                                  -- frio | morno | quente
  dados          jsonb,
  oportunidade_id text,
  cliente_id     text,
  empresa_id     text,
  created_at     timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS lead_sessao_token_key ON lead_sessao (token);
CREATE INDEX IF NOT EXISTS lead_sessao_emp_idx ON lead_sessao (empresa_id, created_at);
CREATE INDEX IF NOT EXISTS lead_sessao_orc_idx ON lead_sessao (oportunidade_id);

CREATE TABLE IF NOT EXISTS lead_sessao_mensagem (
  id         text PRIMARY KEY,
  sessao_id  text NOT NULL,
  role       text NOT NULL, -- user | assistant
  conteudo   text NOT NULL,
  created_at timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS lead_sessao_mensagem_sessao_idx ON lead_sessao_mensagem (sessao_id);

-- Cor da marca do tenant aplicada no chat público.
ALTER TABLE lead_funil_config ADD COLUMN IF NOT EXISTS cor_primaria text;
-- Regras de finalização do chat (injetadas no prompt da IA).
ALTER TABLE lead_funil_config ADD COLUMN IF NOT EXISTS regras_finalizacao text;

-- Urgência por temperatura/pontuação na oportunidade (lead do funil).
ALTER TABLE oportunidades ADD COLUMN IF NOT EXISTS score integer;
ALTER TABLE oportunidades ADD COLUMN IF NOT EXISTS temperatura text;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'lead_sessao_mensagem_sessao_fkey') THEN
    ALTER TABLE lead_sessao_mensagem ADD CONSTRAINT lead_sessao_mensagem_sessao_fkey FOREIGN KEY (sessao_id) REFERENCES lead_sessao(id) ON DELETE CASCADE;
  END IF;
END $$;
