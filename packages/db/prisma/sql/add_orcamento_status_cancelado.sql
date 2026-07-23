-- Status CANCELADO para orçamentos (soft-cancel do kanban, substitui a exclusão
-- permanente). Idempotente — ADD VALUE IF NOT EXISTS não falha se já existir.

ALTER TYPE "OrcamentoStatus" ADD VALUE IF NOT EXISTS 'CANCELADO';
