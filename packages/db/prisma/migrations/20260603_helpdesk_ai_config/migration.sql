-- Configuração singleton da triagem IA — master controla enabled + cap mensal.
CREATE TABLE IF NOT EXISTS "helpdesk_ai_config" (
    "id" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "cap_usd_mensal" DECIMAL(10,2) NOT NULL DEFAULT 10,
    "min_chars_descricao" INTEGER NOT NULL DEFAULT 20,
    "max_chars_descricao" INTEGER NOT NULL DEFAULT 10000,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "helpdesk_ai_config_pkey" PRIMARY KEY ("id")
);
