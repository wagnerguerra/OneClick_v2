-- CRM: nome fantasia + CNAE principal (código + descrição/atividade) da consulta de CNPJ. Idempotente.
ALTER TABLE oportunidades ADD COLUMN IF NOT EXISTS nome_fantasia text;
ALTER TABLE oportunidades ADD COLUMN IF NOT EXISTS cnae_codigo text;
ALTER TABLE oportunidades ADD COLUMN IF NOT EXISTS cnae_descricao text;
