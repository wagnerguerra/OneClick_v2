-- Remove espaço/tab/quebra de linha nas pontas do nome dos serviços (07/10/2026).
--
-- 12 serviços da Central Contábil tinham um tab no começo ou um espaço no fim
-- (ex.: "\tINVEST IMPORTAÇÃO - LOGÍSTICA - ADESÃO"). O tab jogava esses nomes
-- para o topo da ordem alfabética do /servicos e embaralhava a listagem. O
-- cadastro agora faz trim (createServicoSchema). Idempotente: só toca quem tem
-- sobra nas pontas.
UPDATE servicos
SET nome = btrim(nome, E' \t\n\r')
WHERE nome <> btrim(nome, E' \t\n\r');
