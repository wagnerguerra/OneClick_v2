import { z } from 'zod'
import { paginationSchema } from './pagination'

// ── Enums / labels ───────────────────────────────────────────
export const StatusCompra = {
  NOVO: 'NOVO',
  AGUARDANDO_APROVACAO: 'AGUARDANDO_APROVACAO',
  APROVADO: 'APROVADO',
  REPROVADO: 'REPROVADO',
  RECEBIDO: 'RECEBIDO',
  AVALIADO: 'AVALIADO',
  CANCELADO: 'CANCELADO',
} as const
export type StatusCompra = (typeof StatusCompra)[keyof typeof StatusCompra]

export const STATUS_COMPRA_LABELS: Record<string, string> = {
  NOVO: 'Novo',
  AGUARDANDO_APROVACAO: 'Aguardando Aprovação',
  APROVADO: 'Aprovado',
  REPROVADO: 'Reprovado',
  RECEBIDO: 'Recebido',
  AVALIADO: 'Avaliado',
  CANCELADO: 'Cancelado',
}

export const TipoFornecimento = {
  NORMAL: 'NORMAL',
  CONTRATO_PERMANENTE: 'CONTRATO_PERMANENTE',
  CONTRATO_TEMPORARIO: 'CONTRATO_TEMPORARIO',
  CURSO_TREINAMENTO: 'CURSO_TREINAMENTO',
  MANUTENCAO_SOFTWARE: 'MANUTENCAO_SOFTWARE',
} as const
export type TipoFornecimento = (typeof TipoFornecimento)[keyof typeof TipoFornecimento]

export const TIPO_FORNECIMENTO_LABELS: Record<string, string> = {
  NORMAL: 'Normal',
  CONTRATO_PERMANENTE: 'Contrato Permanente',
  CONTRATO_TEMPORARIO: 'Contrato Temporário',
  CURSO_TREINAMENTO: 'Curso / Treinamento',
  MANUTENCAO_SOFTWARE: 'Manutenção de Software',
}

const TIPO_FORN_VALUES = ['NORMAL', 'CONTRATO_PERMANENTE', 'CONTRATO_TEMPORARIO', 'CURSO_TREINAMENTO', 'MANUTENCAO_SOFTWARE'] as const

// ── Item (dentro do create ou avulso) ────────────────────────
const compraItemBaseSchema = z.object({
  descricao: z.string().min(1),
  unidade: z.string().optional().or(z.literal('')),
  quantidade: z.number().int().positive().default(1),
  valorUnitario: z.number().nonnegative().default(0),
})

// ── Pedido ───────────────────────────────────────────────────
export const createCompraSchema = z.object({
  fornecedorId: z.string().min(1, 'Selecione o fornecedor'),
  solicitanteId: z.string().optional().or(z.literal('')),
  formaPagamento: z.string().optional().or(z.literal('')),
  prazoEntrega: z.string().optional().or(z.literal('')),
  prazoPagamento: z.string().optional().or(z.literal('')),
  frete: z.number().nonnegative().optional(),
  observacoes: z.string().optional().or(z.literal('')),
  itens: z.array(compraItemBaseSchema).optional(),
})

export const updateCompraSchema = z.object({
  fornecedorId: z.string().optional(),
  solicitanteId: z.string().optional().or(z.literal('')),
  formaPagamento: z.string().optional().or(z.literal('')),
  prazoEntrega: z.string().optional().or(z.literal('')),
  prazoPagamento: z.string().optional().or(z.literal('')),
  frete: z.number().nonnegative().optional(),
  observacoes: z.string().optional().or(z.literal('')),
})

export const listCompraSchema = paginationSchema.extend({
  status: z.string().optional(),
  fornecedorId: z.string().optional(),
  arquivadas: z.coerce.boolean().optional(),
})

// ── Itens (CRUD avulso) ──────────────────────────────────────
export const createCompraItemSchema = compraItemBaseSchema.extend({ compraId: z.string() })
export const updateCompraItemSchema = z.object({
  id: z.string(),
  descricao: z.string().min(1).optional(),
  unidade: z.string().optional().or(z.literal('')),
  quantidade: z.number().int().positive().optional(),
  valorUnitario: z.number().nonnegative().optional(),
})

