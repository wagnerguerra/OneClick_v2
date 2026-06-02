/**
 * Registry de TODOS os schedulers do sistema. Fonte única de verdade pra a
 * página /configuracoes/agendamentos. Não acopla com os schedulers em si —
 * apenas descreve metadata + onde buscar config/log.
 *
 * Pra cada item, o `agendamento.service.listAll()` resolve em runtime:
 *  - cron atual (de env, systemConfig, DB próprio ou hard-coded)
 *  - ativo (boolean)
 *  - última execução (data + status)
 */

export type CronSource =
  /** hard-coded no código (cron expression literal aqui) */
  | { kind: 'literal'; cron: string; ativo: boolean }
  /** lê de uma key em SystemConfig */
  | { kind: 'systemConfig'; cronKey?: string; enabledKey?: string; defaultCron: string }
  /** env var (process.env.X) */
  | { kind: 'env'; cronEnv?: string; enabledEnv?: string; defaultCron: string }
  /** lê de agenda_disparo_config — horario (HH:MM) + diasSemana viram cron */
  | { kind: 'agendaDisparoConfig' }
  /** tem uma tabela de config própria — slug aponta pra a fonte específica */
  | { kind: 'custom'; descricao: string }

export type LastRunSource =
  /** lê de scheduler_executions filtrando por slug */
  | { kind: 'scheduler_executions'; slug: string }
  /** lê da última row de uma tabela específica */
  | { kind: 'agenda_disparo_logs' }
  /** lê de uma coluna `ultimo*Em` */
  | { kind: 'column'; descricao: string }
  /** scheduler não loga */
  | { kind: 'none' }

export interface SchedulerRegistryItem {
  slug: string
  nome: string
  modulo: string             // pra agrupar visualmente
  descricao: string
  cronSource: CronSource
  lastRunSource: LastRunSource
  /** URL da página específica de config (ou null se não houver UI dedicada) */
  configHref: string | null
  /** Ícone lucide (string — resolvido no front) */
  icon: string
}

