-- Fluxo do serviço "Offboarding de Cliente".
--
-- É DADO, não código: etapas e passos que o time vai enriquecer pela própria
-- tela de Serviços com o tempo. Este arquivo dá a largada — as quatro etapas
-- que o Wagner desenhou — para ninguém ter de montar tudo à mão na primeira vez.
--
-- Idempotente por construção: cada INSERT tem `WHERE NOT EXISTS` na chave
-- (serviço + nome da etapa, etapa + nome do passo). Rodar de novo não duplica,
-- e — o que importa mais — NÃO desfaz o que alguém já tiver ajustado na tela.
-- Um DELETE + INSERT seria mais simples de escrever e apagaria o trabalho do
-- time a cada publicação.
--
-- O serviço é localizado pelo NOME dentro da empresa, não por id: id de produção
-- num arquivo versionado não sobrevive a outro ambiente.

DO $$
DECLARE
  v_servico_id  TEXT;
  v_etapa_id    TEXT;
BEGIN
  SELECT id INTO v_servico_id
    FROM servicos
   WHERE nome = 'Offboarding de Cliente'
   ORDER BY created_at ASC
   LIMIT 1;

  IF v_servico_id IS NULL THEN
    RAISE NOTICE 'Serviço "Offboarding de Cliente" não existe nesta base — fluxo não criado.';
    RETURN;
  END IF;

  -- ═══════════════════════════════════════════════════════════════
  -- Etapa 1 — Receber a rescisão
  -- ═══════════════════════════════════════════════════════════════
  INSERT INTO servico_etapas (id, servico_id, nome, ordem)
  SELECT gen_random_uuid()::text, v_servico_id, 'Receber a rescisão', 0
   WHERE NOT EXISTS (SELECT 1 FROM servico_etapas WHERE servico_id = v_servico_id AND nome = 'Receber a rescisão');

  SELECT id INTO v_etapa_id FROM servico_etapas
   WHERE servico_id = v_servico_id AND nome = 'Receber a rescisão';

  INSERT INTO servico_passos (id, etapa_id, nome, ordem, obrigatorio, sla_minutos, texto_orientativo)
  SELECT gen_random_uuid()::text, v_etapa_id, p.nome, p.ordem, TRUE, p.sla, p.dica
    FROM (VALUES
      ('Registrar o aviso recebido', 0, 60,
       'Como a rescisão chegou (e-mail, WhatsApp, telefone, presencial), a data do aviso e quem comunicou. Anexe o que foi recebido.'),
      ('Registrar o motivo da saída', 1, 30,
       'O que o cliente alegou. É o dado que alimenta o indicador de perda — vale escrever com as palavras dele.'),
      ('Agendar a saída no cadastro', 2, 60,
       'Na ficha do cliente, use Inativar e escolha "Em uma data", com a previsão de saída. O cliente continua ativo até lá, e os líderes das áreas contratadas são convocados automaticamente para informar o encerramento de cada serviço.')
    ) AS p(nome, ordem, sla, dica)
   WHERE NOT EXISTS (SELECT 1 FROM servico_passos WHERE etapa_id = v_etapa_id AND nome = p.nome);

  -- ═══════════════════════════════════════════════════════════════
  -- Etapa 2 — Convocar as áreas
  -- ═══════════════════════════════════════════════════════════════
  INSERT INTO servico_etapas (id, servico_id, nome, ordem)
  SELECT gen_random_uuid()::text, v_servico_id, 'Convocar as áreas', 1
   WHERE NOT EXISTS (SELECT 1 FROM servico_etapas WHERE servico_id = v_servico_id AND nome = 'Convocar as áreas');

  SELECT id INTO v_etapa_id FROM servico_etapas
   WHERE servico_id = v_servico_id AND nome = 'Convocar as áreas';

  INSERT INTO servico_passos (id, etapa_id, nome, ordem, obrigatorio, sla_minutos, texto_orientativo)
  SELECT gen_random_uuid()::text, v_etapa_id, p.nome, p.ordem, TRUE, p.sla, p.dica
    FROM (VALUES
      ('Conferir as áreas contratadas', 0, 30,
       'Abra a aba Serviços do cliente e confira se as áreas contratadas estão corretas. É essa lista que define quem será convocado — área faltando aqui é área que não vai encerrar nada.'),
      ('Confirmar que os líderes foram avisados', 1, 60,
       'O agendamento dispara a notificação para o líder de cada área contratada. Confirme que todos receberam; onde a área não tem responsável definido, avise à mão e corrija o cadastro.')
    ) AS p(nome, ordem, sla, dica)
   WHERE NOT EXISTS (SELECT 1 FROM servico_passos WHERE etapa_id = v_etapa_id AND nome = p.nome);

  -- ═══════════════════════════════════════════════════════════════
  -- Etapa 3 — Encerrar por área
  -- ═══════════════════════════════════════════════════════════════
  INSERT INTO servico_etapas (id, servico_id, nome, ordem)
  SELECT gen_random_uuid()::text, v_servico_id, 'Encerrar por área', 2
   WHERE NOT EXISTS (SELECT 1 FROM servico_etapas WHERE servico_id = v_servico_id AND nome = 'Encerrar por área');

  SELECT id INTO v_etapa_id FROM servico_etapas
   WHERE servico_id = v_servico_id AND nome = 'Encerrar por área';

  -- Um passo por área contratada seria o desenho mais fiel, mas o template do
  -- serviço é fixo e as áreas variam de cliente para cliente. Então o passo é
  -- um só, e a LISTA de áreas está na ficha — que é onde ela é verdadeira.
  INSERT INTO servico_passos (id, etapa_id, nome, ordem, obrigatorio, sla_minutos, texto_orientativo)
  SELECT gen_random_uuid()::text, v_etapa_id, p.nome, p.ordem, TRUE, p.sla, p.dica
    FROM (VALUES
      ('Registrar a data de encerramento de cada área', 0, 2880,
       'Cada líder informa, na aba Serviços do cliente, até quando a sua área presta o serviço. Este passo só se conclui quando todas as áreas contratadas tiverem data.'),
      ('Concluir as entregas em aberto', 1, 2880,
       'Obrigações do período, guias, folha e o que mais estiver em curso até a data de encerramento de cada área.'),
      ('Devolver documentos e acessos', 2, 1440,
       'Documentos físicos e digitais do cliente, e a retirada dos acessos (procurações, certificados, portais) que deixam de ser necessários.')
    ) AS p(nome, ordem, sla, dica)
   WHERE NOT EXISTS (SELECT 1 FROM servico_passos WHERE etapa_id = v_etapa_id AND nome = p.nome);

  -- ═══════════════════════════════════════════════════════════════
  -- Etapa 4 — Fechamento
  -- ═══════════════════════════════════════════════════════════════
  INSERT INTO servico_etapas (id, servico_id, nome, ordem)
  SELECT gen_random_uuid()::text, v_servico_id, 'Fechamento', 3
   WHERE NOT EXISTS (SELECT 1 FROM servico_etapas WHERE servico_id = v_servico_id AND nome = 'Fechamento');

  SELECT id INTO v_etapa_id FROM servico_etapas
   WHERE servico_id = v_servico_id AND nome = 'Fechamento';

  INSERT INTO servico_passos (id, etapa_id, nome, ordem, obrigatorio, sla_minutos, texto_orientativo)
  SELECT gen_random_uuid()::text, v_etapa_id, p.nome, p.ordem, p.obrig, p.sla, p.dica
    FROM (VALUES
      ('Conferir pendências financeiras', 0, TRUE, 720,
       'Honorários em aberto e o que mais estiver pendente com o financeiro antes de encerrar o contrato.'),
      ('Encerrar o contrato', 1, TRUE, 720,
       'Formalize o encerramento e registre a data. É o que fecha a relação do lado do documento.'),
      ('Confirmar a inativação do cliente', 2, TRUE, 60,
       'Na data agendada o sistema inativa sozinho. Confira que aconteceu, e que nenhuma área ficou sem data de encerramento — a notificação avisa quem faltou.'),
      ('Registrar aprendizados da saída', 3, FALSE, 60,
       'O que levou à perda e o que daria para ter feito diferente. Opcional, mas é o que transforma uma saída em informação.')
    ) AS p(nome, ordem, obrig, sla, dica)
   WHERE NOT EXISTS (SELECT 1 FROM servico_passos WHERE etapa_id = v_etapa_id AND nome = p.nome);

  RAISE NOTICE 'Fluxo de Offboarding de Cliente conferido/criado para o serviço %.', v_servico_id;
END $$;
