-- ============================================================
-- Baixa dos itens RESOLVIDOS nesta rodada — auditoria /clientes (qa_cli26) e
-- recursos pendentes de NFe/NFSe (qa_pend26). Necessário porque os seeds
-- (add_qa_itens_clientes.sql / add_qa_itens_pendentes.sql) inserem tudo como
-- PENDENTE; sem esta baixa, a produção mostraria os itens já corrigidos abertos.
--
-- Idempotente e respeitoso: só mexe em item ainda PENDENTE e SEM notas (não
-- sobrescreve item reaberto/anotado à mão). Após rodar, status=CORRIGIDO ⇒ no-op.
-- ============================================================

-- ── Bloco ALTA (/clientes) ──
UPDATE qa_itens SET status='CORRIGIDO', resolvido_em=now(), notas='Corrigido: helper assertClienteAtivo (add) + updateMany/deleteMany com filtro cliente:{empresaId,deletedAt} conferindo count (update/remove por id-filho) + guard SQL join nos raw (vencimentos/andamentos/cnaes). Router passa ctx.isMaster/empresaId nas 24 mutações. Não-master não mexe mais em sub-recurso de cliente de outra empresa.' WHERE id='qa_cli26_a1' AND status='PENDENTE' AND notas IS NULL;
UPDATE qa_itens SET status='CORRIGIDO', resolvido_em=now(), notas='Corrigido junto com #30: o mesmo guard exige cliente.deletedAt IS NULL — nenhuma mutação de sub-recurso funciona em cliente na lixeira.' WHERE id='qa_cli26_a2' AND status='PENDENTE' AND notas IS NULL;
UPDATE qa_itens SET status='CORRIGIDO', resolvido_em=now(), notas='Corrigido: 46x border-[rgba(0,0,0,0.0x)] -> border-border (o que realmente sumia no dark); #10b981 inline -> var(--mod-cadastros); azul do CNPJ (#5ea3cb/#4d8fb5) -> classes sky; #0b1020 -> slate dark-aware; grid/borda invisível dos gráficos -> var(--border). Cores de STATUS e paletas de SÉRIE (data-viz) mantidas de propósito.' WHERE id='qa_cli26_a3' AND status='PENDENTE' AND notas IS NULL;

-- ── Bloco MÉDIA (/clientes) ──
UPDATE qa_itens SET status='CORRIGIDO', resolvido_em=now(), notas='Corrigido com critério: legacy-import — create cliente + clienteEvent em prisma.$transaction (único ponto onde a atomicidade cabe). integration/import-oneclick OneClick — sócios/áreas/serviços são best-effort (transação derrubaria o cliente já importado); os catches silenciosos passaram a REPORTAR qual cliente/etapa falhou (job.logs/console.error) em vez de engolir.' WHERE id='qa_cli26_m1' AND status='PENDENTE' AND notas IS NULL;
UPDATE qa_itens SET status='CORRIGIDO', resolvido_em=now(), notas='Corrigido: dedup do legado por match EXATO do documento normalizado (findFirst where documento) + guarda de documento vazio. contains casava CNPJ por substring.' WHERE id='qa_cli26_m2' AND status='PENDENTE' AND notas IS NULL;
UPDATE qa_itens SET status='CORRIGIDO', resolvido_em=now(), notas='Corrigido: SciService com Logger; stderr do Python (conexão/SQL Firebird) vai pro log interno (error) e o usuário recebe mensagem genérica. Tratado nos 2 pontos (id_sistema e balancete).' WHERE id='qa_cli26_m3' AND status='PENDENTE' AND notas IS NULL;
UPDATE qa_itens SET status='CORRIGIDO', resolvido_em=now(), notas='Corrigido: lock em memória por empresa (Set serproRunning) em cadastrarDasConsultas — 2ª execução simultânea recebe "já em andamento" em vez de dobrar o custo SERPRO. try/finally garante liberação.' WHERE id='qa_cli26_m4' AND status='PENDENTE' AND notas IS NULL;
UPDATE qa_itens SET status='CORRIGIDO', resolvido_em=now(), notas='Padronizado: helper @/lib/date (toDateInputValue/fmtDateBR) com extração de dia SEMPRE em UTC, aplicado nos 4 pontos. Nota: os toISOString().slice(0,10) já eram UTC (o off-by-one real seria com métodos locais) — ganho é padronização + intenção explícita p/ evitar regressão futura.' WHERE id='qa_cli26_m5' AND status='PENDENTE' AND notas IS NULL;
UPDATE qa_itens SET status='CORRIGIDO', resolvido_em=now(), notas='Corrigido de passagem (bloco Alta): getContratoParams valida o tenant via assertClienteAtivo.' WHERE id='qa_cli26_m6' AND status='PENDENTE' AND notas IS NULL;

