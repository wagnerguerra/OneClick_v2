-- ============================================================
-- Colunas usadas pelo cnd-municipal.service.ts via $queryRawUnsafe.
-- O service tenta criar via ALTER TABLE dentro do INSERT mas o SELECT/list
-- roda antes e quebra com "column does not exist".
--
-- Equivale à migration legacy 20260518084845_cnd_municipal_extras — versionada
-- aqui pra que o stage de SQLs do Service Manager aplique automaticamente
-- (a migration antiga não roda quando Prisma migrate falha no shadow DB).
-- ============================================================

ALTER TABLE "certidoes_cnd_municipal" ADD COLUMN IF NOT EXISTS "debitos"       JSONB DEFAULT '[]';
ALTER TABLE "certidoes_cnd_municipal" ADD COLUMN IF NOT EXISTS "pdf_base64"    TEXT;
ALTER TABLE "certidoes_cnd_municipal" ADD COLUMN IF NOT EXISTS "data_validade" DATE;
