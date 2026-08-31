-- ============================================================================
-- Offboarding — o fluxo passa a esperar a data de saída, e a convocação passa
-- a cair em quem tem que agir.
--
-- O `add_fluxo_offboarding_blocos.sql` desenhou o fluxograma, mas o motor não
-- conhece data: o sucessor nasce no instante em que o bloco anterior é
-- concluído. Com a saída marcada para 10/09, isso dava três problemas:
--
--   1. "Acompanhar até a data de saída" tem SLA de 73h. Com a rescisão chegando
--      13 dias antes, o bloco nascia com prazo para dali a três dias e o cron
--      horário cobrava o responsável por um atraso que era a própria espera.
--   2. Nada segurava o fluxo até o dia 10: bastava alguém fechar o checklist
--      para "Encerrar por área" nascer com o cliente ainda ativo.
--   3. "Encerrar por área" herdava o responsável do comercial. Quem precisa
--      registrar a data de encerramento é o líder de cada área contratada — e
--      eles só eram alcançados pela notificação do cron, nunca pelo fluxo.
--
-- Este script liga as duas flags que resolvem isso (a lógica está no backend) e
-- solta a herança de responsável na entrada do bloco de encerramento.
--
-- Idempotente: são UPDATEs para um valor fixo. Rodar de novo não muda nada.
-- ============================================================================

-- As colunas nascem do schema.prisma, e o deploy as cria no `db push`. Elas
-- estão aqui de novo, com IF NOT EXISTS, porque este script é o que depende
-- delas: se por qualquer motivo o push não tiver rodado, o UPDATE abaixo
-- quebraria com "column does not exist" no meio do deploy. Já existindo, é no-op.
ALTER TABLE servicos ADD COLUMN IF NOT EXISTS aguarda_saida_cliente BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE servicos ADD COLUMN IF NOT EXISTS atribuicao_usa_areas_contratadas BOOLEAN NOT NULL DEFAULT FALSE;

DO $$
DECLARE
  v_raiz     TEXT;
  v_agendada TEXT;
  v_por_area TEXT;
BEGIN
  SELECT id INTO v_raiz
    FROM servicos
   WHERE nome = 'Offboarding de Cliente'
     AND servico_pai_id IS NULL
   ORDER BY created_at ASC
   LIMIT 1;

  IF v_raiz IS NULL THEN
    RAISE NOTICE 'Serviço "Offboarding de Cliente" não encontrado — nada a fazer.';
    RETURN;
  END IF;

  SELECT id INTO v_agendada FROM servicos
   WHERE servico_pai_id = v_raiz AND nome = 'Acompanhar até a data de saída';
  SELECT id INTO v_por_area FROM servicos
   WHERE servico_pai_id = v_raiz AND nome = 'Encerrar por área';

  -- ── O bloco que espera a data ──────────────────────────────────────────
  -- Com a flag, o prazo da execução vira a data marcada no cadastro (e não
  -- iniciadoEm + SLA), e o job de inativação agendada conclui o bloco no dia,
  -- disparando "Encerrar por área". É o que faz a espera ser do sistema, não
  -- da memória de quem está tocando o offboarding.
  IF v_agendada IS NOT NULL THEN
    UPDATE servicos SET aguarda_saida_cliente = TRUE, updated_at = now()
     WHERE id = v_agendada AND aguarda_saida_cliente IS DISTINCT FROM TRUE;
  END IF;

  -- ── O bloco que atravessa as áreas ─────────────────────────────────────
  IF v_por_area IS NOT NULL THEN
    UPDATE servicos SET atribuicao_usa_areas_contratadas = TRUE, updated_at = now()
     WHERE id = v_por_area AND atribuicao_usa_areas_contratadas IS DISTINCT FROM TRUE;

    -- Herdar o responsável aqui é o que mantinha o bloco no colo do comercial.
    -- Sem herança, a atribuição cai para as flags do template acima: a execução
    -- nasce sem dono e aparece no painel de todos os líderes das áreas que
    -- ESTE cliente contratou — o primeiro a agir reivindica.
    UPDATE servico_encadeamentos SET herda_responsavel = FALSE
     WHERE servico_destino_id = v_por_area AND herda_responsavel IS DISTINCT FROM FALSE;
  END IF;

  RAISE NOTICE 'Offboarding: espera por data e atribuição por áreas contratadas ligadas.';
END $$;
