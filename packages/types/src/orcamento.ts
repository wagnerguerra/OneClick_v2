import { z } from 'zod'
import { paginationSchema } from './pagination'

export const createOrcamentoSchema = z.object({
  clienteId: z.string().optional().nullable(),
  oportunidadeId: z.string().optional().nullable(),
  responsavelId: z.string().optional().nullable(),
  solicitanteId: z.string().optional().nullable(),
  tipo: z.string().optional().nullable(),
  area: z.string().optional().nullable(),
  validadeDias: z.coerce.number().min(1).default(90),
  contatos: z.string().optional().nullable(),
  emailsContatos: z.string().optional().nullable(),
  observacoes: z.string().optional().nullable(),
  // Campos do modal de criacao (legado crp_orcamentos)
  descontoPct: z.coerce.number().min(0).max(100).optional().nullable(),
  descontoValor: z.coerce.number().min(0).optional().nullable(),
  formaPagamento: z.string().optional().nullable(),
  textoInterno: z.string().optional().nullable(),
  // Servico template vinculado — quando orcamento for APROVADO,
  // sistema cria automaticamente uma execucao para o responsavel
  servicoId: z.string().optional().nullable(),
})

export const updateOrcamentoSchema = createOrcamentoSchema.partial().extend({
  descontoPct: z.coerce.number().min(0).max(100).optional().nullable(),
  descontoValor: z.coerce.number().min(0).optional().nullable(),
  formaPagamento: z.string().optional().nullable(),
  textoInterno: z.string().optional().nullable(),
  textoCorpoCliente: z.string().optional().nullable(),
})

export const listOrcamentoSchema = paginationSchema.extend({
  status: z.string().optional(),
  clienteId: z.string().optional(),
  arquivado: z.boolean().optional(),
  // Filtro de auditoria: somente orcamentos com reaberturas registradas
  comReaberturas: z.boolean().optional(),
  // Escopo de listagem (espelha legado: 1=proprios, 2=financeiro, 3=area, 4=todos)
  scope: z.enum(['proprios', 'financeiro', 'area', 'todos']).optional(),
  // Ordenação clicável (modo tabela) — campos diretos do orçamento.
  sortKey: z.enum(['numero', 'status', 'totalGeral', 'createdAt']).optional(),
  sortDir: z.enum(['asc', 'desc']).optional(),
})

export const itemSituacaoSchema = z.enum(['A_FAZER', 'FAZENDO', 'PENDENTE', 'CONCLUIDO'])

export const createOrcamentoItemSchema = z.object({
  orcamentoId: z.string(),
  tipo: z.enum(['SERVICO', 'TAXA', 'DESPESA']),
  descricao: z.string().min(1),
  quantidade: z.coerce.number().min(0.0001).default(1),
  valorUnitario: z.coerce.number().min(0),
  // Desconto por item (#HLP0302) — só vale para serviço; % e valor somam.
  itemDescontoPct: z.coerce.number().min(0).max(100).optional().nullable(),
  itemDescontoValor: z.coerce.number().min(0).optional().nullable(),
  catalogoId: z.string().optional().nullable(),
  catalogoTextoId: z.string().optional().nullable(),
  situacao: itemSituacaoSchema.optional(),
})

export const updateOrcamentoItemSchema = z.object({
  tipo: z.enum(['SERVICO', 'TAXA', 'DESPESA']).optional(),
  descricao: z.string().min(1).optional(),
  quantidade: z.coerce.number().min(0.0001).optional(),
  valorUnitario: z.coerce.number().min(0).optional(),
  itemDescontoPct: z.coerce.number().min(0).max(100).optional().nullable(),
  itemDescontoValor: z.coerce.number().min(0).optional().nullable(),
  situacao: itemSituacaoSchema.optional(),
  // Vínculo com item do catálogo — permite trocar o serviço na edição
  // usando a mesma busca da inclusão (#HLP0088).
  catalogoId: z.string().optional().nullable(),
  catalogoTextoId: z.string().optional().nullable(),
})

export type CreateOrcamentoInput = z.infer<typeof createOrcamentoSchema>
export type UpdateOrcamentoInput = z.infer<typeof updateOrcamentoSchema>
export type ListOrcamentoInput = z.infer<typeof listOrcamentoSchema>
export type CreateOrcamentoItemInput = z.infer<typeof createOrcamentoItemSchema>
export type UpdateOrcamentoItemInput = z.infer<typeof updateOrcamentoItemSchema>

// ── Workflow rules (FSM) — compartilhado backend/frontend ──────
//
// Mapa de transições permitidas via kanban / changeStatus. Forward-only:
// regressões são bloqueadas tanto pela API (gate de segurança) quanto pelo
// kanban (UX de bloqueio visual durante o drag). Para qualquer regressão,
// usar o endpoint `reabrir` (que pede motivo e limpa datas posteriores).

export const ORCAMENTO_STATUS_ORDER = ['NOVO', 'A_ENVIAR', 'ENVIADO', 'APROVADO', 'LIBERADO', 'FINALIZADO', 'ENCERRADO'] as const
export type OrcamentoStatusValue = typeof ORCAMENTO_STATUS_ORDER[number]

export const ORCAMENTO_STATUS_LABELS: Record<OrcamentoStatusValue, string> = {
  NOVO: 'Novo',
  A_ENVIAR: 'A Enviar',
  ENVIADO: 'Enviado',
  APROVADO: 'Aprovado',
  LIBERADO: 'Liberado',
  FINALIZADO: 'Finalizado',
  ENCERRADO: 'Encerrado',
}

export const ORCAMENTO_ALLOWED_TRANSITIONS: Record<OrcamentoStatusValue, OrcamentoStatusValue[]> = {
  NOVO:        ['A_ENVIAR', 'ENVIADO', 'ENCERRADO'],
  A_ENVIAR:    ['ENVIADO', 'ENCERRADO'],
  ENVIADO:     ['APROVADO', 'ENCERRADO'],
  APROVADO:    ['LIBERADO', 'ENCERRADO'],
  LIBERADO:    ['FINALIZADO', 'ENCERRADO'],
  FINALIZADO:  ['ENCERRADO'],
  ENCERRADO:   [],
}

/** True se a transição (de → para) é permitida pelo workflow forward-only. */
export function isOrcamentoTransitionAllowed(de: string, para: string): boolean {
  if (de === para) return false
  return (ORCAMENTO_ALLOWED_TRANSITIONS[de as OrcamentoStatusValue] ?? []).includes(para as OrcamentoStatusValue)
}
