import { z } from 'zod'

// ============================================================
// Recorrência automática de serviço
// ============================================================

export const RECORRENCIA_FREQUENCIA = [
  'DIARIA', 'SEMANAL', 'MENSAL', 'TRIMESTRAL', 'SEMESTRAL', 'ANUAL',
] as const
export type RecorrenciaFrequencia = (typeof RECORRENCIA_FREQUENCIA)[number]

export const RECORRENCIA_FREQUENCIA_LABELS: Record<RecorrenciaFrequencia, string> = {
  DIARIA: 'Diária',
  SEMANAL: 'Semanal',
  MENSAL: 'Mensal',
  TRIMESTRAL: 'Trimestral',
  SEMESTRAL: 'Semestral',
  ANUAL: 'Anual',
}

export const RECORRENCIA_ANCORAGEM = [
  'DIA_DO_MES', 'DIA_UTIL', 'DIAS_APOS_COMPETENCIA',
] as const
export type RecorrenciaAncoragem = (typeof RECORRENCIA_ANCORAGEM)[number]

export const RECORRENCIA_ANCORAGEM_LABELS: Record<RecorrenciaAncoragem, string> = {
  DIA_DO_MES: 'Dia do mês',
  DIA_UTIL: 'N-ésimo dia útil',
  DIAS_APOS_COMPETENCIA: 'Dias após competência',
}

/**
 * Sentinela usado em diasDoMes para indicar "último dia do mês".
 * Por que 31: cabe no Int e é sempre o último dia (já que meses com 30 dias
 * fazem clamp). Renderizado como pill "Último" na UI.
 */
export const RECORRENCIA_ULTIMO_DIA = 31 as const

// ── Ajuste de vencimento (FDS / feriado) ─────────────────
export const AJUSTE_VENCIMENTO = ['MANTER', 'ANTECIPAR', 'POSTERGAR'] as const
export type AjusteVencimento = (typeof AJUSTE_VENCIMENTO)[number]

export const AJUSTE_VENCIMENTO_LABELS: Record<AjusteVencimento, string> = {
  MANTER: 'Manter data (mesmo em FDS/feriado)',
  ANTECIPAR: 'Antecipar para dia útil anterior',
  POSTERGAR: 'Postergar para próximo dia útil',
}

export const AJUSTE_VENCIMENTO_HINTS: Record<AjusteVencimento, string> = {
  MANTER: 'Default — preserva a data calculada exata, mesmo caindo em sábado, domingo ou feriado nacional.',
  ANTECIPAR: 'Quando cair em FDS ou feriado, recua para o dia útil imediatamente anterior. Comum em 13º salário e pagamentos contratuais.',
  POSTERGAR: 'Quando cair em FDS ou feriado, avança para o próximo dia útil. Comum em obrigações fiscais (DAS, ICMS, ISS).',
}

export const upsertRecorrenciaSchema = z.object({
  servicoId: z.string(),
  ativa: z.boolean().default(true),
  frequencia: z.enum(RECORRENCIA_FREQUENCIA),
  ancoragem: z.enum(RECORRENCIA_ANCORAGEM).default('DIA_DO_MES'),
  valorAncoragem: z.coerce.number().int().min(1).max(31),
  competenciaOffset: z.coerce.number().int().min(0).max(12).default(1),
  responsavelPadrao: z.string().nullable().optional(),
  // ── Modo composto / personalizado ───────────────────────
  // Quando modoPersonalizado=true e diasDoMes não-vazio, scheduler ignora
  // ancoragem/valorAncoragem e gera 1 execução por (dia × mês compatível).
  modoPersonalizado: z.boolean().default(false),
  diasDoMes: z.array(z.coerce.number().int().min(1).max(31)).default([]),
  mesesDoAno: z.array(z.coerce.number().int().min(1).max(12)).default([]),
  // ── Ajuste quando cai em FDS/feriado ────────────────────
  ajusteVencimento: z.enum(AJUSTE_VENCIMENTO).default('MANTER'),
})
export type UpsertRecorrenciaInput = z.infer<typeof upsertRecorrenciaSchema>

/**
 * Presets de regras compostas — facilitam configuração comum.
 * Aplicados pela UI como atalho que preenche diasDoMes/mesesDoAno.
 */
