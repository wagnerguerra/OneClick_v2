-- #HLP0210 (Fase 2) — enxuga o enum "ClienteSituacao" para MENSAL/AVULSO/PROSPECT/PARALIZADO.
--
-- EM_CONSTITUICAO, POTENCIAL e PRE_OPERACIONAL são consolidados em PROSPECT.
-- PARALIZADO PERMANECE (usado pelos clientes existentes; nada novo grava mais —
-- a "inativação" da Caixa Postal/CND foi removida). Nada usa mais deleted_at do
-- cliente como indicador (status é o indicador).
--
-- Multi-tenant: o tipo vive no schema public e é referenciado por public.clientes.situacao
-- (e por cada tenant_*.clientes.situacao). A troca do tipo altera TODAS as colunas
-- que o usam, em todos os schemas. Mesma mecânica da migração de status.
--
-- Roda em transação. Idempotente o suficiente para uma execução por ambiente.

-- (1) Backfill: consolida os 3 valores removidos em PROSPECT, em todos os schemas.
DO $$
DECLARE s text;
BEGIN
  FOR s IN
    SELECT table_schema FROM information_schema.tables
    WHERE table_name = 'clientes' AND table_type = 'BASE TABLE'
  LOOP
    EXECUTE format(
      'UPDATE %I.clientes SET situacao = ''PROSPECT'' WHERE situacao::text IN (''POTENCIAL'', ''EM_CONSTITUICAO'', ''PRE_OPERACIONAL'')',
      s
    );
  END LOOP;
END $$;

-- (2) Recriar o enum público "ClienteSituacao" com os 4 valores finais.
ALTER TYPE "ClienteSituacao" RENAME TO "ClienteSituacao_old";
CREATE TYPE "ClienteSituacao" AS ENUM ('MENSAL', 'AVULSO', 'PROSPECT', 'PARALIZADO');

-- Alterar cada coluna que usa o tipo antigo (public + tenants), mapeando os valores.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT n.nspname AS sch, c.relname AS tbl, a.attname AS col
    FROM pg_attribute a
    JOIN pg_class c ON c.oid = a.attrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_type t ON t.oid = a.atttypid
    WHERE t.typname = 'ClienteSituacao_old'
      AND a.attnum > 0 AND NOT a.attisdropped AND c.relkind = 'r'
  LOOP
    EXECUTE format('ALTER TABLE %I.%I ALTER COLUMN %I DROP DEFAULT', r.sch, r.tbl, r.col);
    EXECUTE format(
      'ALTER TABLE %I.%I ALTER COLUMN %I TYPE "ClienteSituacao" USING ('
      || 'CASE %I::text WHEN ''POTENCIAL'' THEN ''PROSPECT'' '
      || 'WHEN ''EM_CONSTITUICAO'' THEN ''PROSPECT'' '
      || 'WHEN ''PRE_OPERACIONAL'' THEN ''PROSPECT'' '
      || 'ELSE %I::text END::"ClienteSituacao")',
      r.sch, r.tbl, r.col, r.col, r.col
    );
    EXECUTE format('ALTER TABLE %I.%I ALTER COLUMN %I SET DEFAULT ''MENSAL''', r.sch, r.tbl, r.col);
  END LOOP;
END $$;

DROP TYPE "ClienteSituacao_old";
