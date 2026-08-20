-- #HLP0209/0211 — Cliente.status vira o "soft-delete" (só ATIVO/INATIVO).
--
-- Multi-tenant: o tipo enum "ClienteStatus" vive no schema `public` e é referenciado
-- por public.clientes.status E por cada tenant_*.clientes.status (as tabelas de tenant
-- são clonadas do public via CREATE TABLE ... LIKE). Por isso a troca do tipo precisa
-- alterar TODAS as colunas que o usam, em todos os schemas, antes de dropar o tipo antigo.
--
-- Mapeamento dos valores antigos:
--   ATIVA                                        -> ATIVO
--   INATIVA | SUSPENSA | BAIXADA | INAPTA | NULA -> INATIVO
-- Reconciliação da Lixeira: quem tinha deleted_at preenchido passa a status=INATIVO
-- (a Lixeira/deletedAt foi aposentada; a coluna deleted_at permanece por ora).
--
-- Obs.: NÃO há coluna de motivo. Os motivos de inativação/reativação ficam só no
-- histórico (ClienteEvent.changes) — fonte única de verdade.
--
-- Roda em transação. Idempotente o suficiente para uma execução por ambiente.

-- Recriar o enum público "ClienteStatus" com apenas ATIVO/INATIVO
ALTER TYPE "ClienteStatus" RENAME TO "ClienteStatus_old";
CREATE TYPE "ClienteStatus" AS ENUM ('ATIVO', 'INATIVO');

-- Alterar cada coluna que usa o tipo antigo (public + tenants), mapeando os valores
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT n.nspname AS sch, c.relname AS tbl, a.attname AS col
    FROM pg_attribute a
    JOIN pg_class c ON c.oid = a.attrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_type t ON t.oid = a.atttypid
    WHERE t.typname = 'ClienteStatus_old'
      AND a.attnum > 0 AND NOT a.attisdropped AND c.relkind = 'r'
  LOOP
    EXECUTE format('ALTER TABLE %I.%I ALTER COLUMN %I DROP DEFAULT', r.sch, r.tbl, r.col);
    EXECUTE format(
      'ALTER TABLE %I.%I ALTER COLUMN %I TYPE "ClienteStatus" USING ('
      || 'CASE %I::text WHEN ''ATIVA'' THEN ''ATIVO'' ELSE ''INATIVO'' END::"ClienteStatus")',
      r.sch, r.tbl, r.col, r.col
    );
    EXECUTE format('ALTER TABLE %I.%I ALTER COLUMN %I SET DEFAULT ''ATIVO''', r.sch, r.tbl, r.col);
  END LOOP;
END $$;

DROP TYPE "ClienteStatus_old";

-- Reconciliação da Lixeira: soft-deleted (deleted_at) ⇒ INATIVO, em todos os schemas
DO $$
DECLARE s text;
BEGIN
  FOR s IN
    SELECT table_schema FROM information_schema.tables
    WHERE table_name = 'clientes' AND table_type = 'BASE TABLE'
  LOOP
    EXECUTE format(
      'UPDATE %I.clientes SET status = ''INATIVO'' WHERE deleted_at IS NOT NULL AND status <> ''INATIVO''',
      s
    );
  END LOOP;
END $$;
