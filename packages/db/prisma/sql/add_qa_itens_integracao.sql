-- ============================================================
-- Relatório de QA — auditoria de INTEGRAÇÃO /crm ↔ /orcamentos ↔ /agenda
-- (07/07/2026). Seed com guard NOT EXISTS: roda uma vez; itens tratados/
-- excluídos não são recriados. Idempotente.
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM qa_itens WHERE id LIKE 'qa_int26_%') THEN
    INSERT INTO qa_itens (id, modulo, severidade, titulo, descricao, arquivo, fix_proposto, origem) VALUES
    ('qa_int26_a1', 'crm↔orcamentos', 'ALTA', 'Status não sincroniza entre oportunidade e orçamento (nos dois sentidos)',
     'moverEtapa não tem hook pras flags ehGanho/ehPerda da etapa (que existem no CrmEtapa) — card GANHO/PERDIDO deixa o orçamento vivo em NOVO ("zumbi"). No inverso, orçamento APROVADO/ENCERRADO não move o card do funil. Estado permanentemente inconsistente entre os módulos.',
     'apps/api/src/crm/crm.service.ts:513-571 (moverEtapa) · orcamento.service.ts (changeStatus sem reflexo no CRM)',
     'Definir a regra de produto e ligar os dois hooks: etapa ganho→sugerir/aprovar orçamento e perda→encerrar; orçamento aprovado/encerrado→mover card (ou ao menos avisar).',
     'Auditoria integração 07/07/2026'),
    ('qa_int26_m1', 'crm↔orcamentos', 'MEDIA', 'Orçamento gerado pelo funil não herda contato/valor da oportunidade',
     'Ao mover pra etapa "Orçamento", o create passa só oportunidadeId/clienteId/solicitanteId/observacoes. contatoNome/contatoEmail/contatoTelefone e valor da oportunidade não são aproveitados — o comercial redigita o que o CRM já sabia.',
     'apps/api/src/crm/crm.service.ts:539-544',
     'Prefill: copiar contatos (campo contatos/emails do orçamento) e considerar o valor da oportunidade como referência.',
     'Auditoria integração 07/07/2026'),
    ('qa_int26_m2', 'crm↔orcamentos', 'MEDIA', 'Excluir oportunidade não cancela serviços/processos do orçamento aprovado',
     'crm.delete deleta os orçamentos em cascata (cascataDoCrm), mas orcamento.delete não chama cancelarServicosDoOrcamento — processos/execuções disparados na aprovação ficam órfãos rodando.',
     'apps/api/src/crm/crm.service.ts:581-596',
     'Na cascata, cancelar os serviços/processos abertos do orçamento antes de deletá-lo (reusar cancelarServicosDoOrcamento).',
     'Auditoria integração 07/07/2026'),
    ('qa_int26_m3', 'crm↔orcamentos', 'MEDIA', 'Orçamento automático nasce sem cliente quando a oportunidade não tem clienteId',
     'Oportunidade sem cliente vinculado gera orçamento com clienteId null — a UI exige Cliente* e o envio fica bloqueado até alguém perceber.',
     'apps/api/src/crm/crm.service.ts:539-544',
     'Bloquear a geração com aviso ("vincule um cliente antes") OU criar o cliente-lead a partir da razão social da oportunidade.',
     'Auditoria integração 07/07/2026'),
    ('qa_int26_m4', 'agenda↔crm', 'MEDIA', 'buscarOportunidades (seletor da agenda) sem gate do módulo CRM',
     'Endpoint gateado só por agenda.canRead expõe id/título/razão social/etapa das oportunidades a quem não tem CRM. Tensão de produto: o seletor existe pra vincular evento a card — decidir se exige crm.canRead (readProcedureAnyOf) ou se o vazamento leve é aceitável.',
     'apps/api/src/agenda/agenda.router.ts:176',
     'Trocar por gate que exija também leitura de crm (ou decidir explicitamente que é aceitável e documentar).',
     'Auditoria integração 07/07/2026'),
    ('qa_int26_m5', 'agenda↔crm', 'MEDIA', 'Excluir oportunidade deixa eventos de agenda órfãos sem tratamento',
     'FK do evento é onDelete:SetNull — ao deletar o card, eventos (inclusive futuros, ex.: reunião marcada pelo lead) permanecem na agenda sem contexto, sem aviso a ninguém.',
     'apps/api/src/crm/crm.service.ts:581-596 · schema.prisma:2685',
     'No crm.delete, tratar os eventos vinculados: avisar participantes/cancelar futuros (ou registrar no título/log que o card foi removido).',
     'Auditoria integração 07/07/2026'),
    ('qa_int26_m6', 'agenda↔crm', 'MEDIA', 'Migração de anotações/anexos evento→oportunidade sem transação',
     'Ao vincular/trocar card, migrarAnotacoesAnexosParaOportunidade + syncEventoOportunidades rodam fora de $transaction — falha no meio deixa migração parcial (dado meio no evento, meio na oportunidade).',
     'apps/api/src/agenda/agenda.service.ts (update → bloco de vínculo CRM)',
     'Envolver a migração + sync numa prisma.$transaction.',
     'Auditoria integração 07/07/2026'),
    ('qa_int26_m7', 'lead→crm', 'MEDIA', 'registrarNoCrm engole falha silenciosamente — lead quente pode se perder',
     'crmService.create(...).catch(() => null): se a criação da oportunidade falhar, o lead qualificado não é registrado e NINGUÉM fica sabendo (sem log, sem notificação). O funil perde lead sem rastro.',
     'apps/api/src/lead/lead.service.ts:455-463',
     'Logar o erro + notificar o comercial/admin no catch (manter o fluxo do chat vivo, mas nunca perder o lead em silêncio).',
     'Auditoria integração 07/07/2026'),
    ('qa_int26_b1', 'lead→agenda', 'BAIXA', 'Reunião de lead pode notificar o comercial em dobro',
     'agendarReuniao cria evento com notificar:true (e-mail da agenda aos participantes) e o fluxo do lead também gera sino próprio — mesma reunião, dois avisos.',
     'apps/api/src/lead/lead.service.ts:611-624',
     'Escolher um canal (provável: manter o da agenda) e remover o outro.',
     'Auditoria integração 07/07/2026'),
    ('qa_int26_b2', 'lead→agenda', 'BAIXA', 'Sem usuários na área Comercial, a reunião do lead nasce sem participantes (silencioso)',
     'resolverComercial devolve [] se não houver área "Comercial" — o evento é criado sem participantes e ninguém é avisado da reunião.',
     'apps/api/src/lead/lead.service.ts:563-569',
     'Se comercial vazio: notificar master/admin ou falhar com mensagem clara.',
     'Auditoria integração 07/07/2026'),
    ('qa_int26_b3', 'lead→agenda', 'BAIXA', 'agendarReuniao não valida a oportunidade da sessão',
     'oportunidadeId da sessão vai direto pro evento sem conferir se o card ainda existe/está ativo (pode ter sido excluído entre a qualificação e o agendamento).',
     'apps/api/src/lead/lead.service.ts:607',
     'findUnique antes de vincular; se não existir, criar o evento sem vínculo.',
     'Auditoria integração 07/07/2026'),
    ('qa_int26_b4', 'lead (público)', 'BAIXA', 'Endpoint público /agendar sem validação de formato de data/hora',
     'data (YYYY-MM-DD) e horaInicio (HH:MM) chegam como string livre do body — valor malformado passa até estourar no parse.',
     'apps/api/src/lead/lead.controller.ts:83-94',
     'Validar com regex/Zod no controller antes de chamar o service.',
     'Auditoria integração 07/07/2026'),
    ('qa_int26_b5', 'crm/lead', 'BAIXA', 'Filtro defensivo isAi:false nas listas do comercial',
     'Hoje o usuário IA não entra nas notificações do comercial porque não tem área — mas se alguém atribuir área a ele, passa a receber sino/e-mail de lead. Filtro explícito custa nada.',
     'apps/api/src/crm/crm.service.ts:35 · lead.service.ts:564',
     'Adicionar isAi: false (ou NOT isAi) ao WHERE das duas queries.',
     'Auditoria integração 07/07/2026'),
    ('qa_int26_b6', 'orcamentos↔agenda', 'BAIXA', 'Sem integração orçamentos→agenda (oportunidade de feature)',
     'Não há vínculo direto entre os módulos (verificado). Melhorias óbvias: validade do orçamento não gera lembrete na agenda; recusa (ENCERRADO) não agenda follow-up — o e-mail até sugere "agendar follow-up", mas nada é criado.',
     'apps/api/src/orcamento/orcamento.scheduler.ts (só trata atrasos de status)',
     'Avaliar: lembrete de validade vencendo + follow-up automático pós-recusa.',
     'Auditoria integração 07/07/2026'),

    ('qa_int26_b7', 'crm↔orcamentos', 'BAIXA', 'Reabrir orçamento para NOVO não restaura o sino do comercial',
     'O sino de "novo orçamento" é removido quando o status sai de NOVO; no reabrir de volta pra NOVO ele não é recriado — quem não viu na 1ª vez não fica sabendo.',
     'apps/api/src/orcamento/orcamento.service.ts (reabrir)',
     'Re-disparar a notificação (fire-and-forget) quando reabrir cair em NOVO.',
     'Auditoria integração 07/07/2026');

    -- Itens corrigidos no mesmo deploy do seed (fixes acompanham este SQL).
    UPDATE qa_itens SET status='CORRIGIDO', resolvido_em=now(),
      notas='Corrigido: sincronização nos dois sentidos. Card PERDA→encerra orçamentos abertos (cascata de serviços inclusa); GANHO→avisa quem moveu se houver orçamento pendente (aprovação não é automatizada — dispara serviços/contratos). Orçamento APROVADO→card vai pra etapa de ganho; ENCERRADO (antes de FINALIZADO)→etapa de perda. Guardas contra rebaixar card ganho e contra loop.'
    WHERE id='qa_int26_a1';
    UPDATE qa_itens SET status='CORRIGIDO', resolvido_em=now(),
      notas='Corrigido: orçamento gerado pelo funil herda contato (nome · telefone) e e-mail da oportunidade (+ validadeDias explícito).'
    WHERE id='qa_int26_m1';
    UPDATE qa_itens SET status='CORRIGIDO', resolvido_em=now(),
      notas='Corrigido: crm.delete chama cancelarServicosDoOrcamento (agora público) antes de deletar cada orçamento da cascata.'
    WHERE id='qa_int26_m2';
    UPDATE qa_itens SET status='CORRIGIDO', resolvido_em=now(),
      notas='Corrigido: sem cliente vinculado o orçamento NÃO é gerado — evento no card + sino pra quem moveu, com instrução de vincular o cliente.'
    WHERE id='qa_int26_m3';
    UPDATE qa_itens SET status='CORRIGIDO', resolvido_em=now(),
      notas='Corrigido: buscarOportunidades exige crm.canRead (não-master); sem permissão devolve lista vazia (seletor gracioso, sem erro).'
    WHERE id='qa_int26_m4';
    UPDATE qa_itens SET status='CORRIGIDO', resolvido_em=now(),
      notas='Corrigido: crm.delete desativa eventos FUTUROS vinculados (log + sino pro criador); passados ficam como histórico.'
    WHERE id='qa_int26_m5';
    UPDATE qa_itens SET status='CORRIGIDO', resolvido_em=now(),
      notas='Corrigido: migração de anotações/anexos e sync de vínculos em $transaction (pares copiar+apagar atômicos).'
    WHERE id='qa_int26_m6';
    UPDATE qa_itens SET status='CORRIGIDO', resolvido_em=now(),
      notas='Corrigido: falha no registro do lead agora loga + notifica o comercial (fallback: masters) com os contatos do lead pra registro manual.'
    WHERE id='qa_int26_m7';
  END IF;
END $$;
