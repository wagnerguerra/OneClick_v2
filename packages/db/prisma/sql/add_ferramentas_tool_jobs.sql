-- Ferramentas (jobs das conversões fiscais/contábeis): tool_jobs + tool_job_eventos.
-- O model existe no schema.prisma (ToolJob/ToolJobEvent) e em TENANT_TABLES, mas o
-- `prisma db push` foi pulado nos deploys (detecção de schema via HEAD@{1} perdeu a
-- mudança quando o deploy do PR #2 falhou no lockfile depois do reset). Sem a tabela,
-- o Histórico das ferramentas quebra: "table public.tool_jobs does not exist".
-- Idempotente (CREATE ... IF NOT EXISTS) — pode rodar a cada deploy.

CREATE TABLE IF NOT EXISTS tool_jobs (
  id            text PRIMARY KEY,
  code          serial,
  tool          text NOT NULL,
  status        text NOT NULL DEFAULT 'queued',
  webapp_job_id text,
  file_name_in  text NOT NULL,
  file_name_out text,
  progress      integer NOT NULL DEFAULT 0,
  error_message text,
  empresa_id    text,
  user_id       text,
  version       integer NOT NULL DEFAULT 1,
  deleted_at    timestamp(3),
  created_at    timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS tool_jobs_empresa_deleted_idx ON tool_jobs (empresa_id, deleted_at);
CREATE INDEX IF NOT EXISTS tool_jobs_tool_status_idx ON tool_jobs (tool, status);

CREATE TABLE IF NOT EXISTS tool_job_eventos (
  id          text PRIMARY KEY,
  tool_job_id text NOT NULL REFERENCES tool_jobs(id) ON DELETE CASCADE,
  user_id     text,
  type        text NOT NULL,
  status      text,
  version     integer NOT NULL,
  created_at  timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS tool_job_eventos_job_idx ON tool_job_eventos (tool_job_id);
