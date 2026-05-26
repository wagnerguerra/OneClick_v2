-- Migração manual: criar tabelas do módulo Projetos (bloco TI)
-- Aplicada em 2026-05-26. NÃO toca em drift histórico de outras tabelas.

-- Enums
DO $$ BEGIN
  CREATE TYPE "ProjetoStatus" AS ENUM ('ATIVO', 'CONCLUIDO', 'ARQUIVADO');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "TarefaStatus" AS ENUM ('BACKLOG', 'A_FAZER', 'EM_ANDAMENTO', 'EM_REVISAO', 'CONCLUIDO', 'CANCELADO');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "TarefaPrioridade" AS ENUM ('URGENTE', 'ALTA', 'MEDIA', 'BAIXA');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Tabela Projeto
CREATE TABLE IF NOT EXISTS "projetos" (
  "id" TEXT PRIMARY KEY,
  "nome" TEXT NOT NULL,
  "descricao" TEXT,
  "cor" TEXT NOT NULL DEFAULT '#5ea3cb',
  "status" "ProjetoStatus" NOT NULL DEFAULT 'ATIVO',
  "responsavel_id" TEXT,
  "data_inicio" TIMESTAMP(3),
  "data_previsao" TIMESTAMP(3),
  "ordem" INTEGER NOT NULL DEFAULT 0,
  "empresa_id" TEXT,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL
);

CREATE INDEX IF NOT EXISTS "projetos_status_is_active_idx" ON "projetos"("status", "is_active");
CREATE INDEX IF NOT EXISTS "projetos_responsavel_id_idx" ON "projetos"("responsavel_id");

-- Tabela Tag de Projeto
CREATE TABLE IF NOT EXISTS "projetos_tags" (
  "id" TEXT PRIMARY KEY,
  "projeto_id" TEXT NOT NULL,
  "nome" TEXT NOT NULL,
  "cor" TEXT NOT NULL DEFAULT '#94a3b8',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "projetos_tags_projeto_fk" FOREIGN KEY ("projeto_id") REFERENCES "projetos"("id") ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "projetos_tags_projeto_id_nome_key" ON "projetos_tags"("projeto_id", "nome");

-- Tabela Tarefa
CREATE TABLE IF NOT EXISTS "projetos_tarefas" (
  "id" TEXT PRIMARY KEY,
  "projeto_id" TEXT NOT NULL,
  "titulo" TEXT NOT NULL,
  "descricao" TEXT,
  "status" "TarefaStatus" NOT NULL DEFAULT 'BACKLOG',
  "prioridade" "TarefaPrioridade" NOT NULL DEFAULT 'MEDIA',
  "responsavel_id" TEXT,
  "prazo" TIMESTAMP(3),
  "estimativa" INTEGER,
  "ordem" INTEGER NOT NULL DEFAULT 0,
  "parent_id" TEXT,
  "concluido_em" TIMESTAMP(3),
  "empresa_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "projetos_tarefas_projeto_fk" FOREIGN KEY ("projeto_id") REFERENCES "projetos"("id") ON DELETE CASCADE,
  CONSTRAINT "projetos_tarefas_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "projetos_tarefas"("id") ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS "projetos_tarefas_projeto_id_status_idx" ON "projetos_tarefas"("projeto_id", "status");
CREATE INDEX IF NOT EXISTS "projetos_tarefas_responsavel_id_idx" ON "projetos_tarefas"("responsavel_id");
CREATE INDEX IF NOT EXISTS "projetos_tarefas_prazo_idx" ON "projetos_tarefas"("prazo");

-- Tabela de junção Tarefa-Tag
CREATE TABLE IF NOT EXISTS "projetos_tarefas_tags" (
  "tarefa_id" TEXT NOT NULL,
  "tag_id" TEXT NOT NULL,
  PRIMARY KEY ("tarefa_id", "tag_id"),
  CONSTRAINT "projetos_tarefas_tags_tarefa_fk" FOREIGN KEY ("tarefa_id") REFERENCES "projetos_tarefas"("id") ON DELETE CASCADE,
  CONSTRAINT "projetos_tarefas_tags_tag_fk" FOREIGN KEY ("tag_id") REFERENCES "projetos_tags"("id") ON DELETE CASCADE
);

-- Anexos de Tarefa
CREATE TABLE IF NOT EXISTS "projetos_tarefas_anexos" (
  "id" TEXT PRIMARY KEY,
  "tarefa_id" TEXT NOT NULL,
  "nome" TEXT NOT NULL,
  "url" TEXT NOT NULL,
  "mime_type" TEXT,
  "tamanho" INTEGER NOT NULL,
  "uploaded_by_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "projetos_tarefas_anexos_tarefa_fk" FOREIGN KEY ("tarefa_id") REFERENCES "projetos_tarefas"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "projetos_tarefas_anexos_tarefa_id_idx" ON "projetos_tarefas_anexos"("tarefa_id");

-- Eventos/Atividade de Tarefa
CREATE TABLE IF NOT EXISTS "projetos_tarefas_eventos" (
  "id" TEXT PRIMARY KEY,
  "tarefa_id" TEXT NOT NULL,
  "tipo" TEXT NOT NULL,
  "autor_id" TEXT,
  "comentario" TEXT,
  "campo_antes" TEXT,
  "campo_depois" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "projetos_tarefas_eventos_tarefa_fk" FOREIGN KEY ("tarefa_id") REFERENCES "projetos_tarefas"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "projetos_tarefas_eventos_tarefa_id_created_at_idx" ON "projetos_tarefas_eventos"("tarefa_id", "created_at" DESC);
