import { z } from 'zod'

/**
 * Categorias visíveis em /obrigacoes (mesmas que `Servico.categoria`).
 * Mantido como tupla pra permitir filtro via z.enum sem perder o type.
 */
export const OBRIGACAO_CATEGORIAS = ['Fiscal', 'Trabalhista', 'Contábil'] as const
export type ObrigacaoCategoria = (typeof OBRIGACAO_CATEGORIAS)[number]

export const OBRIGACAO_CATEGORIA_CORES: Record<ObrigacaoCategoria, { bg: string; text: string; border: string }> = {
  Fiscal:      { bg: 'bg-indigo-50',  text: 'text-indigo-700',  border: 'border-indigo-200' },
  Trabalhista: { bg: 'bg-lime-50',    text: 'text-lime-700',    border: 'border-lime-200' },
  Contábil:    { bg: 'bg-violet-50',  text: 'text-violet-700',  border: 'border-violet-200' },
}

export const listObrigacoesSchema = z.object({
  categoria: z.enum(OBRIGACAO_CATEGORIAS).optional(),
  frequencia: z.enum(['DIARIA', 'SEMANAL', 'MENSAL', 'TRIMESTRAL', 'SEMESTRAL', 'ANUAL']).optional(),
  search: z.string().optional(),
  ativo: z.boolean().optional(),
}).optional()
export type ListObrigacoesInput = z.infer<typeof listObrigacoesSchema>

export const createObrigacaoSchema = z.object({
  nome: z.string().min(2),
  descricao: z.string().optional().nullable(),
  categoria: z.enum(OBRIGACAO_CATEGORIAS),
  fonteUrl: z.string().url().optional().nullable(),
  documentacaoUrl: z.string().url().optional().nullable(),
  // Recorrência inicial — opcional; usuário ajusta depois em /servicos/[id]
  recorrencia: z.object({
    frequencia: z.enum(['DIARIA', 'SEMANAL', 'MENSAL', 'TRIMESTRAL', 'SEMESTRAL', 'ANUAL']),
    ancoragem: z.enum(['DIA_DO_MES', 'DIA_UTIL', 'DIAS_APOS_COMPETENCIA']).default('DIA_DO_MES'),
    valorAncoragem: z.coerce.number().int().min(1).max(31),
    competenciaOffset: z.coerce.number().int().min(0).max(12).default(1),
  }).optional(),
})
export type CreateObrigacaoInput = z.infer<typeof createObrigacaoSchema>
