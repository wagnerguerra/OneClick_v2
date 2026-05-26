-- Migração manual: tabela singleton de configurações do módulo Projetos

CREATE TABLE IF NOT EXISTS "projetos_config" (
  "id" TEXT PRIMARY KEY,
  "auto_arquivar_habilitado" BOOLEAN NOT NULL DEFAULT false,
  "auto_arquivar_dias" INTEGER NOT NULL DEFAULT 90,
  "ultima_execucao" TIMESTAMP(3),
  "ultimo_total_arquivados" INTEGER NOT NULL DEFAULT 0,
  "updated_at" TIMESTAMP(3) NOT NULL
);
