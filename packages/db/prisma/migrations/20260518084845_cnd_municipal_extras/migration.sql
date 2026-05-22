-- Adiciona colunas que o service `cnd-municipal.service.ts` precisa.
-- O service tentava criar via ALTER TABLE IF NOT EXISTS dentro do INSERT,
-- mas o SELECT/list roda antes e quebra com "column does not exist" quando
-- a tabela foi recriada sem essas colunas (ex: após prisma db push).

ALTER TABLE "certidoes_cnd_municipal" ADD COLUMN IF NOT EXISTS "debitos"       JSONB DEFAULT '[]';
ALTER TABLE "certidoes_cnd_municipal" ADD COLUMN IF NOT EXISTS "pdf_base64"    TEXT;
ALTER TABLE "certidoes_cnd_municipal" ADD COLUMN IF NOT EXISTS "data_validade" DATE;
