-- Modelo configurável do e-mail diário da agenda (paralelo ao HTML atual). Idempotente.
CREATE TABLE IF NOT EXISTS agenda_email_template (
  id                        text PRIMARY KEY,
  empresa_id                text,
  ativo                     boolean NOT NULL DEFAULT false,
  assunto                   text NOT NULL DEFAULT 'Agenda do dia · {{dataDisplay}}',
  accent                    text NOT NULL DEFAULT '#38bdf8',
  header_html               text NOT NULL DEFAULT '',
  intro_html                text NOT NULL DEFAULT '',
  footer_html               text NOT NULL DEFAULT '',
  evento_linha_html         text NOT NULL DEFAULT '',
  sem_eventos_html          text NOT NULL DEFAULT '',
  mostrar_outros            boolean NOT NULL DEFAULT true,
  nome_grupo_outros         text NOT NULL DEFAULT 'Outros',
  nome_grupo_particulares   text NOT NULL DEFAULT 'Compromissos pessoais',
  cor_particulares          text NOT NULL DEFAULT '#a855f7',
  created_at                timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at                timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS agenda_email_grupos (
  id                  text PRIMARY KEY,
  template_id         text NOT NULL,
  nome                text NOT NULL,
  cor                 text NOT NULL DEFAULT '#38bdf8',
  ordem               integer NOT NULL DEFAULT 0,
  inclui_particulares boolean NOT NULL DEFAULT false,
  tipos_ids           text[] NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS agenda_email_grupos_template_idx ON agenda_email_grupos (template_id);

ALTER TABLE agenda_email_template ADD COLUMN IF NOT EXISTS logo_url text NOT NULL DEFAULT '';
ALTER TABLE agenda_email_grupos ADD COLUMN IF NOT EXISTS icone text NOT NULL DEFAULT '';

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'agenda_email_grupos_template_id_fkey') THEN
    ALTER TABLE agenda_email_grupos ADD CONSTRAINT agenda_email_grupos_template_id_fkey
      FOREIGN KEY (template_id) REFERENCES agenda_email_template(id) ON DELETE CASCADE;
  END IF;
END $$;
