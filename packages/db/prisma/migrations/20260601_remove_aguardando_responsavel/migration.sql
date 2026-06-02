-- Remove o valor AGUARDANDO_RESPONSAVEL do enum HelpdeskStatus.
-- Estratégia padrão Postgres pra "remover valor de enum": criar enum novo,
-- migrar a coluna que usa, dropar o antigo, renomear.
-- Defesa: se restar algum ticket nesse status (não deveria — checagem feita
-- na VPS antes da migration), promove pra EM_ANDAMENTO antes de trocar o enum.

UPDATE "helpdesk_tickets"
SET "status" = 'EM_ANDAMENTO'
WHERE "status" = 'AGUARDANDO_RESPONSAVEL';

ALTER TYPE "HelpdeskStatus" RENAME TO "HelpdeskStatus_old";

CREATE TYPE "HelpdeskStatus" AS ENUM ('NOVO', 'EM_ANDAMENTO', 'RESOLVIDO', 'CONCLUIDO', 'CANCELADO');

ALTER TABLE "helpdesk_tickets"
  ALTER COLUMN "status" DROP DEFAULT,
  ALTER COLUMN "status" TYPE "HelpdeskStatus" USING "status"::text::"HelpdeskStatus",
  ALTER COLUMN "status" SET DEFAULT 'NOVO';

DROP TYPE "HelpdeskStatus_old";