// ── Ações do workflow ────────────────────────────────────────
export const reprovarCompraSchema = z.object({ id: z.string(), motivo: z.string().min(3) })
export const avaliarCompraSchema = z.object({
  id: z.string(),
  nfNumero: z.string().optional().or(z.literal('')),
  nfValor: z.number().nonnegative().optional(),
  tipoFornecimento: z.enum(TIPO_FORN_VALUES).default('NORMAL'),
  melhoria: z.boolean().default(false),
  melhoriaObs: z.string().optional().or(z.literal('')),
  setor: z.string().optional().or(z.literal('')),
  respostas: z.array(z.object({ criterioId: z.string(), atende: z.boolean() })).default([]),
})

// ── Anexos / Mensagens / Critérios (espelham fornecedor) ─────
export const createCompraAnexoSchema = z.object({
  compraId: z.string(),
  descricao: z.string().optional().or(z.literal('')),
  fileUrl: z.string().min(1),
  fileName: z.string().min(1),
  mimeType: z.string().optional().or(z.literal('')),
  tamanho: z.number().int().nonnegative().optional(),
})
export const updateCompraAnexoSchema = z.object({ id: z.string(), descricao: z.string().optional().or(z.literal('')) })
export const createCompraMensagemSchema = z.object({
  compraId: z.string(),
  texto: z.string().min(1),
  /** Resposta a outra mensagem — encadeia a thread, como no orçamento. */
  parentId: z.string().optional(),
})
export const updateCompraMensagemSchema = z.object({ id: z.string(), texto: z.string().min(1) })
export const createCompraCriterioSchema = z.object({ criterio: z.string().min(2), ordem: z.number().int().nonnegative().default(0) })
export const updateCompraCriterioSchema = z.object({
  id: z.string(), criterio: z.string().min(2).optional(), ordem: z.number().int().nonnegative().optional(), isActive: z.boolean().optional(),
})

// ── Cotação (RFQ) ────────────────────────────────────────────
export const StatusCotacao = {
  RASCUNHO: 'RASCUNHO',
  ENVIADA: 'ENVIADA',
  APURACAO: 'APURACAO',
  CONVERTIDA: 'CONVERTIDA',
  CANCELADA: 'CANCELADA',
} as const
export type StatusCotacao = (typeof StatusCotacao)[keyof typeof StatusCotacao]

export const STATUS_COTACAO_LABELS: Record<string, string> = {
  RASCUNHO: 'Rascunho',
  ENVIADA: 'Enviada',
  APURACAO: 'Em apuração',
  CONVERTIDA: 'Convertida em pedidos',
  CANCELADA: 'Cancelada',
}

export const createCotacaoSchema = z.object({
  titulo: z.string().max(200).optional().or(z.literal('')),
  observacoes: z.string().optional().or(z.literal('')),
  prazoResposta: z.string().optional().or(z.literal('')), // 'YYYY-MM-DD'
})
export const updateCotacaoSchema = createCotacaoSchema.partial().extend({
  id: z.string(),
  status: z.enum(['RASCUNHO', 'ENVIADA', 'APURACAO', 'CONVERTIDA', 'CANCELADA']).optional(),
})
export const listCotacaoSchema = paginationSchema.extend({
  status: z.string().optional(),
})

export const createCotacaoItemSchema = z.object({
  cotacaoId: z.string(),
  descricao: z.string().min(1, 'Descreva o item'),
  unidade: z.string().optional().or(z.literal('')),
  quantidade: z.coerce.number().int().min(1).default(1),
})
export const updateCotacaoItemSchema = z.object({
  id: z.string(),
  descricao: z.string().min(1).optional(),
  unidade: z.string().optional().or(z.literal('')),
  quantidade: z.coerce.number().int().min(1).optional(),
  ordem: z.coerce.number().int().nonnegative().optional(),
})

