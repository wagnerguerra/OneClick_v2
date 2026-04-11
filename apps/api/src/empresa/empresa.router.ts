import { z } from 'zod'
import { router, protectedProcedure } from '../trpc/trpc.service'
import { createEmpresaSchema, updateEmpresaSchema, listEmpresaSchema } from '@saas/types'
import { EmpresaService } from './empresa.service'

export function createEmpresaRouter(empresaService: EmpresaService) {
  return router({
    list: protectedProcedure.input(listEmpresaSchema).query(({ input }) => empresaService.list(input)),
    getById: protectedProcedure.input(z.object({ id: z.string() })).query(({ input }) => empresaService.getById(input.id)),
    create: protectedProcedure.input(createEmpresaSchema).mutation(({ input, ctx }) => empresaService.create(input, ctx.userId)),
    update: protectedProcedure.input(z.object({ id: z.string(), data: updateEmpresaSchema })).mutation(({ input, ctx }) => empresaService.update(input.id, input.data, ctx.userId)),
    delete: protectedProcedure.input(z.object({ id: z.string() })).mutation(({ input, ctx }) => empresaService.delete(input.id, ctx.userId)),
    getEvents: protectedProcedure.input(z.object({ empresaId: z.string() })).query(({ input }) => empresaService.getEvents(input.empresaId)),
    exportAll: protectedProcedure.query(() => empresaService.exportAll()),
    listForSelect: protectedProcedure.query(() => empresaService.listForSelect()),
    importBulk: protectedProcedure.input(z.object({ items: z.array(createEmpresaSchema) })).mutation(({ input, ctx }) => empresaService.bulkCreate(input.items, ctx.userId)),
  })
}
