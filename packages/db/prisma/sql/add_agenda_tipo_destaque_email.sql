-- Destaque do tipo de evento no e-mail do dia (#agenda / pedido da limpeza).
--
-- Informação de preparação — "arrumar sala" é o caso que motivou — ficava
-- diluída numa lista de vinte eventos, e quem precisava agir passava direto.
-- Marcado o destaque, os eventos daquele tipo ganham uma moldura colorida no
-- e-mail; a cor é escolhida no próprio cadastro do tipo.
--
-- Idempotente.

ALTER TABLE agenda_tipos ADD COLUMN IF NOT EXISTS destacar_email BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE agenda_tipos ADD COLUMN IF NOT EXISTS cor_destaque   TEXT;