-- ── Bloco BAIXA (/clientes) já resolvido de passagem ──
UPDATE qa_itens SET status='CORRIGIDO', resolvido_em=now(), notas='Corrigido de passagem (reescrevi o método): data_conclusao via CASE WHEN $1=concluido parametrizado, sem interpolar NOW()/NULL na string SQL.' WHERE id='qa_cli26_b1' AND status='PENDENTE' AND notas IS NULL;

-- ── Recursos pendentes ALTA (NFe/NFSe) reavaliados ──
UPDATE qa_itens SET status='CORRIGIDO', resolvido_em=now(), notas='Reavaliado: NÃO era stub. NfeDistService (538 linhas) existe, o NfeDistModule provê o token e o scheduler JÁ chama processarCliente — funcional. Só o typing estava frouxo (unknown + interface Like + TODO). Tipado com import type NfeDistService (evita ciclo), casts/TODOs removidos.' WHERE id='qa_pend26_01' AND status='PENDENTE' AND notas IS NULL;
UPDATE qa_itens SET status='CORRIGIDO', resolvido_em=now(), notas='Mesmo caso do NFe: NfseDistService existe e é chamado; era só typing frouxo. Tipado direito, casts/TODOs removidos.' WHERE id='qa_pend26_02' AND status='PENDENTE' AND notas IS NULL;
UPDATE qa_itens SET status='CORRIGIDO', resolvido_em=now(), notas='Reavaliado: a galeria (/nfse/galeria) já consumia nfse.listClientesComNotas/listGaleriaPorCliente e a rota REST /api/nfse/:id/pdf existe — só tinham TODOs obsoletos. Faltava getStats no nfse.router (adicionado) e ligar a página /nfse overview (usava arrays vazios); agora busca via useState+useEffect (padrão do /danfe). TODOs limpos.' WHERE id='qa_pend26_03' AND status='PENDENTE' AND notas IS NULL;

-- ── Apontamentos nos MÉDIA que seguem PENDENTE (bloqueados por ação/decisão do
--    Wagner) — só grava a nota, mantém o status. ──
UPDATE qa_itens SET notas='APONTAMENTO (bloqueado por config sua): o código está pronto — o webhook /api/helpdesk/inbound já detecta #ORCNNNN e registra a resposta. Falta AÇÃO DE INFRA que só você faz: (1) confirmar que o Reply-To é um Resend Inbound real (registro MX apontando pro Resend) e (2) cadastrar o webhook de inbound no painel do Resend apontando pra /api/helpdesk/inbound. Sem isso, o Resend não tem pra onde entregar a resposta. Nada a corrigir no código.' WHERE id='qa_pend26_04' AND status='PENDENTE' AND notas IS NULL;
UPDATE qa_itens SET notas='APONTAMENTO (aguardando decisão de produto — mesmo tema do #28): preciso das regras. (a) Lembrete de validade: quantos dias antes? pra quem? canal (sino/e-mail/agenda)? (b) Follow-up pós-recusa: evento automático quantos dias após ENCERRADO? responsável e tipo de evento? Com as respostas eu implemento (orcamento.scheduler + integração agenda).' WHERE id='qa_pend26_05' AND status='PENDENTE' AND notas IS NULL;
UPDATE qa_itens SET notas='APONTAMENTO (você parkou explicitamente — "deixe pendente"): o widget já funciona via iframe. O embed=1 dedicado (cabeçalho compacto + X interno que fecha via postMessage) é melhoria de UX que depende do seu OK. Implementável a qualquer momento.' WHERE id='qa_pend26_06' AND status='PENDENTE' AND notas IS NULL;
