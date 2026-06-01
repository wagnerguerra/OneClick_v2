-- CreateTable
CREATE TABLE "agenda_disparo_logs" (
    "id" TEXT NOT NULL,
    "disparado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "data_referencia" DATE NOT NULL,
    "modo" TEXT NOT NULL,
    "enviados" INTEGER NOT NULL DEFAULT 0,
    "falhas" INTEGER NOT NULL DEFAULT 0,
    "destinatarios" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "erros" JSONB,
    "triggered_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agenda_disparo_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "agenda_disparo_logs_disparado_em_idx" ON "agenda_disparo_logs"("disparado_em" DESC);
