import { z } from 'zod'
import { router, protectedProcedure, publicProcedure } from '../trpc/trpc.service'
import { BiService } from './bi.service'
import {
  biClienteIdSchema, biAnoSchema, biFaturamentoSerieSchema, biFaturamentoRefreshSchema,
  biBalanceteMatrizSchema, biBalanceteKpisSchema, biBalanceteAnaliseSchema,
  biBalanceteRefreshSchema, biExcluirPeriodoSchema, biSimularSchema,
  biCategoriasCopiarSchema, biContaIgnoradaGetSchema, biContaIgnoradaSaveSchema,
  biRegraCalculoGetSchema, biRegraCalculoSaveSchema, biLinkPublicoSchema,
  biPublicTokenSchema, biCategoriaLimparSchema, biBackupSchema,
} from '@saas/types'

// ══════════════════════════════════════════════════════════════
// Router BI autenticado
// ══════════════════════════════════════════════════════════════
export function createBiRouter(biService: BiService) {
  return router({
    // Categorias globais (filtro)
    categorias: protectedProcedure
      .query(() => biService.getCategorias()),

    // ── Faturamento ──
    faturamentoDisponivel: protectedProcedure
      .input(biClienteIdSchema)
      .query(({ input }) => biService.faturamentoDisponivel(input.clienteId)),

    faturamentoSerie: protectedProcedure
      .input(biFaturamentoSerieSchema)
      .query(({ input }) => biService.faturamentoSerie(input.clienteId, input.ano, input.fonte)),

    faturamentoRefresh: protectedProcedure
      .input(biFaturamentoRefreshSchema)
      .mutation(({ input }) => biService.faturamentoRefresh(input.clienteId, input.ano)),

    faturamentoRefreshStatus: protectedProcedure
      .input(biAnoSchema)
      .query(({ input }) => biService.faturamentoRefreshStatus(input.clienteId, input.ano)),

    // ── Balancete ──
    balanceteCategoriasNivel4: protectedProcedure
      .input(biClienteIdSchema)
      .query(({ input }) => biService.balanceteCategoriasNivel4(input.clienteId)),

    balanceteMatriz: protectedProcedure
      .input(biBalanceteMatrizSchema)
      .query(({ input }) => biService.balanceteMatriz(input.clienteId, input.ano, input.useParent)),

    balanceteKpis: protectedProcedure
      .input(biBalanceteKpisSchema)
      .query(({ input }) => biService.balanceteKpis(input.clienteId, input.ano, input.meses)),

    balanceteAnalise: protectedProcedure
      .input(biBalanceteAnaliseSchema)
      .query(({ input }) => biService.balanceteAnalise(input.clienteId, input.ano, input.meses)),

    balanceteDiagnostico: protectedProcedure
      .input(biAnoSchema)
      .query(({ input }) => biService.balanceteDiagnostico(input.clienteId, input.ano)),

    balanceteRefresh: protectedProcedure
      .input(biBalanceteRefreshSchema)
      .mutation(({ input }) => biService.balanceteRefresh(input.clienteId, input.ano, input.force)),

    balanceteRefreshPeriodo: protectedProcedure
      .input(z.object({
        clienteId: z.string(),
        anoInicio: z.coerce.number(),
        mesInicio: z.coerce.number().min(1).max(12),
        anoFim: z.coerce.number(),
        mesFim: z.coerce.number().min(1).max(12),
        substituirExistentes: z.coerce.boolean().default(true),
      }))
      .mutation(({ input }) => biService.balanceteRefreshPeriodo(
        input.clienteId, input.anoInicio, input.mesInicio, input.anoFim, input.mesFim, input.substituirExistentes,
      )),

    balanceteRefreshStatus: protectedProcedure
      .input(biAnoSchema)
      .query(({ input }) => biService.balanceteRefreshStatus(input.clienteId, input.ano)),

    balanceteRefreshStatusByRange: protectedProcedure
      .input(z.object({
        clienteId: z.string(),
        refInicio: z.coerce.number(),
        refFim: z.coerce.number(),
      }))
      .query(({ input }) => biService.balanceteRefreshStatusByRange(input.clienteId, input.refInicio, input.refFim)),

    balanceteExcluirPeriodo: protectedProcedure
      .input(biExcluirPeriodoSchema)
      .mutation(({ input }) => biService.balanceteExcluirPeriodo(input.clienteId, input.ano, input.mesInicio, input.mesFim)),

    balanceteSimular: protectedProcedure
      .input(biSimularSchema)
      .query(({ input }) => biService.balanceteSimular(input.clienteId, input.ref)),

    // ── Categorias — Copiar / Backup / Restaurar / Limpar ──
    categoriasCopiar: protectedProcedure
      .input(biCategoriasCopiarSchema)
      .mutation(({ input }) => biService.categoriasCopiar(input.documentoOrigem, input.documentoDestino)),

    categoriasBackup: protectedProcedure
      .input(biBackupSchema)
      .query(({ input }) => biService.categoriasBackup(input.documento)),

    categoriasRestaurar: protectedProcedure
      .input(z.object({
        documento: z.string(),
        categorias: z.array(z.record(z.unknown())),
      }))
      .mutation(({ input }) => biService.categoriasRestaurar(input.documento, input.categorias)),

    importarBackupCompleto: protectedProcedure
      .input(z.object({
        documento: z.string(),
        backup: z.record(z.unknown()),
      }))
      .mutation(({ input }) => biService.importarBackupCompleto(input.documento, input.backup)),

    categoriasLimpar: protectedProcedure
      .input(biCategoriaLimparSchema)
      .mutation(({ input }) => biService.categoriasLimpar(input.documento)),

    categoriasLimparTudo: protectedProcedure
      .mutation(() => biService.categoriasLimparTudo()),

    limparTudoCliente: protectedProcedure
      .input(z.object({ clienteId: z.string() }))
      .mutation(({ input }) => biService.limparTudoCliente(input.clienteId)),

    // ── KPI — Contas ignoradas ──
    kpiContasIgnoradasGet: protectedProcedure
      .input(biContaIgnoradaGetSchema)
      .query(({ input }) => biService.kpiContasIgnoradasGet(input.clienteId, input.tipoKpi)),

    kpiContasIgnoradasSave: protectedProcedure
      .input(biContaIgnoradaSaveSchema)
      .mutation(({ input }) => biService.kpiContasIgnoradasSave(input.clienteId, input.tipoKpi, input.contas)),

    // ── KPI — Contas incluídas (seleção do card) ──
    kpiListarContasDisponiveis: protectedProcedure
      .input(z.object({ clienteId: z.string(), tipoKpi: z.string(), ano: z.coerce.number() }))
      .query(({ input }) => biService.kpiListarContasDisponiveis(input.clienteId, input.tipoKpi, input.ano)),

    kpiContasIncluidasGet: protectedProcedure
      .input(z.object({ clienteId: z.string(), tipoKpi: z.string() }))
      .query(({ input }) => biService.kpiContasIncluidasGet(input.clienteId, input.tipoKpi)),

    kpiContasIncluidasSave: protectedProcedure
      .input(z.object({ clienteId: z.string(), tipoKpi: z.string(), contas: z.array(z.string()) }))
      .mutation(({ input }) => biService.kpiContasIncluidasSave(input.clienteId, input.tipoKpi, input.contas)),

    // ── KPI — Regras de cálculo ──
    kpiRegraCalculoGet: protectedProcedure
      .input(biRegraCalculoGetSchema)
      .query(({ input }) => biService.kpiRegraCalculoGet(input.clienteId, input.tipoKpi)),

    kpiRegraCalculoSave: protectedProcedure
      .input(biRegraCalculoSaveSchema)
      .mutation(({ input }) => biService.kpiRegraCalculoSave(input.clienteId, input.tipoKpi, input.regra)),

    // ── Link público ──
    linkPublico: protectedProcedure
      .input(biLinkPublicoSchema)
      .mutation(({ input }) => biService.linkPublicoGenerate(input.clienteId)),
  })
}

