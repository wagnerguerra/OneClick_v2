-- Progresso e detalhamento das sincronizações do Acessórias.
--
-- A sincronização de entregas roda em segundo plano e leva minutos (varre
-- cliente a cliente). Sem estes campos a tela só conseguiria dizer "rodando",
-- sem noção de quanto falta nem do que aconteceu em cada etapa.
--
-- Idempotente: o `prisma db push` já cria as colunas pelo schema; este SQL é a
-- rede de segurança.
ALTER TABLE "acessorias_sync_logs" ADD COLUMN IF NOT EXISTS "progresso_atual" INTEGER;
ALTER TABLE "acessorias_sync_logs" ADD COLUMN IF NOT EXISTS "progresso_total" INTEGER;
ALTER TABLE "acessorias_sync_logs" ADD COLUMN IF NOT EXISTS "progresso_msg"   TEXT;
ALTER TABLE "acessorias_sync_logs" ADD COLUMN IF NOT EXISTS "detalhes"        JSONB;
