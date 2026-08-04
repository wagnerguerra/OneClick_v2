-- Regras de aplicabilidade das obrigações do Acessórias.
--
-- O Acessórias lista obrigações que nem sempre são devidas — configuração
-- antiga, cliente que mudou de regime, obrigação criada por engano. Sem regra
-- elas voltam a cada sincronização e o painel de prazos vira ruído.
--
-- Precedência: regra com cliente vence regra geral (cliente_id NULL).
--
-- Idempotente: o `prisma db push` já cria pelo schema; este SQL é a rede.
CREATE TABLE IF NOT EXISTS "acessorias_regras_obrigacao" (
  "id"         TEXT PRIMARY KEY,
  "nome"       TEXT NOT NULL,
  "cliente_id" TEXT,
  "considerar" BOOLEAN NOT NULL DEFAULT false,
  "motivo"     TEXT,
  "empresa_id" TEXT,
  "criado_por" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "acessorias_regras_cliente_fk" FOREIGN KEY ("cliente_id")
    REFERENCES "clientes" ("id") ON DELETE CASCADE
);

-- UNIQUE com coluna anulável: no Postgres dois NULL são distintos, então a
-- restrição não impediria duas regras gerais para a mesma obrigação. Dois
-- índices parciais resolvem — um para o caso com cliente, outro para o geral.
CREATE UNIQUE INDEX IF NOT EXISTS "uk_acessorias_regra_cliente"
  ON "acessorias_regras_obrigacao" ("empresa_id", "nome", "cliente_id")
  WHERE "cliente_id" IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "uk_acessorias_regra_geral"
  ON "acessorias_regras_obrigacao" ("empresa_id", "nome")
  WHERE "cliente_id" IS NULL;

CREATE INDEX IF NOT EXISTS "idx_acessorias_regras_nome"    ON "acessorias_regras_obrigacao" ("nome");
CREATE INDEX IF NOT EXISTS "idx_acessorias_regras_cliente" ON "acessorias_regras_obrigacao" ("cliente_id");
