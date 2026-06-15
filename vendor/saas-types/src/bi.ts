import { z } from 'zod'

// ══════════════════════════════════════════════════════════════
// Inputs para consultas BI
// ══════════════════════════════════════════════════════════════

export const biClienteIdSchema = z.object({
  clienteId: z.string(),
})

export const biAnoSchema = z.object({
  clienteId: z.string(),
  ano: z.coerce.number().min(2000).max(2100),
})

export const biFaturamentoSerieSchema = z.object({
  clienteId: z.string(),
  ano: z.coerce.number(),
  fonte: z.enum(['sci', 'manual']).default('sci'),
  meses: z.string().optional(), // "1,2,3" comma-separated
})

export const biFaturamentoRefreshSchema = z.object({
  clienteId: z.string(),
  ano: z.coerce.number(),
  quadro: z.string().optional(),
  consolidar: z.coerce.boolean().default(false),
})

export const biBalanceteMatrizSchema = z.object({
  clienteId: z.string(),
  ano: z.coerce.number(),
  useParent: z.coerce.boolean().default(false),
})

export const biBalanceteKpisSchema = z.object({
  clienteId: z.string(),
  ano: z.coerce.number(),
  meses: z.string().optional(), // "1,2,3"
  categorias: z.string().optional(), // IDs comma-separated
})

export const biBalanceteAnaliseSchema = z.object({
  clienteId: z.string(),
  ano: z.coerce.number(),
  meses: z.string().optional(),
})

export const biBalanceteRefreshSchema = z.object({
  clienteId: z.string(),
  ano: z.coerce.number(),
  force: z.coerce.boolean().default(false),
})

export const biExcluirPeriodoSchema = z.object({
  clienteId: z.string(),
  ano: z.coerce.number(),
  mesInicio: z.coerce.number().min(1).max(12).optional(),
  mesFim: z.coerce.number().min(1).max(12).optional(),
})

export const biSimularSchema = z.object({
  clienteId: z.string(),
  ref: z.coerce.number(), // AAAAMM (ex: 202501)
})

export const biCategoriasCopiarSchema = z.object({
  documentoOrigem: z.string(),
  documentoDestino: z.string(),
})

export const biContaIgnoradaGetSchema = z.object({
  clienteId: z.string(),
  tipoKpi: z.string(),
})

export const biContaIgnoradaSaveSchema = z.object({
  clienteId: z.string(),
  tipoKpi: z.string(),
  contas: z.array(z.string()),
})

export const biRegraCalculoGetSchema = z.object({
  clienteId: z.string(),
  tipoKpi: z.string(),
})

export const biRegraCalculoSaveSchema = z.object({
  clienteId: z.string(),
  tipoKpi: z.string(),
  regra: z.any(),
})

export const biLinkPublicoSchema = z.object({
  clienteId: z.string(),
})

export const biPublicTokenSchema = z.object({
  token: z.string(),
})

// ══════════════════════════════════════════════════════════════
// Schemas para categorias do balancete
// ══════════════════════════════════════════════════════════════

export const biCategoriaSaveSchema = z.object({
  documento: z.string(),
  categorias: z.array(z.object({
    contaLonga: z.string(),
    parentContaLonga: z.string().optional().nullable(),
    nomeExibido: z.string().optional().nullable(),
    ordem: z.coerce.number().default(0),
    ativo: z.coerce.boolean().default(true),
    tipo: z.string().optional().nullable(),
    formula: z.string().optional().nullable(),
  })),
})

export const biCategoriaLimparSchema = z.object({
  documento: z.string(),
})

export const biBackupSchema = z.object({
  documento: z.string(),
})

export const biLinhaSchema = z.object({
  documento: z.string(),
  ano: z.coerce.number(),
})

export const biLinhaSaveSchema = z.object({
  documento: z.string(),
  linhas: z.array(z.object({
    contaLonga: z.string(),
    nomeConta: z.string().optional(),
    ref: z.coerce.number(), // AAAAMM
    valor: z.coerce.number(),
    natureza: z.string().optional(),
  })),
})

export const biLinhaDeleteSchema = z.object({
  documento: z.string(),
  ids: z.array(z.string()),
})

// ══════════════════════════════════════════════════════════════
// Tipos de output
// ══════════════════════════════════════════════════════════════

export type BiKpiResult = {
  receitaBruta: number
  deducoes: number
  receitaLiquida: number
  custoDasVendas: number
  lucroBruto: number
  margemBruta: number
  custosFixos: number
  despesasOperacionais: number
  lucroOperacional: number
  ebitda: number
  lucroLiquidoDRE: number
  [key: string]: number
}

export type BiMatrizLinha = {
  contaLonga: string
  nomeConta: string
  nomeExibido?: string
  parentContaLonga?: string
  nivel: number
  tipo?: string
  valores: Record<string, number> // { "01": 1234.56, "02": 789.00, ... }
  total: number
}

export type BiAnaliseItem = {
  contaLonga: string
  nomeConta: string
  valores: Record<string, number>
  percentuais: Record<string, number>
  variacoes: Record<string, number>
}

export type BiFaturamentoSerie = {
  ano: number
  meses: Array<{ mes: number; valor: number }>
  total: number
}

export type BiRefreshStatus = {
  status: 'idle' | 'running' | 'done' | 'error'
  progress?: number
  message?: string
  log?: string[]
  startedAt?: string
  completedAt?: string
}

export type BiLinkPublicoResult = {
  token: string
  url: string
}

// Tipos de KPI suportados
export const BI_KPI_TIPOS = [
  'receita_bruta',
  'deducoes',
  'receita_liquida',
  'custo_das_vendas',
  'lucro_bruto',
  'custos_fixos',
  'despesas_operacionais',
  'lucro_operacional',
  'ebitda',
  'lucro_liquido_dre',
] as const

export type BiKpiTipo = (typeof BI_KPI_TIPOS)[number]