export const RECORRENCIA_PRESETS: Array<{
  id: string
  label: string
  descricao: string
  diasDoMes: number[]
  mesesDoAno: number[]
}> = [
  {
    id: 'quinzenal',
    label: 'Quinzenal (dias 1 e 15)',
    descricao: 'Disparo em todo dia 1 e dia 15 de cada mês.',
    diasDoMes: [1, 15],
    mesesDoAno: [],
  },
  {
    id: 'quinzenal-fim',
    label: 'Quinzenal (dia 15 e último)',
    descricao: 'Disparo no dia 15 e último dia de cada mês.',
    diasDoMes: [15, RECORRENCIA_ULTIMO_DIA],
    mesesDoAno: [],
  },
  {
    id: 'trimestral-20',
    label: 'Trimestral dia 20 (jan/abr/jul/out)',
    descricao: 'Disparo dia 20 nos meses de janeiro, abril, julho e outubro.',
    diasDoMes: [20],
    mesesDoAno: [1, 4, 7, 10],
  },
  {
    id: 'anual-jan',
    label: 'Anual em janeiro (dia 10)',
    descricao: 'Uma execução por ano no dia 10 de janeiro.',
    diasDoMes: [10],
    mesesDoAno: [1],
  },
  {
    id: 'duas-vezes-mes',
    label: 'Duas vezes ao mês (dias 5 e 20)',
    descricao: 'Disparo no dia 5 e dia 20 de cada mês.',
    diasDoMes: [5, 20],
    mesesDoAno: [],
  },
]

// ============================================================
// Regras de notificação
// ============================================================

export const NOTIFICACAO_EVENTO = [
  'INICIADA', 'CONCLUIDA', 'ATRASADA', 'PRAZO_PROXIMO',
  'PAUSADA', 'CANCELADA', 'AGUARDANDO_RESPOSTA',
] as const
export type NotificacaoEvento = (typeof NOTIFICACAO_EVENTO)[number]

export const NOTIFICACAO_EVENTO_LABELS: Record<NotificacaoEvento, string> = {
  INICIADA: 'Execução iniciada',
  CONCLUIDA: 'Execução concluída',
  ATRASADA: 'Prazo vencido (atrasada)',
  PRAZO_PROXIMO: 'Prazo se aproximando',
  PAUSADA: 'Execução pausada',
  CANCELADA: 'Execução cancelada',
  AGUARDANDO_RESPOSTA: 'Aguardando resposta (bloco PERGUNTA)',
}

export const NOTIFICACAO_CANAL = ['EMAIL'] as const
export type NotificacaoCanal = (typeof NOTIFICACAO_CANAL)[number]

export const NOTIFICACAO_DESTINATARIO = [
  'RESPONSAVEL', 'GESTOR', 'CLIENTE', 'WATCHERS', 'CUSTOM',
] as const
export type NotificacaoDestinatario = (typeof NOTIFICACAO_DESTINATARIO)[number]

export const NOTIFICACAO_DESTINATARIO_LABELS: Record<NotificacaoDestinatario, string> = {
  RESPONSAVEL: 'Responsável da execução',
  GESTOR: 'Gestor / líder da área',
  CLIENTE: 'Cliente vinculado',
  WATCHERS: 'Watchers da execução',
  CUSTOM: 'E-mails específicos',
}

export const createNotificacaoRegraSchema = z.object({
  servicoId: z.string(),
  ativa: z.boolean().default(true),
  evento: z.enum(NOTIFICACAO_EVENTO),
  canal: z.enum(NOTIFICACAO_CANAL).default('EMAIL'),
  destinatariosTipo: z.enum(NOTIFICACAO_DESTINATARIO),
  destinatariosCustom: z.array(z.string().email()).max(20).default([]),
  assunto: z.string().min(1).max(200),
  corpoHtml: z.string().min(1),
  antecedenciaHoras: z.coerce.number().int().min(1).max(720).nullable().optional(),
})
export type CreateNotificacaoRegraInput = z.infer<typeof createNotificacaoRegraSchema>

export const updateNotificacaoRegraSchema = createNotificacaoRegraSchema
  .partial()
  .extend({ id: z.string() })
export type UpdateNotificacaoRegraInput = z.infer<typeof updateNotificacaoRegraSchema>

/**
 * Templates prontos sugeridos quando o usuário cria a 1ª regra de notificação.
 * Cobrem os 80% dos casos: atrasada→responsável, concluída→cliente, etc.
 * Sugeridos como botões clicáveis no UI — usuário pode editar antes de salvar.
 */
