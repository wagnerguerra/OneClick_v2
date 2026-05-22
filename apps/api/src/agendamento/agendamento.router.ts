import { z } from 'zod'
import { router, readProcedure, writeProcedure } from '../trpc/trpc.service'
import { AgendamentoService, type SchedulerSlug } from './agendamento.service'

const MODULE = 'cliente'

const schedulerSchema = z.enum(['nfe-dist', 'nfse-dist'])

export function createAgendamentoRouter(svc: AgendamentoService) {
  return router({
    /** Status atual de um scheduler — cron, próxima execução, clientes ativos, KPIs. */
    getStatus: readProcedure(MODULE)
      .input(z.object({ scheduler: schedulerSchema }))
      .query(({ input }) => svc.getStatus(input.scheduler as SchedulerSlug)),

    /** Lista as últimas N execuções (cron + manual). */
    listExecucoes: readProcedure(MODULE)
      .input(z.object({
        scheduler: schedulerSchema,
        limit: z.number().int().min(1).max(100).optional(),
        offset: z.number().int().min(0).optional(),
        statusFiltro: z.enum(['OK', 'ERRO', 'PARCIAL', 'RODANDO']).nullable().optional(),
      }))
      .query(({ input }) => svc.listExecucoes({
        scheduler: input.scheduler as SchedulerSlug,
        limit: input.limit,
        offset: input.offset,
        statusFiltro: input.statusFiltro ?? null,
      })),

    /** Detalhe de uma execução (com array de detalhes por cliente). */
    getExecucao: readProcedure(MODULE)
      .input(z.object({ id: z.string() }))
      .query(({ input }) => svc.getExecucao(input.id)),

    /**
     * Atualiza expressão cron. Nome com prefixo "salvar..." pra escapar de
     * filtros de adblockers que pegam "setCron"/"setEnabled" como tracker.
     */
    salvarHorario: writeProcedure(MODULE)
      .input(z.object({
        scheduler: schedulerSchema,
        cron: z.string().min(5).max(100),
      }))
      .mutation(({ input, ctx }) => svc.setCron(input.scheduler as SchedulerSlug, input.cron, ctx.userId)),

    /** Liga/desliga cron diário. */
    alternarStatus: writeProcedure(MODULE)
      .input(z.object({
        scheduler: schedulerSchema,
        enabled: z.boolean(),
      }))
      .mutation(({ input, ctx }) => svc.setEnabled(input.scheduler as SchedulerSlug, input.enabled, ctx.userId)),

    /**
     * Dispara busca manual pra TODOS os clientes ativos do scheduler.
     * Marca *SyncRequestedAt — poll manual (60s) consome.
     */
    executarAgora: writeProcedure(MODULE)
      .input(z.object({ scheduler: schedulerSchema }))
      .mutation(({ input }) => svc.dispararAgora(input.scheduler as SchedulerSlug)),
  })
}
