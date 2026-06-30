import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { router, protectedProcedure } from '../trpc/trpc.service'
import { AdminTenantService } from './admin-tenant.service'

/** Só o master GLOBAL da plataforma gere tenants (não o empresaMaster do tenant). */
function assertMaster(ctx: { isMaster?: boolean }) {
  if (!ctx.isMaster) {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Apenas master da plataforma' })
  }
}

export function createAdminTenantRouter(svc: AdminTenantService) {
  return router({
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
