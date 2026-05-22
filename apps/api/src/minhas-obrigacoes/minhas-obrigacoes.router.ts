import { z } from 'zod'
import { router, readProcedure, writeProcedure, protectedProcedure } from '../trpc/trpc.service'
import { TRPCError } from '@trpc/server'
import { MinhasObrigacoesService } from './minhas-obrigacoes.service'

const MODULE = 'minhas-obrigacoes'

export function createMinhasObrigacoesRouter(svc: MinhasObrigacoesService) {
  return router({
    list: readProcedure(MODULE)
      .input(z.object({
        status: z.enum(['TODOS', 'PENDENTES', 'ATRASADAS', 'CONCLUIDAS']).optional(),
        area: z.string().optional(),
        clienteId: z.string().optional(),
        competenciaAno: z.coerce.number().int().optional(),
        competenciaMes: z.coerce.number().int().min(1).max(12).optional(),
        search: z.string().optional(),
      }).optional())
      .query(({ input, ctx }) => {
        if (!ctx.userId) throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Usuário não autenticado.' })
        return svc.listMinhas(ctx.userId, input ?? {}, ctx.empresaId)
      }),

    stats: readProcedure(MODULE)
      .query(({ ctx }) => {
        if (!ctx.userId) throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Usuário não autenticado.' })
        return svc.getStats(ctx.userId, ctx.empresaId)
      }),

    entregar: writeProcedure(MODULE)
      .input(z.object({
        execucaoId: z.string(),
        observacao: z.string().max(500).optional().nullable(),
        anexoUrl: z.string().url().optional().nullable(),
      }))
      .mutation(({ input, ctx }) => {
        if (!ctx.userId) throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Usuário não autenticado.' })
        return svc.entregar(ctx.userId, input)
      }),

    log: protectedProcedure
      .input(z.object({ execucaoId: z.string() }))
      .query(({ input, ctx }) => {
        if (!ctx.userId) throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Usuário não autenticado.' })
        return svc.getLog(ctx.userId, input.execucaoId)
      }),
  })
}
