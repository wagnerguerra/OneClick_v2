-- Marca quais NFS-e foram baixadas com DANFSe oficial vs PDF auxiliar interno.
-- false = PDF auxiliar do nosso gerador (simples); true = DANFSe oficial da API gov.br.
-- Botão "Regerar PDF" pode reupar pra oficial quando a API DANFSe responder.

ALTER TABLE nfse_importadas
  ADD COLUMN IF NOT EXISTS pdf_oficial BOOLEAN NOT NULL DEFAULT FALSE;
