-- ============================================================
-- Baixa dos itens RESOLVIDOS do Relatório de QA (auditorias /agenda e
-- integração crm↔orcamentos↔agenda). Necessário porque os updates dentro do
-- bloco guardado dos seeds só rodam em instalação nova — se a produção semeou
-- antes das correções, os itens ficaram PENDENTE.
--
-- Idempotente e respeita o usuário: só atualiza item ainda PENDENTE e SEM
-- notas (não mexe em item reaberto/anotado manualmente).
-- ============================================================

-- ── Auditoria /agenda (qa_ag26) ──
UPDATE qa_itens SET status='CORRIGIDO', resolvido_em=now(), notas='Corrigido: enviarAgendaDia filtra por empresaId do destinatário (mesma regra do listEventos; master vê tudo).' WHERE id='qa_ag26_a1' AND status='PENDENTE' AND notas IS NULL;
UPDATE qa_itens SET status='CORRIGIDO', resolvido_em=now(), notas='Corrigido: podeGerenciarRegistro(a.user?.id / x.user?.id) — dono volta a editar/excluir as próprias anotações e anexos (backend já validava posse).' WHERE id='qa_ag26_a2' AND status='PENDENTE' AND notas IS NULL;
UPDATE qa_itens SET status='CORRIGIDO', resolvido_em=now(), notas='Corrigido: evento particular dispara lembrete só pro criador (POPUP/SSE, push e e-mail derivam da mesma lista) — mesma regra do disparo diário.' WHERE id='qa_ag26_a3' AND status='PENDENTE' AND notas IS NULL;
UPDATE qa_itens SET status='CORRIGIDO', resolvido_em=now(), notas='Corrigido: deleteLote exige dono da série OU master/sub-perm (mesma regra do delete individual).' WHERE id='qa_ag26_m1' AND status='PENDENTE' AND notas IS NULL;
UPDATE qa_itens SET status='CORRIGIDO', resolvido_em=now(), notas='Corrigido: o bug real era o Google sync usar o timezone do SERVIDOR — agora converte via Intl America/Sao_Paulo; convenção do módulo documentada nos demais pontos (estavam consistentes).' WHERE id='qa_ag26_m2' AND status='PENDENTE' AND notas IS NULL;
UPDATE qa_itens SET status='CORRIGIDO', resolvido_em=now(), notas='Corrigido: delete + createMany de participantes em prisma.$transaction.' WHERE id='qa_ag26_m3' AND status='PENDENTE' AND notas IS NULL;
UPDATE qa_itens SET status='CORRIGIDO', resolvido_em=now(), notas='Corrigido: getTemplate prefere o template da empresa com fallback pro global; o disparo passa o empresaId do destinatário.' WHERE id='qa_ag26_m4' AND status='PENDENTE' AND notas IS NULL;
UPDATE qa_itens SET status='CORRIGIDO', resolvido_em=now(), notas='Corrigido: tabela google_calendar_tokens criada via SQL cirúrgico; CREATE TABLE removido do runtime.' WHERE id='qa_ag26_m5' AND status='PENDENTE' AND notas IS NULL;
UPDATE qa_itens SET status='CORRIGIDO', resolvido_em=now(), notas='Corrigido: e-mails de lembrete enviados em paralelo (Promise.all com catch individual).' WHERE id='qa_ag26_m6' AND status='PENDENTE' AND notas IS NULL;
UPDATE qa_itens SET status='DESCARTADO', resolvido_em=now(), notas='Descartado após análise: o popup do SweetAlert não é tematizado (fica claro também no dark) — os cinzas fixos estão corretos ali; os cards usam ternário isDark intencional/comentado.' WHERE id='qa_ag26_b1' AND status='PENDENTE' AND notas IS NULL;
UPDATE qa_itens SET status='CORRIGIDO', resolvido_em=now(), notas='Corrigido: helper textoContraste(cor) — texto do badge escolhe branco/quase-preto por luminância (era #fff fixo).' WHERE id='qa_ag26_b2' AND status='PENDENTE' AND notas IS NULL;
UPDATE qa_itens SET status='CORRIGIDO', resolvido_em=now(), notas='Corrigido: tarefas com soft-delete (is_active); listagem exclui inativas; lembretes da tarefa excluída removidos.' WHERE id='qa_ag26_b3' AND status='PENDENTE' AND notas IS NULL;
UPDATE qa_itens SET status='CORRIGIDO', resolvido_em=now(), notas='Corrigido: early-return por canManageTipos nos handlers de tipos (defesa em profundidade).' WHERE id='qa_ag26_b4' AND status='PENDENTE' AND notas IS NULL;
UPDATE qa_itens SET status='CORRIGIDO', resolvido_em=now(), notas='Corrigido: helper único data-br.util (América/São_Paulo) — de quebra corrigiu o hojeStr do create que recusava eventos válidos entre 21h e 00h BR.' WHERE id='qa_ag26_b5' AND status='PENDENTE' AND notas IS NULL;

