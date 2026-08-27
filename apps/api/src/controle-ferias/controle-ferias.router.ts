import { z } from 'zod'
import { router, readProcedure, writeProcedure, deleteProcedure, readSubProcedure } from '../trpc/trpc.service'
import {
  criarFeriasPeriodoSchema, atualizarFeriasPeriodoSchema, criarFeriasEventoSchema,
  atualizarFeriasEventoSchema,
  listarFeriasPeriodosSchema, filtroRelatorioFeriasSchema as filtroRelatorioSchema,
} from '@saas/types'
import { ControleFeriasService } from './controle-ferias.service'
import { ControleFeriasReportsService } from './controle-ferias-reports.service'

const MODULE = 'controle-ferias'

// Sub-permissão única: `valores` libera a provisão em R$ (usa salário).
export function createControleFeriasRouter(
  service: ControleFeriasService,
  reports: ControleFeriasReportsService,
) {
  return router({
    listar: readProcedure(MODULE)
      .input(listarFeriasPeriodosSchema)
      .query(({ input, ctx }) => service.listar(input, ctx.empresaId)),

    getById: readProcedure(MODULE)
      .input(z.object({ id: z.string() }))
      .query(({ input, ctx }) => service.getById(input.id, ctx.empresaId)),

    criar: writeProcedure(MODULE)
      .input(criarFeriasPeriodoSchema)
      .mutation(({ input, ctx }) => service.criar(input, ctx.userId, ctx.empresaId)),

    atualizar: writeProcedure(MODULE)
      .input(atualizarFeriasPeriodoSchema)
      .mutation(({ input, ctx }) => service.atualizar(input, ctx.empresaId)),

    excluir: deleteProcedure(MODULE)
      .input(z.object({ id: z.string() }))
      .mutation(({ input, ctx }) => service.excluir(input.id, ctx.empresaId)),

    criarEvento: writeProcedure(MODULE)
      .input(criarFeriasEventoSchema)
      .mutation(({ input, ctx }) => service.criarEvento(input, ctx.userId, ctx.empresaId)),

    atualizarEvento: writeProcedure(MODULE)
      .input(atualizarFeriasEventoSchema)
      .mutation(({ input, ctx }) => service.atualizarEvento(input, ctx.empresaId)),

    excluirEvento: deleteProcedure(MODULE)
      .input(z.object({ id: z.string() }))
      .mutation(({ input }) => service.excluirEvento(input.id)),

    criarArquivo: writeProcedure(MODULE)
      .input(z.object({ periodoId: z.string(), nome: z.string().min(1), path: z.string().min(1) }))
      .mutation(({ input, ctx }) => service.criarArquivo(input, ctx.userId, ctx.empresaId)),

    excluirArquivo: deleteProcedure(MODULE)
      .input(z.object({ id: z.string() }))
      .mutation(({ input }) => service.excluirArquivo(input.id)),

    /** Saldo que o colaborador traz do período mais recente. */
    saldoAnterior: readProcedure(MODULE)
      .input(z.object({ colaboradorId: z.string().min(1) }))
      .query(({ input, ctx }) => service.saldoAnterior(input.colaboradorId, ctx.empresaId)),

    // ── Relatórios ──────────────────────────────────────────────
    reportPainel: readProcedure(MODULE)
      .input(filtroRelatorioSchema.optional())
      .query(({ input, ctx }) => reports.painel(ctx.empresaId, input ?? {})),

    reportVencimentos: readProcedure(MODULE)
      .input(filtroRelatorioSchema.optional())
      .query(({ input, ctx }) => reports.vencimentos(ctx.empresaId, input ?? {})),

    reportSaldos: readProcedure(MODULE)
      .input(filtroRelatorioSchema.optional())
      .query(({ input, ctx }) => reports.saldos(ctx.empresaId, input ?? {})),

    reportEscala: readProcedure(MODULE)
      .input(filtroRelatorioSchema.extend({ ano: z.coerce.number().int().min(2000).max(2100) }))
      .query(({ input, ctx }) => reports.escala(ctx.empresaId, input.ano, input)),

    reportPagamentos: readProcedure(MODULE)
      .input(filtroRelatorioSchema.extend({ ano: z.coerce.number().int().min(2000).max(2100).optional() }))
      .query(({ input, ctx }) => reports.pagamentos(ctx.empresaId, input.ano, input)),

    /** Valores exigem liberação explícita: expõe salário. */
    reportProvisao: readSubProcedure(MODULE, 'valores', 'Ver valores e provisão de férias')
      .input(filtroRelatorioSchema.optional())
      .query(({ input, ctx }) => reports.provisao(ctx.empresaId, input ?? {})),

    /** Corrige a admissão pelo painel de pendências, sem ir ao cadastro. */
    definirAdmissao: writeProcedure(MODULE)
      .input(z.object({
        colaboradorId: z.string().min(1),
        dataAdmissao: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida.').nullable(),
      }))
      .mutation(({ input, ctx }) => service.definirAdmissao(input.colaboradorId, input.dataAdmissao, ctx.empresaId)),

    /** Tira (ou devolve) o colaborador do controle de férias. */
    definirInclusao: writeProcedure(MODULE)
      .input(z.object({ colaboradorId: z.string().min(1), incluir: z.boolean() }))
      .mutation(({ input, ctx }) => service.definirInclusao(input.colaboradorId, input.incluir, ctx.empresaId)),

    /** Regera os avisos do sino na hora (o scheduler faz isso todo dia). */
    notificarVencimentos: writeProcedure(MODULE)
      .mutation(() => reports.notificarVencimentos()),

    listarColaboradores: readProcedure(MODULE)
      .input(z.object({ incluirInativos: z.boolean().optional() }).optional())
      .query(({ input, ctx }) => service.listarColaboradores(ctx.empresaId, !!input?.incluirInativos)),
  })
}
