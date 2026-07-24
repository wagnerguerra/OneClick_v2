-- Designação explícita de matriz/filial para o CNPJ ALFANUMÉRICO (Fase 3).
-- Coluna NULLABLE, sem default: nenhuma linha existente é reescrita — todas
-- ficam NULL e continuam sendo classificadas pelo /0001 (numérico, legado).
-- Só novos registros alfanuméricos usam o valor explícito. Idempotente.

ALTER TABLE "clientes" ADD COLUMN IF NOT EXISTS "eh_matriz" BOOLEAN;
