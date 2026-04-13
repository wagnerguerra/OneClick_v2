import { z } from 'zod'
import { router, readProcedure, writeProcedure, deleteProcedure } from '../trpc/trpc.service'
import { createColaboradorSchema, updateColaboradorSchema, listColaboradorSchema } from '@saas/types'
import { ColaboradorService } from './colaborador.service'

const MODULE = 'colaboradores'

export function createColaboradorRouter(colaboradorService: ColaboradorService) {
  return router({
    list: readProcedure(MODULE)
      .input(listColaboradorSchema)
      .query(({ input, ctx }) => colaboradorService.list(input, ctx.isMaster ?? false, ctx.empresaId)),

    getById: readProcedure(MODULE)
      .input(z.object({ id: z.string() }))
      .query(({ input, ctx }) => colaboradorService.getById(input.id, ctx.isMaster ?? false, ctx.empresaId)),

    create: writeProcedure(MODULE)
      .input(createColaboradorSchema)
      .mutation(({ input, ctx }) => colaboradorService.create(input, ctx.userId, ctx.isMaster ?? false, ctx.empresaId)),

    update: writeProcedure(MODULE)
      .input(z.object({ id: z.string(), data: updateColaboradorSchema }))
      .mutation(({ input, ctx }) => colaboradorService.update(input.id, input.data, ctx.userId, ctx.isMaster ?? false, ctx.empresaId)),

    delete: deleteProcedure(MODULE)
      .input(z.object({ id: z.string() }))
      .mutation(({ input, ctx }) => colaboradorService.delete(input.id, ctx.userId, ctx.isMaster ?? false, ctx.empresaId)),

    listForSelect: readProcedure(MODULE)
      .query(({ ctx }) => colaboradorService.listForSelect(ctx.isMaster ?? false, ctx.empresaId)),

    getEvents: readProcedure(MODULE)
      .input(z.object({ id: z.string() }))
      .query(({ input }) => colaboradorService.getEvents(input.id)),

    exportAll: readProcedure(MODULE)
      .query(({ ctx }) => colaboradorService.exportAll(ctx.isMaster ?? false, ctx.empresaId)),

    importBulk: writeProcedure(MODULE)
      .input(z.object({ items: z.array(createColaboradorSchema) }))
      .mutation(({ input, ctx }) => colaboradorService.bulkCreate(input.items, ctx.userId, ctx.isMaster ?? false, ctx.empresaId)),
  })
}
