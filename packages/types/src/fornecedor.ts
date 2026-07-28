import { z } from 'zod'
import { paginationSchema } from './pagination'

export const TipoFornecedor = {
  PRODUTO: 'PRODUTO',
  SERVICO: 'SERVICO',
  AMBOS: 'AMBOS',
} as const

export type TipoFornecedor = (typeof TipoFornecedor)[keyof typeof TipoFornecedor]

export const TIPO_FORNECEDOR_LABELS: Record<string, string> = {
  PRODUTO: 'Produto',
  SERVICO: 'Serviço',
  AMBOS: 'Produto e Serviço',
}

export const RiscoFornecedor = {
  BAIXO: 'BAIXO',
  MEDIO: 'MEDIO',
  ALTO: 'ALTO',
} as const

export type RiscoFornecedor = (typeof RiscoFornecedor)[keyof typeof RiscoFornecedor]

export const RISCO_FORNECEDOR_LABELS: Record<string, string> = {
  BAIXO: 'Baixo',
  MEDIO: 'Médio',
  ALTO: 'Alto',
}

export const createFornecedorSchema = z.object({
  // Identificação
  razaoSocial: z.string().min(2, 'Razão Social deve ter no mínimo 2 caracteres'),
  nomeFantasia: z.string().optional().or(z.literal('')),
  documento: z.string().min(11, 'Documento inválido'),
  tipoDocumento: z.enum(['CNPJ', 'CPF']).default('CNPJ'),
  inscricaoEstadual: z.string().optional().or(z.literal('')),
  inscricaoMunicipal: z.string().optional().or(z.literal('')),
  tipoFornecedor: z.enum(['PRODUTO', 'SERVICO', 'AMBOS']).default('AMBOS'),
  categoria: z.string().optional().or(z.literal('')),
  logoUrl: z.string().optional().or(z.literal('')),

  // Qualidade / ISO (port v1)
  risco: z.enum(['BAIXO', 'MEDIO', 'ALTO']).default('MEDIO'),
  avaliacaoObrigatoria: z.boolean().default(false),

  // Contato
  telefone: z.string().optional().or(z.literal('')),
  celular: z.string().optional().or(z.literal('')),
  email: z.string().email('E-mail inválido').optional().or(z.literal('')),
  site: z.string().optional().or(z.literal('')),
  contatoPrincipal: z.string().optional().or(z.literal('')),
  cargoContato: z.string().optional().or(z.literal('')),

  // Endereço
  cep: z.string().optional().or(z.literal('')),
  logradouro: z.string().optional().or(z.literal('')),
  numero: z.string().optional().or(z.literal('')),
  complemento: z.string().optional().or(z.literal('')),
  bairro: z.string().optional().or(z.literal('')),
  cidade: z.string().optional().or(z.literal('')),
  uf: z.string().max(2).optional().or(z.literal('')),

  // Dados Bancários
  banco: z.string().optional().or(z.literal('')),
  agencia: z.string().optional().or(z.literal('')),
  conta: z.string().optional().or(z.literal('')),
  tipoConta: z.string().optional().or(z.literal('')),
  pixChave: z.string().optional().or(z.literal('')),
  pixTipo: z.string().optional().or(z.literal('')),

  // Comercial
  observacoes: z.string().optional().or(z.literal('')),

  // Controle
  isActive: z.boolean().default(true),
})

export const updateFornecedorSchema = createFornecedorSchema.partial()

export const listFornecedorSchema = paginationSchema.extend({
  isActive: z.coerce.boolean().optional(),
  tipoFornecedor: z.string().optional(),
  tipoDocumento: z.string().optional(),
})

export type CreateFornecedorInput = z.infer<typeof createFornecedorSchema>
export type UpdateFornecedorInput = z.infer<typeof updateFornecedorSchema>
export type ListFornecedorInput = z.infer<typeof listFornecedorSchema>

// ── Sub-entidades ISO (port v1) ──────────────────────────────

// Anexos (cad_for_arq) — o arquivo é enviado via /api/upload e aqui só gravamos os metadados.
export const createFornecedorAnexoSchema = z.object({
  fornecedorId: z.string(),
  descricao: z.string().optional().or(z.literal('')),
  fileUrl: z.string().min(1),
  fileName: z.string().min(1),
  mimeType: z.string().optional().or(z.literal('')),
  tamanho: z.number().int().nonnegative().optional(),
})
export const updateFornecedorAnexoSchema = z.object({
  id: z.string(),
  descricao: z.string().optional().or(z.literal('')),
})

// Critérios de seleção/homologação (cad_for_cri, QA='S')
export const createFornecedorCriterioSchema = z.object({
  tipoFornecedor: z.enum(['PRODUTO', 'SERVICO', 'AMBOS']).default('AMBOS'),
  criterio: z.string().min(2),
  ordem: z.number().int().nonnegative().default(0),
})
export const updateFornecedorCriterioSchema = z.object({
  id: z.string(),
  criterio: z.string().min(2).optional(),
  tipoFornecedor: z.enum(['PRODUTO', 'SERVICO', 'AMBOS']).optional(),
  ordem: z.number().int().nonnegative().optional(),
  isActive: z.boolean().optional(),
})

// Qualificação — resposta Sim/Não do fornecedor a um critério (cad_for_qua)
export const responderQualificacaoSchema = z.object({
  fornecedorId: z.string(),
  criterioId: z.string(),
  atende: z.boolean(),
})

// Mensagens/interações (cad_for_msg)
export const createFornecedorMensagemSchema = z.object({
  fornecedorId: z.string(),
  texto: z.string().min(1),
})
export const updateFornecedorMensagemSchema = z.object({
  id: z.string(),
  texto: z.string().min(1),
})

export type CreateFornecedorAnexoInput = z.infer<typeof createFornecedorAnexoSchema>
export type UpdateFornecedorAnexoInput = z.infer<typeof updateFornecedorAnexoSchema>
export type CreateFornecedorCriterioInput = z.infer<typeof createFornecedorCriterioSchema>
export type UpdateFornecedorCriterioInput = z.infer<typeof updateFornecedorCriterioSchema>
export type ResponderQualificacaoInput = z.infer<typeof responderQualificacaoSchema>
export type CreateFornecedorMensagemInput = z.infer<typeof createFornecedorMensagemSchema>
export type UpdateFornecedorMensagemInput = z.infer<typeof updateFornecedorMensagemSchema>
