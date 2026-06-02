import { z } from 'zod'
import { paginationSchema } from './pagination'

// ============================================================
// Enums e Labels
// ============================================================

export const ClienteSituacao = {
  MENSAL: 'MENSAL',
  EM_CONSTITUICAO: 'EM_CONSTITUICAO',
  POTENCIAL: 'POTENCIAL',
  AVULSO: 'AVULSO',
  PARALIZADO: 'PARALIZADO',
  PRE_OPERACIONAL: 'PRE_OPERACIONAL',
  PROSPECT: 'PROSPECT',
} as const
export type ClienteSituacao = (typeof ClienteSituacao)[keyof typeof ClienteSituacao]

export const SITUACAO_LABELS: Record<ClienteSituacao, string> = {
  MENSAL: 'Mensal',
  EM_CONSTITUICAO: 'Em Constituição',
  POTENCIAL: 'Potencial',
  AVULSO: 'Avulso',
  PARALIZADO: 'Paralizado',
  PRE_OPERACIONAL: 'Pré Operacional',
  PROSPECT: 'Prospect',
}

export const SITUACAO_COLORS: Record<ClienteSituacao, { bg: string; color: string }> = {
  MENSAL: { bg: '#5ea3cb', color: '#ffffff' },
  EM_CONSTITUICAO: { bg: '#f59e0b', color: '#ffffff' },
  POTENCIAL: { bg: '#8b5cf6', color: '#ffffff' },
  AVULSO: { bg: '#64748b', color: '#ffffff' },
  PARALIZADO: { bg: '#ef4444', color: '#ffffff' },
  PRE_OPERACIONAL: { bg: '#06b6d4', color: '#ffffff' },
  PROSPECT: { bg: '#10b981', color: '#ffffff' },
}

export const ClienteStatus = {
  ATIVA: 'ATIVA',
  INATIVA: 'INATIVA',
  SUSPENSA: 'SUSPENSA',
  BAIXADA: 'BAIXADA',
  INAPTA: 'INAPTA',
  NULA: 'NULA',
} as const
export type ClienteStatus = (typeof ClienteStatus)[keyof typeof ClienteStatus]

export const STATUS_LABELS: Record<ClienteStatus, string> = {
  ATIVA: 'Ativa',
  INATIVA: 'Inativa',
  SUSPENSA: 'Suspensa',
  BAIXADA: 'Baixada',
  INAPTA: 'Inapta',
  NULA: 'Nula',
}

export const STATUS_COLORS: Record<ClienteStatus, { bg: string; color: string }> = {
  ATIVA: { bg: '#10b981', color: '#ffffff' },
  INATIVA: { bg: '#64748b', color: '#ffffff' },
  SUSPENSA: { bg: '#f59e0b', color: '#ffffff' },
  BAIXADA: { bg: '#ef4444', color: '#ffffff' },
  INAPTA: { bg: '#f97316', color: '#ffffff' },
  NULA: { bg: '#9ca3af', color: '#ffffff' },
}

export const TipoDocumento = {
  CNPJ: 'CNPJ',
  CPF: 'CPF',
} as const
export type TipoDocumento = (typeof TipoDocumento)[keyof typeof TipoDocumento]

export const RegimeContabil = {
  CAIXA: 'CAIXA',
  COMPETENCIA: 'COMPETENCIA',
} as const
export type RegimeContabil = (typeof RegimeContabil)[keyof typeof RegimeContabil]

export const REGIME_LABELS: Record<RegimeContabil, string> = {
  CAIXA: 'Caixa',
  COMPETENCIA: 'Competência',
}

