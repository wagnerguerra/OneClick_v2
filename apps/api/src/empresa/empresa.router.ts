import { z } from 'zod'
import { router, masterProcedure, protectedProcedure } from '../trpc/trpc.service'
import { createEmpresaSchema, updateEmpresaSchema, listEmpresaSchema } from '@saas/types'
import { EmpresaService } from './empresa.service'

// O módulo "Empresas" é administração GLOBAL multi-tenant (lista todas as
// empresas/tenants da plataforma). Por isso a gestão é restrita ao MASTER
// global (masterProcedure) — admins de tenant (isEmpresaMaster) NÃO acessam.
// Exceções acessíveis: getById, listForSelect e getMyEmpresa — todas escopadas
// por empresa no service (não-master só enxerga a PRÓPRIA empresa). F-009/F-012.
export function createEmpresaRouter(empresaService: EmpresaService) {
  return router({
    list: masterProcedure.input(listEmpresaSchema).query(({ input }) => empresaService.list(input)),
    getById: protectedProcedure.input(z.object({ id: z.string() })).query(({ input, ctx }) => empresaService.getById(input.id, ctx.isMaster ?? false, ctx.empresaId)),
    create: masterProcedure.input(createEmpresaSchema).mutation(({ input, ctx }) => empresaService.create(input, ctx.userId)),
    update: masterProcedure.input(z.object({ id: z.string(), data: updateEmpresaSchema })).mutation(({ input, ctx }) => empresaService.update(input.id, input.data, ctx.userId)),
    delete: masterProcedure.input(z.object({ id: z.string() })).mutation(({ input, ctx }) => empresaService.delete(input.id, ctx.userId)),
    getEvents: masterProcedure.input(z.object({ empresaId: z.string() })).query(({ input }) => empresaService.getEvents(input.empresaId)),
    exportAll: masterProcedure.query(() => empresaService.exportAll()),
    listForSelect: protectedProcedure.query(({ ctx }) => empresaService.listForSelect({ empresaId: ctx.empresaId ?? null, isMaster: !!ctx.isMaster })),
    importBulk: masterProcedure.input(z.object({ items: z.array(createEmpresaSchema) })).mutation(({ input, ctx }) => empresaService.bulkCreate(input.items, ctx.userId)),
    /** Retorna a empresa vinculada ao usuário logado — sem exigir permissão no módulo */
    getMyEmpresa: protectedProcedure.query(({ ctx }) => empresaService.getMyEmpresa(ctx.userId)),
  })
}
