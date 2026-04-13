import { z } from 'zod'
import { router, readProcedure, writeProcedure, deleteProcedure } from '../trpc/trpc.service'
import { createFornecedorSchema, updateFornecedorSchema, listFornecedorSchema } from '@saas/types'
import { FornecedorService } from './fornecedor.service'

const MODULE = 'fornecedores'

export function createFornecedorRouter(fornecedorService: FornecedorService) {
  return router({
    list: readProcedure(MODULE)
      .input(listFornecedorSchema)
      .query(({ input, ctx }) => fornecedorService.list(input, ctx.isMaster ?? false, ctx.empresaId, ctx.tenantSchema)),

    getById: readProcedure(MODULE)
      .input(z.object({ id: z.string() }))
      .query(({ input, ctx }) => fornecedorService.getById(input.id, ctx.isMaster ?? false, ctx.empresaId, ctx.tenantSchema)),

    create: writeProcedure(MODULE)
      .input(createFornecedorSchema)
      .mutation(({ input, ctx }) => fornecedorService.create(input, ctx.userId, ctx.isMaster ?? false, ctx.empresaId, ctx.tenantSchema)),

    update: writeProcedure(MODULE)
      .input(z.object({ id: z.string(), data: updateFornecedorSchema }))
      .mutation(({ input, ctx }) => fornecedorService.update(input.id, input.data, ctx.userId, ctx.isMaster ?? false, ctx.empresaId, ctx.tenantSchema)),

    delete: deleteProcedure(MODULE)
      .input(z.object({ id: z.string() }))
      .mutation(({ input, ctx }) => fornecedorService.delete(input.id, ctx.userId, ctx.isMaster ?? false, ctx.empresaId, ctx.tenantSchema)),

    listForSelect: readProcedure(MODULE)
      .query(({ ctx }) => fornecedorService.listForSelect(ctx.isMaster ?? false, ctx.empresaId, ctx.tenantSchema)),

    getEvents: readProcedure(MODULE)
      .input(z.object({ id: z.string() }))
      .query(({ input }) => fornecedorService.getEvents(input.id)),

    exportAll: readProcedure(MODULE)
      .query(({ ctx }) => fornecedorService.exportAll(ctx.isMaster ?? false, ctx.empresaId, ctx.tenantSchema)),

    importBulk: writeProcedure(MODULE)
      .input(z.object({ items: z.array(createFornecedorSchema) }))
      .mutation(({ input, ctx }) => fornecedorService.bulkCreate(input.items, ctx.userId, ctx.isMaster ?? false, ctx.empresaId, ctx.tenantSchema)),
  })
}
