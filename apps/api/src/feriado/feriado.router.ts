import { z } from 'zod'
import { router, readProcedure, writeProcedure, deleteProcedure } from '../trpc/trpc.service'
import { FeriadoService } from './feriado.service'
import { listFeriadosSchema, createFeriadoSchema, updateFeriadoSchema } from '@saas/types'

const MODULE = 'configuracoes'

export function createFeriadoRouter(feriadoService: FeriadoService) {
  return router({
    list: readProcedure(MODULE)
      .input(listFeriadosSchema)
      .query(({ input, ctx }) => feriadoService.list(input, ctx.empresaId)),

    stats: readProcedure(MODULE)
      .query(({ ctx }) => feriadoService.getStats(ctx.empresaId)),

    create: writeProcedure(MODULE)
      .input(createFeriadoSchema)
      .mutation(({ input, ctx }) => feriadoService.create(input, ctx.empresaId)),

    update: writeProcedure(MODULE)
      .input(updateFeriadoSchema)
      .mutation(({ input }) => feriadoService.update(input.id, input.data)),

    delete: deleteProcedure(MODULE)
      .input(z.object({ id: z.string() }))
      .mutation(({ input }) => feriadoService.delete(input.id)),

    bulkDelete: deleteProcedure(MODULE)
      .input(z.object({ ids: z.array(z.string()).min(1) }))
      .mutation(({ input }) => feriadoService.bulkDelete(input.ids)),
  })
}
