import { z } from 'zod'
import { TaxRegime, taxRegimeLabels } from './empresa'

// IMPORTANTE: NÃO re-exportar TaxRegime / taxRegimeLabels daqui — já vêm
// do empresa.ts via export * no index.ts. Re-exportar causa conflito de
// símbolo no bundler do Next.js (registry §3.7).
//
// Aliases novos (TAX_REGIME, TAX_REGIME_LABELS) ficam só aqui — não existem
// em outro lugar do pacote.
/** Array das chaves do enum TaxRegime — uso em .map() de selects. */
export const TAX_REGIME: ReadonlyArray<TaxRegime> = Object.values(TaxRegime)
/** Alias pra `taxRegimeLabels` (uppercase pra ficar consistente com TAX_REGIME). */
export const TAX_REGIME_LABELS = taxRegimeLabels

export const listGruposObrigacaoSchema = z.object({
  search: z.string().optional(),
  tributacao: z.nativeEnum(TaxRegime).optional(),
  ativo: z.boolean().optional(),
}).optional()
export type ListGruposObrigacaoInput = z.infer<typeof listGruposObrigacaoSchema>

const grupoBaseSchema = z.object({
  nome: z.string().min(2, 'Nome obrigatório'),
  slug: z.string().min(2, 'Slug obrigatório').regex(/^[a-z0-9-]+$/, 'Apenas letras minúsculas, números e hífen'),
  descricao: z.string().optional().nullable(),
  tributacao: z.nativeEnum(TaxRegime).optional().nullable(),
  segmentoSlug: z.string().optional().nullable(),
  area: z.string().optional().nullable(),
  cor: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Cor inválida (use #RRGGBB)').optional().nullable(),
  ativo: z.boolean().default(true),
  /** Prefixos CNAE aplicáveis — strings de 2-7 dígitos. Ex.: "45" cobre todo comércio de veículos. */
  cnaesAplicaveis: z.array(z.string().regex(/^\d{2,7}$/)).default([]),
  servicoIds: z.array(z.string()).default([]),
})

export const createGrupoObrigacaoSchema = grupoBaseSchema
export type CreateGrupoObrigacaoInput = z.infer<typeof createGrupoObrigacaoSchema>

export const updateGrupoObrigacaoSchema = z.object({
  id: z.string(),
  data: grupoBaseSchema.partial(),
})

export const aplicarTemplateSchema = z.object({
  clienteId: z.string(),
  grupoId: z.string(),
  /** Quando true, mantém ClienteObrigacao já existentes (só adiciona os faltantes).
   *  Quando false, remove os vínculos do mesmo template antes de criar (limpa estado). */
  manterExistentes: z.boolean().default(true),
})

export const addClienteObrigacaoSchema = z.object({
  clienteId: z.string(),
  servicoId: z.string(),
  observacao: z.string().optional().nullable(),
})

export const updateClienteObrigacaoSchema = z.object({
  id: z.string(),
  data: z.object({
    ativo: z.boolean().optional(),
    observacao: z.string().nullable().optional(),
    ajusteVencimentoOverride: z.enum(['MANTER', 'ANTECIPAR', 'POSTERGAR']).nullable().optional(),
  }),
})
