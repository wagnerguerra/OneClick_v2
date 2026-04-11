import { z } from 'zod'
import { router, protectedProcedure } from '../trpc/trpc.service'
import { createCargoSchema, updateCargoSchema, listCargoSchema } from '@saas/types'
import { CargoService } from './cargo.service'

export function createCargoRouter(cargoService: CargoService) {
  return router({
    list: protectedProcedure.input(listCargoSchema)
      .query(({ input, ctx }) => cargoService.list(input, ctx.isMaster ?? false, ctx.empresaId)),
    getById: protectedProcedure.input(z.object({ id: z.string() }))
      .query(({ input, ctx }) => cargoService.getById(input.id, ctx.isMaster ?? false, ctx.empresaId)),
    create: protectedProcedure.input(createCargoSchema)
      .mutation(({ input, ctx }) => cargoService.create(input, ctx.isMaster ?? false, ctx.empresaId, ctx.userId)),
    update: protectedProcedure.input(z.object({ id: z.string(), data: updateCargoSchema }))
      .mutation(({ input, ctx }) => cargoService.update(input.id, input.data, ctx.isMaster ?? false, ctx.empresaId, ctx.userId)),
    delete: protectedProcedure.input(z.object({ id: z.string() }))
      .mutation(({ input, ctx }) => cargoService.delete(input.id, ctx.isMaster ?? false, ctx.empresaId, ctx.userId)),
    getEvents: protectedProcedure.input(z.object({ cargoId: z.string() }))
      .query(({ input }) => cargoService.getEvents(input.cargoId)),
    exportAll: protectedProcedure
      .query(({ ctx }) => cargoService.exportAll(ctx.isMaster ?? false, ctx.empresaId)),
    listForSelect: protectedProcedure
      .query(({ ctx }) => cargoService.listForSelect(ctx.isMaster ?? false, ctx.empresaId)),
    importBulk: protectedProcedure.input(z.object({ items: z.array(createCargoSchema) }))
      .mutation(({ input, ctx }) => cargoService.bulkCreate(input.items, ctx.isMaster ?? false, ctx.empresaId, ctx.userId)),
  })
}
