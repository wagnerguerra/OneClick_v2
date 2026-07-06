-- ============================================================
-- Relatório de QA — RECURSOS PENDENTES DE IMPLANTAÇÃO (features incompletas /
-- stubs / parkadas), 06/07/2026. Seed guardado (NOT EXISTS qa_pend26_%).
-- Severidade = prioridade sugerida. Todos entram como PENDENTE.
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM qa_itens WHERE id LIKE 'qa_pend26_%') THEN
    INSERT INTO qa_itens (id, modulo, severidade, titulo, descricao, arquivo, fix_proposto, status, origem) VALUES
    ('qa_pend26_01', 'nfe-dist', 'ALTA', '[PENDENTE] Scheduler de distribuição de NFe não ligado ao service real',
     'O NfeDistScheduler injeta @Inject(''NfeDistService'') tipado como unknown e tem TODOs "será implementado em paralelo". Os arquivos do service existem, mas o scheduler não está fiado — a distribuição automática de NFe (poll/cron por cliente) não roda de fato.',
     'apps/api/src/nfe-dist/nfe-dist.scheduler.ts:60-63,196,273',
     'Injetar o NfeDistService real por token e chamar processarCliente nos pontos marcados; remover o unknown.',
     'PENDENTE', 'Recursos pendentes 06/07/2026'),
    ('qa_pend26_02', 'nfse-dist', 'ALTA', '[PENDENTE] Scheduler de distribuição de NFS-e não ligado ao service real',
     'Mesmo padrão do NFe: NfseDistScheduler injeta unknown e tem TODOs de service "em paralelo". Distribuição automática de NFS-e não efetiva.',
     'apps/api/src/nfse-dist/nfse-dist.scheduler.ts:57-58,184,255',
     'Injetar o NfseDistService real e ligar processarCliente; remover o unknown.',
     'PENDENTE', 'Recursos pendentes 06/07/2026'),
    ('qa_pend26_03', 'nfse', 'ALTA', '[PENDENTE] Telas de NFS-e (lista + galeria) sem backend — usando dados vazios/mock',
     'As páginas /nfse e /nfse/galeria estão com clientes=[] e stats=null e TODOs "trocar pelos hooks do tRPC quando o router de nfse for criado" + rota REST /api/nfse/:id/pdf. O usuário abre a tela e não vê nada.',
     'apps/web/src/app/(dashboard)/nfse/page.tsx:61-66 · nfse/galeria/page.tsx:91,111,469',
     'Criar/registrar o router nfse (listClientesComNFSe, getStats) + rota de PDF e plugar nas telas.',
     'PENDENTE', 'Recursos pendentes 06/07/2026'),
    ('qa_pend26_04', 'orcamentos', 'MEDIA', '[PENDENTE] Captura de resposta do cliente por e-mail (inbound) — falta config no Resend',
     'O código do inbound de orçamento está pronto (webhook do HelpDesk detecta #ORCNNNN e registra a resposta como mensagem + notifica o comercial), mas depende de o endereço inbound ser um Resend Inbound REAL (MX + webhook). Enquanto não confirmado, respostas do cliente não são capturadas.',
     'apps/api/src/helpdesk/helpdesk-inbound.controller.ts:74-88 (código) · Configurações → Helpdesk (config)',
     'Confirmar/configurar o Resend Inbound (MX + webhook /api/helpdesk/inbound) do endereço usado no Reply-To.',
     'PENDENTE', 'Recursos pendentes 06/07/2026'),
    ('qa_pend26_05', 'crm/orcamentos/agenda', 'MEDIA', '[PENDENTE] Validade do orçamento → lembrete na agenda + follow-up pós-recusa',
     'Não há integração orçamentos↔agenda: a validade do orçamento não gera lembrete e a recusa (ENCERRADO) não agenda follow-up (o e-mail só sugere em texto). Mesmo tema do item de integração qa_int26_b6 — aguardando decisão de produto.',
     'apps/api/src/orcamento/orcamento.scheduler.ts (só trata atrasos de status)',
     'Definir a regra e criar: lembrete de validade vencendo + follow-up automático agendado após recusa.',
     'PENDENTE', 'Recursos pendentes 06/07/2026'),
    ('qa_pend26_06', 'crm', 'MEDIA', '[PENDENTE] Widget de chat da Recepção IA: modo embed=1 dedicado',
     'O widget do site abre a página /atendimento num iframe (funciona), mas falta o modo embed=1 de verdade: cabeçalho compacto e "X" interno que fecha o widget via postMessage. Parkado na conversa de implantação.',
     'apps/web/public/embed/atendimento.js · apps/web/src/app/(public)/atendimento/[slug]/page.tsx',
     'Implementar embed=1 na página (chrome compacto + postMessage de fechar) e consumir no widget.',
     'PENDENTE', 'Recursos pendentes 06/07/2026'),
    ('qa_pend26_07', 'ativos', 'BAIXA', '[PENDENTE] Termo de responsabilidade de ativo com nome da empresa hardcoded',
     'A página de termo usa empresaNome = ''Sua Empresa'' fixo (FIXME) — o documento impresso sai com o placeholder em vez do nome real do tenant.',
     'apps/web/src/app/(dashboard)/ativos/[id]/termo/page.tsx:48',
     'Buscar o nome da empresa via getMyProfile/empresa e usar no termo.',
     'PENDENTE', 'Recursos pendentes 06/07/2026');
  END IF;
END $$;
