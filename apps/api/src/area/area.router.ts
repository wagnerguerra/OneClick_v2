import { z } from 'zod'
import { router, protectedProcedure } from '../trpc/trpc.service'
import { createAreaSchema, updateAreaSchema, listAreaSchema } from '@saas/types'
import { AreaService } from './area.service'

export function createAreaRouter(areaService: AreaService) {
  return router({
    list: protectedProcedure
      .input(listAreaSchema)
      .query(({ input, ctx }) => areaService.list(input, ctx.isMaster ?? false, ctx.empresaId)),

    getById: protectedProcedure
      .input(z.object({ id: z.string() }))
      .query(({ input, ctx }) => areaService.getById(input.id, ctx.isMaster ?? false, ctx.empresaId)),

    create: protectedProcedure
      .input(createAreaSchema)
      .mutation(({ input, ctx }) => areaService.create(input, ctx.isMaster ?? false, ctx.empresaId)),

    update: protectedProcedure
      .input(z.object({ id: z.string(), data: updateAreaSchema }))
      .mutation(({ input, ctx }) => areaService.update(input.id, input.data, ctx.isMaster ?? false, ctx.empresaId)),

    delete: protectedProcedure
      .input(z.object({ id: z.string() }))
      .mutation(({ input, ctx }) => areaService.delete(input.id, ctx.isMaster ?? false, ctx.empresaId)),

    listForSelect: protectedProcedure
      .query(({ ctx }) => areaService.listForSelect(ctx.isMaster ?? false, ctx.empresaId)),

    importBulk: protectedProcedure
      .input(z.object({ items: z.array(createAreaSchema) }))
      .mutation(({ input, ctx }) => areaService.bulkCreate(input.items, ctx.isMaster ?? false, ctx.empresaId)),
  })
}
