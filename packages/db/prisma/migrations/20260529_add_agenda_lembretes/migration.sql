-- CreateEnum
CREATE TYPE "AgendaLembreteCanal" AS ENUM ('POPUP', 'EMAIL');

-- CreateTable
CREATE TABLE "agenda_lembretes" (
    "id" TEXT NOT NULL,
    "evento_id" TEXT NOT NULL,
    "canal" "AgendaLembreteCanal" NOT NULL DEFAULT 'POPUP',
    "minutos_antes" INTEGER NOT NULL,
    "ultimo_disparo_em" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agenda_lembretes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "agenda_lembretes_evento_id_idx" ON "agenda_lembretes"("evento_id");

-- CreateIndex
CREATE INDEX "agenda_lembretes_minutos_antes_idx" ON "agenda_lembretes"("minutos_antes");

-- AddForeignKey
ALTER TABLE "agenda_lembretes" ADD CONSTRAINT "agenda_lembretes_evento_id_fkey" FOREIGN KEY ("evento_id") REFERENCES "agenda_eventos"("id") ON DELETE CASCADE ON UPDATE CASCADE;
