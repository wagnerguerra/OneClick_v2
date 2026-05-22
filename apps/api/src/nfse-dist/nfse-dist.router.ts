import { z } from 'zod'
import { prisma } from '@saas/db'
import { router, readProcedure, writeProcedure } from '../trpc/trpc.service'
import { NfseDistService } from './nfse-dist.service'

// Reaproveita permissão de cliente — quem edita cliente pode configurar NFS-e Dist.
const MODULE = 'cliente'

export function createNfseDistRouter(svc: NfseDistService) {
  return router({
    /**
     * Habilita/desabilita NFS-e Distribuição (ADN) para o cliente e opcionalmente
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
          select: { nfseDistUltimoNsu: true },
        })
        const setAguardando = input.enabled && !atual?.nfseDistUltimoNsu

        await prisma.cliente.update({
          where: { id: input.clienteId },
          data: {
            nfseDistEnabled: input.enabled,
            nfseDistCertificadoId: input.certificadoId ?? null,
            ...(setAguardando ? { nfseDistSyncStatus: 'aguardando' } : {}),
          },
        })
        return { ok: true }
      }),

    /** Solicita sync manual — scheduler detecta no próximo poll. */
    solicitarSync: writeProcedure(MODULE)
      .input(z.object({ clienteId: z.string() }))
      .mutation(({ input }) => svc.solicitarSync(input.clienteId)),

    /** Re-sincroniza a partir de um NSU específico (0 = histórico completo). */
    resincronizarDesdeNsu: writeProcedure(MODULE)
      .input(z.object({ clienteId: z.string(), nsu: z.string() }))
      .mutation(({ input }) => svc.resincronizarDesdeNsu(input.clienteId, input.nsu)),

    /** Progresso em tempo real (polling pela UI). */
    getProgressoAtual: readProcedure(MODULE)
      .input(z.object({ clienteId: z.string() }))
      .query(({ input }) => svc.getProgressoAtual(input.clienteId)),

    /** Retorna estado atual da config NFS-e Dist do cliente. */
    status: readProcedure(MODULE)
      .input(z.object({ clienteId: z.string() }))
      .query(async ({ input }) => {
        const c = await prisma.cliente.findUnique({
          where: { id: input.clienteId },
          select: {
            id: true,
            nfseDistEnabled: true,
            nfseDistUltimoNsu: true,
            nfseDistSyncedAt: true,
            nfseDistSyncStatus: true,
            nfseDistSyncRequestedAt: true,
            nfseDistCertificadoId: true,
          },
        })
        if (!c) return null
        return {
          ...c,
          // BigInt → string pra serialização JSON
          nfseDistUltimoNsu: c.nfseDistUltimoNsu != null ? c.nfseDistUltimoNsu.toString() : null,
        }
      }),
  })
}
