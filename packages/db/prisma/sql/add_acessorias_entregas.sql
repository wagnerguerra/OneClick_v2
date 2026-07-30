-- Espelho bruto das entregas do Acessórias — base do painel de acompanhamento
-- de prazos e de leitura das guias pelos clientes.
--
-- Separado de servico_execucoes de propósito: a execução só nasce quando a
-- obrigação tem mapeamento para um Serviço nosso, e obrigação sem mapeamento é
-- descartada no sync. Para o painel isso seria um ponto cego justamente onde
-- dói. Aqui guardamos tudo, mapeado ou não.
--
-- Idempotente: o `prisma db push` já cria a tabela pelo schema; este SQL é a
-- rede de segurança. `synced_at` tem DEFAULT porque o @default(now()) do Prisma
-- é aplicado pelo cliente — um INSERT cru sem ele violaria o NOT NULL.

CREATE TABLE IF NOT EXISTS "acessorias_entregas" (
  "id"             TEXT PRIMARY KEY,
  "cliente_id"     TEXT NOT NULL,
  "ent_id"         TEXT NOT NULL,
  "nome"           TEXT NOT NULL,
  "competencia"    DATE,
  "prazo"          DATE,
  "dt_atraso"      DATE,
  "dt_entrega"     DATE,
  "dt_finalizacao" TIMESTAMP(3),
  "guia_lida"      TEXT,
  "lida"           BOOLEAN,
  "status"         TEXT,
  "multa"          BOOLEAN NOT NULL DEFAULT false,
  "resp_prazo"     TEXT,
  "resp_entrega"   TEXT,
  "dpto"           TEXT,
  "last_dh"        TIMESTAMP(3),
  "synced_at"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "empresa_id"     TEXT,
  CONSTRAINT "acessorias_entregas_cliente_fk" FOREIGN KEY ("cliente_id")
    REFERENCES "clientes" ("id") ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "uk_acessorias_entregas_cliente_ent"
  ON "acessorias_entregas" ("cliente_id", "ent_id");
CREATE INDEX IF NOT EXISTS "idx_acessorias_entregas_cliente" ON "acessorias_entregas" ("cliente_id");
CREATE INDEX IF NOT EXISTS "idx_acessorias_entregas_prazo"   ON "acessorias_entregas" ("prazo");
CREATE INDEX IF NOT EXISTS "idx_acessorias_entregas_lida"    ON "acessorias_entregas" ("lida");
CREATE INDEX IF NOT EXISTS "idx_acessorias_entregas_empresa" ON "acessorias_entregas" ("empresa_id");
