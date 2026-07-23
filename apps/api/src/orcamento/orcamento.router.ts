import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { prisma } from '@saas/db'
import { router, readProcedure, writeProcedure, deleteProcedure, publicProcedure, writeSubProcedure, deleteSubProcedure, protectedProcedure } from '../trpc/trpc.service'
import { createOrcamentoSchema, updateOrcamentoSchema, listOrcamentoSchema, createOrcamentoItemSchema, updateOrcamentoItemSchema, resolveOrcamentoScope, ORCAMENTO_SCOPE_DEFAULT, type OrcamentoScope } from '@saas/types'
import { OrcamentoService } from './orcamento.service'

const MODULE = 'orcamentos'

/**
 * Escopo de listagem efetivo do usuário (#HLP0266). Lê a sub-permissão gravada
 * e cai no padrão 'proprios' quando não há usuário ou registro — a escolha nunca
 * fica vazia, e o padrão é o mais restritivo.
 */
async function resolveScopeDoUsuario(userId: string | undefined): Promise<OrcamentoScope> {
  if (!userId) return ORCAMENTO_SCOPE_DEFAULT
  const p = await prisma.userPermission.findFirst({
    where: { userId, moduleSlug: MODULE },
    select: { subPermissions: true },
  }).catch(() => null)
  return resolveOrcamentoScope(p?.subPermissions as Record<string, unknown> | null)
}

