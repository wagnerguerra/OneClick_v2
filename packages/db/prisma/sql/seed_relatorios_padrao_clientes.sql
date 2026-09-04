-- Relatorios PADRAO do modulo Clientes.
--
-- Sao os recortes que os ultimos dias revelaram como reais: a carteira por
-- tributacao (o pedido que originou o recurso), os clientes sem servico (9, e
-- ninguem sabia), os sem tributacao (o furo que a planilha da contabilidade
-- expos) e os com beneficio fiscal.
--
-- Uma linha por relatorio, com empresa_id NULL: o padrao e da plataforma, nao
-- de uma empresa. Quem ajusta um deles ganha uma COPIA sua (origem USUARIO) —
-- o padrao segue igual para todo mundo.
--
-- Os campos sao chaves do catalogo (relatorio/campos.ts). Uma chave que deixe
-- de existir e descartada na execucao, entao um relatorio antigo nao quebra:
-- so perde aquela coluna.

INSERT INTO relatorio_definicoes (modulo, nome, descricao, campos, filtros, origem, visibilidade, favorito_de)
SELECT v.modulo, v.nome, v.descricao, v.campos, v.filtros::jsonb, 'SISTEMA', 'EMPRESA', '{}'
  FROM (VALUES
    ('clientes', 'Carteira mensal por tributação',
     'Todos os clientes mensais ativos, com o regime de cada um.',
     ARRAY['code','razaoSocial','documento','tributacao','grupo','cidade','uf'],
     '{"situacao":"MENSAL","status":"ATIVO"}'),

    ('clientes', 'Clientes sem serviço contratado',
     'Mensais ativos que não têm nenhuma área marcada como contratada.',
     ARRAY['code','razaoSocial','documento','situacao','grupo','cidade','uf'],
     '{"situacao":"MENSAL","status":"ATIVO","comServico":"__sem__"}'),

    ('clientes', 'Clientes sem tributação preenchida',
     'Mensais ativos com o campo de tributação vazio — a lista de trabalho para fechar o cadastro.',
     ARRAY['code','razaoSocial','documento','grupo','cidade','uf'],
     '{"situacao":"MENSAL","status":"ATIVO","tributacao":"__sem__"}'),

    ('clientes', 'Clientes com benefício fiscal',
     'Mensais ativos que possuem algum benefício, com os benefícios listados.',
     ARRAY['code','razaoSocial','documento','tributacao','beneficios','cidade','uf'],
     '{"situacao":"MENSAL","status":"ATIVO","comBeneficio":"__com__"}'),

    ('clientes', 'Contatos da carteira',
     'Telefone, e-mail e contatos cadastrados de cada cliente mensal ativo.',
     ARRAY['code','razaoSocial','telefone','email','contatos','cidade','uf'],
     '{"situacao":"MENSAL","status":"ATIVO"}'),

    ('clientes', 'Ex-clientes',
     'Quem já foi mensal e saiu, com a data de saída.',
     ARRAY['code','razaoSocial','documento','dataEntrada','dataSaida','grupo'],
     '{"exCliente":true}')
  ) AS v(modulo, nome, descricao, campos, filtros)
 WHERE NOT EXISTS (
   SELECT 1 FROM relatorio_definicoes r
    WHERE r.origem = 'SISTEMA' AND r.modulo = v.modulo AND r.nome = v.nome
 );
