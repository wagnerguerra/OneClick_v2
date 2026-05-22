import { z } from 'zod'
import { router, protectedProcedure, writeProcedure } from '../trpc/trpc.service'
import { prisma } from '@saas/db'
import {
  upsertRecorrenciaSchema,
  createNotificacaoRegraSchema,
  updateNotificacaoRegraSchema,
} from '@saas/types'
import { RecorrenciaScheduler } from './recorrencia.scheduler'
import { NotificacaoService } from './notificacao.service'

const MODULE = 'servicos'

export function createNotificacaoRouter(
  recorrenciaScheduler: RecorrenciaScheduler,
  notificacaoService: NotificacaoService,
) {
  return router({
    // ── Recorrência ─────────────────────────────────────────
    getRecorrencia: protectedProcedure
      .input(z.object({ servicoId: z.string() }))
      .query(({ input }) =>
        prisma.servicoRecorrencia.findUnique({ where: { servicoId: input.servicoId } }),
      ),

    upsertRecorrencia: writeProcedure(MODULE)
      .input(upsertRecorrenciaSchema)
      .mutation(async ({ input, ctx }) => {
        const empresaId = ctx.empresaId ?? null
        const agora = new Date()
        // Pré-carrega feriados do ano corrente + próximo pra respeitar ajuste de vencimento.
        const extrasNaoUteis = await recorrenciaScheduler.carregarDiasNaoUteis([
          agora.getFullYear(),
          agora.getFullYear() + 1,
        ])
        // Pré-calcula próxima execução usando o helper do scheduler
        const proxima = recorrenciaScheduler.calcularProximaExecucao(
          {
            frequencia: input.frequencia,
            ancoragem: input.ancoragem,
            valorAncoragem: input.valorAncoragem,
            competenciaOffset: input.competenciaOffset,
            modoPersonalizado: input.modoPersonalizado,
            diasDoMes: input.diasDoMes,
            mesesDoAno: input.mesesDoAno,
            ajusteVencimento: input.ajusteVencimento,
          },
          agora,
          extrasNaoUteis,
        )
        return prisma.servicoRecorrencia.upsert({
          where: { servicoId: input.servicoId },
          create: {
            servicoId: input.servicoId,
            ativa: input.ativa,
            frequencia: input.frequencia,
            ancoragem: input.ancoragem,
            valorAncoragem: input.valorAncoragem,
            competenciaOffset: input.competenciaOffset,
            responsavelPadrao: input.responsavelPadrao ?? null,
            modoPersonalizado: input.modoPersonalizado,
            diasDoMes: input.diasDoMes,
            mesesDoAno: input.mesesDoAno,
            ajusteVencimento: input.ajusteVencimento,
            proximaExecucao: proxima,
            empresaId,
          },
          update: {
            ativa: input.ativa,
            frequencia: input.frequencia,
            ancoragem: input.ancoragem,
            valorAncoragem: input.valorAncoragem,
            competenciaOffset: input.competenciaOffset,
            responsavelPadrao: input.responsavelPadrao ?? null,
            modoPersonalizado: input.modoPersonalizado,
            diasDoMes: input.diasDoMes,
            mesesDoAno: input.mesesDoAno,
            ajusteVencimento: input.ajusteVencimento,
            proximaExecucao: proxima,
          },
        })
      }),

    // Preview de próximas execuções — usado pela UI quando o usuário monta
    // a regra (composta ou simples) e quer ver datas concretas antes de salvar.
    previewRecorrencia: protectedProcedure
      .input(upsertRecorrenciaSchema.omit({ servicoId: true, responsavelPadrao: true }).extend({
        quantidade: z.coerce.number().int().min(1).max(12).default(5),
      }))
      .query(async ({ input }) => {
        const agora = new Date()
        const extrasNaoUteis = await recorrenciaScheduler.carregarDiasNaoUteis([
          agora.getFullYear(),
          agora.getFullYear() + 1,
        ])
        const datas = recorrenciaScheduler.proximasExecucoes(
          {
            frequencia: input.frequencia,
            ancoragem: input.ancoragem,
            valorAncoragem: input.valorAncoragem,
            competenciaOffset: input.competenciaOffset,
            modoPersonalizado: input.modoPersonalizado,
            diasDoMes: input.diasDoMes,
            mesesDoAno: input.mesesDoAno,
            ajusteVencimento: input.ajusteVencimento,
          },
          agora,
          input.quantidade,
          extrasNaoUteis,
        )
        return { datas: datas.map(d => d.toISOString()) }
      }),

    deleteRecorrencia: writeProcedure(MODULE)
      .input(z.object({ servicoId: z.string() }))
      .mutation(({ input }) =>
        prisma.servicoRecorrencia.delete({ where: { servicoId: input.servicoId } }).catch(() => null),
      ),

    // ── Regras de notificação ───────────────────────────────
    listRegras: protectedProcedure
      .input(z.object({ servicoId: z.string() }))
      .query(({ input }) =>
        prisma.servicoNotificacaoRegra.findMany({
          where: { servicoId: input.servicoId },
          orderBy: { createdAt: 'asc' },
        }),
      ),

    createRegra: writeProcedure(MODULE)
      .input(createNotificacaoRegraSchema)
      .mutation(async ({ input, ctx }) =>
        prisma.servicoNotificacaoRegra.create({
          data: {
            servicoId: input.servicoId,
            ativa: input.ativa,
            evento: input.evento,
            canal: input.canal,
            destinatariosTipo: input.destinatariosTipo,
            destinatariosCustom: input.destinatariosCustom,
            assunto: input.assunto,
            corpoHtml: input.corpoHtml,
            antecedenciaHoras: input.antecedenciaHoras ?? null,
            empresaId: ctx.empresaId ?? null,
          },
        }),
      ),

    updateRegra: writeProcedure(MODULE)
      .input(updateNotificacaoRegraSchema)
      .mutation(({ input }) => {
        const { id, ...rest } = input
        return prisma.servicoNotificacaoRegra.update({
          where: { id },
          data: rest as any,
        })
      }),

    deleteRegra: writeProcedure(MODULE)
      .input(z.object({ id: z.string() }))
      .mutation(({ input }) =>
        prisma.servicoNotificacaoRegra.delete({ where: { id: input.id } }),
      ),

    // ── Teste de envio ──────────────────────────────────────
    testarEnvio: writeProcedure(MODULE)
      .input(z.object({
        para: z.string().email(),
        assunto: z.string().min(1),
        corpoHtml: z.string().min(1),
      }))
      .mutation(async ({ input }) => {
        const ok = await notificacaoService.testarEnvio(input)
        return { ok }
      }),

    // ── Logs (auditoria) ────────────────────────────────────
    listLogs: protectedProcedure
      .input(z.object({
        servicoId: z.string().optional(),
        execucaoId: z.string().optional(),
        limit: z.coerce.number().int().min(1).max(200).optional(),
      }))
      .query(async ({ input }) => {
        if (!input.servicoId && !input.execucaoId) return []
        return prisma.servicoNotificacaoLog.findMany({
          where: {
            ...(input.execucaoId ? { execucaoId: input.execucaoId } : {}),
            ...(input.servicoId ? { regra: { servicoId: input.servicoId } } : {}),
          },
          orderBy: { sentAt: 'desc' },
          take: input.limit ?? 50,
          include: { regra: { select: { evento: true, destinatariosTipo: true } } },
        })
      }),
  })
}
