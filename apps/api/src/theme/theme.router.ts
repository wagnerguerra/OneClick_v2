import { z } from 'zod'
import { router, publicProcedure, writeProcedure } from '../trpc/trpc.service'
import { ThemeService } from './theme.service'

const MODULE = 'admin' // reusa permissões existentes — só master/empresaMaster edita

export function createThemeRouter(svc: ThemeService) {
  return router({
    /** Lista de cores — público (qualquer usuário precisa pra renderizar a UI). */
    list: publicProcedure.query(() => svc.list()),

    /** Defaults (pra "Resetar" no Design System). */
    defaults: publicProcedure.query(() => svc.defaults()),

    /** Atualiza uma cor — só master/empresaMaster (via writeProcedure(admin)). */
    update: writeProcedure(MODULE)
      .input(z.object({
        slug:  z.string().min(1).max(40),
        label: z.string().min(1).max(80),
        color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Hex inválido — use #RRGGBB'),
      }))
      .mutation(({ input, ctx }) => svc.upsert(input.slug, input.label, input.color, ctx.userId)),

    /** Restaura a cor padrão de um slug. */
    reset: writeProcedure(MODULE)
      .input(z.object({ slug: z.string().min(1) }))
      .mutation(({ input }) => svc.reset(input.slug)),
  })
}
