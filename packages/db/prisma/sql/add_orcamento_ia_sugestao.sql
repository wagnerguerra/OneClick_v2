-- Sugestões (ações rápidas) do assistente de IA do orçamento — os "chips"
-- editáveis nas Configurações de Orçamentos. `label` = texto do botão; `prompt`
-- = instrução enviada à IA ao clicar. Por empresa (empresa_id NULL = global).
-- Idempotente.
CREATE TABLE IF NOT EXISTS orcamento_ia_sugestao (
  id          text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  label       text NOT NULL,
  prompt      text NOT NULL,
  ordem       integer NOT NULL DEFAULT 0,
  empresa_id  text,
  created_at  timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS orcamento_ia_sugestao_emp_idx ON orcamento_ia_sugestao (empresa_id, ordem);