// ══════════════════════════════════════════════════════════════
// Router BI público (sem autenticação — resolve por token)
// ══════════════════════════════════════════════════════════════
export function createBiPublicRouter(biService: BiService) {
  return router({
    context: publicProcedure
      .input(biPublicTokenSchema)
      .query(({ input }) => biService.resolverToken(input.token)),

    faturamentoDisponivel: publicProcedure
      .input(biPublicTokenSchema)
      .query(async ({ input }) => {
        const cliente = await biService.resolverToken(input.token)
        return biService.faturamentoDisponivel(cliente.id)
      }),

    anosDisponiveis: publicProcedure
      .input(biPublicTokenSchema)
      .query(async ({ input }) => {
        const cliente = await biService.resolverToken(input.token)
        return biService.anosComBalancete(cliente.id)
      }),

    faturamentoSerie: publicProcedure
      .input(biPublicTokenSchema.merge(z.object({ ano: z.coerce.number(), fonte: z.string().default('sci') })))
      .query(async ({ input }) => {
        const cliente = await biService.resolverToken(input.token)
        return biService.faturamentoSerie(cliente.id, input.ano, input.fonte)
      }),

    balanceteCategoriasNivel4: publicProcedure
      .input(biPublicTokenSchema)
      .query(async ({ input }) => {
        const cliente = await biService.resolverToken(input.token)
        return biService.balanceteCategoriasNivel4(cliente.id)
      }),

    balanceteMatriz: publicProcedure
      .input(biPublicTokenSchema.merge(z.object({ ano: z.coerce.number(), useParent: z.coerce.boolean().default(false) })))
      .query(async ({ input }) => {
        const cliente = await biService.resolverToken(input.token)
        return biService.balanceteMatriz(cliente.id, input.ano, input.useParent)
      }),

    balanceteKpis: publicProcedure
      .input(biPublicTokenSchema.merge(z.object({ ano: z.coerce.number(), meses: z.string().optional() })))
      .query(async ({ input }) => {
        const cliente = await biService.resolverToken(input.token)
        return biService.balanceteKpis(cliente.id, input.ano, input.meses)
      }),

    balanceteAnalise: publicProcedure
      .input(biPublicTokenSchema.merge(z.object({ ano: z.coerce.number(), meses: z.string().optional() })))
      .query(async ({ input }) => {
        const cliente = await biService.resolverToken(input.token)
        return biService.balanceteAnalise(cliente.id, input.ano, input.meses)
      }),

    kpiContasIgnoradasGet: publicProcedure
      .input(biPublicTokenSchema.merge(z.object({ tipoKpi: z.string() })))
      .query(async ({ input }) => {
        const cliente = await biService.resolverToken(input.token)
        return biService.kpiContasIgnoradasGet(cliente.id, input.tipoKpi)
      }),

    kpiRegraCalculoGet: publicProcedure
      .input(biPublicTokenSchema.merge(z.object({ tipoKpi: z.string() })))
      .query(async ({ input }) => {
        const cliente = await biService.resolverToken(input.token)
        return biService.kpiRegraCalculoGet(cliente.id, input.tipoKpi)
      }),
  })
}
