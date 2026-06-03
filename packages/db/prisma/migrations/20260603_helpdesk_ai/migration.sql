-- Novo valor no enum HelpdeskStatus pra tickets que a IA respondeu e
-- aguardam revisão humana antes de fechar.
ALTER TYPE "HelpdeskStatus" ADD VALUE IF NOT EXISTS 'AGUARDANDO_AUDITORIA' BEFORE 'RESOLVIDO';

-- Flag user-sistema da IA (responsável por mensagens automáticas no helpdesk).
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "is_ai" BOOLEAN NOT NULL DEFAULT false;

-- Auditoria das decisões da IA Claude sobre cada ticket processado.
CREATE TABLE IF NOT EXISTS "helpdesk_ai_decisions" (
    "id" TEXT NOT NULL,
    "ticket_id" TEXT NOT NULL,
    "modelo" TEXT NOT NULL,
    "complexidade" TEXT NOT NULL,
    "decisao" JSONB,
    "contexto_faq" TEXT,
    "tokens_input" INTEGER,
    "tokens_output" INTEGER,
    "custo_usd" DECIMAL(10,6),
    "duracao_ms" INTEGER,
    "erro" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "helpdesk_ai_decisions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "helpdesk_ai_decisions_ticket_id_idx" ON "helpdesk_ai_decisions"("ticket_id");
CREATE INDEX IF NOT EXISTS "helpdesk_ai_decisions_created_at_idx" ON "helpdesk_ai_decisions"("created_at");

ALTER TABLE "helpdesk_ai_decisions"
  ADD CONSTRAINT "helpdesk_ai_decisions_ticket_id_fkey"
  FOREIGN KEY ("ticket_id") REFERENCES "helpdesk_tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