export function createOrcamentoRouter(orcamentoService: OrcamentoService) {
  return router({
    // ── CRUD ────────────────────────────────────────────────
    // #HLP0266: o `scope` que vier do cliente é DESCARTADO — a visibilidade é
    // decidida aqui, a partir da sub-permissão gravada do usuário. Antes o front
    // resolvia e o backend confiava, então uma chamada direta ao tRPC com
    // scope='todos' via tudo. O campo segue no schema só por compatibilidade
    // com clientes antigos, mas não tem efeito.
    list: readProcedure(MODULE)
      .input(listOrcamentoSchema)
      .query(async ({ input, ctx }) => {
        const scope = await resolveScopeDoUsuario(ctx.userId)
        return orcamentoService.list({ ...input, scope }, ctx.isMaster ?? false, ctx.empresaId, ctx.userId)
      }),

    getById: readProcedure(MODULE)
      .input(z.object({ id: z.string() }))
      .query(({ input, ctx }) => orcamentoService.getById(input.id, { userId: ctx.userId, isMaster: ctx.isMaster })),

    // Histórico do legado (só leitura) por cliente — exibido no detalhe do orçamento e no cliente
    legadoPorCliente: readProcedure(MODULE)
      .input(z.object({ clienteId: z.string() }))
      .query(({ input }) => orcamentoService.listLegadoPorCliente(input.clienteId)),

    // Assistente de IA — histórico do chat persistido (por orçamento + usuário)
    iaMensagens: readProcedure(MODULE)
      .input(z.object({ id: z.string() }))
      .query(({ input, ctx }) => orcamentoService.listIaMensagens(input.id, ctx.userId)),

    limparIaChat: writeProcedure(MODULE)
      .input(z.object({ id: z.string() }))
      .mutation(({ input, ctx }) => orcamentoService.limparIaChat(input.id, ctx.userId)),

    // ── Biblioteca de modelos de proposta (referência da IA) ──
    modelosProposta: readProcedure(MODULE)
      .query(({ ctx }) => orcamentoService.listModelosPropostaAdmin(ctx.empresaId)),

    criarModeloProposta: writeSubProcedure(MODULE, 'gerir_modelos_proposta', 'Gerir modelos de proposta')
      .input(z.object({
        titulo: z.string().min(1),
        conteudo: z.string().min(1),
        tipo: z.string().nullable().optional(),
        segmento: z.string().nullable().optional(),
        ativo: z.boolean().optional(),
        ordem: z.number().int().optional(),
      }))
      .mutation(({ input, ctx }) => orcamentoService.createModeloProposta(input, ctx.userId, ctx.empresaId)),

    atualizarModeloProposta: writeSubProcedure(MODULE, 'gerir_modelos_proposta', 'Gerir modelos de proposta')
      .input(z.object({
        id: z.string(),
        titulo: z.string().min(1).optional(),
        conteudo: z.string().min(1).optional(),
        tipo: z.string().nullable().optional(),
        segmento: z.string().nullable().optional(),
        ativo: z.boolean().optional(),
        ordem: z.number().int().optional(),
      }))
      .mutation(({ input, ctx: _ctx }) => {
        const { id, ...data } = input
        return orcamentoService.updateModeloProposta(id, data)
      }),

    excluirModeloProposta: writeSubProcedure(MODULE, 'gerir_modelos_proposta', 'Gerir modelos de proposta')
      .input(z.object({ id: z.string() }))
      .mutation(({ input }) => orcamentoService.excluirModeloProposta(input.id)),

    // ── Sugestões (ações rápidas) do assistente de IA — editáveis em Configurações ──
    iaSugestoesListar: readProcedure(MODULE)
      .query(({ ctx }) => orcamentoService.listIaSugestoes(ctx.empresaId)),

    iaSugestoesSalvar: writeSubProcedure(MODULE, 'acessar_configuracoes', 'Editar configurações de orçamentos')
      .input(z.object({ items: z.array(z.object({ label: z.string().min(1), prompt: z.string().min(1) })).max(20) }))
      .mutation(({ input, ctx }) => orcamentoService.saveIaSugestoes(ctx.empresaId, input.items)),

    create: writeProcedure(MODULE)
      .input(createOrcamentoSchema)
      .mutation(({ input, ctx }) => orcamentoService.create(input, ctx.userId, ctx.empresaId)),

    // Master edita o orçamento por inteiro mesmo congelado (bypass do "duplicar
    // para editar") e o service loga a alteração na timeline. ctx.isMaster é a
    // mesma flag que libera os campos no front.
    update: writeProcedure(MODULE)
      .input(z.object({ id: z.string(), data: updateOrcamentoSchema }))
      .mutation(({ input, ctx }) => orcamentoService.update(input.id, input.data, ctx.userId, ctx.isMaster ?? false)),

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
      .input(z.object({ id: z.string(), status: z.string(), viaKanban: z.boolean().optional(), notificarCliente: z.boolean().optional() }))
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
        return orcamentoService.changeStatus(input.id, input.status, ctx.userId, { notificarCliente: input.notificarCliente })
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

    // ── Solicitação de orçamento (balão "Fale com a TI") ──
    // protectedProcedure: qualquer usuário autenticado pode pedir um orçamento
    // ao comercial, mesmo sem permissão de escrita no módulo orçamentos.
    buscarClientes: protectedProcedure
      .input(z.object({ search: z.string().optional() }))
      .query(({ input, ctx }) => orcamentoService.buscarClientesParaSolicitacao(input.search, ctx.isMaster ?? false, ctx.empresaId)),

    // Cadastra (ou reaproveita) um cliente como lead/prospect a partir de um
    // nome digitado — usado na edição de cliente no detalhe do orçamento.
    // writeProcedure: só quem pode editar orçamentos cria cliente por aqui.
    criarClienteRapido: writeProcedure(MODULE)
      .input(z.object({ nome: z.string().min(2) }))
      .mutation(({ input, ctx }) => orcamentoService.encontrarOuCriarClientePorNome(input.nome, ctx.empresaId)),

    solicitar: protectedProcedure
      .input(z.object({
        clienteId: z.string().optional().nullable(),
        clienteNome: z.string().optional().nullable(),
        detalhamento: z.string().min(3),
        areaIds: z.array(z.string()).optional(),
        anexos: z.array(z.object({
          fileName: z.string(),
          fileUrl: z.string(),
          fileSize: z.number().optional(),
          mimeType: z.string().optional(),
        })).optional(),
      }))
      .mutation(({ input, ctx }) => orcamentoService.solicitar(input, ctx.userId, ctx.empresaId)),

    // ── Multiárea: pills, config, detalhamento por área ──
    listAreasSelecionaveis: protectedProcedure
      .query(({ ctx }) => orcamentoService.listAreasSelecionaveis(ctx.empresaId)),

    getConfigAreas: readProcedure(MODULE)
      .query(({ ctx }) => orcamentoService.getConfigAreas(ctx.empresaId)),
    saveConfigAreas: writeSubProcedure(MODULE, 'acessar_configuracoes', 'Editar configurações de orçamentos')
      .input(z.object({
        config: z.object({
          prazoRespostaDias: z.number().int().min(1).max(60),
          prazoEmDiasUteis: z.boolean(),
          canais: z.object({ sino: z.boolean(), email: z.boolean(), push: z.boolean() }),
          avisarComercialAtraso: z.boolean(),
          areaComercialId: z.string().nullable().optional(),
        }),
        areas: z.array(z.object({ areaId: z.string(), substitutoId: z.string().nullable().optional() })),
      }))
      .mutation(({ input, ctx }) => orcamentoService.saveConfigAreas(input, ctx.empresaId)),

    listAreasDoOrcamento: protectedProcedure
      .input(z.object({ orcamentoId: z.string() }))
      .query(({ input }) => orcamentoService.listAreasDoOrcamento(input.orcamentoId)),
    vincularAreas: writeProcedure(MODULE)
      .input(z.object({ orcamentoId: z.string(), areaIds: z.array(z.string()) }))
      .mutation(({ input, ctx }) => orcamentoService.vincularAreas(input.orcamentoId, input.areaIds, ctx.userId, ctx.empresaId)),
    detalharArea: protectedProcedure
      .input(z.object({ id: z.string(), detalhe: z.string().min(1), valor: z.number().nullable().optional() }))
      .mutation(({ input, ctx }) => orcamentoService.detalharArea(input.id, { detalhe: input.detalhe, valor: input.valor }, ctx.userId)),
    prorrogarArea: protectedProcedure
      .input(z.object({ id: z.string(), dias: z.number().int().min(1).max(60), justificativa: z.string().min(3) }))
      .mutation(({ input, ctx }) => orcamentoService.prorrogarArea(input.id, { dias: input.dias, justificativa: input.justificativa }, ctx.userId)),

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

    /** Histórico paginado de orçamentos do cliente (todos os status). */
    listOrcamentosDoClientePaginado: readProcedure(MODULE)
      .input(z.object({ clienteId: z.string(), page: z.coerce.number().min(1).default(1), limit: z.coerce.number().min(1).max(100).default(20) }))
      .query(({ input }) => orcamentoService.listOrcamentosDoClientePaginado(input.clienteId, input.page, input.limit)),

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
        email_aprovacao: z.string(),
        email_liberacao: z.string().optional(),
        notificar_executor_liberacao: z.string().optional(),
        texto_padrao: z.string(),
        texto_apresentacao: z.string(),
        // Estas chaves o front já envia; sem declará-las o Zod as descartava
        // (config de lembrete/follow-up do #46 não persistia). Opcionais p/ compat.
        email_lembretes: z.string().optional(),
        lembrete_validade_ativo: z.string().optional(),
        lembrete_validade_dias_antes: z.string().optional(),
        followup_recusa_ativo: z.string().optional(),
        followup_recusa_dias: z.string().optional(),
        followup_tipo_evento_id: z.string().optional(),
        // #HLP0302 — "Usar apenas desconto por item" ('1' marcada / '0' desmarcada).
        apenas_desconto_item: z.string().optional(),
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
        cnpjFaturamento: z.string().optional(),
        emailFinanceiro: z.string().optional(),
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

    // Envia e-mail ao cliente pelo detalhe do orçamento (registra como mensagem;
    // a resposta volta pelo inbound e vira mensagem também).
    enviarEmailCliente: writeProcedure(MODULE)
      .input(z.object({
        orcamentoId: z.string(),
        para: z.array(z.string().email()).min(1),
        assunto: z.string().min(1),
        corpoHtml: z.string().min(1),
      }))
      .mutation(({ input, ctx }) => orcamentoService.enviarEmailCliente(input.orcamentoId, ctx.userId || '', input.para, input.assunto, input.corpoHtml)),

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

    /** Marca um anexo como público (aparece na proposta do cliente) ou privado. */
    setArquivoPublico: writeProcedure(MODULE)
      .input(z.object({ id: z.string(), publico: z.boolean() }))
      .mutation(({ input }) => orcamentoService.setArquivoPublico(input.id, input.publico)),

    // ── Relatorios ─────────────────────────────────────────
    reportFunil: readProcedure(MODULE)
      .input(z.object({ dias: z.number().optional() }).optional())
      .query(({ input, ctx }) => orcamentoService.reportFunil(ctx.empresaId, input?.dias)),

    reportIndicadores: readProcedure(MODULE)
      .input(z.object({ dataInicio: z.string(), dataFim: z.string() }))
      .query(({ input, ctx }) => orcamentoService.reportIndicadores(ctx.empresaId, input.dataInicio, input.dataFim)),

    reportFunilComercial: readProcedure(MODULE)
      .input(z.object({ dias: z.number().optional() }).optional())
      .query(({ input, ctx }) => orcamentoService.reportFunilComercial(ctx.empresaId, input?.dias)),

    reportMrrAvulso: readProcedure(MODULE)
      .input(z.object({ dias: z.number().optional() }).optional())
      .query(({ input, ctx }) => orcamentoService.reportMrrAvulso(ctx.empresaId, input?.dias)),

    reportRankingVendedores: readProcedure(MODULE)
      .input(z.object({ dias: z.number().optional() }).optional())
      .query(({ input, ctx }) => orcamentoService.reportRankingVendedores(ctx.empresaId, input?.dias)),

    reportDescontosMargem: readProcedure(MODULE)
      .input(z.object({ dias: z.number().optional() }).optional())
      .query(({ input, ctx }) => orcamentoService.reportDescontosMargem(ctx.empresaId, input?.dias)),

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

    // Desfaz a exclusão (#HLP0282). Exige permissão de escrita, não de exclusão:
    // restaurar devolve um item ao catálogo, não remove nada.
    restaurarCatalogo: writeProcedure(MODULE)
      .input(z.object({ id: z.string() }))
      .mutation(({ input }) => orcamentoService.restaurarCatalogo(input.id)),

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
