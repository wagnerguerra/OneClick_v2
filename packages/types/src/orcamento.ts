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
  // Filtros do painel (HLP0296) — espelham a lista do legado.
  numero: z.coerce.number().int().positive().optional(),
  dataInicial: z.string().optional(), // YYYY-MM-DD (filtra createdAt)
  dataFinal: z.string().optional(),   // YYYY-MM-DD (filtra createdAt)
  // Filtro "Item": id do catálogo (Servico.id p/ SERVICO, ServicoCatalogo.id
  // p/ TAXA/DESPESA) — casa por item do orçamento, de qualquer tipo.
  itemCatalogoId: z.string().optional(),
  responsavelId: z.string().optional(),
  solicitanteId: z.string().optional(),
  // "Incluir paralizados?" — default é incluir (Sim); só constrange quando false.
  incluirParalizados: z.boolean().optional(),
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

// Ordem do PIPELINE = colunas do kanban. CANCELADO fica FORA daqui de propósito:
// é um estado terminal fora do funil (não vira coluna). Ver ORCAMENTO_STATUS_ALL.
export const ORCAMENTO_STATUS_ORDER = ['NOVO', 'A_ENVIAR', 'ENVIADO', 'APROVADO', 'LIBERADO', 'FINALIZADO', 'ENCERRADO'] as const

// Todos os status possíveis, incluindo os terminais fora do pipeline (CANCELADO).
// É a base dos rótulos e do tipo — o kanban usa só o ORDER acima.
export const ORCAMENTO_STATUS_ALL = [...ORCAMENTO_STATUS_ORDER, 'CANCELADO'] as const
export type OrcamentoStatusValue = typeof ORCAMENTO_STATUS_ALL[number]

export const ORCAMENTO_STATUS_LABELS: Record<OrcamentoStatusValue, string> = {
  NOVO: 'Novo',
  A_ENVIAR: 'A Enviar',
  ENVIADO: 'Enviado',
  APROVADO: 'Aprovado',
  LIBERADO: 'Liberado',
  FINALIZADO: 'Finalizado',
  ENCERRADO: 'Encerrado',
  CANCELADO: 'Cancelado',
}

/**
 * Campos do relatório de orçamentos — fonte única para a tela (escolha dos
 * campos) e para o servidor (cabeçalho do xlsx/csv/pdf). Serve ao "Relatório
 * da coluna" do kanban e à exportação da lista. Campo novo entra AQUI.
 *  - `status` só faz sentido na exportação da lista (atravessa etapas);
 *  - `dataStatus` só no relatório da coluna (uma etapa só).
 */
export const ORCAMENTO_RELATORIO_CAMPOS = [
  { key: 'numero', label: 'Número' },
  { key: 'status', label: 'Status' },
  { key: 'cliente', label: 'Cliente' },
  { key: 'valorTotal', label: 'Valor total' },
  { key: 'natureza', label: 'Tipo (Extra/Mensal)' },
  { key: 'areas', label: 'Área(s)' },
  { key: 'solicitante', label: 'Solicitante' },
  { key: 'responsavel', label: 'Responsável' },
  { key: 'createdAt', label: 'Criado em' },
  { key: 'dataStatus', label: 'Data na etapa' },
  { key: 'validadeDias', label: 'Validade (dias)' },
  { key: 'itens', label: 'Itens/serviços' },
  { key: 'descontoAplicado', label: 'Desconto' },
  { key: 'formaPagamento', label: 'Forma de pagamento' },
  { key: 'textoInterno', label: 'Texto Interno' },
  { key: 'textoCliente', label: 'Texto para o Cliente' },
] as const
export type OrcamentoRelatorioCampo = typeof ORCAMENTO_RELATORIO_CAMPOS[number]['key']

/** Campos marcados por padrão no relatório da coluna. */
export const ORCAMENTO_RELATORIO_CAMPOS_PADRAO: OrcamentoRelatorioCampo[] =
  ['numero', 'cliente', 'valorTotal', 'natureza', 'areas', 'responsavel', 'createdAt']
/** Campos marcados por padrão na exportação da lista (o Status a mais). */
export const ORCAMENTO_EXPORTACAO_CAMPOS_PADRAO: OrcamentoRelatorioCampo[] =
  ['status', ...ORCAMENTO_RELATORIO_CAMPOS_PADRAO]

// Transições do funil (drag no kanban). Cancelamento NÃO é transição de drag —
// é ação própria (botão Cancelar), então CANCELADO não é destino de ninguém e,
// sendo terminal, não sai para lugar nenhum.
export const ORCAMENTO_ALLOWED_TRANSITIONS: Record<OrcamentoStatusValue, OrcamentoStatusValue[]> = {
  NOVO:        ['A_ENVIAR', 'ENVIADO', 'ENCERRADO'],
  A_ENVIAR:    ['ENVIADO', 'ENCERRADO'],
  ENVIADO:     ['APROVADO', 'ENCERRADO'],
  APROVADO:    ['LIBERADO', 'ENCERRADO'],
  LIBERADO:    ['FINALIZADO', 'ENCERRADO'],
  FINALIZADO:  ['ENCERRADO'],
  ENCERRADO:   [],
  CANCELADO:   [],
}

/** True se a transição (de → para) é permitida pelo workflow forward-only. */
export function isOrcamentoTransitionAllowed(de: string, para: string): boolean {
  if (de === para) return false
  return (ORCAMENTO_ALLOWED_TRANSITIONS[de as OrcamentoStatusValue] ?? []).includes(para as OrcamentoStatusValue)
}

/**
 * Cores do destaque do card no quadro de orçamentos. Nomes das cores do
 * `color-styles` do web (a tela monta as classes a partir deles). A primeira é
 * o padrão.
 */
export const DESTAQUE_CORES = ['amber', 'orange', 'rose', 'emerald', 'sky', 'violet'] as const
export type DestaqueCor = (typeof DESTAQUE_CORES)[number]
export const DESTAQUE_COR_LABELS: Record<DestaqueCor, string> = {
  amber: 'Âmbar', orange: 'Laranja', rose: 'Rosa', emerald: 'Verde', sky: 'Azul', violet: 'Violeta',
}
