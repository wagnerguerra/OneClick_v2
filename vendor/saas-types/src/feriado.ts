import { z } from 'zod'

export const FERIADO_TIPO = ['NACIONAL', 'ESTADUAL', 'MUNICIPAL', 'PONTO_FACULTATIVO'] as const
export type FeriadoTipo = (typeof FERIADO_TIPO)[number]

export const FERIADO_TIPO_LABELS: Record<FeriadoTipo, string> = {
  NACIONAL: 'Nacional',
  ESTADUAL: 'Estadual',
  MUNICIPAL: 'Municipal',
  PONTO_FACULTATIVO: 'Ponto facultativo',
}

export const FERIADO_TIPO_CORES: Record<FeriadoTipo, { bg: string; text: string; border: string }> = {
  NACIONAL:          { bg: 'bg-rose-50',    text: 'text-rose-700',    border: 'border-rose-200' },
  ESTADUAL:          { bg: 'bg-sky-50',     text: 'text-sky-700',     border: 'border-sky-200' },
  MUNICIPAL:         { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' },
  PONTO_FACULTATIVO: { bg: 'bg-amber-50',   text: 'text-amber-700',   border: 'border-amber-200' },
}

/** UFs brasileiras — pra dropdown no formulário. */
export const UFS_BRASIL = [
  'AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB',
  'PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO',
] as const
export type UF = (typeof UFS_BRASIL)[number]

export const listFeriadosSchema = z.object({
  ano: z.coerce.number().int().min(2000).max(2100).optional(),
  tipo: z.enum(FERIADO_TIPO).optional(),
  uf: z.string().length(2).optional(),
  cidade: z.string().optional(),
  search: z.string().optional(),
}).optional()
export type ListFeriadosInput = z.infer<typeof listFeriadosSchema>

/** Base sem refinements — usada também pra montar o updateSchema com partial(). */
const feriadoBaseSchema = z.object({
  nome: z.string().min(2, 'Informe o nome do feriado'),
  tipo: z.enum(FERIADO_TIPO),
  /** Date no formato ISO yyyy-mm-dd. Quando recorrente=true, ano é apenas referência. */
  data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use o formato AAAA-MM-DD'),
  recorrente: z.boolean().default(true),
  uf: z.string().length(2).optional().nullable(),
  cidade: z.string().optional().nullable(),
  observacao: z.string().optional().nullable(),
})

export const createFeriadoSchema = feriadoBaseSchema.refine(
  (v) => v.tipo !== 'ESTADUAL' || !!v.uf,
  { message: 'UF é obrigatória para feriados estaduais', path: ['uf'] },
).refine(
  (v) => v.tipo !== 'MUNICIPAL' || (!!v.uf && !!v.cidade),
  { message: 'UF e cidade são obrigatórias para feriados municipais', path: ['cidade'] },
)
export type CreateFeriadoInput = z.infer<typeof createFeriadoSchema>

export const updateFeriadoSchema = z.object({
  id: z.string(),
  data: feriadoBaseSchema.partial(),
})
