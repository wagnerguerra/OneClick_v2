import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { router, protectedProcedure } from '../trpc/trpc.service'
import { TabsService } from './tabs.service'

export function createTabsRouter(tabsService: TabsService) {
  return router({
    listarMinhas: protectedProcedure
      .query(({ ctx }) => tabsService.listarMinhas(ctx.userId!)),

    addOrGet: protectedProcedure
      .input(z.object({
        href: z.string().min(1).max(500),
        label: z.string().min(1).max(100),
        icon: z.string().max(50).nullable().optional(),
      }))
      .mutation(({ input, ctx }) => tabsService.addOrGet(ctx.userId!, input)),

    updateLabel: protectedProcedure
      .input(z.object({ href: z.string().min(1), label: z.string().min(1).max(100) }))
      .mutation(({ input, ctx }) => tabsService.updateLabel(ctx.userId!, input.href, input.label)),

    close: protectedProcedure
      .input(z.object({ id: z.string() }))
      .mutation(({ input, ctx }) => tabsService.close(input.id, ctx.userId!)),

    closeMultiple: protectedProcedure
      .input(z.object({ ids: z.array(z.string()).min(1) }))
      .mutation(({ input, ctx }) => tabsService.closeMultiple(input.ids, ctx.userId!)),

    setPinned: protectedProcedure
      .input(z.object({ id: z.string(), pinned: z.boolean() }))
      .mutation(({ input, ctx }) => tabsService.setPinned(input.id, ctx.userId!, input.pinned)),

    reorder: protectedProcedure
      .input(z.object({ orderedIds: z.array(z.string()) }))
      .mutation(({ input, ctx }) => tabsService.reorder(ctx.userId!, input.orderedIds)),

    // Configuração — leitura para qualquer logado, escrita só para master
    getMaxTabs: protectedProcedure
      .query(() => tabsService.getMaxTabs()),

    setMaxTabs: protectedProcedure
      .input(z.object({ max: z.number().int().min(1).max(50) }))
      .mutation(async ({ input, ctx }) => {
        if (!(ctx.isMaster || ctx.isEmpresaMaster)) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Apenas o master pode alterar essa configuração' })
        }
        return tabsService.setMaxTabs(input.max)
      }),
  })
}
