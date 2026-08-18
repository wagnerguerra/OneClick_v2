-- Encadeamento das mensagens do pedido de compra (botão "Responder"), no mesmo
-- desenho das mensagens do orçamento. Idempotente e SÓ ADITIVA: uma coluna,
-- um índice e uma FK. Nenhuma linha existente muda — mensagem sem resposta
-- simplesmente fica com parent_id nulo.

-- Mora em packages/db/prisma/sql/ porque e ESTA a pasta que o Service Manager
-- aplica no deploy (stage 4.5, em ordem alfabetica). A packages/db/migrations/
-- nao e lida por ninguem — SQL colocado la simplesmente nao roda em producao.

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
