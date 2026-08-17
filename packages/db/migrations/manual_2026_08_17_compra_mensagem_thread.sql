-- Encadeamento das mensagens do pedido de compra (botão "Responder"), no mesmo
-- desenho das mensagens do orçamento. Idempotente e SÓ ADITIVA: uma coluna,
-- um índice e uma FK. Nenhuma linha existente muda — mensagem sem resposta
-- simplesmente fica com parent_id nulo.

BEGIN;

ALTER TABLE "compra_mensagens" ADD COLUMN IF NOT EXISTS "parent_id" TEXT;

CREATE INDEX IF NOT EXISTS "compra_mensagens_parent_id_idx" ON "compra_mensagens" ("parent_id");

-- Em bloco DO por causa do IF NOT EXISTS: o Postgres não aceita esse
-- modificador em ADD CONSTRAINT, e sem ele reaplicar o script quebraria.
--
-- ON DELETE CASCADE: apagar a mensagem original leva junto as respostas dela.
-- O contrário — respostas órfãs apontando para o nada — deixaria a thread
-- quebrada na tela, sem quem responder e sem contexto do que se respondeu.
DO $$ BEGIN
  ALTER TABLE "compra_mensagens" ADD CONSTRAINT "compra_mensagens_parent_id_fkey"
    FOREIGN KEY ("parent_id") REFERENCES "compra_mensagens"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

COMMIT;
