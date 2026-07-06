-- ============================================================
-- Relatório de QA (/configuracoes → Relatório de QA).
-- Registro de achados de auditoria/QA para tratamento: severidade, status,
-- notas. Semeado com a auditoria do módulo /agenda de 06/07/2026.
--
-- Guard NOT EXISTS no seed: semeia UMA vez; itens tratados/excluídos pelo
-- usuário NÃO são recriados em deploys seguintes (mesma lição do seed de
-- tipos da agenda). Idempotente.
-- ============================================================

CREATE TABLE IF NOT EXISTS qa_itens (
  id            text PRIMARY KEY,
  modulo        text NOT NULL,
  severidade    text NOT NULL DEFAULT 'MEDIA',          -- ALTA | MEDIA | BAIXA
  titulo        text NOT NULL,
  descricao     text,
  arquivo       text,                                    -- referência arquivo:linha
  fix_proposto  text,
  status        text NOT NULL DEFAULT 'PENDENTE',        -- PENDENTE | EM_ANDAMENTO | CORRIGIDO | DESCARTADO
  notas         text,
  origem        text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  resolvido_em  timestamptz
);
CREATE INDEX IF NOT EXISTS qa_itens_status_idx ON qa_itens (status);
CREATE INDEX IF NOT EXISTS qa_itens_modulo_idx ON qa_itens (modulo);

