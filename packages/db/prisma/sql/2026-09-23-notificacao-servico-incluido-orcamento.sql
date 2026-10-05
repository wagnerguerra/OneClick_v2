-- Evento "Servico incluido ao orcamento" + destinatario "Lider da area".
--
-- Contexto: todo o motor de notificacoes nasceu ancorado na EXECUCAO —
-- disparar(execucaoId, evento) carrega uma ServicoExecucao, os destinatarios
-- saem dela (responsavel, gestor do processo, watchers) e o log de idempotencia
-- tem execucao_id NOT NULL.
--
-- Este evento acontece ANTES: o servico entrou num orcamento e ainda nao foi
-- vendido. Nao ha execucao, nao ha prazo e nao ha processo. Por isso o log
-- passa a aceitar as duas origens, uma de cada vez.
--
-- Idempotente e aditivo: nenhum dado e migrado, nenhuma coluna e removida.
-- Linhas existentes ficam com orcamento_item_id NULL, que e exatamente o
-- significado de "este log veio de uma execucao".

-- 1. Valores novos dos enums. IF NOT EXISTS evita erro ao reaplicar.
ALTER TYPE "NotificacaoEvento"       ADD VALUE IF NOT EXISTS 'SERVICO_INCLUIDO_ORCAMENTO';
ALTER TYPE "NotificacaoDestinatario" ADD VALUE IF NOT EXISTS 'LIDER_AREA';

-- 2. A origem do log deixa de ser obrigatoriamente uma execucao.
ALTER TABLE servico_notificacao_logs
  ALTER COLUMN execucao_id DROP NOT NULL;

ALTER TABLE servico_notificacao_logs
  ADD COLUMN IF NOT EXISTS orcamento_item_id TEXT;

-- 3. Idempotencia da nova origem. No Postgres NULL nao colide com NULL em
--    indice unico, entao esta chave so governa as linhas de orcamento, e a
--    chave antiga (regra, execucao, evento) segue governando as de execucao.
CREATE UNIQUE INDEX IF NOT EXISTS servico_notificacao_logs_regra_item_evento_key
  ON servico_notificacao_logs (regra_id, orcamento_item_id, evento);

CREATE INDEX IF NOT EXISTS servico_notificacao_logs_orcamento_item_id_idx
  ON servico_notificacao_logs (orcamento_item_id);
