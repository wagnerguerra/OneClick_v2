-- #HLP0424 — acessos exportados do OneClick v1 (aba Legalização → Acessos).
--
-- A importação de 08/10 gravou em `observacoes` (que a tela mostra como "Link")
-- o texto "exportada — Link: <url>". O pedido era um campo de Observações com
-- "Exportada". Com a coluna nova `anotacoes` (criada pelo db push, que roda antes
-- deste arquivo), separamos: "Exportada" vai para Observações e o link do v1
-- volta para o Link.
--
-- Idempotente: só toca as linhas importadas (id 'v1acs…') que ainda estão no
-- formato da importação; depois da primeira execução nenhuma linha casa mais.
UPDATE cliente_acessos
   SET anotacoes   = 'Exportada',
       observacoes = NULLIF(btrim(substring(observacoes FROM 'Link: (.*)$')), ''),
       updated_at  = now()
 WHERE id LIKE 'v1acs%'
   AND anotacoes IS NULL
   AND observacoes ILIKE 'exportada%';
