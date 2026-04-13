import { z } from 'zod'
import { router, readProcedure, writeProcedure, deleteProcedure } from '../trpc/trpc.service'
import { createEmpresaSchema, updateEmpresaSchema, listEmpresaSchema } from '@saas/types'
import { EmpresaService } from './empresa.service'

const MODULE = 'empresas'

export function createEmpresaRouter(empresaService: EmpresaService) {
  return router({
    list: readProcedure(MODULE).input(listEmpresaSchema).query(({ input }) => empresaService.list(input)),
    getById: readProcedure(MODULE).input(z.object({ id: z.string() })).query(({ input }) => empresaService.getById(input.id)),
    create: writeProcedure(MODULE).input(createEmpresaSchema).mutation(({ input, ctx }) => empresaService.create(input, ctx.userId)),
    update: writeProcedure(MODULE).input(z.object({ id: z.string(), data: updateEmpresaSchema })).mutation(({ input, ctx }) => empresaService.update(input.id, input.data, ctx.userId)),
    delete: deleteProcedure(MODULE).input(z.object({ id: z.string() })).mutation(({ input, ctx }) => empresaService.delete(input.id, ctx.userId)),
    getEvents: readProcedure(MODULE).input(z.object({ empresaId: z.string() })).query(({ input }) => empresaService.getEvents(input.empresaId)),
    exportAll: readProcedure(MODULE).query(() => empresaService.exportAll()),
    listForSelect: readProcedure(MODULE).query(() => empresaService.listForSelect()),
    importBulk: writeProcedure(MODULE).input(z.object({ items: z.array(createEmpresaSchema) })).mutation(({ input, ctx }) => empresaService.bulkCreate(input.items, ctx.userId)),
  })
}
