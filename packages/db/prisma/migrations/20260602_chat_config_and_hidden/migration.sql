-- ChatConfig singleton — controla comportamento global do chat (ex.: tempo
-- ate ficar ausente). Editavel pelo master em /configuracoes/chat.
CREATE TABLE "chat_config" (
    "id" TEXT NOT NULL,
    "ausente_apos_min" INTEGER NOT NULL DEFAULT 5,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "chat_config_pkey" PRIMARY KEY ("id")
);

-- hiddenAt em chat_participantes — "excluir conversa pra mim". Nova mensagem
-- chega, o backend zera esse campo e a conversa reaparece pro user.
ALTER TABLE "chat_participantes" ADD COLUMN "hidden_at" TIMESTAMP(3);
