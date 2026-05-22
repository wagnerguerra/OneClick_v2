import { z } from 'zod'
import { router, publicProcedure, readProcedure, writeProcedure, deleteProcedure } from '../trpc/trpc.service'
import { ClientErrorService } from './client-error.service'

const MODULE = 'admin'  // só admins veem; reusa permissões existentes do módulo

const reportSchema = z.object({
  level:       z.enum(['ERROR', 'WARN', 'REJECTION']),
  message:     z.string().min(1).max(5000),
  stack:       z.string().max(20000).optional().nullable(),
  url:         z.string().max(500).optional().nullable(),
  userAgent:   z.string().max(500).optional().nullable(),
  environment: z.string().max(40).optional(),
  /// Slug do módulo derivado da URL (ex: 'cnd', 'danfe', 'agendamento')
  modulo:      z.string().max(60).optional().nullable(),
})

export function createClientErrorRouter(svc: ClientErrorService) {
  return router({
    /** Endpoint público (sem auth obrigatório) — frontend captura erros antes
     *  do login também. Quando há sessão, preenche userId/empresaId do ctx. */
    report: publicProcedure.input(reportSchema)
      .mutation(({ input, ctx }) => svc.report({
        ...input,
        userId:    ctx.userId    ?? null,
        empresaId: ctx.empresaId ?? null,
      })),

    list: readProcedure(MODULE).input(z.object({
      page: z.coerce.number().int().min(1).default(1),
      limit: z.coerce.number().int().min(1).max(100).default(30),
      search: z.string().optional(),
      level: z.enum(['ERROR', 'WARN', 'REJECTION']).optional(),
      resolved: z.enum(['all', 'open', 'resolved']).default('open'),
      environment: z.string().optional(),
      modulo: z.string().optional(),
    }).optional())
      .query(({ input }) => svc.list(input ?? {})),

    getById: readProcedure(MODULE).input(z.object({ id: z.string() }))
      .query(({ input }) => svc.getById(input.id)),

    getStats: readProcedure(MODULE).input(z.object({ environment: z.string().optional() }).optional())
      .query(({ input }) => svc.getStats(input?.environment)),

    markResolved: writeProcedure(MODULE).input(z.object({ id: z.string() }))
      .mutation(({ input, ctx }) => svc.markResolved(input.id, ctx.userId)),

    markUnresolved: writeProcedure(MODULE).input(z.object({ id: z.string() }))
      .mutation(({ input }) => svc.markUnresolved(input.id)),

    markAllResolved: writeProcedure(MODULE)
      .mutation(({ ctx }) => svc.markAllResolved(ctx.userId)),

    deleteResolved: deleteProcedure(MODULE)
      .mutation(() => svc.deleteResolved()),

    // ── Banco de bugs ─────────────────────────────────────────
    getNotas: readProcedure(MODULE).input(z.object({ id: z.string() }))
      .query(({ input }) => svc.getNotas(input.id)),

    updateNotas: writeProcedure(MODULE).input(z.object({
      id: z.string(),
      notas: z.string().max(20000),
    }))
      .mutation(({ input, ctx }) => svc.updateNotas(input.id, input.notas, ctx.userId)),

    getTrend: readProcedure(MODULE).input(z.object({
      dias: z.coerce.number().int().min(1).max(365).default(30),
    }).optional())
      .query(({ input }) => svc.getTrend(input?.dias ?? 30)),

    getTopByFrequency: readProcedure(MODULE).input(z.object({
      limit: z.coerce.number().int().min(1).max(100).default(10),
    }).optional())
      .query(({ input }) => svc.getTopByFrequency(input?.limit ?? 10)),

    getByUrl: readProcedure(MODULE).input(z.object({
      limit: z.coerce.number().int().min(1).max(100).default(20),
    }).optional())
      .query(({ input }) => svc.getByUrl(input?.limit ?? 20)),
  })
}
