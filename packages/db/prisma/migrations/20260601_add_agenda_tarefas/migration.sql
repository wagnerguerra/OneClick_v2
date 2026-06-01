-- CreateTable
CREATE TABLE "agenda_tarefas" (
    "id" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "descricao" TEXT,
    "prazo" DATE NOT NULL,
    "hora_prazo" TEXT,
    "concluida" BOOLEAN NOT NULL DEFAULT false,
    "concluida_em" TIMESTAMP(3),
    "prioridade" TEXT NOT NULL DEFAULT 'NORMAL',
    "criador_id" TEXT NOT NULL,
    "empresa_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agenda_tarefas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agenda_tarefa_lembretes" (
    "id" TEXT NOT NULL,
    "tarefa_id" TEXT NOT NULL,
    "canal" "AgendaLembreteCanal" NOT NULL DEFAULT 'POPUP',
    "minutos_antes" INTEGER NOT NULL,
    "ultimo_disparo_em" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agenda_tarefa_lembretes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "agenda_tarefas_criador_id_concluida_prazo_idx" ON "agenda_tarefas"("criador_id", "concluida", "prazo");
CREATE INDEX "agenda_tarefas_prazo_idx" ON "agenda_tarefas"("prazo");
CREATE INDEX "agenda_tarefas_empresa_id_idx" ON "agenda_tarefas"("empresa_id");

CREATE INDEX "agenda_tarefa_lembretes_tarefa_id_idx" ON "agenda_tarefa_lembretes"("tarefa_id");
CREATE INDEX "agenda_tarefa_lembretes_minutos_antes_idx" ON "agenda_tarefa_lembretes"("minutos_antes");

-- AddForeignKey
ALTER TABLE "agenda_tarefas" ADD CONSTRAINT "agenda_tarefas_criador_id_fkey" FOREIGN KEY ("criador_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "agenda_tarefa_lembretes" ADD CONSTRAINT "agenda_tarefa_lembretes_tarefa_id_fkey" FOREIGN KEY ("tarefa_id") REFERENCES "agenda_tarefas"("id") ON DELETE CASCADE ON UPDATE CASCADE;
