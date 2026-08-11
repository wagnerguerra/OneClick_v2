-- Dá dono às execuções vindas do Acessórias que estão sem responsável.
--
-- O painel /meus-servicos tinha 2.322 execuções em andamento e apenas 3 com
-- responsável — numa tela cujo subtítulo é "Execuções de serviço atribuídas a
-- você". O dado de quem responde sempre chegou do Acessórias; só nunca foi
-- convertido em `responsavel_id`.
--
-- A cadeia é toda por ID, nunca por grafia de nome:
--   servico_execucoes.acessorias_ent_id
--     → acessorias_entregas.resp_entrega_id / resp_prazo_id
--       → acessorias_colaboradores.acessorias_id
--         → users.id
--
-- RespEntrega tem precedência (é quem de fato entregou), mas só existe DEPOIS
-- da entrega: nas 8.694 entregas em aberto ele vem vazio em 100% dos casos.
-- Por isso o COALESCE com RespPrazo, o responsável designado — sem ele, a
-- obrigação pendente, que é justamente a que precisa de dono, ficaria órfã.
--
-- Idempotente: só toca linha com responsavel_id NULL, então roda em todo deploy
-- sem efeito colateral e nunca sobrescreve atribuição feita à mão.
--
-- Restrito às execuções ABERTAS: 1.811 linhas, 25 pessoas, 945 delas atrasadas.
-- A mesma junção alcançaria 8.013 se incluísse concluídas e dispensadas — daria
-- dono ao histórico e faria relatório por responsável valer para trás —, mas é
-- outro assunto, e mexer em 5,7 mil linhas fechadas não é o que o painel pede.

UPDATE servico_execucoes e
   SET responsavel_id = c.user_id,
       -- Guarda a fonte usada, para o sync saber depois se a atribuição MUDOU
       -- no Acessórias (e só então reatribuir, preservando troca manual).
       acessorias_resp_entrega_id = a.resp_entrega_id,
       acessorias_resp_prazo_id   = a.resp_prazo_id
  FROM acessorias_entregas a
  JOIN acessorias_colaboradores c
    ON c.acessorias_id = COALESCE(a.resp_entrega_id, a.resp_prazo_id)
 WHERE a.cliente_id = e.cliente_id
   AND a.ent_id     = e.acessorias_ent_id
   AND e.responsavel_id IS NULL
   AND e.status IN ('EM_ANDAMENTO', 'AGUARDANDO_INICIO')
   AND e.arquivado = false
   AND c.user_id IS NOT NULL;

-- Preenche os IDs de origem também onde o colaborador ainda NÃO está casado com
-- um usuário. A execução segue sem dono (o certo — melhor sem responsável do
-- que com o errado), mas quando alguém casar o colaborador na tela de Vínculos,
-- o próximo sync já encontra a execução com a fonte registrada.
UPDATE servico_execucoes e
   SET acessorias_resp_entrega_id = a.resp_entrega_id,
       acessorias_resp_prazo_id   = a.resp_prazo_id
  FROM acessorias_entregas a
 WHERE a.cliente_id = e.cliente_id
   AND a.ent_id     = e.acessorias_ent_id
   AND e.acessorias_resp_entrega_id IS NULL
   AND e.acessorias_resp_prazo_id   IS NULL
   AND e.status IN ('EM_ANDAMENTO', 'AGUARDANDO_INICIO')
   AND e.arquivado = false
   AND (a.resp_entrega_id IS NOT NULL OR a.resp_prazo_id IS NOT NULL);
