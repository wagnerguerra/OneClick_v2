import { router, protectedProcedure } from '../trpc/trpc.service'

/**
 * Router de presença — endpoint leve `ping` que o frontend chama toda vez que
 * muda de rota (Next link navigation). O `createContext` já chama `touch()`
 * via header X-Page; esse endpoint só existe pra GARANTIR que a chamada
 * aconteça mesmo em páginas que não disparam outras queries tRPC.
 *
 * Não precisa retornar nada útil — o trabalho real está no middleware do ctx.
 */
export function createPresenceRouter() {
  return router({
    ping: protectedProcedure.mutation(() => ({ ok: true })),
  })
}
