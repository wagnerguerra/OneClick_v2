import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { router, protectedProcedure } from '../trpc/trpc.service'
import { DashboardLayoutService } from './dashboard-layout.service'
import { DashboardLayoutEventsService } from './dashboard-layout-events.service'

const widgetItemSchema = z.object({
  i: z.string().min(1),
  x: z.number().int().min(0),
  y: z.number().int().min(0),
  w: z.number().int().min(1).max(12),
  h: z.number().int().min(1).max(20),
  minW: z.number().int().min(1).optional(),
  minH: z.number().int().min(1).optional(),
  customLabel: z.string().max(80).optional(),
  // Controle de acesso por widget. Default (ausente) = 'all'. Se scope='users',
  // só usuários em userIds enxergam; se scope='areas', só users cuja areaId está
  // em areaIds. Master/EmpresaMaster sempre veem (filtro aplicado no frontend).
  visibility: z
    .object({
      scope: z.enum(['all', 'users', 'areas']),
      userIds: z.array(z.string()).max(500).default([]),
      areaIds: z.array(z.string()).max(100).default([]),
    })
    .optional(),
})

/** Resolve a empresa alvo:
 *   - Master global: aceita empresaId vindo do input (selecionada na UI)
 *   - Outros: usa sempre ctx.empresaId (não permite trocar)
 *   Lança erro se não houver nenhuma.
 */
function resolveEmpresaId(ctx: any, inputEmpresaId?: string): string {
  if (ctx.isMaster && inputEmpresaId) return inputEmpresaId
  if (ctx.empresaId) return ctx.empresaId
  if (ctx.isMaster && !inputEmpresaId) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'Selecione uma empresa no header antes de editar o dashboard' })
  }
  throw new TRPCError({ code: 'BAD_REQUEST', message: 'Sem empresa selecionada' })
}

export function createDashboardLayoutRouter(
  service: DashboardLayoutService,
  events: DashboardLayoutEventsService,
) {
  return router({
    /** Qualquer user autenticado lê o layout da própria empresa. Master pode passar empresaId. */
    get: protectedProcedure
      .input(z.object({ empresaId: z.string().optional() }).optional())
      .query(({ input, ctx }) => {
        const empresaId = (ctx.isMaster && input?.empresaId) ? input.empresaId : ctx.empresaId
        if (!empresaId) return null
        return service.get(empresaId)
      }),

    /** Apenas master/empresa-master pode salvar. */
    save: protectedProcedure
      .input(z.object({
        layout: z.array(widgetItemSchema).max(50),
        empresaId: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        if (!(ctx.isMaster || ctx.isEmpresaMaster)) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Apenas master/empresa-master pode editar o dashboard' })
        }
        const empresaId = resolveEmpresaId(ctx, input.empresaId)
        await service.save(empresaId, input.layout, ctx.userId)
        // Notifica os demais clientes conectados a recarregarem o layout
        events.emit({ type: 'save', empresaId, actorUserId: ctx.userId ?? null })
        return { ok: true }
      }),

    /** Reset — remove customização e volta pro default. */
    reset: protectedProcedure
      .input(z.object({ empresaId: z.string().optional() }).optional())
      .mutation(async ({ input, ctx }) => {
        if (!(ctx.isMaster || ctx.isEmpresaMaster)) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Apenas master/empresa-master' })
        }
        const empresaId = resolveEmpresaId(ctx, input?.empresaId)
        const result = await service.reset(empresaId)
        events.emit({ type: 'reset', empresaId, actorUserId: ctx.userId ?? null })
        return result
      }),

    // ============================================================
    // Layout pessoal — qualquer user autenticado salva o próprio
    // ============================================================

    /** Layout pessoal do user logado. Retorna null se nunca foi personalizado
     *  (frontend cai no empresarial, depois no DEFAULT_LAYOUT). */
    getMine: protectedProcedure
      .query(({ ctx }) => {
        if (!ctx.userId) return null
        return service.getForUser(ctx.userId)
      }),

    /** User logado salva o próprio layout. */
    saveMine: protectedProcedure
      .input(z.object({
        layout: z.array(widgetItemSchema).max(50),
      }))
      .mutation(async ({ input, ctx }) => {
        if (!ctx.userId) {
          throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Não autenticado' })
        }
        await service.saveForUser(ctx.userId, ctx.empresaId ?? null, input.layout)
        return { ok: true }
      }),

    /** Reset — apaga a personalização pessoal, volta pro empresarial/default. */
    resetMine: protectedProcedure
      .mutation(async ({ ctx }) => {
        if (!ctx.userId) {
          throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Não autenticado' })
        }
        return service.resetForUser(ctx.userId)
      }),
  })
}