export const NOTIFICACAO_TEMPLATES_PADRAO: Array<{
  nome: string
  descricao: string
  evento: NotificacaoEvento
  destinatariosTipo: NotificacaoDestinatario
  assunto: string
  corpoHtml: string
  antecedenciaHoras?: number
}> = [
  {
    nome: 'Atrasada → Responsável',
    descricao: 'Alerta o responsável quando o SLA estourar.',
    evento: 'ATRASADA',
    destinatariosTipo: 'RESPONSAVEL',
    assunto: '⏰ Execução atrasada: {{servico.nome}} — {{cliente.razaoSocial}}',
    corpoHtml:
      '<p>Olá <strong>{{responsavel.name}}</strong>,</p>' +
      '<p>A execução do serviço <strong>{{servico.nome}}</strong> para o cliente ' +
      '<strong>{{cliente.razaoSocial}}</strong> ({{cliente.documento}}) teve o prazo vencido em ' +
      '<strong>{{prazo.data}} às {{prazo.hora}}</strong>.</p>' +
      '<p><a href="{{link.execucao}}">Abrir execução</a></p>',
  },
  {
    nome: 'Concluída → Cliente',
    descricao: 'Notifica o cliente quando a entrega for finalizada.',
    evento: 'CONCLUIDA',
    destinatariosTipo: 'CLIENTE',
    assunto: '✅ Serviço concluído: {{servico.nome}}',
    corpoHtml:
      '<p>Olá,</p>' +
      '<p>Concluímos o serviço <strong>{{servico.nome}}</strong> referente à ' +
      '<strong>{{cliente.razaoSocial}}</strong>.</p>' +
      '<p>Em caso de dúvidas, fique à vontade para responder este e-mail.</p>',
  },
  {
    nome: 'Aguardando resposta → Gestor',
    descricao: 'Avisa o gestor quando um bloco PERGUNTA precisa de decisão.',
    evento: 'AGUARDANDO_RESPOSTA',
    destinatariosTipo: 'GESTOR',
    assunto: '❓ Decisão pendente: {{servico.nome}} — {{cliente.razaoSocial}}',
    corpoHtml:
      '<p>Olá,</p>' +
      '<p>Um bloco de pergunta no processo <strong>{{processo.nome}}</strong> aguarda sua resposta ' +
      'para continuar o fluxo do cliente <strong>{{cliente.razaoSocial}}</strong>.</p>' +
      '<p><a href="{{link.execucao}}">Abrir painel de pendências</a></p>',
  },
  {
    nome: 'Prazo próximo (24h) → Responsável',
    descricao: 'Lembrete preventivo 24h antes do SLA vencer.',
    evento: 'PRAZO_PROXIMO',
    destinatariosTipo: 'RESPONSAVEL',
    antecedenciaHoras: 24,
    assunto: '⏳ Prazo próximo: {{servico.nome}} — {{cliente.razaoSocial}}',
    corpoHtml:
      '<p>Olá <strong>{{responsavel.name}}</strong>,</p>' +
      '<p>O serviço <strong>{{servico.nome}}</strong> do cliente ' +
      '<strong>{{cliente.razaoSocial}}</strong> tem prazo até ' +
      '<strong>{{prazo.data}} às {{prazo.hora}}</strong>.</p>' +
      '<p><a href="{{link.execucao}}">Abrir execução</a></p>',
  },
  {
    nome: 'Iniciada → Responsável',
    descricao: 'Notifica o responsável assim que a execução começa.',
    evento: 'INICIADA',
    destinatariosTipo: 'RESPONSAVEL',
    assunto: '▶️ Nova execução: {{servico.nome}} — {{cliente.razaoSocial}}',
    corpoHtml:
      '<p>Olá <strong>{{responsavel.name}}</strong>,</p>' +
      '<p>Foi criada uma execução do serviço <strong>{{servico.nome}}</strong> para ' +
      '<strong>{{cliente.razaoSocial}}</strong>.</p>' +
      '<p>Prazo: <strong>{{prazo.data}}</strong></p>' +
      '<p><a href="{{link.execucao}}">Abrir execução</a></p>',
  },
]

/**
 * Variáveis disponíveis para substituição em assunto/corpoHtml.
 * Renderer faz find-replace por exact match.
 */
export const NOTIFICACAO_VARIAVEIS = [
  { key: '{{servico.nome}}',           label: 'Nome do serviço' },
  { key: '{{cliente.razaoSocial}}',    label: 'Razão social do cliente' },
  { key: '{{cliente.documento}}',      label: 'CNPJ/CPF do cliente' },
  { key: '{{cliente.nomeFantasia}}',   label: 'Nome fantasia do cliente' },
  { key: '{{responsavel.name}}',       label: 'Nome do responsável' },
  { key: '{{responsavel.email}}',      label: 'E-mail do responsável' },
  { key: '{{prazo.data}}',             label: 'Data do prazo (DD/MM/AAAA)' },
  { key: '{{prazo.hora}}',             label: 'Hora do prazo (HH:mm)' },
  { key: '{{processo.nome}}',          label: 'Nome do processo' },
  { key: '{{link.execucao}}',          label: 'Link absoluto da execução' },
] as const
