import { z } from 'zod'
import { router, protectedProcedure } from '../trpc/trpc.service'
import { createUserSchema, updateUserSchema, listUserSchema } from '@saas/types'
import { UserService } from './user.service'

export function createUserRouter(userService: UserService) {
  return router({
    list: protectedProcedure
      .input(listUserSchema)
      .query(({ input, ctx }) =>
        userService.list(input, ctx.isMaster ?? false, ctx.empresaId),
      ),

    getById: protectedProcedure
      .input(z.object({ id: z.string() }))
      .query(({ input, ctx }) => userService.getById(input.id, ctx.isMaster ?? false, ctx.empresaId)),

    create: protectedProcedure
      .input(createUserSchema)
      .mutation(({ input }) => userService.create(input)),

    update: protectedProcedure
      .input(z.object({ id: z.string(), data: updateUserSchema }))
      .mutation(({ input, ctx }) =>
        userService.update(input.id, input.data, ctx.isMaster ?? false),
      ),

    delete: protectedProcedure
      .input(z.object({ id: z.string() }))
      .mutation(({ input, ctx }) =>
        userService.delete(input.id, ctx.userId),
      ),

    toggleMaster: protectedProcedure
      .input(z.object({ id: z.string() }))
      .mutation(({ input, ctx }) =>
        userService.toggleMaster(input.id, ctx.userId, ctx.isMaster ?? false),
      ),

    listForSelect: protectedProcedure
      .query(({ ctx }) =>
        userService.listForSelect(ctx.isMaster ?? false, ctx.empresaId),
      ),

    getMyPermissions: protectedProcedure
      .query(({ ctx }) => userService.getMyPermissions(ctx.userId)),

    copyPermissions: protectedProcedure
      .input(z.object({
        sourceUserId: z.string(),
        targetUserIds: z.array(z.string()).min(1),
      }))
      .mutation(({ input }) => userService.copyPermissions(input.sourceUserId, input.targetUserIds)),

    exportAll: protectedProcedure
      .query(({ ctx }) => userService.exportAll(ctx.isMaster ?? false, ctx.empresaId)),

    importBulk: protectedProcedure
      .input(z.object({ items: z.array(createUserSchema) }))
      .mutation(({ input }) => userService.bulkCreate(input.items)),
  })
}
