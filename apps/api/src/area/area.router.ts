import { z } from 'zod'
import { router, readProcedure, writeProcedure, deleteProcedure } from '../trpc/trpc.service'
import { createAreaSchema, updateAreaSchema, listAreaSchema } from '@saas/types'
import { AreaService } from './area.service'

const MODULE = 'areas'

export function createAreaRouter(areaService: AreaService) {
  return router({
    list: readProcedure(MODULE)
      .input(listAreaSchema)
      .query(({ input, ctx }) => areaService.list(input, ctx.isMaster ?? false, ctx.empresaId, ctx.tenantSchema)),

    getById: readProcedure(MODULE)
      .input(z.object({ id: z.string() }))
      .query(({ input, ctx }) => areaService.getById(input.id, ctx.isMaster ?? false, ctx.empresaId, ctx.tenantSchema)),

    create: writeProcedure(MODULE)
      .input(createAreaSchema)
      .mutation(({ input, ctx }) => areaService.create(input, ctx.isMaster ?? false, ctx.empresaId, ctx.tenantSchema)),

    update: writeProcedure(MODULE)
      .input(z.object({ id: z.string(), data: updateAreaSchema }))
      .mutation(({ input, ctx }) => areaService.update(input.id, input.data, ctx.isMaster ?? false, ctx.empresaId, ctx.tenantSchema)),

    delete: deleteProcedure(MODULE)
      .input(z.object({ id: z.string() }))
      .mutation(({ input, ctx }) => areaService.delete(input.id, ctx.isMaster ?? false, ctx.empresaId, ctx.tenantSchema)),

    listForSelect: readProcedure(MODULE)
      .query(({ ctx }) => areaService.listForSelect(ctx.isMaster ?? false, ctx.empresaId, ctx.tenantSchema)),

    importBulk: writeProcedure(MODULE)
      .input(z.object({ items: z.array(createAreaSchema) }))
      .mutation(({ input, ctx }) => areaService.bulkCreate(input.items, ctx.isMaster ?? false, ctx.empresaId, ctx.tenantSchema)),
  })
}
