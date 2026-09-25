-- Marca os serviços de ENTRADA de novo cliente.
--
-- O painel /comercial conta "Contratos assinados" como os orçamentos aprovados
-- que contêm um serviço de entrada de novo cliente (decisão do Wagner,
-- 25/09/2026). Quem diz se o serviço é de entrada é a flag
-- `servicos.entrada_novo_cliente`, criada neste deploy pelo db push (que roda
-- antes desta pasta) e editável no cadastro do serviço.
--
-- Este script só faz a marcação inicial, pelos nomes que existem hoje:
-- "Constituição de Novo Cliente", "Entrada de Novo Cliente",
-- "Transferência - Entrada de Novo Cliente". A "Transferência - Saída de
-- Cliente" fica de fora. Daqui para frente, marcar pelo cadastro.
UPDATE servicos
   SET entrada_novo_cliente = true
 WHERE nome ILIKE '%novo cliente%'
   AND nome NOT ILIKE '%saída%'
   AND nome NOT ILIKE '%saida%'
   AND entrada_novo_cliente = false;
