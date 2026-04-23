import { z } from 'zod'
import { router, readProcedure, writeProcedure, deleteProcedure } from '../trpc/trpc.service'
import { CndService } from './cnd.service'
import { CndSchedulerService } from './cnd.scheduler'
import { TRPCError } from '@trpc/server'
import { paginationSchema } from '@saas/types'

const MODULE = 'certidoes-cnd'

export function createCndRouter(service: CndService, scheduler: CndSchedulerService) {
  return router({
    // ── Consulta ─────────────────────────────────────────

    consultar: writeProcedure(MODULE)
      .input(z.object({
        documento: z.string().min(11),
        tipoDocumento: z.number().int().min(1).max(3).default(1),
        clienteId: z.string().optional(),
        forcarNova: z.boolean().optional(),
      }))
      .mutation(({ input, ctx }) => service.consultar(input.documento, input.tipoDocumento, {
        clienteId: input.clienteId,
        empresaId: ctx.empresaId ?? undefined,
        userId: ctx.userId,
        forcarNova: input.forcarNova,
      })),

    consultarLote: writeProcedure(MODULE)
      .input(z.object({ documentos: z.array(z.string()).min(1).max(500) }))
      .mutation(({ input, ctx }) => service.consultarLote(input.documentos, ctx.empresaId ?? null, ctx.userId)),

    verificarCache: readProcedure(MODULE)
      .input(z.object({ documento: z.string().min(11) }))
      .query(({ input }) => service.verificarCache(input.documento)),

    totalizadores: readProcedure(MODULE)
      .query(() => service.totalizadores()),

    // ── Listagem ─────────────────────────────────────────

    list: readProcedure(MODULE)
      .input(paginationSchema.extend({
        clienteId: z.string().optional(),
        tipoCertidao: z.string().optional(),
        lixeira: z.boolean().optional(),
      }))
      .query(({ input }) => service.list(input)),

    getById: readProcedure(MODULE)
      .input(z.object({ id: z.string() }))
      .query(({ input }) => service.getById(input.id)),

    getPdf: readProcedure(MODULE)
      .input(z.object({ id: z.string() }))
      .query(({ input }) => service.getPdf(input.id)),

    // ── Exclusao ─────────────────────────────────────────

    delete: deleteProcedure(MODULE)
      .input(z.object({ id: z.string() }))
      .mutation(({ input }) => service.softDelete(input.id)),

    restore: writeProcedure(MODULE)
      .input(z.object({ id: z.string() }))
      .mutation(({ input }) => service.restore(input.id)),

    hardDelete: deleteProcedure(MODULE)
      .input(z.object({ id: z.string() }))
      .mutation(({ input }) => service.hardDelete(input.id)),

    // ── Logs de execucao ──────────────────────────────────

    execLogs: readProcedure(MODULE)
      .input(z.object({ limit: z.number().min(1).max(100).default(20), offset: z.number().min(0).default(0) }).optional())
      .query(({ input }) => service.listarExecLogs(input?.limit ?? 20, input?.offset ?? 0)),

    // ── Clientes mensais ─────────────────────────────────

    clientesMensais: readProcedure(MODULE)
      .query(() => service.listarClientesMensais()),

    // ── Agendamento ──────────────────────────────────────

    schedule: router({
      get: readProcedure(MODULE)
        .query(() => scheduler.getStatus()),

      update: writeProcedure(MODULE)
        .input(z.object({
          enabled: z.boolean(),
          cron: z.string().min(1),
          delayMs: z.number().min(1000).max(60000).optional(),
          clienteIds: z.array(z.string()).optional(),
        }))
        .mutation(async ({ input, ctx }) => {
          if (!ctx.isMaster) throw new TRPCError({ code: 'FORBIDDEN', message: 'Apenas perfil MASTER pode alterar agendamentos' })
          return scheduler.updateConfig(input)
        }),

      runNow: writeProcedure(MODULE)
        .mutation(async ({ ctx }) => {
          if (!ctx.isMaster) throw new TRPCError({ code: 'FORBIDDEN', message: 'Apenas perfil MASTER pode executar manualmente' })
          return scheduler.runNow(ctx.userId)
        }),

      progress: readProcedure(MODULE)
        .query(() => scheduler.getProgress()),

      clientes: readProcedure(MODULE)
        .query(() => scheduler.listarClientesDisponiveis()),
    }),
  })
}
