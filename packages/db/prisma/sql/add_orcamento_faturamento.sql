-- Campos de faturamento informados pelo cliente ao APROVAR o orçamento pelo link
-- público (CPF/CNPJ de faturamento + e-mail do financeiro). Idempotente.
ALTER TABLE orcamentos
  ADD COLUMN IF NOT EXISTS decisao_cnpj_faturamento text,
  ADD COLUMN IF NOT EXISTS decisao_email_financeiro text;
