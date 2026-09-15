import { z } from 'zod'
import { router, masterProcedure, protectedProcedure } from '../trpc/trpc.service'
import type { PortalModulosService } from '../portal/portal-modulos.service'
import { createEmpresaSchema, updateEmpresaSchema, listEmpresaSchema } from '@saas/types'
import { EmpresaService } from './empresa.service'

// O módulo "Empresas" é administração GLOBAL multi-tenant (lista todas as
// empresas/tenants da plataforma). Por isso a gestão é restrita ao MASTER
// global (masterProcedure) — admins de tenant (isEmpresaMaster) NÃO acessam.
// Exceções acessíveis: getById, listForSelect e getMyEmpresa — todas escopadas
// por empresa no service (não-master só enxerga a PRÓPRIA empresa). F-009/F-012.
export function createEmpresaRouter(
  empresaService: EmpresaService,
  portalModulos: PortalModulosService,
) {
  return router({
    list: masterProcedure.input(listEmpresaSchema).query(({ input }) => empresaService.list(input)),
    getById: protectedProcedure.input(z.object({ id: z.string() })).query(({ input, ctx }) => empresaService.getById(input.id, ctx.isMaster ?? false, ctx.empresaId)),

    /**
     * Quais módulos do Portal do Cliente estão liberados nesta empresa.
     *
     * SÓ LEITURA. Quem liga e desliga é o master, em `adminTenant` — é decisão
     * comercial, e não do escritório sobre si mesmo. Aqui a empresa vê a
     * própria configuração, que é informação legítima de quem responde por
     * ela: sem isto, o administrador do escritório não tem como saber por que
     * uma aba não aparece no portal dos clientes dele.
     *
     * O `getById` vem antes e é quem barra: ele já carrega a regra de que
     * não-master só alcança a PRÓPRIA empresa. Repetir a comparação aqui
     * criaria um segundo lugar para a mesma decisão de isolamento, e é assim
     * que uma das duas fica para trás.
     */
    portalModulos: protectedProcedure
      .input(z.object({ empresaId: z.string() }))
      .query(async ({ input, ctx }) => {
        await empresaService.getById(input.empresaId, ctx.isMaster ?? false, ctx.empresaId)
        return portalModulos.listar(input.empresaId)
      }),

    /**
     * Liga ou desliga um módulo do portal para os clientes deste tenant.
     *
     * `masterProcedure`: é o master GLOBAL da plataforma quem decide — liberar
     * módulo do portal é decisão comercial sobre o tenant, e não do tenant
     * sobre si mesmo. O `isEmpresaMaster` (dono do tenant) NÃO passa aqui.
     *
     * Moraram em `adminTenant` até 15/09/2026, numa tela que tratava a tabela
     * `Tenant` como se fosse o cadastro de tenants. Não é: o tenant do OneClick
     * é a `Empresa`, e tudo que é dele fica no cadastro dela.
     */
    definirPortalModulo: masterProcedure
      .input(z.object({
        empresaId: z.string(),
        modulo: z.string().min(1).max(40),
        liberado: z.boolean(),
      }))
      .mutation(({ input, ctx }) => portalModulos.definir(input, ctx.userId)),

    voltarPortalModuloAoPadrao: masterProcedure
      .input(z.object({ empresaId: z.string(), modulo: z.string().min(1).max(40) }))
      .mutation(({ input }) => portalModulos.voltarAoPadrao(input.empresaId, input.modulo)),
    create: masterProcedure.input(createEmpresaSchema).mutation(({ input, ctx }) => empresaService.create(input, ctx.userId)),
    update: masterProcedure.input(z.object({ id: z.string(), data: updateEmpresaSchema })).mutation(({ input, ctx }) => empresaService.update(input.id, input.data, ctx.userId)),
    delete: masterProcedure.input(z.object({ id: z.string() })).mutation(({ input, ctx }) => empresaService.delete(input.id, ctx.userId)),
    getEvents: masterProcedure.input(z.object({ empresaId: z.string() })).query(({ input }) => empresaService.getEvents(input.empresaId)),
    exportAll: masterProcedure.query(() => empresaService.exportAll()),
    listForSelect: protectedProcedure.query(({ ctx }) => empresaService.listForSelect({ empresaId: ctx.empresaId ?? null, isMaster: !!ctx.isMaster })),
    importBulk: masterProcedure.input(z.object({ items: z.array(createEmpresaSchema) })).mutation(({ input, ctx }) => empresaService.bulkCreate(input.items, ctx.userId)),
    /** Retorna a empresa ATIVA do usuário logado (server-authoritative) */
    getMyEmpresa: protectedProcedure.query(({ ctx }) => empresaService.getMyEmpresa(ctx.userId)),
    /** Define a empresa ATIVA no servidor (master: qualquer; não-master: só a home) */
    setActiveEmpresa: protectedProcedure
      .input(z.object({ empresaId: z.string() }))
      .mutation(({ input, ctx }) => empresaService.setActiveEmpresa(ctx.userId, input.empresaId)),
  })
}
