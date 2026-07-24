-- Custeio/rentabilidade por cliente (Gestão de Contratos — Fase 3).
-- Dois objetos: parâmetros de custeio por empresa (config do modelo) e a
-- tabela de saída recalculável (custo/receita por cliente e mês).
-- Idempotente (IF NOT EXISTS).

CREATE TABLE IF NOT EXISTS "empresa_parametros_custeio" (
  "id"                            TEXT PRIMARY KEY,
  "empresa_id"                    TEXT NOT NULL UNIQUE,
  "encargos_percentual"           DOUBLE PRECISION NOT NULL DEFAULT 0,
  "usar_horas_servicos"           BOOLEAN NOT NULL DEFAULT false,
  "aplicar_aumento_faturamento"   BOOLEAN NOT NULL DEFAULT true,
  "horas_mes_referencia"          INTEGER NOT NULL DEFAULT 160,
  "beneficio_alimentacao_dia"     DOUBLE PRECISION NOT NULL DEFAULT 40,
  "beneficio_vale_transporte_dia" DOUBLE PRECISION NOT NULL DEFAULT 10.2,
  "beneficio_plano_saude_mensal"  DOUBLE PRECISION NOT NULL DEFAULT 162,
  "mult_categoria_standard"       DOUBLE PRECISION NOT NULL DEFAULT 1,
  "mult_categoria_advanced"       DOUBLE PRECISION NOT NULL DEFAULT 1.2,
  "mult_categoria_premium"        DOUBLE PRECISION NOT NULL DEFAULT 1.5,
  "created_at"                    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"                    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "cliente_custeio_mensal" (
  "id"                 TEXT PRIMARY KEY,
  "empresa_id"         TEXT NOT NULL,
  "cliente_id"         TEXT NOT NULL,
  "ref_mes"            TEXT NOT NULL,
  "custo_direto"       DOUBLE PRECISION NOT NULL DEFAULT 0,
  "custo_rateio_apoio" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "custo_tdabc"        DOUBLE PRECISION NOT NULL DEFAULT 0,
  "custo_total"        DOUBLE PRECISION NOT NULL DEFAULT 0,
  "receita_referencia" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "detalhe_json"       JSONB,
  "created_at"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "cliente_custeio_mensal_cliente_id_fkey"
    FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "cliente_custeio_mensal_empresa_id_cliente_id_ref_mes_key"
  ON "cliente_custeio_mensal" ("empresa_id", "cliente_id", "ref_mes");
CREATE INDEX IF NOT EXISTS "cliente_custeio_mensal_empresa_id_ref_mes_idx"
  ON "cliente_custeio_mensal" ("empresa_id", "ref_mes");
