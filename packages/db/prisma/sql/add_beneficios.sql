-- Módulo Benefícios (Trabalhista): controle de VT / VA / Mobilidade. Idempotente.

CREATE TABLE IF NOT EXISTS beneficio_config (
  id                     text PRIMARY KEY,
  empresa_id             text NOT NULL,
  diaria_va              numeric(10,2) NOT NULL DEFAULT 0,
  diaria_vt              numeric(10,2) NOT NULL DEFAULT 10.20,
  vt_dias_desconto_saldo integer NOT NULL DEFAULT 7,
  ativo                  boolean NOT NULL DEFAULT true,
  created_at             timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at             timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS beneficio_config_empresa_key ON beneficio_config (empresa_id);
ALTER TABLE beneficio_config ADD COLUMN IF NOT EXISTS notificar_auto boolean NOT NULL DEFAULT false;
ALTER TABLE beneficio_config ADD COLUMN IF NOT EXISTS dia_notificacao integer;
ALTER TABLE beneficio_config ADD COLUMN IF NOT EXISTS dia_cobranca integer;

CREATE TABLE IF NOT EXISTS beneficio_colaborador (
  id                text PRIMARY KEY,
  colaborador_id    text NOT NULL,
  empresa_id        text,
  recebe_va         boolean NOT NULL DEFAULT true,
  recebe_vt         boolean NOT NULL DEFAULT false,
  recebe_mobilidade boolean NOT NULL DEFAULT false,
  valor_mobilidade  numeric(10,2) NOT NULL DEFAULT 0,
  observacao        text,
  ativo             boolean NOT NULL DEFAULT true,
  created_at        timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS beneficio_colaborador_colab_key ON beneficio_colaborador (colaborador_id);
CREATE INDEX IF NOT EXISTS beneficio_colaborador_emp_idx ON beneficio_colaborador (empresa_id);

CREATE TABLE IF NOT EXISTS beneficio_competencia (
  id                     text PRIMARY KEY,
  empresa_id             text NOT NULL,
  ano                    integer NOT NULL,
  mes                    integer NOT NULL,
  dias_uteis             integer NOT NULL,
  diaria_va              numeric(10,2) NOT NULL,
  diaria_vt              numeric(10,2) NOT NULL,
  vt_dias_desconto_saldo integer NOT NULL DEFAULT 7,
  status                 text NOT NULL DEFAULT 'ABERTA', -- ABERTA | EM_APONTAMENTO | FECHADA
  aberto_por_id          text,
  fechado_por_id         text,
  fechado_em             timestamp(3),
  created_at             timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at             timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS beneficio_competencia_emp_mes_key ON beneficio_competencia (empresa_id, ano, mes);

CREATE TABLE IF NOT EXISTS beneficio_apontamento (
  id              text PRIMARY KEY,
  competencia_id  text NOT NULL,
  colaborador_id  text NOT NULL,
  dias_ferias     integer NOT NULL DEFAULT 0,
  dias_licenca    integer NOT NULL DEFAULT 0,
  dias_ausencia   integer NOT NULL DEFAULT 0,
  faltas          integer NOT NULL DEFAULT 0,
  plantoes        integer NOT NULL DEFAULT 0,
  vt_saldo_cartao numeric(10,2) NOT NULL DEFAULT 0,
  observacao      text,
  lancado_por_id  text,
  lancado_em      timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS beneficio_apontamento_comp_colab_key ON beneficio_apontamento (competencia_id, colaborador_id);
CREATE INDEX IF NOT EXISTS beneficio_apontamento_comp_idx ON beneficio_apontamento (competencia_id);

CREATE TABLE IF NOT EXISTS beneficio_recarga (
  id               text PRIMARY KEY,
  competencia_id   text NOT NULL,
  colaborador_id   text NOT NULL,
  valor_va         numeric(10,2) NOT NULL DEFAULT 0,
  valor_vt         numeric(10,2) NOT NULL DEFAULT 0,
  valor_mobilidade numeric(10,2) NOT NULL DEFAULT 0,
  total            numeric(10,2) NOT NULL DEFAULT 0,
  breakdown        jsonb,
  gerado_em        timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS beneficio_recarga_comp_colab_key ON beneficio_recarga (competencia_id, colaborador_id);
CREATE INDEX IF NOT EXISTS beneficio_recarga_comp_idx ON beneficio_recarga (competencia_id);

CREATE TABLE IF NOT EXISTS beneficio_cartao_avulso (
  id               text PRIMARY KEY,
  empresa_id       text NOT NULL,
  nome             text NOT NULL,
  valor_va         numeric(10,2) NOT NULL DEFAULT 0,
  valor_vt         numeric(10,2) NOT NULL DEFAULT 0,
  valor_mobilidade numeric(10,2) NOT NULL DEFAULT 0,
  ativo            boolean NOT NULL DEFAULT true,
  created_at       timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS beneficio_cartao_avulso_emp_idx ON beneficio_cartao_avulso (empresa_id);

-- FKs (cascade) — só cria se ainda não existir.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'beneficio_apontamento_competencia_fkey') THEN
    ALTER TABLE beneficio_apontamento ADD CONSTRAINT beneficio_apontamento_competencia_fkey FOREIGN KEY (competencia_id) REFERENCES beneficio_competencia(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'beneficio_recarga_competencia_fkey') THEN
    ALTER TABLE beneficio_recarga ADD CONSTRAINT beneficio_recarga_competencia_fkey FOREIGN KEY (competencia_id) REFERENCES beneficio_competencia(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Script idempotente — seguro reaplicar a cada deploy (CREATE/ALTER IF NOT EXISTS).
