import { z } from 'zod'
import { prisma } from '@saas/db'
import { router, readProcedure, writeProcedure } from '../trpc/trpc.service'
import { DriveSyncService } from './drive-sync.service'
import { nfseWhereDoCliente, resolverCnpjDoCliente, nfseWhereFromCnpj } from '../nfse/nfse-cliente.filter'

const MODULE = 'cliente'  // reaproveita permissão de cliente: quem edita cliente pode vincular pasta

export function createDriveSyncRouter(svc: DriveSyncService) {
  return router({
    /** Info da conta conectada (SA email ou conta OAuth autorizada). Usado pela UI. */
    info: readProcedure(MODULE)
      .query(async () => {
        try {
          const { email, mode } = await svc.getAccountInfo()
          return { email, mode, configurado: true }
        } catch (e) {
          return { email: null, mode: null, configurado: false, erro: (e as Error).message }
        }
      }),

    vincularPasta: writeProcedure(MODULE)
      .input(z.object({
        clienteId: z.string(),
        folderInput: z.string().min(10),
      }))
      .mutation(({ input }) => svc.vincularPasta(input)),

    desvincularPasta: writeProcedure(MODULE)
      .input(z.object({ clienteId: z.string() }))
      .mutation(({ input }) => svc.desvincularPasta(input.clienteId)),

    // ── Pasta Local (Launcher Electron) ────────────────────
    configurarPastaLocal: writeProcedure(MODULE)
      .input(z.object({
        clienteId: z.string(),
        path:      z.string().default(''),
        enabled:   z.boolean(),
      }))
      .mutation(({ input }) => svc.configurarPastaLocal(input)),

    listarConfigsLocais: readProcedure(MODULE)
      .query(() => svc.listarConfigsLocais()),

    solicitarSyncLocal: writeProcedure(MODULE)
      .input(z.object({ clienteId: z.string() }))
      .mutation(({ input }) => svc.solicitarSyncLocal(input.clienteId)),

    sincronizarCliente: writeProcedure(MODULE)
      .input(z.object({ clienteId: z.string() }))
      .mutation(({ input, ctx }) => svc.sincronizarCliente(input.clienteId, {
        iniciadoPor: ctx.userId,
        tipo: 'manual',
      })),

    sincronizarTodos: writeProcedure(MODULE)
      .mutation(({ ctx }) => svc.sincronizarTodos({ iniciadoPor: ctx.userId, tipo: 'manual' })),

    listarLogs: readProcedure(MODULE)
      .input(z.object({ clienteId: z.string(), limit: z.number().int().min(1).max(100).optional() }))
      .query(({ input }) => svc.listarLogs(input.clienteId, input.limit ?? 20)),

    getLog: readProcedure(MODULE)
      .input(z.object({ id: z.string() }))
      .query(({ input }) => svc.getLog(input.id)),

    /** Polling do progresso enquanto sync está rodando. Retorna null se não houver running. */
    getProgressoAtual: readProcedure(MODULE)
      .input(z.object({ clienteId: z.string() }))
      .query(({ input }) => svc.getProgressoAtual(input.clienteId)),

    /**
     * Totais de notas baixadas via SEFAZ/ADN — usado nos indicadores fiscais
     * da aba "Resumo". Conta apenas notas que vieram pelas integrações automáticas
     * (Drive sync, pasta local, SEFAZ NFe e ADN NFS-e), todas vinculadas ao cliente.
     */
    getResumoFiscal: readProcedure(MODULE)
      .input(z.object({
        clienteId: z.string(),
        // Período opcional (ISO) — filtra as contagens por dataEmissao das notas.
        dataInicio: z.string().optional(),
        dataFim: z.string().optional(),
      }))
      .query(async ({ input }) => {
        // NFS-e da pasta do cliente resolve por CNPJ (prestador OU tomador); NFe
        // segue pelo vínculo físico (clienteId). Separa Prestadas (o CNPJ é o
        // prestador) × Tomadas (o CNPJ é o tomador). Ver nfse-cliente.filter.
        const cnpj = await resolverCnpjDoCliente(input.clienteId)
        const nfseWhere = nfseWhereFromCnpj(input.clienteId, cnpj)
        const periodo: Record<string, Date> = {}
        if (input.dataInicio) periodo.gte = new Date(input.dataInicio)
        if (input.dataFim) periodo.lte = new Date(input.dataFim)
        const noPeriodo = (input.dataInicio || input.dataFim) ? { dataEmissao: periodo } : {}
        const [totalNfe, totalNfse, nfsePrestadas, nfseTomadas] = await Promise.all([
          prisma.danfe.count({ where: { clienteId: input.clienteId, ...noPeriodo } }),
          prisma.notaServicoImportada.count({ where: { ...nfseWhere, ...noPeriodo } }),
          cnpj ? prisma.notaServicoImportada.count({ where: { prestadorCnpj: cnpj, ...noPeriodo } }) : Promise.resolve(0),
          cnpj ? prisma.notaServicoImportada.count({ where: { tomadorCnpjCpf: cnpj, ...noPeriodo } }) : Promise.resolve(0),
        ])
        return { totalNfe, totalNfse, nfsePrestadas, nfseTomadas }
      }),

    /**
     * Lista competências (YYYY-MM) que têm notas vinculadas ao cliente, com count
     * por tipo. Usado na /danfe/galeria pra carregar notas sob demanda (só a
     * competência atual no load, demais quando o user seleciona).
     */
    listCompetenciasFiscais: readProcedure(MODULE)
      .input(z.object({ clienteId: z.string() }))
      .query(async ({ input }) => {
        // NFe pelo vínculo físico (clienteId); NFS-e por CNPJ (prestador OU
        // tomador) via nfseWhereDoCliente.
        const danfeWhere = input.clienteId === '__null__' ? { clienteId: null } : { clienteId: input.clienteId }
        const nfseWhere = await nfseWhereDoCliente(input.clienteId)
        const [danfeDates, nfseDates] = await Promise.all([
          prisma.danfe.findMany({ where: danfeWhere, select: { dataEmissao: true } }),
          prisma.notaServicoImportada.findMany({ where: nfseWhere, select: { dataEmissao: true } }),
        ])
        const map = new Map<string, { ym: string; totalNfe: number; totalNfse: number }>()
        function ym(d: Date): string {
          return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
        }
        for (const { dataEmissao } of danfeDates) {
          const key = ym(dataEmissao)
          const e = map.get(key) ?? { ym: key, totalNfe: 0, totalNfse: 0 }
          e.totalNfe++
          map.set(key, e)
        }
        for (const { dataEmissao } of nfseDates) {
          const key = ym(dataEmissao)
          const e = map.get(key) ?? { ym: key, totalNfe: 0, totalNfse: 0 }
          e.totalNfse++
          map.set(key, e)
        }
        return Array.from(map.values()).sort((a, b) => b.ym.localeCompare(a.ym))
      }),
  })
}
