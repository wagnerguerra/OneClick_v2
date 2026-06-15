import { z } from 'zod'

// ── Status derivado de dataVencimento (não persistido) ──
export const BENEFICIO_STATUS = ['NO_PRAZO', 'VENCENDO', 'VENCIDO', 'SEM_DATA'] as const
export type BeneficioStatus = (typeof BENEFICIO_STATUS)[number]

export const BENEFICIO_STATUS_LABELS: Record<BeneficioStatus, string> = {
  NO_PRAZO: 'No prazo',
  VENCENDO: 'Vencendo',
  VENCIDO: 'Vencido',
  SEM_DATA: 'Sem data',
}

// ── Catálogo de benefícios ──
export const createBeneficioCatalogoSchema = z.object({
  nome: z.string().min(1, 'Informe o nome do benefício'),
  servicoId: z.string().optional().nullable(),
  notificaVencimentoDias: z.coerce.number().int().min(0).max(365).optional().nullable(),
  obs: z.string().optional().nullable(),
  ativo: z.boolean().optional(),
})
export const updateBeneficioCatalogoSchema = createBeneficioCatalogoSchema.partial().extend({
  id: z.string(),
})

// ── Vínculo cliente↔benefício ──
export const createBeneficioVinculoSchema = z.object({
  clienteId: z.string().min(1, 'Selecione o cliente'),
  catalogoId: z.string().min(1, 'Selecione o benefício'),
  dataVencimento: z.string().optional().nullable(), // 'YYYY-MM-DD'
  portaria: z.string().optional().nullable(),
  processo: z.string().optional().nullable(),
  obs: z.string().optional().nullable(),
  ativo: z.boolean().optional(),
})
export const updateBeneficioVinculoSchema = createBeneficioVinculoSchema.partial().extend({
  id: z.string(),
})

export const listBeneficioSchema = z.object({
  status: z.enum(BENEFICIO_STATUS).optional(),
  clienteId: z.string().optional(),
  busca: z.string().optional(),
  incluirInativos: z.boolean().optional(),
})

export type CreateBeneficioCatalogoInput = z.infer<typeof createBeneficioCatalogoSchema>
export type UpdateBeneficioCatalogoInput = z.infer<typeof updateBeneficioCatalogoSchema>
export type CreateBeneficioVinculoInput = z.infer<typeof createBeneficioVinculoSchema>
export type UpdateBeneficioVinculoInput = z.infer<typeof updateBeneficioVinculoSchema>
