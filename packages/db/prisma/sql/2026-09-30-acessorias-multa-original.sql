-- Acessórias — guarda o EntMulta original nas entregas já espelhadas.
--
-- A coluna multa_acessorias nasce vazia no db push (roda antes deste SQL).
-- Até aqui não existia reclassificação de multa, então o valor de `multa` É o
-- que veio do Acessórias. Só dados, e só onde ainda está nulo: rodar de novo
-- não muda nada, e nunca sobrescreve o original já registrado pelo sync.

UPDATE acessorias_entregas
   SET multa_acessorias = multa
 WHERE multa_acessorias IS NULL;
