-- ============================================================================
-- Offboarding de Cliente — o FLUXO (blocos + ligações)
--
-- O `add_fluxo_offboarding_cliente.sql` criou o checklist: 4 etapas, 12 passos,
-- todos pendurados no serviço raiz. Só que um checklist linear não sabe dizer
-- "depende". E o offboarding tem uma escolha que muda o trabalho: a saída é
-- imediata, ou é numa data futura? Na imediata o cliente sai hoje; na agendada
-- ele continua ativo, as áreas registram as datas e o scheduler inativa no dia.
--
-- Este script re-corta o serviço num fluxograma de verdade:
--
--   Offboarding de Cliente (raiz: receber a rescisão, mapear as áreas)
--        │
--        ▼
--   ◇ A saída é imediata ou em uma data futura? ◇
--     │                              │
--   "Imediata"                "Em uma data"
--     ▼                              ▼
--   Encerrar agora        Acompanhar até a data de saída
--     └──────────────┬───────────────┘
--                    ▼
--            Encerrar por área      ← etapa existente, reparentada
--                    ▼
--            Fechamento             ← etapa existente, reparentada
--                    ▼
--            ■ Cliente inativado ■
--
-- NADA é apagado. As etapas 'Encerrar por área' e 'Fechamento' são MOVIDAS
-- (troca do servico_id) para blocos próprios, com os passos junto — quem já
-- estiver executando o offboarding não perde histórico.
--
-- Idempotente: cada bloco é localizado por (servico_pai_id, nome), cada aresta
-- pela unique (origem, destino), e os UPDATEs de reparent não casam nada na
-- segunda rodada. Rodar de novo não duplica.
-- ============================================================================

DO $$
DECLARE
  v_raiz        TEXT;
  v_empresa     TEXT;
  v_area        TEXT;
  v_pergunta    TEXT;
  v_imediata    TEXT;
  v_agendada    TEXT;
  v_por_area    TEXT;
  v_fechamento  TEXT;
  v_fim         TEXT;
  v_etapa       TEXT;
  v_passo       TEXT;
