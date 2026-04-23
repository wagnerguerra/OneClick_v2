import { z } from 'zod'
import { router, protectedProcedure, readProcedure, writeProcedure, deleteProcedure } from '../trpc/trpc.service'
import { createUserSchema, updateUserSchema, listUserSchema, permissionSchema } from '@saas/types'
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

    // Clientes vinculados ao usuário (responsável/substituto)
    getAssignedClients: readProcedure(MODULE)
      .input(z.object({ userId: z.string() }))
      .query(({ input }) => userService.getAssignedClients(input.userId)),

    // Importar carteira de clientes do OneClick v1
    importarCarteiraOneClick: writeProcedure(MODULE)
      .input(z.object({
        userId: z.string(),
        dryRun: z.boolean().default(false),
        somenteAreaUsuario: z.boolean().default(false),
      }))
      .mutation(({ input }) => userService.importarCarteiraOneClick(input.userId, input)),

    // getMyPermissions permanece como protectedProcedure — todo usuário pode consultar suas próprias permissões
    getMyPermissions: protectedProcedure
      .query(({ ctx }) => userService.getMyPermissions(ctx.userId)),

    updatePermissions: writeProcedure(MODULE)
      .input(z.object({ userId: z.string(), permissions: z.array(permissionSchema) }))
      .mutation(({ input }) => userService.updatePermissions(input.userId, input.permissions)),

    copyPermissions: writeProcedure(MODULE)
      .input(z.object({
        sourceUserId: z.string(),
        targetUserIds: z.array(z.string()).min(1),
      }))
      .mutation(({ input }) => userService.copyPermissions(input.sourceUserId, input.targetUserIds)),

    // Buscar dados do usuário nos bancos legados (SERPRO2 + OneClick v1)
    buscarDadosLegado: readProcedure(MODULE)
      .input(z.object({ email: z.string().email() }))
      .query(({ input }) => userService.buscarDadosLegado(input.email)),

    exportAll: readProcedure(MODULE)
      .query(({ ctx }) => userService.exportAll(ctx.isMaster ?? false, ctx.empresaId)),

    importBulk: writeProcedure(MODULE)
      .input(z.object({ items: z.array(createUserSchema) }))
      .mutation(({ input }) => userService.bulkCreate(input.items)),
  })
}
