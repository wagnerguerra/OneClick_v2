import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { router, protectedProcedure } from '../trpc/trpc.service'
import { DashboardCalendarioService } from './dashboard-calendario.service'

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

export function createDashboardCalendarioRouter(service: DashboardCalendarioService) {
  return router({
    listPrazos: protectedProcedure
      .input(z.object({
        inicio: z.string().regex(ISO_DATE, 'Use YYYY-MM-DD'),
        fim: z.string().regex(ISO_DATE, 'Use YYYY-MM-DD'),
      }))
      .query(({ input, ctx }) => {
        if (!ctx.userId) throw new TRPCError({ code: 'UNAUTHORIZED' })
        return service.listPrazos(
          {
            userId: ctx.userId,
            isMaster: !!ctx.isMaster,
            isEmpresaMaster: !!ctx.isEmpresaMaster,
            empresaId: ctx.empresaId,
          },
          input,
        )
      }),

    // Aniversariantes do mês — usado pelo widget calendário pra marcar
    // comemorações (nascimento e tempo de empresa). Sem checagem de módulo:
    // informação comemorativa, equiparada ao widget de ramais.
    listComemoracoes: protectedProcedure
      .input(z.object({
        ano: z.coerce.number().int().min(1900).max(3000),
        mes: z.coerce.number().int().min(1).max(12),
      }))
      .query(({ input, ctx }) => service.listComemoracoes(ctx.empresaId, input)),
  })
}
