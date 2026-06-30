-- Migração manual: escopo por tenant do domínio de AGENDAMENTO (ISO-003).
-- Aplicada em 2026-06-26. Idempotente. NÃO toca em drift histórico de outras tabelas.
--
-- Vazamento cross-tenant P0 (ISO-003): os schedulers (cnd.schedule, caixaPostal.schedule)
-- guardavam config/lastRun/lastResult/progress como chaves GLOBAIS em system_config e
-- o log de execução (caixa_postal_exec_log) não tinha empresa_id — qualquer sessão lia
-- os dados (com razões sociais) de outro tenant. O código passou a:
--   * namespear as chaves por empresa: `<BASE>:<empresaId>`;
--   * escopar o exec_log por empresa_id.
-- Esta migração preserva os dados atuais sem regressão, atribuindo-os à empresa "home"
-- (a mais antiga — mesma que resolverEmpresaId/o cron usam).

-- ── 1) caixa_postal_exec_log: coluna empresa_id + backfill ───
CREATE TABLE IF NOT EXISTS caixa_postal_exec_log (
  id TEXT PRIMARY KEY,
  tipo TEXT NOT NULL DEFAULT 'manual',
  iniciado_por TEXT,
  nome_usuario TEXT,
  iniciado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finalizado_em TIMESTAMPTZ,
  total INT NOT NULL DEFAULT 0,
  sucesso INT NOT NULL DEFAULT 0,
  falhas INT NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'running',
  itens JSONB NOT NULL DEFAULT '[]'::jsonb,
  empresa_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE caixa_postal_exec_log ADD COLUMN IF NOT EXISTS empresa_id TEXT;

-- Logs existentes pertencem à empresa home (único tenant que rodou até aqui).
UPDATE caixa_postal_exec_log
   SET empresa_id = (SELECT id FROM empresas ORDER BY created_at ASC LIMIT 1)
 WHERE empresa_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_cp_execlog_empresa ON caixa_postal_exec_log (empresa_id);

-- ── 2) system_config: namespear chaves globais de agendamento ─
-- Move CND_SCHEDULE_* e CAIXA_POSTAL_SCHEDULE_* (globais) para `<key>:<homeId>`,
-- preservando os valores atuais (senão o cron de produção reiniciaria zerado).
DO $$
DECLARE
  home_id TEXT;
  r RECORD;
BEGIN
  SELECT id INTO home_id FROM empresas ORDER BY created_at ASC LIMIT 1;
  IF home_id IS NULL THEN RETURN; END IF;

  FOR r IN
    SELECT key, value FROM system_config
     WHERE (key LIKE 'CND_SCHEDULE_%' OR key LIKE 'CAIXA_POSTAL_SCHEDULE_%')
       AND position(':' in key) = 0  -- só chaves AINDA globais (idempotente)
  LOOP
    INSERT INTO system_config (id, key, value, updated_at)
      VALUES (r.key || ':' || home_id, r.key || ':' || home_id, r.value, NOW())
      ON CONFLICT (key) DO NOTHING;
    DELETE FROM system_config WHERE key = r.key;
  END LOOP;
END $$;
