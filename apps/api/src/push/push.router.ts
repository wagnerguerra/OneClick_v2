import { z } from 'zod'
import { router, protectedProcedure } from '../trpc/trpc.service'
import { PushService } from './push.service'

/**
 * Router de push do app mobile. Qualquer usuário autenticado registra/remove
 * o token do próprio device (sem RBAC de módulo — é dado do próprio usuário).
 */
export function createPushRouter(pushService: PushService) {
  return router({
    register: protectedProcedure
      .input(z.object({ token: z.string().min(1), platform: z.string().optional() }))
      .mutation(async ({ input, ctx }) => {
        await pushService.registerDevice(ctx.userId, input.token, input.platform)
        return { ok: true as const }
      }),

    unregister: protectedProcedure
      .input(z.object({ token: z.string().min(1) }))
      .mutation(async ({ input, ctx }) => {
        await pushService.removeDevice(ctx.userId, input.token)
        return { ok: true as const }
      }),
  })
}
