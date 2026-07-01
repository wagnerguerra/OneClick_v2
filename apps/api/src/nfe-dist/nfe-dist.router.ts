import { z } from 'zod'
import { prisma } from '@saas/db'
import { router, readProcedure, writeProcedure } from '../trpc/trpc.service'
import { NfeDistService } from './nfe-dist.service'

// Reaproveita permissão de cliente — quem edita cliente pode configurar NFe Dist.
const MODULE = 'cliente'

export function createNfeDistRouter(svc: NfeDistService) {
  return router({
    /**
     * Habilita/desabilita NFe Distribuição para o cliente e opcionalmente
     * vincula um certificado digital. Se habilitando pela primeira vez (sem
     * ultimoNsu), marca status como 'aguardando' pra próxima rodada do scheduler.
     */
    configurar: writeProcedure(MODULE)
      .input(z.object({
        clienteId: z.string(),
        enabled: z.boolean(),
        certificadoId: z.string().nullable().optional(),
      }))
      .mutation(async ({ input }) => {
        const atual = await prisma.cliente.findUnique({
          where: { id: input.clienteId },
          select: { nfeDistUltimoNsu: true },
        })
        const setAguardando = input.enabled && !atual?.nfeDistUltimoNsu

        await prisma.cliente.update({
          where: { id: input.clienteId },
          data: {
            nfeDistEnabled: input.enabled,
            nfeDistCertificadoId: input.certificadoId ?? null,
            ...(setAguardando ? { nfeDistSyncStatus: 'aguardando' } : {}),
          },
        })
        return { ok: true }
      }),

    /** Solicita sync manual — scheduler detecta no próximo poll. */
    solicitarSync: writeProcedure(MODULE)
      .input(z.object({ clienteId: z.string() }))
      .mutation(({ input }) => svc.solicitarSync(input.clienteId)),

    /**
     * Re-sincroniza a partir de um NSU específico (default 0 = histórico completo).
     * Útil pra recuperar notas que possam ter sido perdidas. Dedup automática
     * via SHA-256 evita duplicar no banco.
     */
    resincronizarDesdeNsu: writeProcedure(MODULE)
      .input(z.object({ clienteId: z.string(), nsu: z.string() }))
      .mutation(({ input }) => svc.resincronizarDesdeNsu(input.clienteId, input.nsu)),

    /** Clientes com NFe Distribuição habilitada — pro seletor da busca sob demanda. */
    listEnabled: readProcedure(MODULE)
      .query(async ({ ctx }) => {
        const rows = await prisma.cliente.findMany({
          where: {
            nfeDistEnabled: true,
            deletedAt: null,
            ...(ctx.isMaster ? {} : { empresaId: ctx.empresaId }),
          },
          select: {
            id: true, razaoSocial: true, nomeFantasia: true, documento: true,
            nfeDistUltimoNsu: true, nfeDistSyncedAt: true, nfeDistSyncStatus: true, nfeDistSyncRequestedAt: true,
          },
          orderBy: { razaoSocial: 'asc' },
        })
        return rows.map((c) => ({
          ...c,
          nfeDistUltimoNsu: c.nfeDistUltimoNsu != null ? c.nfeDistUltimoNsu.toString() : null,
        }))
      }),

    /** Progresso em tempo real (polling pela UI enquanto sync rodando). */
    getProgressoAtual: readProcedure(MODULE)
      .input(z.object({ clienteId: z.string() }))
      .query(({ input }) => svc.getProgressoAtual(input.clienteId)),

    /** Retorna estado atual da config NFe Dist do cliente. */
    status: readProcedure(MODULE)
      .input(z.object({ clienteId: z.string() }))
      .query(async ({ input }) => {
        const c = await prisma.cliente.findUnique({
          where: { id: input.clienteId },
          select: {
            id: true,
            nfeDistEnabled: true,
            nfeDistUltimoNsu: true,
            nfeDistSyncedAt: true,
            nfeDistSyncStatus: true,
            nfeDistSyncRequestedAt: true,
            nfeDistCertificadoId: true,
          },
        })
        if (!c) return null
        return {
          ...c,
          // BigInt → string pra serialização JSON
          nfeDistUltimoNsu: c.nfeDistUltimoNsu != null ? c.nfeDistUltimoNsu.toString() : null,
        }
      }),
  })
}
