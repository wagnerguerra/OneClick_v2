-- Guarda todos os campos extras extraídos do XML da NFS-e que não têm coluna dedicada.
-- Inclui: endereço completo do prestador/tomador, telefone, email, IM, regime SN,
-- NBS, tributação completa (CST, retenções), totais aproximados de tributos.
-- Schema do JSON está em apps/api/src/nfse-dist/nfse.parser.ts (interface ParsedNFSe).

ALTER TABLE nfse_importadas
  ADD COLUMN IF NOT EXISTS dados_extras JSONB;