export const addCotacaoFornecedorSchema = z.object({
  cotacaoId: z.string(),
  fornecedorId: z.string(),
})
/** Condições comerciais que o fornecedor devolveu junto da proposta. */
export const updateCotacaoFornecedorSchema = z.object({
  id: z.string(),
  frete: z.coerce.number().nonnegative().optional().nullable(),
  prazoEntrega: z.string().optional().or(z.literal('')),
  prazoPagamento: z.string().optional().or(z.literal('')),
  formaPagamento: z.string().optional().or(z.literal('')),
  validadeProposta: z.string().optional().or(z.literal('')),
  observacoes: z.string().optional().or(z.literal('')),
  /** Marca/desmarca a proposta como recebida. */
  respondido: z.boolean().optional(),
})

/** Uma célula da matriz. `disponivel: false` = fornecedor não atende o item. */
export const setCotacaoPrecoSchema = z.object({
  cotacaoItemId: z.string(),
  cotacaoFornecedorId: z.string(),
  valorUnitario: z.coerce.number().nonnegative().optional().nullable(),
  disponivel: z.boolean().optional(),
  observacoes: z.string().optional().or(z.literal('')),
})

/** Premia um item. `cotacaoFornecedorId: null` desfaz a premiação. */
export const premiarItemSchema = z.object({
  cotacaoItemId: z.string(),
  cotacaoFornecedorId: z.string().nullable(),
})
export const premiarLoteSchema = z.object({
  cotacaoId: z.string(),
  /** 'MENOR_PRECO' = melhor preço item a item (pode dividir entre fornecedores).
   *  'FORNECEDOR_UNICO' = tudo em um só (exige `cotacaoFornecedorId`). */
  modo: z.enum(['MENOR_PRECO', 'FORNECEDOR_UNICO']),
  cotacaoFornecedorId: z.string().optional(),
})

export const enviarCotacaoSchema = z.object({
  cotacaoId: z.string(),
  /** Vazio = todos os convidados que ainda não receberam. */
  cotacaoFornecedorIds: z.array(z.string()).optional(),
})

export type CreateCotacaoInput = z.infer<typeof createCotacaoSchema>
export type UpdateCotacaoInput = z.infer<typeof updateCotacaoSchema>
export type ListCotacaoInput = z.infer<typeof listCotacaoSchema>
export type CreateCotacaoItemInput = z.infer<typeof createCotacaoItemSchema>
export type UpdateCotacaoItemInput = z.infer<typeof updateCotacaoItemSchema>
export type AddCotacaoFornecedorInput = z.infer<typeof addCotacaoFornecedorSchema>
export type UpdateCotacaoFornecedorInput = z.infer<typeof updateCotacaoFornecedorSchema>
export type SetCotacaoPrecoInput = z.infer<typeof setCotacaoPrecoSchema>
export type PremiarItemInput = z.infer<typeof premiarItemSchema>
export type PremiarLoteInput = z.infer<typeof premiarLoteSchema>
export type EnviarCotacaoInput = z.infer<typeof enviarCotacaoSchema>

export type CreateCompraInput = z.infer<typeof createCompraSchema>
export type UpdateCompraInput = z.infer<typeof updateCompraSchema>
export type ListCompraInput = z.infer<typeof listCompraSchema>
export type CreateCompraItemInput = z.infer<typeof createCompraItemSchema>
export type UpdateCompraItemInput = z.infer<typeof updateCompraItemSchema>
export type ReprovarCompraInput = z.infer<typeof reprovarCompraSchema>
export type AvaliarCompraInput = z.infer<typeof avaliarCompraSchema>
export type CreateCompraAnexoInput = z.infer<typeof createCompraAnexoSchema>
export type UpdateCompraAnexoInput = z.infer<typeof updateCompraAnexoSchema>
export type CreateCompraMensagemInput = z.infer<typeof createCompraMensagemSchema>
export type UpdateCompraMensagemInput = z.infer<typeof updateCompraMensagemSchema>
export type CreateCompraCriterioInput = z.infer<typeof createCompraCriterioSchema>
export type UpdateCompraCriterioInput = z.infer<typeof updateCompraCriterioSchema>
