import { z } from 'zod'
import {
  router, readProcedure, writeProcedure, deleteProcedure, protectedProcedure,
} from '../trpc/trpc.service'
import {
  listProcessoSchema, createProcessoSchema, cancelarProcessoSchema,
} from '@saas/types'
import { ProcessoService } from './processo.service'

// Reutiliza o slug "servicos" — quem tem permissao de servicos tambem
// gerencia processos. Se no futuro quiser permissao separada, troca aqui.
const MODULE = 'servicos'

export function createProcessoRouter(processoService: ProcessoService) {
  return router({
    list: readProcedure(MODULE)
      .input(listProcessoSchema)
      .query(({ input, ctx }) => processoService.list(input, ctx.empresaId)),

    getById: readProcedure(MODULE)
      .input(z.object({ id: z.string() }))
      .query(({ input }) => processoService.getById(input.id)),

    create: writeProcedure(MODULE)
      .input(createProcessoSchema)
      .mutation(({ input, ctx }) => processoService.create(input, ctx.empresaId, ctx.userId)),

    cancelar: deleteProcedure(MODULE)
      .input(cancelarProcessoSchema)
      .mutation(({ input, ctx }) => processoService.cancelar(input.id, input.motivo, ctx.userId)),

    listEventos: readProcedure(MODULE)
      .input(z.object({ processoId: z.string() }))
      .query(({ input }) => processoService.listEventos(input.processoId)),

    // ── Painel operacional ──
    painelExecucoes: protectedProcedure
      .input(z.object({
        search: z.string().optional(),
        segmentos: z.array(z.string()).optional(),
        responsaveis: z.array(z.string()).optional(),
      }).optional())
      .query(({ input, ctx }) =>
        processoService.painelExecucoes(ctx.userId!, input ?? {}),
      ),

    painelResponsaveis: protectedProcedure
      .query(({ ctx }) => processoService.painelResponsaveis(ctx.userId!)),
  })
}
