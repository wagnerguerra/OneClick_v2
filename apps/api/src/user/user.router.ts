import { z } from 'zod'
import { router, protectedProcedure, readProcedure, writeProcedure, deleteProcedure } from '../trpc/trpc.service'
import { createUserSchema, updateUserSchema, listUserSchema } from '@saas/types'
import { UserService } from './user.service'

const MODULE = 'usuarios'

export function createUserRouter(userService: UserService) {
  return router({
    list: readProcedure(MODULE)
      .input(listUserSchema)
      .query(({ input, ctx }) =>
        userService.list(input, ctx.isMaster ?? false, ctx.empresaId),
      ),

    getById: readProcedure(MODULE)
      .input(z.object({ id: z.string() }))
      .query(({ input, ctx }) => userService.getById(input.id, ctx.isMaster ?? false, ctx.empresaId)),

    create: writeProcedure(MODULE)
      .input(createUserSchema)
      .mutation(({ input }) => userService.create(input)),

    update: writeProcedure(MODULE)
      .input(z.object({ id: z.string(), data: updateUserSchema }))
      .mutation(({ input, ctx }) =>
        userService.update(input.id, input.data, ctx.isMaster ?? false),
      ),

    delete: deleteProcedure(MODULE)
      .input(z.object({ id: z.string() }))
      .mutation(({ input, ctx }) =>
        userService.delete(input.id, ctx.userId),
      ),

    toggleMaster: writeProcedure(MODULE)
      .input(z.object({ id: z.string() }))
      .mutation(({ input, ctx }) =>
        userService.toggleMaster(input.id, ctx.userId, ctx.isMaster ?? false),
      ),

    listForSelect: readProcedure(MODULE)
      .query(({ ctx }) =>
        userService.listForSelect(ctx.isMaster ?? false, ctx.empresaId),
      ),

    // getMyPermissions permanece como protectedProcedure — todo usuário pode consultar suas próprias permissões
    getMyPermissions: protectedProcedure
      .query(({ ctx }) => userService.getMyPermissions(ctx.userId)),

    copyPermissions: writeProcedure(MODULE)
      .input(z.object({
        sourceUserId: z.string(),
        targetUserIds: z.array(z.string()).min(1),
      }))
      .mutation(({ input }) => userService.copyPermissions(input.sourceUserId, input.targetUserIds)),

    exportAll: readProcedure(MODULE)
      .query(({ ctx }) => userService.exportAll(ctx.isMaster ?? false, ctx.empresaId)),

    importBulk: writeProcedure(MODULE)
      .input(z.object({ items: z.array(createUserSchema) }))
      .mutation(({ input }) => userService.bulkCreate(input.items)),
  })
}
