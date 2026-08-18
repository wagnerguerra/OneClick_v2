import { z } from 'zod'
import { paginationSchema } from './pagination'

/**
 * Melhorias da Qualidade — port do `sgq_melhorias` do OneClick v1.
 *
 * Módulo pequeno de propósito: uma oportunidade de melhoria tem título,
 * descrição, área de aplicação e data prevista. A listagem soma as compras
 * marcadas como melhoria (`Compra.melhoria`), como o v1 fazia.
 */

/** O v1 não tinha ciclo nenhum — este é o único acréscimo do port. */
export const melhoriaStatusSchema = z.enum(['REGISTRADA', 'IMPLEMENTADA', 'CANCELADA'])
export type MelhoriaStatus = z.infer<typeof melhoriaStatusSchema>

export const MELHORIA_STATUS_LABEL: Record<MelhoriaStatus, string> = {
  REGISTRADA: 'Registrada',
  IMPLEMENTADA: 'Implementada',
  CANCELADA: 'Cancelada',
}

const dataISO = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida.')

export const criarMelhoriaSchema = z.object({
  titulo: z.string().min(3, 'Dê um título à melhoria.').max(200),
  descricao: z.string().optional().nullable(),
  areaId: z.string().optional().nullable(),
  previstaPara: dataISO.optional().nullable(),
})

export const atualizarMelhoriaSchema = criarMelhoriaSchema.partial().extend({
  id: z.string().min(1),
  status: melhoriaStatusSchema.optional(),
})

export const listarMelhoriasSchema = paginationSchema.extend({
  status: melhoriaStatusSchema.optional(),
  areaId: z.string().optional(),
})

export type CriarMelhoriaInput = z.infer<typeof criarMelhoriaSchema>
export type AtualizarMelhoriaInput = z.infer<typeof atualizarMelhoriaSchema>
export type ListarMelhoriasInput = z.infer<typeof listarMelhoriasSchema>
