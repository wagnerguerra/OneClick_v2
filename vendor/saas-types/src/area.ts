import { z } from 'zod'
import { paginationSchema } from './pagination'

export const CostType = {
  DIRECT: 'DIRECT',
  INDIRECT: 'INDIRECT',
} as const

export type CostType = (typeof CostType)[keyof typeof CostType]

export const createAreaSchema = z.object({
  name: z.string().min(2, 'Nome deve ter no mínimo 2 caracteres'),
  isActive: z.boolean().default(true),
  availableForHiring: z.boolean().default(false),
  showInOrgChart: z.boolean().default(false),
  email: z.string().email('E-mail inválido').optional().or(z.literal('')),
  leaderId: z.string().optional().or(z.literal('')),
  parentId: z.string().optional().or(z.literal('')),
  costType: z.enum(['DIRECT', 'INDIRECT']).default('DIRECT'),
  costWeight: z.coerce.number().min(0, 'Peso deve ser positivo').default(1),
  excludeFromCosting: z.boolean().default(false),
})

export const updateAreaSchema = createAreaSchema.partial()

export const listAreaSchema = paginationSchema.extend({
  isActive: z.coerce.boolean().optional(),
})

export type CreateAreaInput = z.infer<typeof createAreaSchema>
export type UpdateAreaInput = z.infer<typeof updateAreaSchema>
export type ListAreaInput = z.infer<typeof listAreaSchema>
