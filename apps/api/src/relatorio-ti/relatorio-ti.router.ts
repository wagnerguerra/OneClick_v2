import { z } from 'zod'
import { router, readProcedure, writeSubOrLiderProcedure } from '../trpc/trpc.service'
import {
  criarRelatorioSchema, atualizarRelatorioSchema,
  listarRelatoriosMesSchema, listarRelatoriosDiaSchema,
} from '@saas/types'
import { RelatorioTiService } from './relatorio-ti.service'

/**
 * Relatórios da TI.
 *
 * LER é de todos que têm o módulo — o painel existe para a equipe acompanhar o
 * histórico. As ações que mudam algo pedem sub-permissão, com uma exceção que
 * é a regra do módulo: quem LIDERA a área não precisa de nenhuma marcação, e
 * é o que `writeSubOrLiderProcedure` já resolve.
 */
const MODULE = 'relatorios-ti'

export function createRelatorioTiRouter(service: RelatorioTiService) {
  return router({
    // ── Leitura (todos que têm o módulo) ──
    mes: readProcedure(MODULE)
      .input(listarRelatoriosMesSchema)
      .query(({ input, ctx }) => service.mes(input.ano, input.mes, ctx.empresaId)),

    dia: readProcedure(MODULE)
      .input(listarRelatoriosDiaSchema)
      .query(({ input, ctx }) => service.dia(input.data, ctx.empresaId)),

    equipe: readProcedure(MODULE)
      .query(({ ctx }) => service.equipe(ctx.empresaId)),

    config: readProcedure(MODULE)
      .query(({ ctx }) => service.getConfig(ctx.empresaId)),

    /** A tela usa isto para decidir o que mostrar — o servidor decide de novo em cada ação. */
    souLider: readProcedure(MODULE)
      .query(({ ctx }) => service.ehLiderDaEquipe(ctx.userId, ctx.empresaId)),

    // ── Rotina da equipe ──
    criar: writeSubOrLiderProcedure(MODULE, 'postar', 'Publicar o proprio relatorio')
      .input(criarRelatorioSchema)
      .mutation(({ input, ctx }) => service.criar(input, ctx.userId, ctx.empresaId)),

    atualizar: writeSubOrLiderProcedure(MODULE, 'postar', 'Editar o proprio relatorio')
      .input(atualizarRelatorioSchema)
      .mutation(async ({ input, ctx }) => {
        const lider = await service.ehLiderDaEquipe(ctx.userId, ctx.empresaId)
        return service.atualizar(input, ctx.userId, lider || (ctx.isMaster ?? false))
      }),

    remover: writeSubOrLiderProcedure(MODULE, 'postar', 'Excluir o proprio relatorio')
      .input(z.object({ id: z.string().min(1) }))
      .mutation(async ({ input, ctx }) => {
        const lider = await service.ehLiderDaEquipe(ctx.userId, ctx.empresaId)
        return service.remover(input.id, ctx.userId, lider || (ctx.isMaster ?? false))
      }),

    /** Envios já feitos num dia — o painel mostra quem mandou e quando. */
    enviosDoDia: readProcedure(MODULE)
      .input(listarRelatoriosDiaSchema)
      .query(({ input, ctx }) => service.enviosDoDia(input.data, ctx.empresaId)),

    // ── Consolidar e enviar (liderança) ──
    consolidarDia: writeSubOrLiderProcedure(MODULE, 'gerar_pdf', 'Consolidar o dia num PDF')
      .input(listarRelatoriosDiaSchema)
      .mutation(({ input, ctx }) => service.consolidarDia(input.data, ctx.empresaId)),

    enviarDiretoria: writeSubOrLiderProcedure(MODULE, 'enviar_diretoria', 'Enviar o consolidado a diretoria')
      .input(z.object({
        data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        /** Em branco, usa os destinatários da configuração. */
        destinatarios: z.array(z.string().email()).optional(),
        assunto: z.string().max(200).optional(),
        mensagem: z.string().max(4000).optional(),
      }))
      .mutation(({ input, ctx }) => service.enviarDiretoria(input, ctx.userId, ctx.empresaId)),

    // ── Configuração ──
    salvarConfig: writeSubOrLiderProcedure(MODULE, 'gerenciar_config', 'Configurar os relatorios da TI')
      .input(z.object({
        areaId: z.string().optional().nullable(),
        destinatariosIds: z.array(z.string()).optional(),
        destinatariosEmails: z.array(z.string().email()).optional(),
        assuntoPadrao: z.string().max(200).optional().nullable(),
      }))
      .mutation(({ input, ctx }) => service.salvarConfig(input, ctx.empresaId)),
  })
}
