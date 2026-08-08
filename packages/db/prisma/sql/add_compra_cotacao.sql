-- Cotação (RFQ) do módulo de Aquisições — o passo ANTES do pedido.
-- Monta-se a lista de itens, convidam-se N fornecedores, lançam-se os preços de
-- cada um e premia-se item por item; cada fornecedor premiado gera um pedido.
--
-- Idempotente: o `prisma db push` já cria tudo a partir do schema; este SQL é a
-- rede de segurança e pode rodar antes ou depois, sem efeito colateral.
--
-- Nota: `updated_at` recebe DEFAULT aqui de propósito. O `@updatedAt` do Prisma
-- é aplicado pelo cliente, não pelo banco — sem DEFAULT, qualquer INSERT cru
-- (backfill, script de manutenção) quebraria com NOT NULL violation.

-- ── Enum de status ──
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'StatusCotacao') THEN
    CREATE TYPE "StatusCotacao" AS ENUM ('RASCUNHO', 'ENVIADA', 'APURACAO', 'CONVERTIDA', 'CANCELADA');
  END IF;
END $$;

-- ── Cotação ──
CREATE TABLE IF NOT EXISTS "compra_cotacoes" (
  "id"             TEXT PRIMARY KEY,
  "code"           SERIAL,
  "status"         "StatusCotacao" NOT NULL DEFAULT 'RASCUNHO',
  "titulo"         TEXT,
  "observacoes"    TEXT,
  "prazo_resposta" DATE,
  "solicitante_id" TEXT,
  "empresa_id"     TEXT,
  "is_active"      BOOLEAN NOT NULL DEFAULT true,
  "created_at"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "idx_compra_cotacoes_empresa" ON "compra_cotacoes" ("empresa_id");
CREATE INDEX IF NOT EXISTS "idx_compra_cotacoes_status" ON "compra_cotacoes" ("status");

-- ── Itens (a lista de compras — sem fornecedor, sem preço) ──
CREATE TABLE IF NOT EXISTS "compra_cotacao_itens" (
  "id"          TEXT PRIMARY KEY,
  "cotacao_id"  TEXT NOT NULL,
  "descricao"   TEXT NOT NULL,
  "unidade"     TEXT,
  "quantidade"  INTEGER NOT NULL DEFAULT 1,
  "ordem"       INTEGER NOT NULL DEFAULT 0,
  "vencedor_id" TEXT,
  "is_active"   BOOLEAN NOT NULL DEFAULT true,
  "created_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "compra_cotacao_itens_cotacao_fk" FOREIGN KEY ("cotacao_id")
    REFERENCES "compra_cotacoes" ("id") ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS "idx_compra_cotacao_itens_cotacao" ON "compra_cotacao_itens" ("cotacao_id");

-- ── Fornecedores convidados (condições comerciais são por fornecedor) ──
CREATE TABLE IF NOT EXISTS "compra_cotacao_fornecedores" (
  "id"                TEXT PRIMARY KEY,
  "cotacao_id"        TEXT NOT NULL,
  "fornecedor_id"     TEXT NOT NULL,
  "enviado_em"        TIMESTAMP(3),
  "respondido_em"     TIMESTAMP(3),
  "frete"             DECIMAL(14,2),
  "prazo_entrega"     TEXT,
  "prazo_pagamento"   TEXT,
  "forma_pagamento"   TEXT,
  "validade_proposta" TEXT,
  "observacoes"       TEXT,
  "created_at"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "compra_cotacao_fornecedores_cotacao_fk" FOREIGN KEY ("cotacao_id")
    REFERENCES "compra_cotacoes" ("id") ON DELETE CASCADE,
  CONSTRAINT "compra_cotacao_fornecedores_forn_fk" FOREIGN KEY ("fornecedor_id")
    REFERENCES "fornecedores" ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "uk_compra_cotacao_fornecedor"
  ON "compra_cotacao_fornecedores" ("cotacao_id", "fornecedor_id");
CREATE INDEX IF NOT EXISTS "idx_compra_cotacao_fornecedores_cotacao"
  ON "compra_cotacao_fornecedores" ("cotacao_id");

-- ── Preços (a célula da matriz: item × fornecedor) ──
CREATE TABLE IF NOT EXISTS "compra_cotacao_precos" (
  "id"                    TEXT PRIMARY KEY,
  "cotacao_item_id"       TEXT NOT NULL,
  "cotacao_fornecedor_id" TEXT NOT NULL,
  "valor_unitario"        DECIMAL(14,2),
  "disponivel"            BOOLEAN NOT NULL DEFAULT true,
  "observacoes"           TEXT,
  "created_at"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "compra_cotacao_precos_item_fk" FOREIGN KEY ("cotacao_item_id")
    REFERENCES "compra_cotacao_itens" ("id") ON DELETE CASCADE,
  CONSTRAINT "compra_cotacao_precos_forn_fk" FOREIGN KEY ("cotacao_fornecedor_id")
    REFERENCES "compra_cotacao_fornecedores" ("id") ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "uk_compra_cotacao_preco"
  ON "compra_cotacao_precos" ("cotacao_item_id", "cotacao_fornecedor_id");
CREATE INDEX IF NOT EXISTS "idx_compra_cotacao_precos_forn"
  ON "compra_cotacao_precos" ("cotacao_fornecedor_id");

-- ── Rastro do pedido até a cotação que o originou ──
ALTER TABLE "compras" ADD COLUMN IF NOT EXISTS "cotacao_id" TEXT;
CREATE INDEX IF NOT EXISTS "idx_compras_cotacao" ON "compras" ("cotacao_id");
-- A checagem e por QUALQUER FK sobre compras.cotacao_id, nao pelo nome desta.
-- O modelo Compra ja declara a relacao, entao o `prisma db push` cria a dele
-- (compras_cotacao_id_fkey). Checando so pelo nome antigo, as duas conviviam:
-- o push derrubava a nossa a cada deploy e este arquivo a recriava logo em
-- seguida — duas FKs identicas sobre a mesma coluna, para sempre.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
    WHERE c.contype = 'f' AND c.conrelid = 'compras'::regclass AND a.attname = 'cotacao_id'
  ) THEN
    ALTER TABLE "compras" ADD CONSTRAINT "compras_cotacao_fk"
      FOREIGN KEY ("cotacao_id") REFERENCES "compra_cotacoes" ("id") ON DELETE SET NULL;
  END IF;
END $$;
