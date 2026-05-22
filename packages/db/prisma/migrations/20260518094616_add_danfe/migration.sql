-- DANFE — XML NFe → PDF conversion module
-- Tables: danfes (1 per unique NFe), danfe_lotes (batch upload), danfe_lote_itens (per-XML result inside a batch)

CREATE TYPE "DanfeLoteStatus" AS ENUM ('PROCESSANDO', 'CONCLUIDO', 'CANCELADO');

CREATE TABLE "danfe_lotes" (
    "id"            TEXT NOT NULL,
    "nome"          TEXT NOT NULL,
    "status"        "DanfeLoteStatus" NOT NULL DEFAULT 'PROCESSANDO',
    "total_xmls"    INTEGER NOT NULL,
    "processados"   INTEGER NOT NULL DEFAULT 0,
    "sucesso"       INTEGER NOT NULL DEFAULT 0,
    "erros"         INTEGER NOT NULL DEFAULT 0,
    "iniciado_em"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "concluido_em"  TIMESTAMP(3),
    "empresa_id"    TEXT,
    "uploaded_by_id" TEXT NOT NULL,
    CONSTRAINT "danfe_lotes_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "danfe_lotes_uploaded_by_id_idx" ON "danfe_lotes" ("uploaded_by_id");
CREATE INDEX "danfe_lotes_status_idx"          ON "danfe_lotes" ("status");
ALTER TABLE "danfe_lotes" ADD CONSTRAINT "danfe_lotes_uploaded_by_id_fkey" FOREIGN KEY ("uploaded_by_id") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "danfes" (
    "id"               TEXT NOT NULL,
    "chave"            TEXT NOT NULL,
    "modelo"           TEXT NOT NULL,
    "numero"           INTEGER NOT NULL,
    "serie"            INTEGER NOT NULL,
    "emitente_cnpj"    TEXT NOT NULL,
    "emitente_razao"   TEXT NOT NULL,
    "dest_cnpj_cpf"    TEXT,
    "dest_razao"       TEXT,
    "valor_total"      DECIMAL(14, 2) NOT NULL,
    "data_emissao"     TIMESTAMP(3) NOT NULL,
    "data_autorizacao" TIMESTAMP(3),
    "status"           TEXT NOT NULL DEFAULT 'AUTORIZADA',
    "protocolo"        TEXT,
    "xml_key"          TEXT NOT NULL,
    "pdf_key"          TEXT,
    "lote_id"          TEXT,
    "empresa_id"       TEXT,
    "uploaded_by_id"   TEXT NOT NULL,
    "created_at"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "danfes_pkey"      PRIMARY KEY ("id"),
    CONSTRAINT "danfes_chave_key" UNIQUE ("chave")
);
CREATE INDEX "danfes_emitente_cnpj_idx" ON "danfes" ("emitente_cnpj");
CREATE INDEX "danfes_dest_cnpj_cpf_idx" ON "danfes" ("dest_cnpj_cpf");
CREATE INDEX "danfes_data_emissao_idx"  ON "danfes" ("data_emissao");
CREATE INDEX "danfes_empresa_id_idx"    ON "danfes" ("empresa_id");
CREATE INDEX "danfes_lote_id_idx"       ON "danfes" ("lote_id");
ALTER TABLE "danfes" ADD CONSTRAINT "danfes_lote_id_fkey"        FOREIGN KEY ("lote_id")        REFERENCES "danfe_lotes" ("id") ON DELETE SET NULL  ON UPDATE CASCADE;
ALTER TABLE "danfes" ADD CONSTRAINT "danfes_uploaded_by_id_fkey" FOREIGN KEY ("uploaded_by_id") REFERENCES "users" ("id")       ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "danfe_lote_itens" (
    "id"         TEXT NOT NULL,
    "lote_id"    TEXT NOT NULL,
    "file_name"  TEXT NOT NULL,
    "chave"      TEXT,
    "status"     TEXT NOT NULL,
    "mensagem"   TEXT,
    "danfe_id"   TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "danfe_lote_itens_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "danfe_lote_itens_lote_id_idx" ON "danfe_lote_itens" ("lote_id");
ALTER TABLE "danfe_lote_itens" ADD CONSTRAINT "danfe_lote_itens_lote_id_fkey"  FOREIGN KEY ("lote_id")  REFERENCES "danfe_lotes" ("id") ON DELETE CASCADE  ON UPDATE CASCADE;
ALTER TABLE "danfe_lote_itens" ADD CONSTRAINT "danfe_lote_itens_danfe_id_fkey" FOREIGN KEY ("danfe_id") REFERENCES "danfes" ("id")       ON DELETE SET NULL ON UPDATE CASCADE;
