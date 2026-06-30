-- Migração manual: escopo por tenant das execuções de scheduler (ISO-003, parte 2).
-- Aplicada em 2026-06-26. Idempotente. NÃO toca em drift histórico de outras tabelas.
--
-- scheduler_executions (nfe-dist/nfse-dist) não tinha empresa_id — getStatus/
-- listExecucoes/getExecucao (readProcedure, não-master) retornavam `detalhes` com
-- razão social de clientes de outro tenant. Adiciona empresa_id e atribui as linhas
-- existentes à empresa "home" (mais antiga — mesma do cron/resolverEmpresaId).

ALTER TABLE scheduler_executions ADD COLUMN IF NOT EXISTS empresa_id TEXT;

-- Execuções nfe-dist/nfse-dist existentes pertencem à home (único tenant com dados).
-- google-backup e outras de plataforma permanecem NULL (não são lidas por tenant).
UPDATE scheduler_executions
   SET empresa_id = (SELECT id FROM empresas ORDER BY created_at ASC LIMIT 1)
 WHERE empresa_id IS NULL
   AND scheduler IN ('nfe-dist', 'nfse-dist');

CREATE INDEX IF NOT EXISTS idx_sched_exec_scheduler_empresa
  ON scheduler_executions (scheduler, empresa_id, iniciado_em DESC);
