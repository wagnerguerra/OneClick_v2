import { z } from 'zod'
import { paginationSchema } from './pagination'

export const TaxRegime = {
  SIMPLES_NACIONAL: 'SIMPLES_NACIONAL',
  LUCRO_PRESUMIDO: 'LUCRO_PRESUMIDO',
  LUCRO_REAL: 'LUCRO_REAL',
  MEI: 'MEI',
  IMUNE: 'IMUNE',
  ISENTA: 'ISENTA',
} as const

export type TaxRegime = (typeof TaxRegime)[keyof typeof TaxRegime]

export const taxRegimeLabels: Record<TaxRegime, string> = {
  SIMPLES_NACIONAL: 'Simples Nacional',
  LUCRO_PRESUMIDO: 'Lucro Presumido',
  LUCRO_REAL: 'Lucro Real',
  MEI: 'MEI',
  IMUNE: 'Imune',
  ISENTA: 'Isenta',
}

/** Lista canônica das chaves — útil pra .map em selects. */
export const TAX_REGIME_VALUES = Object.values(TaxRegime)

export const createEmpresaSchema = z.object({
  razaoSocial: z.string().min(2, 'Razão Social é obrigatória'),
  nomeFantasia: z.string().optional().or(z.literal('')),
  cnpj: z.string().min(14, 'CNPJ é obrigatório').max(18, 'CNPJ inválido'),
  inscricaoEstadual: z.string().optional().or(z.literal('')),
  inscricaoMunicipal: z.string().optional().or(z.literal('')),
  taxRegime: z.enum(['SIMPLES_NACIONAL', 'LUCRO_PRESUMIDO', 'LUCRO_REAL', 'MEI']).optional(),
  isActive: z.boolean().default(true),

  // Endereço
  cep: z.string().min(8, 'CEP é obrigatório').or(z.literal('')).optional(),
  logradouro: z.string().min(2, 'Logradouro é obrigatório'),
  numero: z.string().optional().or(z.literal('')),
  complemento: z.string().optional().or(z.literal('')),
  bairro: z.string().min(2, 'Bairro é obrigatório'),
  cidade: z.string().min(2, 'Cidade é obrigatória'),
  uf: z.string().length(2, 'UF é obrigatória'),

  // Contato
  telefone: z.string().min(10, 'Telefone é obrigatório'),
  email: z.string().email('E-mail inválido').min(1, 'E-mail é obrigatório'),
  site: z.string().optional().or(z.literal('')),

  // Logo
  logoUrl: z.string().optional().or(z.literal('')),
  logoDarkUrl: z.string().optional().or(z.literal('')),
  // Marca d'agua exibida em documentos impressos (ex: orçamento)
  marcaDaguaUrl: z.string().optional().or(z.literal('')),
})

export const updateEmpresaSchema = createEmpresaSchema.partial()

export const listEmpresaSchema = paginationSchema.extend({
  isActive: z.coerce.boolean().optional(),
})

export type CreateEmpresaInput = z.infer<typeof createEmpresaSchema>
export type UpdateEmpresaInput = z.infer<typeof updateEmpresaSchema>
export type ListEmpresaInput = z.infer<typeof listEmpresaSchema>