export const SCHEDULER_REGISTRY: SchedulerRegistryItem[] = [
  // ─── E-FISCAL ─────────────────────────────────────────────────
  {
    slug: 'nfe-dist',
    nome: 'NF-e Distribuição',
    modulo: 'Fiscal',
    descricao: 'Busca diariamente notas fiscais eletrônicas emitidas contra os CNPJs dos clientes na SEFAZ.',
    cronSource: { kind: 'custom', descricao: 'Configurado em /configuracoes/nfe-dist' },
    lastRunSource: { kind: 'scheduler_executions', slug: 'nfe-dist' },
    configHref: '/clientes-nf',
    icon: 'Receipt',
  },
  {
    slug: 'nfse-dist',
    nome: 'NFS-e Distribuição',
    modulo: 'Fiscal',
    descricao: 'Busca notas fiscais de serviço emitidas pelos clientes nos portais municipais.',
    cronSource: { kind: 'custom', descricao: 'Configurado em /configuracoes/nfse-dist' },
    lastRunSource: { kind: 'scheduler_executions', slug: 'nfse-dist' },
    configHref: '/clientes-nf',
    icon: 'FileText',
  },
  {
    slug: 'caixapostal',
    nome: 'Caixa Postal e-CAC',
    modulo: 'Fiscal',
    descricao: 'Consulta automática de mensagens na Caixa Postal do e-CAC dos clientes selecionados.',
    cronSource: { kind: 'custom', descricao: 'Configurado em /caixapostal/configuracoes' },
    lastRunSource: { kind: 'column', descricao: 'Última via systemConfig caixapostal.scheduler.lastRun' },
    configHref: '/caixapostal/configuracoes',
    icon: 'Mailbox',
  },
  {
    slug: 'cnd',
    nome: 'CNDs',
    modulo: 'Fiscal',
    descricao: 'Renova certidões negativas de débito (CND, CNDT, CRF, Municipais) dos clientes ativos.',
    cronSource: { kind: 'custom', descricao: 'Configurado em /certidoes/configuracoes' },
    lastRunSource: { kind: 'column', descricao: 'Última via systemConfig cnd.scheduler.lastRun' },
    configHref: '/certidoes/configuracoes',
    icon: 'ShieldCheck',
  },
  {
    slug: 'certificado-digital',
    nome: 'Certificados — alertas',
    modulo: 'Fiscal',
    descricao: 'Marca certificados expirados e cria notificações nos buckets 60/30/7 dias antes do vencimento.',
    cronSource: { kind: 'literal', cron: '0 6 * * *', ativo: true },
    lastRunSource: { kind: 'none' },
    configHref: null,
    icon: 'FileSignature',
  },

  // ─── AGENDA ───────────────────────────────────────────────────
  {
    slug: 'agenda-disparo',
    nome: 'Agenda do dia (e-mail)',
    modulo: 'Agenda',
    descricao: 'Envia diariamente o resumo da agenda do dia pros destinatários configurados.',
    cronSource: { kind: 'agendaDisparoConfig' },
    lastRunSource: { kind: 'agenda_disparo_logs' },
    configHref: '/agenda/configuracoes',
    icon: 'Calendar',
  },
  {
    slug: 'agenda-lembrete',
    nome: 'Lembretes de eventos',
    modulo: 'Agenda',
    descricao: 'Verifica lembretes pendentes a cada 60s e dispara notificação/e-mail conforme configurado em cada evento.',
    cronSource: { kind: 'literal', cron: '* * * * *', ativo: true },
    lastRunSource: { kind: 'none' },
    configHref: '/agenda',
    icon: 'Bell',
  },

  // ─── ATENDIMENTO ──────────────────────────────────────────────
  {
    slug: 'helpdesk-sla',
    nome: 'Helpdesk — SLA & auto-close',
    modulo: 'TI',
    descricao: 'Alerta tickets com 75% do SLA consumido, marca os estourados e auto-fecha resolvidos sem CSAT após 3 dias.',
    cronSource: { kind: 'literal', cron: '7 * * * *', ativo: true },
    lastRunSource: { kind: 'none' },
    configHref: null,
    icon: 'Headphones',
  },

  // ─── COMERCIAL ────────────────────────────────────────────────
  {
    slug: 'orcamento-sla',
    nome: 'Orçamentos — alerta SLA',
    modulo: 'Comercial',
    descricao: 'Notifica responsáveis quando o tempo no status atual excede a configuração da empresa.',
    cronSource: { kind: 'literal', cron: '0 8 * * *', ativo: true },
    lastRunSource: { kind: 'none' },
    configHref: null,
    icon: 'TrendingUp',
  },
  {
    slug: 'servico',
    nome: 'Execuções de serviço',
    modulo: 'Comercial',
    descricao: 'Avalia execuções de serviço com prazo próximo/estourado e cria notificações.',
    cronSource: { kind: 'literal', cron: '15 * * * *', ativo: true },
    lastRunSource: { kind: 'none' },
    configHref: null,
    icon: 'ClipboardCheck',
  },

  // ─── NOTIFICAÇÕES ─────────────────────────────────────────────
  {
    slug: 'notificacao-recorrencia',
    nome: 'Notificações recorrentes',
    modulo: 'Sistema',
    descricao: 'Gera notificações periódicas de regras configuradas (lembretes diários, semanais, etc).',
    cronSource: { kind: 'literal', cron: '0 6 * * *', ativo: true },
    lastRunSource: { kind: 'none' },
    configHref: null,
    icon: 'BellRing',
  },
  {
    slug: 'notificacao-prazo-proximo',
    nome: 'Prazos próximos',
    modulo: 'Sistema',
    descricao: 'Verifica prazos próximos de obrigações e dispara notificações nos buckets configurados.',
    cronSource: { kind: 'literal', cron: '17 * * * *', ativo: true },
    lastRunSource: { kind: 'none' },
    configHref: null,
    icon: 'Clock',
  },

  // ─── INTEGRAÇÕES ──────────────────────────────────────────────
  {
    slug: 'drive-sync',
    nome: 'Google Drive — sync',
    modulo: 'Sistema',
    descricao: 'Sincroniza arquivos dos clientes com o Google Drive vinculado (intervalo configurável via env).',
    cronSource: {
      kind: 'env',
      cronEnv: 'GOOGLE_DRIVE_SYNC_CRON',
      enabledEnv: 'GOOGLE_DRIVE_SYNC_ENABLED',
      defaultCron: '*/15 * * * *',
    },
    lastRunSource: { kind: 'none' },
    configHref: null,
    icon: 'HardDriveDownload',
  },
  {
    slug: 'google-backup',
    nome: 'Backup Google Drive',
    modulo: 'Sistema',
    descricao: 'Envia backup diário do banco de dados pro Google Drive configurado (03:30 BR).',
    cronSource: {
      kind: 'systemConfig',
      enabledKey: 'google.backup.enabled',
      defaultCron: '30 3 * * *',
    },
    lastRunSource: { kind: 'scheduler_executions', slug: 'google-backup' },
    configHref: '/configuracoes',
    icon: 'Database',
  },
]