-- ── Auditoria integração crm↔orcamentos↔agenda (qa_int26) ──
UPDATE qa_itens SET status='CORRIGIDO', resolvido_em=now(), notas='Corrigido: sincronização nos dois sentidos. Card PERDA→encerra orçamentos abertos; GANHO→avisa quem moveu se houver pendente. Orçamento APROVADO→card ganho; ENCERRADO (antes de FINALIZADO)→perda. Guardas contra rebaixar card ganho e contra loop.' WHERE id='qa_int26_a1' AND status='PENDENTE' AND notas IS NULL;
UPDATE qa_itens SET status='CORRIGIDO', resolvido_em=now(), notas='Corrigido: orçamento do funil herda contato (nome · telefone) e e-mail da oportunidade (+ validadeDias explícito).' WHERE id='qa_int26_m1' AND status='PENDENTE' AND notas IS NULL;
UPDATE qa_itens SET status='CORRIGIDO', resolvido_em=now(), notas='Corrigido: crm.delete chama cancelarServicosDoOrcamento antes de deletar cada orçamento da cascata.' WHERE id='qa_int26_m2' AND status='PENDENTE' AND notas IS NULL;
UPDATE qa_itens SET status='CORRIGIDO', resolvido_em=now(), notas='Corrigido: sem cliente vinculado o orçamento NÃO é gerado — evento no card + sino pra quem moveu.' WHERE id='qa_int26_m3' AND status='PENDENTE' AND notas IS NULL;
UPDATE qa_itens SET status='CORRIGIDO', resolvido_em=now(), notas='Corrigido: buscarOportunidades exige crm.canRead (não-master); sem permissão devolve lista vazia.' WHERE id='qa_int26_m4' AND status='PENDENTE' AND notas IS NULL;
UPDATE qa_itens SET status='CORRIGIDO', resolvido_em=now(), notas='Corrigido: crm.delete desativa eventos FUTUROS vinculados (log + sino pro criador); passados ficam como histórico.' WHERE id='qa_int26_m5' AND status='PENDENTE' AND notas IS NULL;
UPDATE qa_itens SET status='CORRIGIDO', resolvido_em=now(), notas='Corrigido: migração de anotações/anexos e sync de vínculos em $transaction.' WHERE id='qa_int26_m6' AND status='PENDENTE' AND notas IS NULL;
UPDATE qa_itens SET status='CORRIGIDO', resolvido_em=now(), notas='Corrigido: falha no registro do lead loga + notifica o comercial (fallback: masters) com os contatos do lead.' WHERE id='qa_int26_m7' AND status='PENDENTE' AND notas IS NULL;
UPDATE qa_itens SET status='DESCARTADO', resolvido_em=now(), notas='Descartado após verificação: no sucesso só roda o fluxo padrão da agenda; o sino do lead só dispara no catch, e o aviso de card novo do CRM é evento distinto. Não há duplicação.' WHERE id='qa_int26_b1' AND status='PENDENTE' AND notas IS NULL;
UPDATE qa_itens SET status='CORRIGIDO', resolvido_em=now(), notas='Corrigido: comercial vazio → avisa os masters (sino); a reunião ainda é criada.' WHERE id='qa_int26_b2' AND status='PENDENTE' AND notas IS NULL;
UPDATE qa_itens SET status='CORRIGIDO', resolvido_em=now(), notas='Corrigido: agendarReuniao valida se o card existe/está ativo antes de vincular.' WHERE id='qa_int26_b3' AND status='PENDENTE' AND notas IS NULL;
UPDATE qa_itens SET status='CORRIGIDO', resolvido_em=now(), notas='Corrigido: /agendar valida formato estrito (YYYY-MM-DD e HH:MM) antes de tocar o service.' WHERE id='qa_int26_b4' AND status='PENDENTE' AND notas IS NULL;
UPDATE qa_itens SET status='CORRIGIDO', resolvido_em=now(), notas='Corrigido: isAi:false nas queries do comercial (crm + lead + sino de reabertura).' WHERE id='qa_int26_b5' AND status='PENDENTE' AND notas IS NULL;
UPDATE qa_itens SET status='CORRIGIDO', resolvido_em=now(), notas='Corrigido: reabrir para NOVO em orçamento vindo do CRM re-notifica a área Comercial.' WHERE id='qa_int26_b7' AND status='PENDENTE' AND notas IS NULL;
-- qa_int26_b6 (validade→lembrete / follow-up pós-recusa) permanece PENDENTE: feature, aguardando decisão de produto.
