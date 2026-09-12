import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { router, protectedProcedure } from '../trpc/trpc.service'
import { AdminTenantService } from './admin-tenant.service'
import type { PortalModulosService } from '../portal/portal-modulos.service'

/** Só o master GLOBAL da plataforma gere tenants (não o empresaMaster do tenant). */
function assertMaster(ctx: { isMaster?: boolean }) {
  if (!ctx.isMaster) {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Apenas master da plataforma' })
  }
}

export function createAdminTenantRouter(
  svc: AdminTenantService,
  modulos: PortalModulosService,
) {
  return router({
    /**
     * Liberação dos módulos do Portal do Cliente.
     *
     * Fica aqui, junto do cadastro de tenants, porque quem decide é o master
     * da plataforma. Mas a unidade é a EMPRESA, não o tenant: `Empresa` não
     * tem `tenantId` no schema, e as empresas em operação estão todas sem
     * tenant — um gate por tenant não alcançaria cliente nenhum hoje.
     */
    portalEmpresas: protectedProcedure.query(({ ctx }) => {
      assertMaster(ctx)
      return modulos.empresasComPortal()
    }),

    portalModulos: protectedProcedure
      .input(z.object({ empresaId: z.string() }))
      .query(({ ctx, input }) => {
        assertMaster(ctx)
        return modulos.listar(input.empresaId)
      }),

    definirPortalModulo: protectedProcedure
      .input(z.object({
        empresaId: z.string(),
        modulo: z.string().min(1).max(40),
        liberado: z.boolean(),
      }))
      .mutation(({ ctx, input }) => {
        assertMaster(ctx)
        return modulos.definir(input, ctx.userId!)
      }),

    voltarPortalModuloAoPadrao: protectedProcedure
      .input(z.object({ empresaId: z.string(), modulo: z.string().min(1).max(40) }))
      .mutation(({ ctx, input }) => {
        assertMaster(ctx)
        return modulos.voltarAoPadrao(input.empresaId, input.modulo)
      }),

    list: protectedProcedure.query(({ ctx }) => {
      assertMaster(ctx)
      return svc.list()
    }),

    extendTrial: protectedProcedure
      .input(z.object({ tenantId: z.string(), dias: z.number().int().min(1).max(365) }))
      .mutation(({ ctx, input }) => {
        assertMaster(ctx)
        return svc.extendTrial(input.tenantId, input.dias)
      }),

    suspend: protectedProcedure
      .input(z.object({ tenantId: z.string() }))
      .mutation(({ ctx, input }) => {
        assertMaster(ctx)
        return svc.suspend(input.tenantId)
      }),

    reactivate: protectedProcedure
      .input(z.object({ tenantId: z.string() }))
      .mutation(({ ctx, input }) => {
        assertMaster(ctx)
        return svc.reactivate(input.tenantId)
      }),
  })
}
