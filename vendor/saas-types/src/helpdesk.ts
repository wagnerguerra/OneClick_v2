import { z } from 'zod'

// Espelha o enum do Prisma — mantém em sync manualmente até virar SSOT.
export const HELPDESK_STATUS = [
  'NOVO',
  'EM_ANDAMENTO',
  'AGUARDANDO_AUDITORIA',
  'RESOLVIDO',
  'CONCLUIDO',
  'CANCELADO',
] as const
export type HelpdeskStatus = (typeof HELPDESK_STATUS)[number]

export const HELPDESK_PRIORIDADE = ['BAIXA', 'MEDIA', 'ALTA', 'URGENTE'] as const
export type HelpdeskPrioridade = (typeof HELPDESK_PRIORIDADE)[number]

export const HELPDESK_TIPO = ['INCIDENTE', 'REQUISICAO', 'DUVIDA', 'MELHORIA'] as const
export type HelpdeskTipo = (typeof HELPDESK_TIPO)[number]

// Labels visíveis na UI
export const HELPDESK_STATUS_LABELS: Record<HelpdeskStatus, string> = {
  NOVO: 'Novo',
  EM_ANDAMENTO: 'Em andamento',
  AGUARDANDO_AUDITORIA: 'Aguardando auditoria',
  RESOLVIDO: 'Pendente',
  CONCLUIDO: 'Concluído',
  CANCELADO: 'Cancelado',
}

export const HELPDESK_PRIORIDADE_LABELS: Record<HelpdeskPrioridade, string> = {
  BAIXA: 'Baixa',
  MEDIA: 'Média',
  ALTA: 'Alta',
  URGENTE: 'Urgente',
}

export const HELPDESK_TIPO_LABELS: Record<HelpdeskTipo, string> = {
  INCIDENTE: 'Incidente',
  REQUISICAO: 'Requisição',
  DUVIDA: 'Dúvida',
  MELHORIA: 'Melhoria',
}

// Cor por prioridade (consistente com o /servicos)
export const HELPDESK_PRIORIDADE_COLORS: Record<HelpdeskPrioridade, string> = {
  BAIXA: '#6b7280',
  MEDIA: '#0ea5e9',
  ALTA: '#f59e0b',
  URGENTE: '#ef4444',
}

// Status onde o SLA está pausado (relógio congelado). Vazio atualmente — o
// status que pausava (AGUARDANDO_RESPONSAVEL) foi removido. Mantido como
// array tipado pra não quebrar callers e pra facilitar reintroduzir no futuro.
export const HELPDESK_STATUS_PAUSADOS: HelpdeskStatus[] = []

// Status finais (não conta como aberto)
export const HELPDESK_STATUS_FINAIS: HelpdeskStatus[] = ['CONCLUIDO', 'CANCELADO']

// SLA padrão (horas) por prioridade — pode ser overridden em SystemConfig
// e por categoria. Valores baseados em Freshservice/Jira ITSM padrão.
export const HELPDESK_SLA_PADRAO_HORAS: Record<HelpdeskPrioridade, number> = {
  URGENTE: 4,
  ALTA: 24,
  MEDIA: 48,
  BAIXA: 120, // 5 dias úteis aproximado
}

// ── Schemas Zod ──────────────────────────────────────────────────

export const createTicketSchema = z.object({
  titulo: z.string().min(3, 'Título precisa ter pelo menos 3 caracteres').max(200),
  descricao: z.string().min(1, 'Descrição é obrigatória'),
  tipo: z.enum(HELPDESK_TIPO).default('INCIDENTE'),
  prioridade: z.enum(HELPDESK_PRIORIDADE).default('MEDIA'),
  categoriaId: z.string().optional().nullable(),
  tags: z.array(z.string()).optional().default([]),
})
export type CreateTicketInput = z.infer<typeof createTicketSchema>

export const updateTicketSchema = z.object({
  titulo: z.string().min(3).max(200).optional(),
  descricao: z.string().min(1).optional(),
  tipo: z.enum(HELPDESK_TIPO).optional(),
  prioridade: z.enum(HELPDESK_PRIORIDADE).optional(),
  status: z.enum(HELPDESK_STATUS).optional(),
  categoriaId: z.string().nullable().optional(),
  areaId: z.string().nullable().optional(),
  responsavelId: z.string().nullable().optional(),
  prazoSla: z.string().nullable().optional(), // ISO date
  tags: z.array(z.string()).optional(),
  arquivado: z.boolean().optional(),
})
export type UpdateTicketInput = z.infer<typeof updateTicketSchema>

export const listTicketSchema = z.object({
  scope: z.enum(['MEUS', 'AREA', 'TODOS']).default('MEUS'),
  status: z.array(z.enum(HELPDESK_STATUS)).optional(),
  prioridade: z.array(z.enum(HELPDESK_PRIORIDADE)).optional(),
  categoriaId: z.string().optional(),
  responsavelId: z.string().optional(),
  search: z.string().optional(),
  arquivado: z.boolean().optional().default(false),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
})
export type ListTicketInput = z.infer<typeof listTicketSchema>

export const addMensagemSchema = z.object({
  ticketId: z.string(),
  conteudo: z.string().min(1, 'Mensagem vazia'),
  interna: z.boolean().default(false),
})
export type AddMensagemInput = z.infer<typeof addMensagemSchema>

export const editMensagemSchema = z.object({
  id: z.string(),
  conteudo: z.string().min(1, 'Mensagem vazia'),
})
export type EditMensagemInput = z.infer<typeof editMensagemSchema>

export const deleteMensagemSchema = z.object({
  id: z.string(),
})
export type DeleteMensagemInput = z.infer<typeof deleteMensagemSchema>

export const csatSchema = z.object({
  ticketId: z.string(),
  nota: z.coerce.number().int().min(1).max(5),
  comentario: z.string().max(2000).optional().nullable(),
})
export type CsatInput = z.infer<typeof csatSchema>