-- Número sequencial da ocorrência (#1, #2, ...) — serial preenche as linhas
-- existentes na ordem de inserção e numera as novas automaticamente.
ALTER TABLE qa_itens ADD COLUMN IF NOT EXISTS numero serial;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM qa_itens WHERE id LIKE 'qa_ag26_%') THEN
    INSERT INTO qa_itens (id, modulo, severidade, titulo, descricao, arquivo, fix_proposto, origem) VALUES
    ('qa_ag26_a1', 'agenda', 'ALTA', 'Disparo diário vaza eventos entre empresas',
     'enviarAgendaDia busca todos os eventos do dia sem filtrar empresaId — em cenário multi-empresa, o e-mail "Agenda do dia" inclui eventos de outras empresas. Só o filtro de particular é aplicado.',
     'apps/api/src/agenda/agenda-disparo.service.ts:312-316',
     'Filtrar a query por empresaId do destinatário (considerando eventos globais, se aplicável).',
     'Auditoria /agenda 06/07/2026'),
    ('qa_ag26_a2', 'agenda', 'ALTA', 'Dono não consegue editar a própria anotação/anexo do evento',
     'podeGerenciarRegistro(a.userId) — o objeto não tem userId (o tipo define user.id). Resultado undefined: só quem tem a sub-perm gerenciar_anotacoes_anexos/master vê os botões; o autor comum não mexe no que criou.',
     'apps/web/src/app/(dashboard)/agenda/page.tsx:469,535',
     'Trocar a.userId/x.userId por a.user?.id / x.user?.id.',
     'Auditoria /agenda 06/07/2026'),
    ('qa_ag26_a3', 'agenda', 'ALTA', 'Lembrete de evento particular vai para todos os participantes',
     'dispararLembrete envia pra criador + participantes sem checar evento.particular. O e-mail diário aplica "particular = só o criador"; o lembrete não — expõe título/detalhes.',
     'apps/api/src/agenda/agenda-lembrete.service.ts:246-249',
     'Aplicar a mesma regra do disparo diário (particular → só o criador recebe).',
     'Auditoria /agenda 06/07/2026'),
    ('qa_ag26_m1', 'agenda', 'MEDIA', 'deleteLote (série recorrente) sem checagem de posse/sub-perm',
     'Exclui a série inteira só com deleteProcedure do módulo; não exige a sub-perm delete_eventos nem ser dono (o delete individual é mais restrito).',
     'apps/api/src/agenda/agenda.router.ts:242 + agenda.service.ts:1236',
     'Exigir dono OU sub-perm delete_eventos/editar_todos_eventos, como no delete individual.',
     'Auditoria /agenda 06/07/2026'),
    ('qa_ag26_m2', 'agenda', 'MEDIA', 'Datas com off-by-one de timezone (padrão repetido)',
     'new Date(''YYYY-MM-DD'') interpretado como UTC (disparo:309/483); toISOString().slice(0,10) devolve data UTC (lembrete/service:1084 — evento 23h BR vira o dia seguinte); toTimeString() dependente de locale (google:294).',
     'agenda-disparo.service.ts:309,483 · agenda-lembrete.service.ts · agenda.service.ts:1084 · agenda-google.service.ts:294',
     'Criar helper único de data BR (padronizar no toBrasilia() já existente no disparo) e trocar os 4 pontos.',
     'Auditoria /agenda 06/07/2026'),
    ('qa_ag26_m3', 'agenda', 'MEDIA', 'Update de participantes sem transação',
     'Delete + createMany fora de $transaction — erro no meio deixa o evento sem participantes.',
     'apps/api/src/agenda/agenda.service.ts:1134-1146',
     'Envolver as duas operações em prisma.$transaction.',
     'Auditoria /agenda 06/07/2026'),
    ('qa_ag26_m4', 'agenda', 'MEDIA', 'Template de e-mail sempre global (ignora empresa)',
     'getTemplate(null) no disparo — em multi-empresa, todos usam o mesmo modelo de e-mail.',
     'apps/api/src/agenda/agenda-disparo.service.ts:336',
     'Passar o empresaId do destinatário/config ao getTemplate.',
     'Auditoria /agenda 06/07/2026'),
    ('qa_ag26_m5', 'agenda', 'MEDIA', 'Google sync cria tabela em runtime',
     'CREATE TABLE IF NOT EXISTS dentro do callback OAuth — schema deve nascer em SQL cirúrgico de deploy, não em request.',
     'apps/api/src/agenda/agenda-google.service.ts:43-90',
     'Mover o CREATE TABLE pra um SQL cirúrgico e assumir a tabela existente no código.',
     'Auditoria /agenda 06/07/2026'),
    ('qa_ag26_m6', 'agenda', 'MEDIA', 'E-mails de lembrete enviados em série',
     'Loop com await sequencial — N destinatários = N esperas.',
     'apps/api/src/agenda/agenda-lembrete.service.ts:286-298',
     'Usar Promise.all (ou allSettled) para paralelizar o envio.',
     'Auditoria /agenda 06/07/2026'),
    ('qa_ag26_b1', 'agenda', 'BAIXA', 'Hex hardcoded em cards/SweetAlert (fora do padrão de tokens)',
     'Cores fixas com ternário isDark — funciona, mas foge dos tokens semânticos e é frágil a mudanças de tema.',
     'apps/web/src/app/(dashboard)/agenda/page.tsx:1182-1200,1802-1810',
     'Migrar para tokens semânticos/CSS vars.',
     'Auditoria /agenda 06/07/2026'),
    ('qa_ag26_b2', 'agenda', 'BAIXA', 'Badge de tipo com texto branco fixo',
     'color:#fff fixo em badge com cor dinâmica — se a cor do tipo for clara, o texto some. O backend já fornece corTexto.',
     'apps/web/src/app/(dashboard)/agenda/page.tsx:2179',
     'Usar corTexto do tipo no lugar do branco fixo.',
     'Auditoria /agenda 06/07/2026'),
    ('qa_ag26_b3', 'agenda', 'BAIXA', 'Tarefas usam hard-delete (eventos usam soft-delete)',
     'agendaTarefa.delete apaga de vez, sem isActive/deletadoEm — inconsistente com eventos e perde histórico.',
     'apps/api/src/agenda/agenda-tarefa.service.ts:191',
     'Adotar soft-delete (isActive=false) como nos eventos.',
     'Auditoria /agenda 06/07/2026'),
    ('qa_ag26_b4', 'agenda', 'BAIXA', 'Handlers de tipos sem guard interno de permissão',
     'openTipoNew/handleSaveTipo/handleDeleteTipo confiam só no gate do botão — defesa em profundidade pede early-return por canManageTipos.',
     'apps/web/src/app/(dashboard)/agenda/page.tsx:1291-1308',
     'Adicionar if (!canManageTipos) return no início dos handlers.',
     'Auditoria /agenda 06/07/2026'),
    ('qa_ag26_b5', 'agenda', 'BAIXA', 'Formatação de data duplicada em 3 lugares',
     'Lógica YYYY-MM-DD repetida (service, disparo, lembrete) — candidata a helper único (relacionado ao item de timezone).',
     'agenda.service.ts:938-942 · agenda-disparo.service.ts (formatDateKey) · agenda-lembrete.service.ts',
     'Extrair helper único de formatação de data BR.',
     'Auditoria /agenda 06/07/2026');

    -- Itens já corrigidos no mesmo deploy do seed (o fix acompanha este SQL).
    UPDATE qa_itens SET status = 'CORRIGIDO', resolvido_em = now(),
      notas = 'Corrigido junto com o deploy inicial do relatório: enviarAgendaDia filtra por empresaId do destinatário (mesma regra do listEventos; master vê tudo).'
    WHERE id = 'qa_ag26_a1';
    UPDATE qa_itens SET status = 'CORRIGIDO', resolvido_em = now(),
      notas = 'Corrigido junto com o deploy inicial do relatório: podeGerenciarRegistro(a.user?.id / x.user?.id) — dono volta a editar/excluir as próprias anotações e anexos (backend já validava posse).'
    WHERE id = 'qa_ag26_a2';
    UPDATE qa_itens SET status = 'CORRIGIDO', resolvido_em = now(),
      notas = 'Corrigido junto com o deploy inicial do relatório: evento particular dispara lembrete só pro criador (POPUP/SSE, push e e-mail derivam da mesma lista de destinatários) — mesma regra do disparo diário.'
    WHERE id = 'qa_ag26_a3';
  END IF;
END $$;
