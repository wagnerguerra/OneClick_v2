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
