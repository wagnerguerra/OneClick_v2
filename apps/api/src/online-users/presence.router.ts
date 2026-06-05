import { router, protectedProcedure } from '../trpc/trpc.service'
import { prisma } from '@saas/db'

/**
 * Router de presença — endpoint `ping` chamado pelo frontend pra registrar
 * atividade do user.
 *
 * O middleware do tRPC (createContext) também faz `touch()` em qualquer
 * request autenticada, mas de forma assíncrona (fire-and-forget) pra não
 * adicionar latência. Isso causa uma race condition no primeiro carregamento
 * pós-login: a query getOnline() pode rodar antes do UPDATE do
 * lastActivityAt commitar, fazendo o user aparecer offline pra si mesmo no
 * dropdown do chat.
 *
 * Por isso esse procedure FAZ o update síncrono (await) — quando a Promise
 * resolve, o banco já tem lastActivityAt = now. O frontend chama isso ANTES
 * de carregar a lista de online users na primeira render do chat.
 */
export function createPresenceRouter() {
  return router({
    ping: protectedProcedure.mutation(async ({ ctx }) => {
      const userId = (ctx as { userId?: string }).userId
      if (!userId) return { ok: true }
      await prisma.user
        .update({
          where: { id: userId },
          data: { lastActivityAt: new Date() },
        })
        .catch((e: Error) => {
          if (!e.message.includes('P2025')) {
            console.warn('[presence.ping] touch falhou:', e.message)
          }
        })
      return { ok: true }
    }),
  })
}
