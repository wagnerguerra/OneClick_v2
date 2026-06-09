import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { prisma } from '@saas/db'
import { router, readProcedure, writeProcedure, deleteProcedure, publicProcedure, writeSubProcedure, deleteSubProcedure, protectedProcedure } from '../trpc/trpc.service'
import { createOrcamentoSchema, updateOrcamentoSchema, listOrcamentoSchema, createOrcamentoItemSchema, updateOrcamentoItemSchema } from '@saas/types'
import { OrcamentoService } from './orcamento.service'

const MODULE = 'orcamentos'

export function createOrcamentoRouter(orcamentoService: OrcamentoService) {
  return router({
    // ── CRUD ────────────────────────────────────────────────
    list: readProcedure(MODULE)
      .input(listOrcamentoSchema)
      .query(({ input, ctx }) => orcamentoService.list(input, ctx.isMaster ?? false, ctx.empresaId, ctx.userId)),

    getById: readProcedure(MODULE)
      .input(z.object({ id: z.string() }))
      .query(({ input, ctx }) => orcamentoService.getById(input.id, { userId: ctx.userId, isMaster: ctx.isMaster })),

    create: writeProcedure(MODULE)
      .input(createOrcamentoSchema)
      .mutation(({ input, ctx }) => orcamentoService.create(input, ctx.userId, ctx.empresaId)),

    update: writeProcedure(MODULE)
      .input(z.object({ id: z.string(), data: updateOrcamentoSchema }))
      .mutation(({ input, ctx }) => orcamentoService.update(input.id, input.data, ctx.userId)),

    // Endpoint dedicado para texto interno — funciona mesmo em orcamentos
    // congelados (APROVADO+). E uma anotacao interna, nao altera escopo/valores.
    updateTextoInterno: writeProcedure(MODULE)
      .input(z.object({ id: z.string(), textoInterno: z.string().nullable() }))
      .mutation(({ input, ctx }) => orcamentoService.updateTextoInterno(input.id, input.textoInterno, ctx.userId)),

    delete: deleteProcedure(MODULE)
      .input(z.object({ id: z.string() }))
      .mutation(({ input }) => orcamentoService.delete(input.id)),

    duplicar: writeSubProcedure(MODULE, 'acao_duplicar', 'Duplicar orçamentos')
      .input(z.object({ id: z.string() }))
      .mutation(({ input, ctx }) => orcamentoService.duplicar(input.id, ctx.userId, ctx.empresaId)),

    arquivar: writeSubProcedure(MODULE, 'acao_arquivar', 'Arquivar orçamentos')
      .input(z.object({ id: z.string() }))
      .mutation(({ input, ctx }) => orcamentoService.arquivar(input.id, ctx.userId)),

    // ── Status ─────────────────────────────────────────────
    // changeStatus aceita `viaKanban` opcional + valida sub-permissão por
    // status-alvo. Sub-permissões aplicadas:
    //  - viaKanban=true → `mover_kanban`
    //  - status='ENVIADO' → `acao_enviar`
    //  - status='APROVADO' ou 'REPROVADO' → `acao_aprovar`
    //  - status='LIBERADO' → `acao_liberar`
    //  - status='ENCERRADO' ou 'FINALIZADO' → `acao_encerrar`
    // Master / EmpresaMaster sempre passam. Backend agora bate sub-permissão
    // (antes só `canWrite` era validado — UI bloqueava botões mas API aceitava).
    changeStatus: writeProcedure(MODULE)
      .input(z.object({ id: z.string(), status: z.string(), viaKanban: z.boolean().optional() }))
      .mutation(async ({ input, ctx }) => {
        const isPriv = ctx.isMaster || ctx.isEmpresaMaster
        if (!isPriv) {
          const SUB_BY_STATUS: Record<string, { key: string; label: string }> = {
            ENVIADO:    { key: 'acao_enviar',   label: 'Enviar orçamentos' },
            APROVADO:   { key: 'acao_aprovar',  label: 'Aprovar/reprovar orçamentos' },
            REPROVADO:  { key: 'acao_aprovar',  label: 'Aprovar/reprovar orçamentos' },
            LIBERADO:   { key: 'acao_liberar',  label: 'Liberar orçamentos' },
            FINALIZADO: { key: 'acao_encerrar', label: 'Encerrar orçamentos' },
            ENCERRADO:  { key: 'acao_encerrar', label: 'Encerrar orçamentos' },
          }
          const required: Array<{ key: string; label: string }> = []
          if (input.viaKanban) required.push({ key: 'mover_kanban', label: 'Mover cards no kanban' })
          const byStatus = SUB_BY_STATUS[input.status]
          if (byStatus) required.push(byStatus)
          if (required.length > 0) {
            const p = await prisma.userPermission.findFirst({
              where: { userId: ctx.userId!, moduleSlug: MODULE },
              select: { subPermissions: true },
            })
            const subs = (p?.subPermissions ?? {}) as Record<string, boolean>
            for (const r of required) {
              if (subs[r.key] !== true) {
                throw new TRPCError({ code: 'FORBIDDEN', message: `Sem permissão para: ${r.label}` })
              }
            }
          }
        }
        return orcamentoService.changeStatus(input.id, input.status, ctx.userId)
      }),

    enviar: writeSubProcedure(MODULE, 'acao_enviar', 'Enviar orcamentos')
      .input(z.object({
        id: z.string(),
        destinatarios: z.array(z.string()).optional(),
        mensagem: z.string().optional(),
      }))
      .mutation(({ input, ctx }) => orcamentoService.enviarOrcamento(input.id, { destinatarios: input.destinatarios, mensagem: input.mensagem }, ctx.userId)),

    paralizar: writeSubProcedure(MODULE, 'acao_paralizar', 'Paralisar/pausar orçamentos')
      .input(z.object({ id: z.string(), motivo: z.string().min(1) }))
      .mutation(({ input, ctx }) => orcamentoService.paralizar(input.id, input.motivo, ctx.userId)),

    retomar: writeSubProcedure(MODULE, 'acao_retomar', 'Retomar orçamentos paralisados')
      .input(z.object({ id: z.string() }))
      .mutation(({ input, ctx }) => orcamentoService.retomar(input.id, ctx.userId)),

    reabrir: writeSubProcedure(MODULE, 'acao_reabrir', 'Reabrir orçamentos para edição')
      .input(z.object({ id: z.string(), novoStatus: z.string(), motivo: z.string().optional(), manterDatas: z.boolean().optional() }))
      .mutation(({ input, ctx }) => orcamentoService.reabrir(input.id, input.novoStatus, input.motivo, ctx.userId, input.manterDatas)),

    editarData: writeSubProcedure(MODULE, 'edit_timeline_dates', 'Alterar datas da timeline')
      .input(z.object({ id: z.string(), campo: z.string(), valor: z.string().nullable() }))
      .mutation(({ input, ctx }) => orcamentoService.editarData(input.id, input.campo, input.valor, ctx.userId)),

    listUsuarios: readProcedure(MODULE)
      .query(({ ctx }) => orcamentoService.listUsuarios(ctx.empresaId)),

    // ── Formas de pagamento (lista gerenciável — espelha o legado) ──
    listFormasPagamento: readProcedure(MODULE)
      .query(({ ctx }) => orcamentoService.listFormasPagamento(ctx.empresaId)),

    createFormaPagamento: writeProcedure(MODULE)
      .input(z.object({ valor: z.string().min(1) }))
      .mutation(({ input, ctx }) => orcamentoService.createFormaPagamento(input.valor, ctx.empresaId)),

    updateFormaPagamento: writeProcedure(MODULE)
      .input(z.object({ id: z.string(), valor: z.string().optional(), ordem: z.number().optional(), ativo: z.boolean().optional() }))
      .mutation(({ input }) => orcamentoService.updateFormaPagamento(input.id, input.valor, input.ordem, input.ativo)),

    deleteFormaPagamento: deleteProcedure(MODULE)
      .input(z.object({ id: z.string() }))
      .mutation(({ input }) => orcamentoService.deleteFormaPagamento(input.id)),

    // Disparo manual da rotina de notificação de atrasos (debug/test).
    // Em produção, o cron diário às 08:00 cuida disso automaticamente.
    notificarAtrasados: protectedProcedure
      .mutation(async ({ ctx }) => {
        if (!(ctx.isMaster || ctx.isEmpresaMaster)) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Apenas master pode disparar esta rotina manualmente' })
        }
        return orcamentoService.notificarOrcamentosAtrasados({ empresaId: ctx.empresaId })
      }),

    listOrcamentosDoCliente: readProcedure(MODULE)
      .input(z.object({ clienteId: z.string(), excluirId: z.string().optional() }))
      .query(({ input }) => orcamentoService.listOrcamentosDoCliente(input.clienteId, input.excluirId)),

    trocarResponsavel: writeSubProcedure(MODULE, 'change_responsavel', 'Alterar responsavel pelos servicos')
      .input(z.object({ id: z.string(), responsavelId: z.string().nullable() }))
      .mutation(({ input, ctx }) => orcamentoService.trocarResponsavel(input.id, input.responsavelId, ctx.userId)),

    trocarSolicitante: writeSubProcedure(MODULE, 'change_solicitante', 'Alterar solicitante do orcamento')
      .input(z.object({ id: z.string(), solicitanteId: z.string().nullable() }))
      .mutation(({ input, ctx }) => orcamentoService.trocarSolicitante(input.id, input.solicitanteId, ctx.userId)),

    reordenar: writeProcedure(MODULE)
      .input(z.object({ ids: z.array(z.string()) }))
      .mutation(({ input }) => orcamentoService.reordenar(input.ids)),

    // ── Configuracoes ───────────────────────────────────────
    getConfig: readProcedure(MODULE)
      .query(({ ctx }) => orcamentoService.getConfig(ctx.empresaId)),

    saveConfig: writeProcedure(MODULE)
      .input(z.object({
        solicitante_responsavel: z.string(),
        dias_enviar: z.string(),
        dias_aprovar: z.string(),
        dias_revisar: z.string(),
        validade_dias: z.string(),
        numero_inicial: z.string(),
        email_novo: z.string(),
        email_comercial: z.string(),
        email_financeiro: z.string(),
        texto_padrao: z.string(),
        texto_apresentacao: z.string(),
      }))
      .mutation(({ input, ctx }) => orcamentoService.saveConfig(input, ctx.empresaId)),

    // Imagem de fundo do header — apenas Master pode editar
    setHeaderCover: protectedProcedure
      .input(z.object({ url: z.string().nullable() }))
      .mutation(({ input, ctx }) => {
        if (!ctx.isMaster) throw new TRPCError({ code: 'FORBIDDEN', message: 'Apenas o usuário master pode alterar a imagem de fundo' })
        return orcamentoService.setHeaderCover(input.url, ctx.empresaId)
      }),

    // ── Publico (aprovacao do cliente) ─────────────────────
    getByToken: publicProcedure
      .input(z.object({ token: z.string() }))
      .query(({ input }) => orcamentoService.getByToken(input.token)),

    registrarDecisao: publicProcedure
      .input(z.object({
        token: z.string(),
        tipo: z.enum(['APROVADO', 'REVISAO_SOLICITADA', 'RECUSADO']),
        nome: z.string().min(1),
        cpf: z.string().optional(),
        observacao: z.string().optional(),
      }))
      .mutation(({ input }) => orcamentoService.registrarDecisao(input.token, input)),

    // ── Itens ──────────────────────────────────────────────
    addItem: writeSubProcedure(MODULE, 'manage_itens', 'Incluir itens em orcamentos')
      .input(createOrcamentoItemSchema)
      .mutation(({ input }) => orcamentoService.addItem(input)),

    updateItem: writeSubProcedure(MODULE, 'manage_itens', 'Editar itens de orcamentos')
      .input(z.object({ id: z.string(), data: updateOrcamentoItemSchema }))
      .mutation(({ input }) => orcamentoService.updateItem(input.id, input.data)),

    removeItem: deleteSubProcedure(MODULE, 'manage_itens', 'Excluir itens de orcamentos')
      .input(z.object({ id: z.string() }))
      .mutation(({ input }) => orcamentoService.removeItem(input.id)),

    // ── Mensagens ──────────────────────────────────────────
    addMensagem: writeProcedure(MODULE)
      .input(z.object({
        orcamentoId: z.string(),
        mensagem: z.string().min(1),
        acessoUsuarios: z.array(z.string()).optional(),
        notificarUsuarios: z.array(z.string()).optional(),
        restritoFinanceiro: z.boolean().optional(),
        parentId: z.string().optional(),
      }))
      .mutation(({ input, ctx }) => orcamentoService.addMensagem(input.orcamentoId, ctx.userId || '', input.mensagem, {
        acessoUsuarios: input.acessoUsuarios,
        notificarUsuarios: input.notificarUsuarios,
        restritoFinanceiro: input.restritoFinanceiro,
        parentId: input.parentId,
      })),

    updateMensagemAcesso: writeProcedure(MODULE)
      .input(z.object({
        id: z.string(),
        acessoUsuarios: z.array(z.string()).optional(),
        restritoFinanceiro: z.boolean().optional(),
      }))
      .mutation(({ input }) => orcamentoService.updateMensagemAcesso(input.id, {
        acessoUsuarios: input.acessoUsuarios,
        restritoFinanceiro: input.restritoFinanceiro,
      })),

    editMensagem: writeProcedure(MODULE)
      .input(z.object({
        id: z.string(),
        mensagem: z.string().min(1),
      }))
      .mutation(({ input, ctx }) => orcamentoService.editMensagem(input.id, input.mensagem, {
        userId: ctx.userId,
        isMaster: ctx.isMaster,
      })),

    deleteMensagem: deleteProcedure(MODULE)
      .input(z.object({ id: z.string() }))
      .mutation(({ input, ctx }) => orcamentoService.deleteMensagem(input.id, {
        userId: ctx.userId,
        isMaster: ctx.isMaster,
      })),

    // ── Arquivos ───────────────────────────────────────────
    addArquivo: writeProcedure(MODULE)
      .input(z.object({
        orcamentoId: z.string(),
        fileName: z.string(), fileUrl: z.string(),
        fileSize: z.number().optional(), mimeType: z.string().optional(),
      }))
      .mutation(({ input, ctx }) => orcamentoService.addArquivo(input.orcamentoId, input, ctx.userId)),

    removeArquivo: deleteProcedure(MODULE)
      .input(z.object({ id: z.string() }))
      .mutation(({ input }) => orcamentoService.removeArquivo(input.id)),

    // ── Relatorios ─────────────────────────────────────────
    reportFunil: readProcedure(MODULE)
      .input(z.object({ dias: z.number().optional() }).optional())
      .query(({ input, ctx }) => orcamentoService.reportFunil(ctx.empresaId, input?.dias)),

    reportAtrasados: readProcedure(MODULE)
      .query(({ ctx }) => orcamentoService.reportAtrasados(ctx.empresaId)),

    reportDesempenho: readProcedure(MODULE)
      .input(z.object({ dias: z.number().optional() }).optional())
      .query(({ input, ctx }) => orcamentoService.reportDesempenho(ctx.empresaId, input?.dias)),

    reportTempoCiclo: readProcedure(MODULE)
      .input(z.object({ dias: z.number().optional() }).optional())
      .query(({ input, ctx }) => orcamentoService.reportTempoCiclo(ctx.empresaId, input?.dias)),

    reportPorArea: readProcedure(MODULE)
      .input(z.object({ dias: z.number().optional() }).optional())
      .query(({ input, ctx }) => orcamentoService.reportPorArea(ctx.empresaId, input?.dias)),

    // ── Catalogo de Servicos ───────────────────────────────
    listCatalogo: readProcedure(MODULE)
      .input(z.object({
        somenteAtivos: z.boolean().optional(),
        somenteDisponiveis: z.boolean().optional(),
        tipoOrcamento: z.string().nullable().optional(),
      }).optional())
      .query(({ input, ctx }) => orcamentoService.listCatalogo(ctx.empresaId, input)),

    createCatalogo: writeProcedure(MODULE)
      .input(z.object({
        nome: z.string().min(1),
        tipo: z.string(),
        valorPadrao: z.coerce.number().optional(),
        textoPadrao: z.string().optional(),
        disponivelOrcamento: z.boolean().optional(),
      }))
      .mutation(({ input, ctx }) => orcamentoService.createCatalogo(input, ctx.empresaId)),

    updateCatalogo: writeProcedure(MODULE)
      .input(z.object({
        id: z.string(),
        nome: z.string().optional(),
        tipo: z.string().optional(),
        valorPadrao: z.coerce.number().nullable().optional(),
        textoPadrao: z.string().nullable().optional(),
        ativo: z.boolean().optional(),
        disponivelOrcamento: z.boolean().optional(),
      }))
      .mutation(({ input }) => orcamentoService.updateCatalogo(input.id, input)),

    deleteCatalogo: deleteProcedure(MODULE)
      .input(z.object({ id: z.string() }))
      .mutation(({ input }) => orcamentoService.deleteCatalogo(input.id)),

    // ── Textos do registro do catalogo ─────────────────────
    listCatalogoTextos: readProcedure(MODULE)
      .input(z.object({ catalogoId: z.string() }))
      .query(({ input }) => orcamentoService.listCatalogoTextos(input.catalogoId)),

    addCatalogoTexto: writeProcedure(MODULE)
      .input(z.object({
        catalogoId: z.string(),
        titulo: z.string().min(1),
        descricao: z.string().optional(),
        valor: z.coerce.number().optional(),
      }))
      .mutation(({ input }) => orcamentoService.addCatalogoTexto(input)),

    updateCatalogoTexto: writeProcedure(MODULE)
      .input(z.object({
        id: z.string(),
        titulo: z.string().min(1).optional(),
        descricao: z.string().nullable().optional(),
        valor: z.coerce.number().nullable().optional(),
      }))
      .mutation(({ input }) => orcamentoService.updateCatalogoTexto(input.id, input)),

    removeCatalogoTexto: deleteProcedure(MODULE)
      .input(z.object({ id: z.string() }))
      .mutation(({ input }) => orcamentoService.removeCatalogoTexto(input.id)),

    // ── Estatisticas ───────────────────────────────────────
    getStats: readProcedure(MODULE)
      .query(({ ctx }) => orcamentoService.getStats(ctx.empresaId)),

    // Stats compactas pro widget do dashboard — inclui checagem de cargo gestor+
    getDashboardStats: readProcedure(MODULE)
      .query(({ ctx }) => orcamentoService.getDashboardStats(ctx.userId, ctx.empresaId)),
  })
}
