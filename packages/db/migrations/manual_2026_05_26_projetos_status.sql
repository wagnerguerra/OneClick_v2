-- Migração manual: trocar enum ProjetoStatus
-- De:   ATIVO, CONCLUIDO, ARQUIVADO
-- Para: NOVO, ANDAMENTO, PENDENTE, CONCLUIDO
--
-- Mapeamento de dados existentes:
--   ATIVO       → ANDAMENTO   (era "em desenvolvimento")
--   CONCLUIDO   → CONCLUIDO   (mantém)
--   ARQUIVADO   → CONCLUIDO   (semanticamente equivalente — fora do fluxo ativo)
--
-- Default: NOVO

BEGIN;

-- 1. Cria enum novo paralelo
CREATE TYPE "ProjetoStatus_new" AS ENUM ('NOVO', 'ANDAMENTO', 'PENDENTE', 'CONCLUIDO');

-- 2. Remove default da coluna pra permitir o ALTER TYPE
ALTER TABLE "projetos" ALTER COLUMN "status" DROP DEFAULT;

-- 3. Migra a coluna pra novo tipo com CASE de mapeamento
ALTER TABLE "projetos"
  ALTER COLUMN "status" TYPE "ProjetoStatus_new" USING (
    CASE "status"::text
      WHEN 'ATIVO'     THEN 'ANDAMENTO'::"ProjetoStatus_new"
      WHEN 'CONCLUIDO' THEN 'CONCLUIDO'::"ProjetoStatus_new"
      WHEN 'ARQUIVADO' THEN 'CONCLUIDO'::"ProjetoStatus_new"
      ELSE 'NOVO'::"ProjetoStatus_new"
    END
  );

-- 4. Dropa o enum antigo
DROP TYPE "ProjetoStatus";

-- 5. Renomeia o novo pra ProjetoStatus
ALTER TYPE "ProjetoStatus_new" RENAME TO "ProjetoStatus";

-- 6. Restaura default
ALTER TABLE "projetos" ALTER COLUMN "status" SET DEFAULT 'NOVO';

COMMIT;
