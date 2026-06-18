-- Biblioteca curada de modelos de proposta (texto p/ cliente) — alimenta o
-- assistente de IA do orçamento. Gerida nas Configurações de Orçamentos.
-- Idempotente.
CREATE TABLE IF NOT EXISTS orcamento_proposta_modelo (
  id          text PRIMARY KEY,
  titulo      text NOT NULL,
  conteudo    text NOT NULL,
  tipo        text,            -- SERVICO_MENSAL | SERVICO_EXTRA | null (qualquer)
  segmento    text,            -- segmento/observação opcional
  ativo       boolean NOT NULL DEFAULT true,
  ordem       integer NOT NULL DEFAULT 0,
  empresa_id  text,
  created_by  text,
  created_at  timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS orcamento_proposta_modelo_emp_idx ON orcamento_proposta_modelo (empresa_id, ativo, ordem);
