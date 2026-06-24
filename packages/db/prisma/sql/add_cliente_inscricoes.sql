-- Registro de Inscrições (estaduais) por cliente — migrado do legado
-- (cad_cli_inscricoes). Idempotente. É tabela de tenant (clonada via LIKE).

CREATE TABLE IF NOT EXISTS "cliente_inscricoes" (
  "id"         TEXT NOT NULL,
  "cliente_id" TEXT NOT NULL,
  "estado"     TEXT NOT NULL,
  "inscricao"  TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "cliente_inscricoes_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "cliente_inscricoes_cliente_id_idx" ON "cliente_inscricoes"("cliente_id");
