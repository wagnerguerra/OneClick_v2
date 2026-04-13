import { z } from 'zod'
import { router, readProcedure, writeProcedure, deleteProcedure } from '../trpc/trpc.service'
import { paginationSchema } from '@saas/types'
import { SitfisService } from './sitfis.service'

const MODULE = 'situacao-fiscal'

export function createSitfisRouter(sitfisService: SitfisService) {
  return router({
    // Consultar situação fiscal (fluxo completo)
    consultar: writeProcedure(MODULE)
      .input(z.object({
        documento: z.string().min(11),
        clienteId: z.string().optional(),
      }))
      .mutation(({ input, ctx }) =>
        sitfisService.consultar(input.documento, input.clienteId, ctx.userId, ctx.empresaId),
      ),

    // Listar consultas realizadas
    list: readProcedure(MODULE)
      .input(paginationSchema.extend({
        clienteId: z.string().optional(),
      }))
      .query(({ input, ctx }) =>
        sitfisService.list(input, ctx.empresaId),
      ),

    // Detalhes de uma consulta
    getById: readProcedure(MODULE)
      .input(z.object({ id: z.string() }))
      .query(({ input }) => sitfisService.getById(input.id)),

    // Obter PDF em base64
    getPdf: readProcedure(MODULE)
      .input(z.object({ id: z.string() }))
      .query(({ input }) => sitfisService.getPdf(input.id)),

    // Consultas de um cliente específico
    getByClienteId: readProcedure(MODULE)
      .input(z.object({ clienteId: z.string() }))
      .query(({ input }) => sitfisService.getByClienteId(input.clienteId)),

    // Excluir consulta (soft delete)
    delete: deleteProcedure(MODULE)
      .input(z.object({ id: z.string() }))
      .mutation(({ input }) => sitfisService.softDelete(input.id)),
  })
}