export const AREA_CONTRATADA_OPTIONS = [
  { value: 'Contabil', label: 'Contábil', color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' },
  { value: 'Fiscal', label: 'Fiscal', color: 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400' },
  { value: 'Trabalhista', label: 'Trabalhista', color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' },
  { value: 'Societario', label: 'Societário', color: 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400' },
  { value: 'Legalizacao', label: 'Legalização', color: 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400' },
] as const

// ============================================================
// Schemas Zod
// ============================================================

export const createClienteSchema = z.object({
  // Identificação
  razaoSocial: z.coerce.string().min(2, 'Razão Social é obrigatória'),
  nomeFantasia: z.coerce.string().optional().or(z.literal('')),
  documento: z.coerce.string().min(11, 'Documento é obrigatório'),
  tipoDocumento: z.enum(['CNPJ', 'CPF']).default('CNPJ'),
  tipoCliente: z.coerce.string().optional().or(z.literal('')),

  // Integração
  idSistema: z.coerce.string().optional().or(z.literal('')),
  idOmie: z.coerce.string().optional().or(z.literal('')),
  omieEmpresa: z.coerce.string().optional().or(z.literal('')),
  idOneClick: z.coerce.string().optional().or(z.literal('')),

  // Comercial
  situacao: z.enum(['MENSAL', 'EM_CONSTITUICAO', 'POTENCIAL', 'AVULSO', 'PARALIZADO', 'PRE_OPERACIONAL', 'PROSPECT']).default('MENSAL'),
  status: z.enum(['ATIVA', 'INATIVA', 'SUSPENSA', 'BAIXADA', 'INAPTA', 'NULA']).default('ATIVA'),
  grupo: z.coerce.string().optional().or(z.literal('')),
  categoria: z.coerce.string().optional().or(z.literal('')),
  origem: z.coerce.string().optional().or(z.literal('')),
  dataEntrada: z.coerce.string().optional().or(z.literal('')),
  dataSaida: z.coerce.string().optional().or(z.literal('')),
  observacoes: z.coerce.string().optional().or(z.literal('')),

  // Fiscal
  tributacao: z.enum(['SIMPLES_NACIONAL', 'LUCRO_PRESUMIDO', 'LUCRO_REAL', 'MEI', 'IMUNE', 'ISENTA']).nullish(),
  regime: z.enum(['CAIXA', 'COMPETENCIA']).nullish(),
  inscricaoEstadual: z.coerce.string().optional().or(z.literal('')),
  inscricaoMunicipal: z.coerce.string().optional().or(z.literal('')),

  // Áreas contratadas (semicolon-separated string)
  areasContratadas: z.coerce.string().optional().or(z.literal('')),

  // Legalização
  nire: z.coerce.string().optional().or(z.literal('')),
  rgEdificacao: z.coerce.string().optional().or(z.literal('')),
  codigoSimples: z.coerce.string().optional().or(z.literal('')),
  bombeirosOcupacao: z.coerce.string().optional().or(z.literal('')),
  bombeirosMetragem: z.coerce.string().optional().or(z.literal('')),
  bombeirosRota: z.coerce.string().optional().or(z.literal('')),
  bombeirosProjeto: z.coerce.string().optional().or(z.literal('')),
  bombeirosCapacidade: z.coerce.string().optional().or(z.literal('')),
  cnaePrincipal: z.coerce.string().optional().or(z.literal('')),

  // Endereço
  cep: z.coerce.string().optional().or(z.literal('')),
  logradouro: z.coerce.string().optional().or(z.literal('')),
  numero: z.coerce.string().optional().or(z.literal('')),
  complemento: z.coerce.string().optional().or(z.literal('')),
  bairro: z.coerce.string().optional().or(z.literal('')),
  cidade: z.coerce.string().optional().or(z.literal('')),
  uf: z.coerce.string().optional().or(z.literal('')),

  // Contato
  telefone: z.coerce.string().optional().or(z.literal('')),
  email: z.coerce.string().optional().or(z.literal('')),

  // Logo
  logoUrl: z.coerce.string().optional().or(z.literal('')),

  // Controle
  isActive: z.coerce.boolean().default(true),
})

export const updateClienteSchema = createClienteSchema.partial()

export const listClienteSchema = paginationSchema.extend({
  situacao: z.enum(['MENSAL', 'EM_CONSTITUICAO', 'POTENCIAL', 'AVULSO', 'PARALIZADO', 'PRE_OPERACIONAL', 'PROSPECT']).optional(),
  status: z.enum(['ATIVA', 'INATIVA', 'SUSPENSA', 'BAIXADA', 'INAPTA', 'NULA']).optional(),
  tributacao: z.enum(['SIMPLES_NACIONAL', 'LUCRO_PRESUMIDO', 'LUCRO_REAL', 'MEI', 'IMUNE', 'ISENTA']).optional(),
  grupo: z.string().optional(),
  cidade: z.string().optional(),
  uf: z.string().optional(),
  isLead: z.boolean().optional(),
  /**
   * Quando true (default), lista apenas matrizes (CNPJ com ordem 0001).
   * Filiais ficam ocultas e são exibidas via modal ao clicar na badge
   * de filiais da matriz. Use false pra mostrar todas as inscrições.
   */
  agruparMatriz: z.coerce.boolean().optional().default(true),
})

export type CreateClienteInput = z.infer<typeof createClienteSchema>
export type UpdateClienteInput = z.infer<typeof updateClienteSchema>
export type ListClienteInput = z.infer<typeof listClienteSchema>
