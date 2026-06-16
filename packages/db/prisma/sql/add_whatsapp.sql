-- Módulo WhatsApp (estilo Digisac) — Comercial. Idempotente.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'WhatsappConversaStatus') THEN
    CREATE TYPE "WhatsappConversaStatus" AS ENUM ('ABERTA','PENDENTE','RESOLVIDA','FECHADA');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS whatsapp_numeros (
  id text PRIMARY KEY,
  phone_number_id text NOT NULL,
  waba_id text,
  display_name text,
  numero text,
  ativo boolean NOT NULL DEFAULT true,
  empresa_id text,
  created_at timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS whatsapp_numeros_empresa_ativo_idx ON whatsapp_numeros (empresa_id, ativo);

CREATE TABLE IF NOT EXISTS whatsapp_setores (
  id text PRIMARY KEY,
  nome text NOT NULL,
  cor text NOT NULL DEFAULT '#22c55e',
  horario jsonb,
  msg_fora_horario text,
  bot_ativo boolean NOT NULL DEFAULT true,
  ativo boolean NOT NULL DEFAULT true,
  ordem integer NOT NULL DEFAULT 0,
  empresa_id text,
  created_at timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS whatsapp_setores_empresa_ativo_idx ON whatsapp_setores (empresa_id, ativo);

CREATE TABLE IF NOT EXISTS whatsapp_setor_agentes (
  id text PRIMARY KEY,
  setor_id text NOT NULL,
  usuario_id text NOT NULL,
  created_at timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_setor_agentes_setor_usuario_key ON whatsapp_setor_agentes (setor_id, usuario_id);
CREATE INDEX IF NOT EXISTS whatsapp_setor_agentes_usuario_idx ON whatsapp_setor_agentes (usuario_id);

CREATE TABLE IF NOT EXISTS whatsapp_contatos (
  id text PRIMARY KEY,
  wa_id text NOT NULL,
  telefone text,
  nome text,
  foto_url text,
  cliente_id text,
  tags text[] NOT NULL DEFAULT '{}',
  bloqueado boolean NOT NULL DEFAULT false,
  empresa_id text,
  created_at timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_contatos_empresa_waid_key ON whatsapp_contatos (empresa_id, wa_id);
CREATE INDEX IF NOT EXISTS whatsapp_contatos_cliente_idx ON whatsapp_contatos (cliente_id);

CREATE TABLE IF NOT EXISTS whatsapp_conversas (
  id text PRIMARY KEY,
  contato_id text NOT NULL,
  numero_id text,
  setor_id text,
  responsavel_id text,
  status "WhatsappConversaStatus" NOT NULL DEFAULT 'ABERTA',
  na_fila boolean NOT NULL DEFAULT true,
  bot_pausado boolean NOT NULL DEFAULT false,
  nao_lidas integer NOT NULL DEFAULT 0,
  ultima_mensagem_em timestamp(3),
  janela_24h_expira_em timestamp(3),
  empresa_id text,
  created_at timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS whatsapp_conversas_empresa_status_idx ON whatsapp_conversas (empresa_id, status, ultima_mensagem_em);
CREATE INDEX IF NOT EXISTS whatsapp_conversas_setor_idx ON whatsapp_conversas (setor_id);
CREATE INDEX IF NOT EXISTS whatsapp_conversas_responsavel_idx ON whatsapp_conversas (responsavel_id);
CREATE INDEX IF NOT EXISTS whatsapp_conversas_contato_idx ON whatsapp_conversas (contato_id);

CREATE TABLE IF NOT EXISTS whatsapp_mensagens (
  id text PRIMARY KEY,
  conversa_id text NOT NULL,
  direcao text NOT NULL,
  autor_id text,
  por_bot boolean NOT NULL DEFAULT false,
  tipo text NOT NULL DEFAULT 'texto',
  conteudo text,
  midia_url text,
  wa_message_id text,
  status text NOT NULL DEFAULT 'enviado',
  interna boolean NOT NULL DEFAULT false,
  created_at timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS whatsapp_mensagens_conversa_idx ON whatsapp_mensagens (conversa_id, created_at);
CREATE INDEX IF NOT EXISTS whatsapp_mensagens_wamid_idx ON whatsapp_mensagens (wa_message_id);

CREATE TABLE IF NOT EXISTS whatsapp_templates (
  id text PRIMARY KEY,
  nome text NOT NULL,
  categoria text NOT NULL DEFAULT 'utility',
  idioma text NOT NULL DEFAULT 'pt_BR',
  corpo text NOT NULL,
  status text NOT NULL DEFAULT 'PENDENTE',
  empresa_id text,
  created_at timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS whatsapp_templates_empresa_idx ON whatsapp_templates (empresa_id);

CREATE TABLE IF NOT EXISTS whatsapp_respostas_rapidas (
  id text PRIMARY KEY,
  titulo text NOT NULL,
  atalho text,
  conteudo text NOT NULL,
  setor_id text,
  empresa_id text,
  created_at timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS whatsapp_respostas_rapidas_empresa_idx ON whatsapp_respostas_rapidas (empresa_id);

-- FKs (não-destrutivas)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'whatsapp_conversas_contato_id_fkey') THEN
    ALTER TABLE whatsapp_conversas ADD CONSTRAINT whatsapp_conversas_contato_id_fkey
      FOREIGN KEY (contato_id) REFERENCES whatsapp_contatos(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'whatsapp_mensagens_conversa_id_fkey') THEN
    ALTER TABLE whatsapp_mensagens ADD CONSTRAINT whatsapp_mensagens_conversa_id_fkey
      FOREIGN KEY (conversa_id) REFERENCES whatsapp_conversas(id) ON DELETE CASCADE;
  END IF;
END $$;
