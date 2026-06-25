import { z } from 'zod'
import { router, readProcedure, masterProcedure, protectedProcedure } from '../trpc/trpc.service'
import { createEmpresaSchema, updateEmpresaSchema, listEmpresaSchema } from '@saas/types'
import { EmpresaService } from './empresa.service'

const MODULE = 'empresas'

// O módulo "Empresas" é administração GLOBAL multi-tenant (lista todas as
// empresas/tenants da plataforma). Por isso a gestão é restrita ao MASTER
// global (masterProcedure) — admins de tenant (isEmpresaMaster) NÃO acessam.
// Exceções: getById (usado pelo seletor de empresa ativa), listForSelect
// (escopado por empresa no service) e getMyEmpresa permanecem acessíveis.
export function createEmpresaRouter(empresaService: EmpresaService) {
  return router({
    list: masterProcedure.input(listEmpresaSchema).query(({ input }) => empresaService.list(input)),
    getById: readProcedure(MODULE).input(z.object({ id: z.string() })).query(({ input }) => empresaService.getById(input.id)),
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
