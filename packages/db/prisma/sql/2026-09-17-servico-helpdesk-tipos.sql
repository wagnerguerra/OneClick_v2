-- Semeia os tipos de chamado atendidos por cada serviço interno da TI
--
-- Contexto: o campo "categoria" do chamado foi substituído por um seletor de
-- SERVIÇOS internos da TI, e o tipo do chamado (Incidente/Requisição/Dúvida/
-- Melhoria) filtra essa lista por `servicos.helpdesk_tipos`.
--
-- Sem este seed, os 38 serviços internos nascem com a lista VAZIA e o seletor
-- aparece vazio em qualquer tipo escolhido — a conversão ficaria inerte.
--
-- A classificação abaixo é um ponto de partida conservador, derivado do nome de
-- cada serviço (as categorias-espelho seguiam o padrão "Grupo · Assunto"):
--   INCIDENTE  = algo parou/quebrou   (acesso negado, senha, falha, erro)
--   REQUISICAO = pedido de provimento (conta nova, instalação, solicitação)
--   DUVIDA     = orientação
--   MELHORIA   = sugestão/evolução
--
-- Serviço pode atender vários tipos de propósito: "Reset de senha" é Incidente
-- para quem não consegue entrar e Requisição para quem quer trocar.
--
-- Idempotente: só grava onde a lista ainda está vazia, então reclassificação
-- feita à mão na tela do serviço (/servicos/[id] → Tipo de cadastro) não é
-- sobrescrita ao rodar de novo.
--
-- IMPORTANTE: rodar como o usuário `oneclick` (não como `postgres`), senão o
-- db push do deploy quebra com permission denied.

-- 1) Estado antes
SELECT COUNT(*) AS internos_ti,
       COUNT(*) FILTER (WHERE cardinality(helpdesk_tipos) > 0) AS ja_classificados
  FROM servicos
 WHERE ativo AND eh_servico_interno;

-- 2) Incidente — falha, indisponibilidade, bloqueio
UPDATE servicos SET helpdesk_tipos = ARRAY['INCIDENTE']::"HelpdeskTipo"[]
 WHERE ativo AND eh_servico_interno
   AND cardinality(helpdesk_tipos) = 0
   AND nome ~* 'negad|falha|erro|indisponi|lent|travand|vazament|indevid|seguran|v[ií]rus|backup';

-- 3) Requisição — provimento, criação, instalação
UPDATE servicos SET helpdesk_tipos = ARRAY['REQUISICAO']::"HelpdeskTipo"[]
 WHERE ativo AND eh_servico_interno
   AND cardinality(helpdesk_tipos) = 0
   AND nome ~* 'conta nova|desligamento|colaborador|instala|solicita|cadastr|licen|equipament|aquisi|acesso remoto|vpn';

-- 4) Reset de senha e MFA atendem os dois casos
UPDATE servicos SET helpdesk_tipos = ARRAY['INCIDENTE','REQUISICAO']::"HelpdeskTipo"[]
 WHERE ativo AND eh_servico_interno
   AND cardinality(helpdesk_tipos) = 0
   AND nome ~* 'senha|mfa|two-factor|2fa|autentica';

-- 5) O que sobrou fica disponível para os quatro tipos, em vez de invisível.
--    Serviço sem tipo não aparece em filtro nenhum — e "sem classificar" não
--    deve significar "inalcançável" enquanto a TI não revisar o cadastro.
UPDATE servicos SET helpdesk_tipos = ARRAY['INCIDENTE','REQUISICAO','DUVIDA','MELHORIA']::"HelpdeskTipo"[]
 WHERE ativo AND eh_servico_interno
   AND cardinality(helpdesk_tipos) = 0;

-- 6) Conferência — o que cada tipo passa a oferecer, e quantos têm checklist
SELECT t.tipo,
       COUNT(*) AS servicos_oferecidos,
       COUNT(*) FILTER (WHERE (SELECT COUNT(*) FROM servico_etapas e WHERE e.servico_id = s.id) > 0) AS com_checklist
  FROM (VALUES ('INCIDENTE'),('REQUISICAO'),('DUVIDA'),('MELHORIA')) AS t(tipo)
  JOIN servicos s ON s.ativo AND s.eh_servico_interno AND t.tipo = ANY(s.helpdesk_tipos::text[])
 GROUP BY t.tipo
 ORDER BY 1;
