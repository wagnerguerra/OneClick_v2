import { z } from 'zod'
import { paginationSchema } from './pagination'

export const createCargoSchema = z.object({
  name: z.string().min(2, 'Nome deve ter no mínimo 2 caracteres'),
  isActive: z.boolean().default(true),
  areaId: z.string().optional().or(z.literal('')),
  showInOrgChart: z.boolean().default(false),
  descricaoSumaria: z.string().optional().or(z.literal('')),
  responsabilidades: z.string().optional().or(z.literal('')),
  habilidades: z.string().optional().or(z.literal('')),
  autoridades: z.string().optional().or(z.literal('')),
  experiencias: z.string().optional().or(z.literal('')),
  treinamentos: z.string().optional().or(z.literal('')),
  educacao: z.string().optional().or(z.literal('')),
})

export const updateCargoSchema = createCargoSchema.partial()

export const listCargoSchema = paginationSchema.extend({
  isActive: z.coerce.boolean().optional(),
})

export type CreateCargoInput = z.infer<typeof createCargoSchema>
export type UpdateCargoInput = z.infer<typeof updateCargoSchema>
export type ListCargoInput = z.infer<typeof listCargoSchema>
