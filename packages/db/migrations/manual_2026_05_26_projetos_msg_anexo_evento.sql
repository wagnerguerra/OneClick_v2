-- Migração manual: adicionar mensagens, anexos e eventos do PROJETO
-- (paralelo às tabelas que já existem pras tarefas)

CREATE TABLE IF NOT EXISTS "projetos_mensagens" (
  "id" TEXT PRIMARY KEY,
  "projeto_id" TEXT NOT NULL,
  "autor_id" TEXT,
  "texto" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "projetos_mensagens_projeto_fk" FOREIGN KEY ("projeto_id") REFERENCES "projetos"("id") ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS "projetos_mensagens_projeto_id_created_at_idx"
  ON "projetos_mensagens"("projeto_id", "created_at" DESC);

CREATE TABLE IF NOT EXISTS "projetos_anexos" (
  "id" TEXT PRIMARY KEY,
  "projeto_id" TEXT NOT NULL,
  "nome" TEXT NOT NULL,
  "url" TEXT NOT NULL,
  "mime_type" TEXT,
  "tamanho" INTEGER NOT NULL,
  "uploaded_by_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "projetos_anexos_projeto_fk" FOREIGN KEY ("projeto_id") REFERENCES "projetos"("id") ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS "projetos_anexos_projeto_id_idx" ON "projetos_anexos"("projeto_id");

CREATE TABLE IF NOT EXISTS "projetos_eventos" (
  "id" TEXT PRIMARY KEY,
  "projeto_id" TEXT NOT NULL,
  "tipo" TEXT NOT NULL,
  "autor_id" TEXT,
  "comentario" TEXT,
  "campo_antes" TEXT,
  "campo_depois" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "projetos_eventos_projeto_fk" FOREIGN KEY ("projeto_id") REFERENCES "projetos"("id") ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS "projetos_eventos_projeto_id_created_at_idx"
  ON "projetos_eventos"("projeto_id", "created_at" DESC);
