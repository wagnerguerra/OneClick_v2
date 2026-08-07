import { z } from 'zod'

/**
 * Paleta de cor/sigla das áreas fiscais clássicas (Fiscal/Trabalhista/Contábil).
 * NÃO é a lista de áreas do sistema — é só um mapa de cores conhecido; áreas fora
 * dele caem num fallback neutro no front. A área real de uma obrigação é a relação
 * Servico.areaId → Area (a coluna-ponte categoria_obrigacao foi removida na F2.5).
 */
export const OBRIGACAO_CATEGORIAS = ['Fiscal', 'Trabalhista', 'Contábil'] as const
export type ObrigacaoCategoria = (typeof OBRIGACAO_CATEGORIAS)[number]

export const OBRIGACAO_CATEGORIA_CORES: Record<ObrigacaoCategoria, { bg: string; text: string; border: string }> = {
  Fiscal:      { bg: 'bg-indigo-50',  text: 'text-indigo-700',  border: 'border-indigo-200' },
  Trabalhista: { bg: 'bg-lime-50',    text: 'text-lime-700',    border: 'border-lime-200' },
  Contábil:    { bg: 'bg-violet-50',  text: 'text-violet-700',  border: 'border-violet-200' },
}

export const createObrigacaoSchema = z.object({
  nome: z.string().min(2),
  descricao: z.string().optional().nullable(),
  // Área real da obrigação (Servico.areaId). Por ID — o front escolhe da lista de
  // áreas do sistema. Opcional: obrigação pode nascer sem área e ser ajustada depois.
  areaId: z.string().min(1).optional().nullable(),
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
