-- #HLP0391 — sócios sem empresa gravada.
--
-- A importação do QSA (tela do cliente) e a do OneClick antigo criavam o sócio
-- sem empresa_id. A edição compara a empresa do sócio com a do usuário, então
-- ninguém além do master conseguia editar ou excluir esses sócios (35 em 08/10,
-- ex.: CLÁUDIA WELP VIANA da Full Solutions). Preenche com a empresa do cliente.
--
-- Idempotente: só toca quem ainda está sem empresa.
UPDATE socios s
   SET empresa_id = c.empresa_id
  FROM clientes c
 WHERE c.id = s.cliente_id
   AND s.empresa_id IS NULL
   AND c.empresa_id IS NOT NULL;
