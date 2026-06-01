-- ============================================================
-- Colunas usadas pelo cnd-municipal.service.ts via $queryRawUnsafe.
-- O service tenta criar via ALTER TABLE dentro do INSERT mas o SELECT/list
-- roda antes e quebra com "column does not exist".
--
-- Equivale à migration legacy 20260518084845_cnd_municipal_extras — versionada
-- aqui pra que o stage de SQLs do Service Manager aplique automaticamente
-- (a migration antiga não roda quando Prisma migrate falha no shadow DB).
--
-- Tolerante a ambientes onde a tabela ainda não foi criada (módulo CND não
-- instalado em todos os tenants). Vira no-op se `certidoes_cnd_municipal`
-- não existe — quando for criada, basta rerodar.
-- ============================================================

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'certidoes_cnd_municipal'
  ) THEN
    ALTER TABLE "certidoes_cnd_municipal" ADD COLUMN IF NOT EXISTS "debitos"       JSONB DEFAULT '[]';
    ALTER TABLE "certidoes_cnd_municipal" ADD COLUMN IF NOT EXISTS "pdf_base64"    TEXT;
    ALTER TABLE "certidoes_cnd_municipal" ADD COLUMN IF NOT EXISTS "data_validade" DATE;
  END IF;
END
$$;
