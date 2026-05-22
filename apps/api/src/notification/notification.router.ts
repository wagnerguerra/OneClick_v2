import { z } from 'zod'
import { router, protectedProcedure } from '../trpc/trpc.service'
import { NotificationService } from './notification.service'
import { TRPCError } from '@trpc/server'
import { prisma } from '@saas/db'

async function assertAdmin(userId: string) {
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: { isMaster: true, isEmpresaMaster: true },
  })
  if (!u || (!u.isMaster && !u.isEmpresaMaster)) {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Acesso restrito a master/empresa-master.' })
  }
}

export function createNotificationRouter(notificationService: NotificationService) {
  return router({
    listarMinhas: protectedProcedure
      .input(z.object({
        limit: z.number().int().min(1).max(100).optional(),
        apenasNaoLidas: z.boolean().optional(),
      }).optional())
      .query(({ input, ctx }) => notificationService.listarMinhas(ctx.userId!, input)),

    contarNaoLidas: protectedProcedure
      .query(({ ctx }) => notificationService.contarNaoLidas(ctx.userId!)),

    /** Conta TODAS notificações ativas do user — pendências (resolvidas pela origem). */
    contarPendentes: protectedProcedure
      .query(({ ctx }) => notificationService.contarPendentes(ctx.userId!)),

    marcarComoLida: protectedProcedure
      .input(z.object({ id: z.string() }))
      .mutation(({ input, ctx }) => notificationService.marcarComoLida(input.id, ctx.userId!)),

    marcarTodasComoLidas: protectedProcedure
      .mutation(({ ctx }) => notificationService.marcarTodasComoLidas(ctx.userId!)),

    excluir: protectedProcedure
      .input(z.object({ id: z.string() }))
      .mutation(({ input, ctx }) => notificationService.excluir(input.id, ctx.userId!)),

    // ── Configuração admin: quais origens permitem remoção pelo usuário ──
    listarOrigens: protectedProcedure
      .query(async ({ ctx }) => {
        await assertAdmin(ctx.userId!)
        return notificationService.listarOrigens()
      }),

    setRemovableConfig: protectedProcedure
      .input(z.object({ removable: z.record(z.string(), z.boolean()) }))
      .mutation(async ({ input, ctx }) => {
        await assertAdmin(ctx.userId!)
        return notificationService.setRemovableConfig(input.removable)
      }),
  })
}
