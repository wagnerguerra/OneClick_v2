import { z } from 'zod'
import { router, readProcedure, writeProcedure, deleteProcedure } from '../trpc/trpc.service'
import { createCargoSchema, updateCargoSchema, listCargoSchema } from '@saas/types'
import { CargoService } from './cargo.service'

const MODULE = 'cargos'

export function createCargoRouter(cargoService: CargoService) {
  return router({
    list: readProcedure(MODULE).input(listCargoSchema)
      .query(({ input, ctx }) => cargoService.list(input, ctx.isMaster ?? false, ctx.empresaId)),
    getById: readProcedure(MODULE).input(z.object({ id: z.string() }))
      .query(({ input, ctx }) => cargoService.getById(input.id, ctx.isMaster ?? false, ctx.empresaId)),
    create: writeProcedure(MODULE).input(createCargoSchema)
      .mutation(({ input, ctx }) => cargoService.create(input, ctx.isMaster ?? false, ctx.empresaId, ctx.userId)),
    update: writeProcedure(MODULE).input(z.object({ id: z.string(), data: updateCargoSchema }))
      .mutation(({ input, ctx }) => cargoService.update(input.id, input.data, ctx.isMaster ?? false, ctx.empresaId, ctx.userId)),
    delete: deleteProcedure(MODULE).input(z.object({ id: z.string() }))
      .mutation(({ input, ctx }) => cargoService.delete(input.id, ctx.isMaster ?? false, ctx.empresaId, ctx.userId)),
    getEvents: readProcedure(MODULE).input(z.object({ cargoId: z.string() }))
      .query(({ input }) => cargoService.getEvents(input.cargoId)),
    exportAll: readProcedure(MODULE)
      .query(({ ctx }) => cargoService.exportAll(ctx.isMaster ?? false, ctx.empresaId)),
    listForSelect: readProcedure(MODULE)
      .query(({ ctx }) => cargoService.listForSelect(ctx.isMaster ?? false, ctx.empresaId)),
    importBulk: writeProcedure(MODULE).input(z.object({ items: z.array(createCargoSchema) }))
      .mutation(({ input, ctx }) => cargoService.bulkCreate(input.items, ctx.isMaster ?? false, ctx.empresaId, ctx.userId)),
  })
}