BEGIN
  SELECT id, empresa_id, area_id INTO v_raiz, v_empresa, v_area
    FROM servicos
   WHERE nome = 'Offboarding de Cliente'
     AND servico_pai_id IS NULL
   ORDER BY created_at ASC
   LIMIT 1;

  IF v_raiz IS NULL THEN
    RAISE NOTICE 'Serviço "Offboarding de Cliente" não encontrado — nada a fazer.';
    RETURN;
  END IF;

  -- ══════════════════════════════════════════════════════════════════════
  -- 1) OS BLOCOS
  --    Todos são sub-serviços de fluxo (categoria FLUXO, filhos da raiz) e
  --    ficam fora do catálogo de orçamento — são peças do desenho, não itens
  --    que alguém contrata.
  -- ══════════════════════════════════════════════════════════════════════

  -- ── A decisão ────────────────────────────────────────────────────────
  -- É a mesma pergunta que a ficha do cliente faz ao inativar. Estar no fluxo
  -- é o que faz o gestor receber só o checklist do caminho escolhido.
  INSERT INTO servicos (
    id, nome, empresa_id, area_id, servico_pai_id, categoria_servico, tipo,
    disponivel_orcamento, pergunta_texto, pergunta_opcoes, pergunta_multi,
    descricao, updated_at
  )
  SELECT gen_random_uuid()::text, 'Imediata ou em uma data?', v_empresa, v_area, v_raiz,
         'FLUXO', 'PERGUNTA', FALSE,
         'A saída deste cliente é imediata ou está marcada para uma data futura?',
         '["Imediata", "Em uma data"]'::jsonb, FALSE,
         'Define o caminho do offboarding. Imediata: o cliente sai hoje. Em uma data: '
         || 'ele continua ativo até o dia previsto, e o sistema inativa sozinho quando chegar.',
         now()
   WHERE NOT EXISTS (
     SELECT 1 FROM servicos WHERE servico_pai_id = v_raiz AND nome = 'Imediata ou em uma data?');

  SELECT id INTO v_pergunta FROM servicos
   WHERE servico_pai_id = v_raiz AND nome = 'Imediata ou em uma data?';

  -- ── Caminho 1: saída imediata ────────────────────────────────────────
  INSERT INTO servicos (
    id, nome, empresa_id, area_id, servico_pai_id, categoria_servico, tipo,
    disponivel_orcamento, descricao, updated_at
  )
  SELECT gen_random_uuid()::text, 'Encerrar agora', v_empresa, v_area, v_raiz,
         'FLUXO', 'ATIVIDADE', FALSE,
         'Sem data futura: a inativação acontece na hora e as áreas são avisadas sem prazo de preparação.',
         now()
   WHERE NOT EXISTS (
     SELECT 1 FROM servicos WHERE servico_pai_id = v_raiz AND nome = 'Encerrar agora');

  SELECT id INTO v_imediata FROM servicos
   WHERE servico_pai_id = v_raiz AND nome = 'Encerrar agora';

  INSERT INTO servico_etapas (id, servico_id, nome, ordem)
  SELECT gen_random_uuid()::text, v_imediata, 'Saída imediata', 0
   WHERE NOT EXISTS (SELECT 1 FROM servico_etapas WHERE servico_id = v_imediata AND nome = 'Saída imediata');

  SELECT id INTO v_etapa FROM servico_etapas
   WHERE servico_id = v_imediata AND nome = 'Saída imediata';

  INSERT INTO servico_passos (id, etapa_id, nome, ordem, obrigatorio, sla_minutos, texto_orientativo)
  SELECT gen_random_uuid()::text, v_etapa, p.nome, p.ordem, TRUE, p.sla, p.dica
    FROM (VALUES
      ('Inativar o cliente no cadastro', 0, 60,
       'Na ficha do cliente, use Inativar e escolha "Imediatamente". Ele sai da lista de ativos na hora — '
       || 'confira antes se não há entrega em curso que dependa dos acessos.'),
      ('Comunicar a saída às áreas', 1, 60,
       'A inativação já notifica os líderes das áreas contratadas. Como não houve prazo de preparação, '
       || 'confirme com cada um pessoalmente: o que estiver em aberto precisa ser resolvido agora, não no mês que vem.')
    ) AS p(nome, ordem, sla, dica)
   WHERE NOT EXISTS (SELECT 1 FROM servico_passos WHERE etapa_id = v_etapa AND nome = p.nome);

  -- ── Caminho 2: saída agendada ────────────────────────────────────────
  INSERT INTO servicos (
    id, nome, empresa_id, area_id, servico_pai_id, categoria_servico, tipo,
    disponivel_orcamento, descricao, updated_at
  )
  SELECT gen_random_uuid()::text, 'Acompanhar até a data de saída', v_empresa, v_area, v_raiz,
         'FLUXO', 'ATIVIDADE', FALSE,
         'O cliente continua ativo até o dia previsto. O trabalho aqui é garantir que as áreas '
         || 'registrem as datas de encerramento antes de a inativação automática acontecer.',
         now()
   WHERE NOT EXISTS (
     SELECT 1 FROM servicos WHERE servico_pai_id = v_raiz AND nome = 'Acompanhar até a data de saída');

  SELECT id INTO v_agendada FROM servicos
   WHERE servico_pai_id = v_raiz AND nome = 'Acompanhar até a data de saída';

  INSERT INTO servico_etapas (id, servico_id, nome, ordem)
  SELECT gen_random_uuid()::text, v_agendada, 'Até a data prevista', 0
   WHERE NOT EXISTS (SELECT 1 FROM servico_etapas WHERE servico_id = v_agendada AND nome = 'Até a data prevista');

  SELECT id INTO v_etapa FROM servico_etapas
   WHERE servico_id = v_agendada AND nome = 'Até a data prevista';

  INSERT INTO servico_passos (id, etapa_id, nome, ordem, obrigatorio, sla_minutos, texto_orientativo)
  SELECT gen_random_uuid()::text, v_etapa, p.nome, p.ordem, p.obrig, p.sla, p.dica
    FROM (VALUES
      ('Agendar a inativação no cadastro', 0, TRUE, 60,
       'Na ficha do cliente, use Inativar e escolha "Em uma data", com a previsão de saída. O cliente '
       || 'continua ativo até lá, e os líderes das áreas contratadas são convocados na hora para informar '
       || 'o encerramento de cada serviço.'),
      ('Acompanhar as datas informadas pelas áreas', 1, TRUE, 2880,
       'Na aba Serviços do cliente dá pra ver quais áreas já registraram o encerramento. Área sem data '
       || 'é área que vai aparecer na cobrança automática no dia da saída.'),
      ('Cobrar quem ainda não informou', 2, FALSE, 1440,
       'Perto da data prevista, quem não registrou trava a saída limpa. Cobrar antes do dia custa um '
       || 'recado; cobrar depois custa retrabalho com o cliente já inativo.')
    ) AS p(nome, ordem, obrig, sla, dica)
   WHERE NOT EXISTS (SELECT 1 FROM servico_passos WHERE etapa_id = v_etapa AND nome = p.nome);

  -- ── Convergência: os dois caminhos voltam a ser o mesmo trabalho ──────
  INSERT INTO servicos (
    id, nome, empresa_id, area_id, servico_pai_id, categoria_servico, tipo,
    disponivel_orcamento, descricao, updated_at
  )
  SELECT gen_random_uuid()::text, 'Encerrar por área', v_empresa, v_area, v_raiz,
         'FLUXO', 'ATIVIDADE', FALSE,
         'Cada área contratada informa até quando presta o serviço, conclui o que está em aberto e '
         || 'devolve documentos e acessos.',
         now()
   WHERE NOT EXISTS (
     SELECT 1 FROM servicos WHERE servico_pai_id = v_raiz AND nome = 'Encerrar por área');

  SELECT id INTO v_por_area FROM servicos
   WHERE servico_pai_id = v_raiz AND nome = 'Encerrar por área';

  INSERT INTO servicos (
    id, nome, empresa_id, area_id, servico_pai_id, categoria_servico, tipo,
    disponivel_orcamento, descricao, updated_at
  )
  SELECT gen_random_uuid()::text, 'Fechamento', v_empresa, v_area, v_raiz,
         'FLUXO', 'ATIVIDADE', FALSE,
         'Pendências financeiras, encerramento do contrato, confirmação da inativação e o registro do '
         || 'que se aprendeu com a saída.',
         now()
   WHERE NOT EXISTS (
     SELECT 1 FROM servicos WHERE servico_pai_id = v_raiz AND nome = 'Fechamento');

  SELECT id INTO v_fechamento FROM servicos
   WHERE servico_pai_id = v_raiz AND nome = 'Fechamento';

  INSERT INTO servicos (
    id, nome, empresa_id, area_id, servico_pai_id, categoria_servico, tipo,
    disponivel_orcamento, descricao, updated_at
  )
  SELECT gen_random_uuid()::text, 'Cliente inativado', v_empresa, v_area, v_raiz,
         'FLUXO', 'FIM', FALSE,
         'Fim do offboarding: contrato encerrado, áreas com data registrada e cliente fora da base ativa.',
         now()
   WHERE NOT EXISTS (
     SELECT 1 FROM servicos WHERE servico_pai_id = v_raiz AND nome = 'Cliente inativado');

  SELECT id INTO v_fim FROM servicos
   WHERE servico_pai_id = v_raiz AND nome = 'Cliente inativado';

  -- ══════════════════════════════════════════════════════════════════════
  -- 2) REPARENT — as etapas que agora moram depois da decisão
  --    Troca só o dono da etapa; os passos vão junto (a FK é da etapa).
  -- ══════════════════════════════════════════════════════════════════════
  UPDATE servico_etapas SET servico_id = v_por_area, ordem = 0
   WHERE servico_id = v_raiz AND nome = 'Encerrar por área';

  UPDATE servico_etapas SET servico_id = v_fechamento, ordem = 0
   WHERE servico_id = v_raiz AND nome = 'Fechamento';

  -- ══════════════════════════════════════════════════════════════════════
  -- 3) OS PASSOS DA RAIZ QUE A DECISÃO TORNOU PREMATUROS
  -- ══════════════════════════════════════════════════════════════════════

  -- 'Agendar a saída no cadastro' mandava escolher "Em uma data" — ou seja,
  -- respondia a pergunta antes de ela ser feita. Na raiz fica só o registro da
  -- data que o cliente informou; agir no cadastro é trabalho de cada caminho.
  UPDATE servico_passos SET
    nome = 'Definir a data de saída',
    texto_orientativo = 'A data que o cliente informou como último dia. Aqui é só o registro — '
      || 'inativar na hora ou agendar para essa data é o que o fluxo pergunta no bloco seguinte.'
   WHERE nome = 'Agendar a saída no cadastro'
     AND etapa_id IN (SELECT id FROM servico_etapas WHERE servico_id = v_raiz);

  -- 'Confirmar que os líderes foram avisados' depende da inativação já ter sido
  -- registrada — o que agora acontece dentro dos caminhos. Vai para o bloco onde
  -- é verdade, na frente dos passos que já estavam lá.
  SELECT p.id INTO v_passo
    FROM servico_passos p
    JOIN servico_etapas e ON e.id = p.etapa_id
   WHERE e.servico_id = v_raiz AND p.nome = 'Confirmar que os líderes foram avisados';

  IF v_passo IS NOT NULL THEN
    SELECT id INTO v_etapa FROM servico_etapas
     WHERE servico_id = v_por_area AND nome = 'Encerrar por área';

    IF v_etapa IS NOT NULL THEN
      UPDATE servico_passos SET ordem = ordem + 1 WHERE etapa_id = v_etapa;
      UPDATE servico_passos SET
        etapa_id = v_etapa,
        ordem = 0,
        texto_orientativo = 'Registrar a saída no cadastro dispara a notificação para o líder de cada '
          || 'área contratada. Confirme que todos receberam; onde a área não tem responsável definido, '
          || 'avise à mão e corrija o cadastro — senão ninguém vai registrar data nenhuma.'
       WHERE id = v_passo;
    END IF;
  END IF;

  -- ══════════════════════════════════════════════════════════════════════
  -- 4) AS LIGAÇÕES
  --    `rotulo` é o que roteia a decisão: em runtime o bloco PERGUNTA fica
  --    aguardando resposta e só o sucessor cujo rótulo casa com a opção
  --    escolhida é disparado. Por isso os rótulos precisam ser IDÊNTICOS às
  --    opções gravadas em pergunta_opcoes.
  -- ══════════════════════════════════════════════════════════════════════
  INSERT INTO servico_encadeamentos (
    id, servico_origem_id, servico_destino_id, ordem, inicia_auto, obrigatorio,
    herda_responsavel, rotulo, created_at
  )
  SELECT gen_random_uuid()::text, l.origem, l.destino, l.ordem, TRUE, TRUE, TRUE, l.rotulo, now()
    FROM (VALUES
      (v_raiz,       v_pergunta,   0, NULL),
      (v_pergunta,   v_imediata,   0, 'Imediata'),
      (v_pergunta,   v_agendada,   1, 'Em uma data'),
      (v_imediata,   v_por_area,   0, NULL),
      (v_agendada,   v_por_area,   0, NULL),
      (v_por_area,   v_fechamento, 0, NULL),
      (v_fechamento, v_fim,        0, NULL)
    ) AS l(origem, destino, ordem, rotulo)
   WHERE l.origem IS NOT NULL AND l.destino IS NOT NULL
  ON CONFLICT (servico_origem_id, servico_destino_id) DO NOTHING;

  RAISE NOTICE 'Fluxo do Offboarding montado: 6 blocos, 7 ligações, 2 etapas reparentadas.';
END $$;
