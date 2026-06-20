import { z } from 'zod'
import { router, readProcedure, writeSubProcedure, readSubProcedure } from '../trpc/trpc.service'
import {
  salvarBeneficioConfigSchema, salvarFichaBeneficioSchema, abrirCompetenciaSchema,
  salvarApontamentoSchema, salvarSaldoVtSchema, salvarCartaoAvulsoSchema,
} from '@saas/types'
import { BeneficioService } from './beneficio.service'

const MODULE = 'beneficios'
const GERIR = 'gerir_beneficios'
const LANCAR = 'lancar_apontamentos'

export function createBeneficioRouter(beneficioService: BeneficioService) {
  return router({
    // ── Geral ──
    listEmpresas: readProcedure(MODULE)
      .query(({ ctx }) => beneficioService.listEmpresas(ctx.empresaId, ctx.isMaster)),

    // ── Config (responsável) ──
    getConfig: readProcedure(MODULE)
      .input(z.object({ empresaId: z.string() }))
      .query(({ input }) => beneficioService.getConfig(input.empresaId)),
    saveConfig: writeSubProcedure(MODULE, GERIR, 'Gerir benefícios')
      .input(salvarBeneficioConfigSchema)
      .mutation(({ input }) => beneficioService.saveConfig(input)),

    // ── Fichas de benefício ──
    listFichas: readSubProcedure(MODULE, GERIR, 'Gerir benefícios')
      .input(z.object({ empresaId: z.string() }))
      .query(({ input }) => beneficioService.listFichas(input.empresaId)),
    saveFicha: writeSubProcedure(MODULE, GERIR, 'Gerir benefícios')
      .input(salvarFichaBeneficioSchema)
      .mutation(({ input }) => beneficioService.saveFicha(input)),

    // ── Competências (responsável) ──
    listCompetencias: readProcedure(MODULE)
      .input(z.object({ empresaId: z.string() }))
      .query(({ input }) => beneficioService.listCompetencias(input.empresaId)),
    getCompetencia: readProcedure(MODULE)
      .input(z.object({ id: z.string() }))
      .query(({ input }) => beneficioService.getCompetencia(input.id)),
    abrirCompetencia: writeSubProcedure(MODULE, GERIR, 'Gerir benefícios')
      .input(abrirCompetenciaSchema)
      .mutation(({ input, ctx }) => beneficioService.abrirCompetencia(input, ctx.userId)),
    reabrirCompetencia: writeSubProcedure(MODULE, GERIR, 'Gerir benefícios')
      .input(z.object({ id: z.string() }))
      .mutation(({ input }) => beneficioService.reabrirCompetencia(input.id)),
    notificarLideres: writeSubProcedure(MODULE, GERIR, 'Gerir benefícios')
      .input(z.object({ id: z.string() }))
      .mutation(({ input }) => beneficioService.notificarLideres(input.id)),
    cobrarPendentes: writeSubProcedure(MODULE, GERIR, 'Gerir benefícios')
      .input(z.object({ id: z.string() }))
      .mutation(({ input }) => beneficioService.cobrarPendentes(input.id)),

    // ── Apontamentos (líder do setor) ──
    listApontamentos: readSubProcedure(MODULE, LANCAR, 'Lançar apontamentos')
      .input(z.object({ competenciaId: z.string() }))
      .query(({ input, ctx }) => beneficioService.listApontamentos(input.competenciaId, ctx)),
    upsertApontamento: writeSubProcedure(MODULE, LANCAR, 'Lançar apontamentos')
      .input(salvarApontamentoSchema)
      .mutation(({ input, ctx }) => beneficioService.upsertApontamento(input, ctx)),

    // ── Cartões avulsos (responsável) ──
    listCartoes: readSubProcedure(MODULE, GERIR, 'Gerir benefícios')
      .input(z.object({ empresaId: z.string() }))
      .query(({ input }) => beneficioService.listCartoes(input.empresaId)),
    saveCartao: writeSubProcedure(MODULE, GERIR, 'Gerir benefícios')
      .input(salvarCartaoAvulsoSchema)
      .mutation(({ input }) => beneficioService.saveCartao(input)),
    deleteCartao: writeSubProcedure(MODULE, GERIR, 'Gerir benefícios')
      .input(z.object({ id: z.string() }))
      .mutation(({ input }) => beneficioService.deleteCartao(input.id)),

    // ── Saldo do VT (responsável) ──
    setVtSaldo: writeSubProcedure(MODULE, GERIR, 'Gerir benefícios')
      .input(salvarSaldoVtSchema)
      .mutation(({ input }) => beneficioService.setVtSaldo(input)),

    // ── Cálculo / fechamento (responsável) ──
    calcularRecargas: readSubProcedure(MODULE, GERIR, 'Gerir benefícios')
      .input(z.object({ competenciaId: z.string() }))
      .query(({ input }) => beneficioService.calcularRecargas(input.competenciaId)),
    fecharCompetencia: writeSubProcedure(MODULE, GERIR, 'Gerir benefícios')
      .input(z.object({ id: z.string() }))
      .mutation(({ input, ctx }) => beneficioService.fecharCompetencia(input.id, ctx.userId)),
  })
}
