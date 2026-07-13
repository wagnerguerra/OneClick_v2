import { z } from 'zod'
import { prisma } from '@saas/db'
import { router, readProcedure, writeProcedure, deleteProcedure, protectedProcedure } from '../trpc/trpc.service'
import {
  createServicoSchema, updateServicoSchema, createServicoEtapaSchema, createServicoPassoSchema, createExecucaoSchema,
  createPassoEmailTemplateSchema, updatePassoEmailTemplateSchema,
  createPassoLembreteSchema, updatePassoLembreteSchema,
  createPassoCampoClienteSchema, updatePassoCampoClienteSchema,
  CAMPOS_CLIENTE_CATALOGO,
  addComentarioPassoSchema, addAnexoPassoSchema, pausarExecucaoSchema, addWatcherSchema,
  createEncadeamentoSchema, updateEncadeamentoSchema,
  createMaterialSchema, updateMaterialSchema, reorderMateriaisSchema,
  createGrupoSchema, updateGrupoSchema, setGrupoServicosSchema, setServicoGruposSchema, iniciarGrupoSchema,
  responderPerguntaSchema,
  setVencimentosMensaisSchema,
  aplicarFlowPlanSchema,
} from '@saas/types'
import { ServicoService } from './servico.service'

const MODULE = 'servicos'

export function createServicoRouter(servicoService: ServicoService) {
  return router({
    // ── Templates ──────────────────────────────────────────
    listServicos: readProcedure(MODULE)
      .input(z.object({
        /** MENSAL | EXTRA | FLUXO. Vazio = top-level (MENSAL+EXTRA). */
        categoria: z.enum(['MENSAL', 'EXTRA', 'FLUXO']).optional(),
        /** comerciais (default) = só serviços comerciais. internos = só ehServicoInterno=true.
         *  todos = ambos. Filtro independente da categoria. */
        tipo: z.enum(['comerciais', 'internos', 'todos']).optional(),
      }).optional())
      .query(({ ctx, input }) => servicoService.listServicos(ctx.empresaId, input?.categoria, input?.tipo)),

    getServico: readProcedure(MODULE)
      .input(z.object({ id: z.string() }))
      .query(({ input }) => servicoService.getServico(input.id)),

    /** Fluxo (DAG) — usado pela aba "Fluxo" em /servicos/[id]. */
    getFluxo: readProcedure(MODULE)
      .input(z.object({ id: z.string() }))
      .query(({ input }) => servicoService.getFluxo(input.id)),

    /** Salva posições visuais dos nós no canvas (debounced no frontend). */
    saveFluxoLayout: writeProcedure(MODULE)
      .input(z.object({
        rootId: z.string(),
        positions: z.array(z.object({
          nodeId: z.string(),
          x: z.number(),
          y: z.number(),
        })),
      }))
      .mutation(({ input }) => servicoService.saveFluxoLayout(input.rootId, input.positions)),

    /** Apaga layout salvo de uma raiz — força auto-layout dagre na próxima abertura. */
    resetFluxoLayout: writeProcedure(MODULE)
      .input(z.object({ rootId: z.string() }))
      .mutation(({ input }) => servicoService.resetFluxoLayout(input.rootId)),

    createServico: writeProcedure(MODULE)
      .input(createServicoSchema)
      .mutation(({ input, ctx }) => servicoService.createServico(input, ctx.empresaId)),

    updateServico: writeProcedure(MODULE)
      .input(z.object({ id: z.string(), data: updateServicoSchema }))
      .mutation(({ input }) => servicoService.updateServico(input.id, input.data)),

    deleteServico: deleteProcedure(MODULE)
      .input(z.object({ id: z.string() }))
      .mutation(({ input }) => servicoService.deleteServico(input.id)),

    bulkDeleteServicos: deleteProcedure(MODULE)
      .input(z.object({ ids: z.array(z.string()).min(1) }))
      .mutation(({ input }) => servicoService.bulkDeleteServicos(input.ids)),

    /** Materializa um FlowPlan (etapas/blocos/arestas) sobre um serviço existente.
     *  Usado pelo assistente guiado e pela geração por IA. */
    aplicarFlowPlan: writeProcedure(MODULE)
      .input(aplicarFlowPlanSchema)
      .mutation(({ input }) => servicoService.aplicarFlowPlan(input.servicoId, input.plan)),

    /** Clona um serviço inteiro (etapas/passos + blocos de fluxo + encadeamentos).
     *  Motor da biblioteca de "modelos prontos". */
    duplicarServico: writeProcedure(MODULE)
      .input(z.object({ id: z.string(), novoNome: z.string().min(1).max(200).optional() }))
      .mutation(({ input }) => servicoService.duplicarServico(input.id, { novoNome: input.novoNome })),

    // ── Vencimentos por mês (Fase B Acessórias) ──────────────
    getVencimentosMensais: readProcedure(MODULE)
      .input(z.object({ servicoId: z.string() }))
      .query(({ input }) => servicoService.getVencimentosMensais(input.servicoId)),

    setVencimentosMensais: writeProcedure(MODULE)
      .input(setVencimentosMensaisSchema)
      .mutation(({ input }) => servicoService.setVencimentosMensais(input.servicoId, input.vencimentos)),

    // ── Etapas ─────────────────────────────────────────────
    addEtapa: writeProcedure(MODULE)
      .input(createServicoEtapaSchema)
      .mutation(({ input }) => servicoService.addEtapa(input)),

    updateEtapa: writeProcedure(MODULE)
      // slaHoras NÃO entra no input — é derivado dos passos pelo servico.service.
      .input(z.object({ id: z.string(), nome: z.string().optional(), ordem: z.number().optional() }))
      .mutation(({ input }) => servicoService.updateEtapa(input.id, input)),

    deleteEtapa: deleteProcedure(MODULE)
      .input(z.object({ id: z.string() }))
      .mutation(({ input }) => servicoService.deleteEtapa(input.id)),

    // ── Passos ─────────────────────────────────────────────
    addPasso: writeProcedure(MODULE)
      .input(createServicoPassoSchema)
      .mutation(({ input }) => servicoService.addPasso(input)),

    updatePasso: writeProcedure(MODULE)
      .input(z.object({ id: z.string(), data: createServicoPassoSchema.partial() }))
      .mutation(({ input }) => servicoService.updatePasso(input.id, input.data)),

    deletePasso: deleteProcedure(MODULE)
      .input(z.object({ id: z.string() }))
      .mutation(({ input }) => servicoService.deletePasso(input.id)),

    // ── E-mail templates por passo ─────────────────────────
    listPassoEmailTemplates: readProcedure(MODULE)
      .input(z.object({ passoId: z.string() }))
      .query(({ input }) => servicoService.listPassoEmailTemplates(input.passoId)),

    createPassoEmailTemplate: writeProcedure(MODULE)
      .input(createPassoEmailTemplateSchema)
      .mutation(({ input, ctx }) => servicoService.createPassoEmailTemplate(input, ctx.empresaId)),

    updatePassoEmailTemplate: writeProcedure(MODULE)
      .input(z.object({ id: z.string(), data: updatePassoEmailTemplateSchema }))
      .mutation(({ input }) => servicoService.updatePassoEmailTemplate(input.id, input.data)),

    deletePassoEmailTemplate: deleteProcedure(MODULE)
      .input(z.object({ id: z.string() }))
      .mutation(({ input }) => servicoService.deletePassoEmailTemplate(input.id)),

    /** Envia o template como teste, com placeholders preenchidos por dados fake. */
    enviarEmailTesteTemplate: writeProcedure(MODULE)
      .input(z.object({
        templateId: z.string(),
        destinatarios: z.array(z.string()).min(1),
      }))
      .mutation(({ input }) => servicoService.enviarEmailTesteTemplate(input.templateId, input.destinatarios)),

    // ── Anexos do template de e-mail ─────────────────────────
    addEmailTemplateAnexo: writeProcedure(MODULE)
      .input(z.object({
        templateId: z.string(),
        fileName: z.string().min(1).max(255),
        storageKey: z.string().min(1).max(255),
        fileSize: z.number().int().nonnegative().optional().nullable(),
        mimeType: z.string().max(120).optional().nullable(),
      }))
      .mutation(({ input }) => servicoService.addEmailTemplateAnexo(input)),

    deleteEmailTemplateAnexo: deleteProcedure(MODULE)
      .input(z.object({ id: z.string() }))
      .mutation(({ input }) => servicoService.deleteEmailTemplateAnexo(input.id)),

    // ── Lembretes por passo (agenda corporativa) ───────────
    listPassoLembretes: readProcedure(MODULE)
      .input(z.object({ passoId: z.string() }))
      .query(({ input }) => servicoService.listPassoLembretes(input.passoId)),

    createPassoLembrete: writeProcedure(MODULE)
      .input(createPassoLembreteSchema)
      .mutation(({ input, ctx }) => servicoService.createPassoLembrete(input, ctx.empresaId)),

    updatePassoLembrete: writeProcedure(MODULE)
      .input(z.object({ id: z.string(), data: updatePassoLembreteSchema }))
      .mutation(({ input }) => servicoService.updatePassoLembrete(input.id, input.data)),

    deletePassoLembrete: deleteProcedure(MODULE)
      .input(z.object({ id: z.string() }))
      .mutation(({ input }) => servicoService.deletePassoLembrete(input.id)),

    // ── Campos do cliente vinculados ao passo ───────────────
    /** Catálogo curado de campos do Cliente (whitelist) — não toca o banco. */
    listCamposClienteCatalogo: readProcedure(MODULE)
      .query(() => CAMPOS_CLIENTE_CATALOGO),

    listPassoCamposCliente: readProcedure(MODULE)
      .input(z.object({ passoId: z.string() }))
      .query(({ input }) => servicoService.listPassoCamposCliente(input.passoId)),

    createPassoCampoCliente: writeProcedure(MODULE)
      .input(createPassoCampoClienteSchema)
      .mutation(({ input, ctx }) => servicoService.createPassoCampoCliente(input, ctx.empresaId)),

    updatePassoCampoCliente: writeProcedure(MODULE)
      .input(z.object({ id: z.string(), data: updatePassoCampoClienteSchema }))
      .mutation(({ input }) => servicoService.updatePassoCampoCliente(input.id, input.data)),

    deletePassoCampoCliente: deleteProcedure(MODULE)
      .input(z.object({ id: z.string() }))
      .mutation(({ input }) => servicoService.deletePassoCampoCliente(input.id)),

    /** Preview na execução — retorna vínculos + valores atuais do cliente. */
    previewCamposClienteDoPasso: protectedProcedure
      .input(z.object({ execPassoId: z.string() }))
      .query(async ({ input, ctx }) => {
        await servicoService.assertCanAccessExecucaoPasso(ctx.userId!, input.execPassoId)
        return servicoService.previewCamposClienteDoPasso(input.execPassoId)
      }),

    previewEmailsDoPasso: protectedProcedure
      .input(z.object({ execPassoId: z.string() }))
      .query(async ({ input, ctx }) => {
        await servicoService.assertCanAccessExecucaoPasso(ctx.userId!, input.execPassoId)
        return servicoService.previewEmailsDoPasso(input.execPassoId)
      }),

    enviarEmailsDoPasso: protectedProcedure
      .input(z.object({
        execPassoId: z.string(),
        extraDestinatarios: z.array(z.string().email()).optional(),
        somenteTemplateIds: z.array(z.string()).optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        await servicoService.assertCanAccessExecucaoPasso(ctx.userId!, input.execPassoId)
        return servicoService.enviarEmailsDoPasso(input.execPassoId, {
          extraDestinatarios: input.extraDestinatarios,
          somenteTemplateIds: input.somenteTemplateIds,
        })
      }),

    // ── Encadeamento (DAG entre templates) ─────────────────
    listEncadeamentos: readProcedure(MODULE)
      .input(z.object({
        servicoOrigemId: z.string().optional(),
        servicoDestinoId: z.string().optional(),
      }).optional())
      .query(({ input }) => servicoService.listEncadeamentos(input)),

    addEncadeamento: writeProcedure(MODULE)
      .input(createEncadeamentoSchema)
      .mutation(({ input }) => servicoService.addEncadeamento(input)),

    updateEncadeamento: writeProcedure(MODULE)
      .input(updateEncadeamentoSchema)
      .mutation(({ input }) => {
        const { id, ...rest } = input
        return servicoService.updateEncadeamento(id, rest)
      }),

    removeEncadeamento: deleteProcedure(MODULE)
      .input(z.object({ id: z.string() }))
      .mutation(({ input }) => servicoService.removeEncadeamento(input.id)),

    // ── Execucoes ──────────────────────────────────────────
    listExecucoes: readProcedure(MODULE)
      .input(z.object({ status: z.string().optional(), clienteId: z.string().optional() }).optional())
      .query(({ input, ctx }) => servicoService.listExecucoes({ ...input, empresaId: ctx.empresaId })),

    // Endpoints de execucao especifica usam protectedProcedure + check de visibilidade
    // pessoal (regras de /meus-servicos). Permite que usuarios sem permissao admin do
    // modulo "servicos" interajam com execucoes que lhes pertencem.
    getExecucao: protectedProcedure
      .input(z.object({ id: z.string() }))
      .query(async ({ input, ctx }) => {
        await servicoService.assertCanAccessExecucao(ctx.userId!, input.id)
        return servicoService.getExecucao(input.id)
      }),

    createExecucao: writeProcedure(MODULE)
      .input(createExecucaoSchema)
      .mutation(({ input, ctx }) => servicoService.createExecucao(input, ctx.empresaId)),

    togglePasso: protectedProcedure
      .input(z.object({
        id: z.string(),
        /** Valores capturados pelo modal de campos do cliente — chave = nome do
         *  campo na whitelist, valor = string/date/bool/number. Opcional: se o
         *  passo não tem campos vinculados, pode ser omitido. */
        valoresCampos: z.record(z.unknown()).optional(),
        /** Chaves de campos (exigeEdicao=true) que o operador marcou como
         *  "Revisado" no modal — bypass da validação de "valor não alterado". */
        camposRevisados: z.array(z.string()).optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        await servicoService.assertCanAccessExecucaoPasso(ctx.userId!, input.id)
        return servicoService.togglePasso(input.id, ctx.userId, input.valoresCampos, input.camposRevisados)
      }),

    updatePassoObs: protectedProcedure
      .input(z.object({ id: z.string(), observacao: z.string() }))
      .mutation(async ({ input, ctx }) => {
        await servicoService.assertCanAccessExecucaoPasso(ctx.userId!, input.id)
        return servicoService.updatePassoObs(input.id, input.observacao)
      }),

    ignorarPasso: protectedProcedure
      .input(z.object({ id: z.string(), motivo: z.string().nullable().optional() }))
      .mutation(async ({ input, ctx }) => {
        await servicoService.assertCanAccessExecucaoPasso(ctx.userId!, input.id)
        return servicoService.ignorarPasso(input.id, input.motivo ?? null, ctx.userId)
      }),

    desfazerIgnorarPasso: protectedProcedure
      .input(z.object({ id: z.string() }))
      .mutation(async ({ input, ctx }) => {
        await servicoService.assertCanAccessExecucaoPasso(ctx.userId!, input.id)
        return servicoService.desfazerIgnorarPasso(input.id, ctx.userId)
      }),

    concluirExecucao: protectedProcedure
      .input(z.object({ id: z.string() }))
      .mutation(async ({ input, ctx }) => {
        await servicoService.assertCanAccessExecucao(ctx.userId!, input.id)
        return servicoService.concluirExecucao(input.id, ctx.userId)
      }),

    /** Responde a execução de um bloco PERGUNTA. Valida opções contra o template,
     *  grava ProcessoRespostaPergunta e dispara só os sucessores cujo rotulo
     *  casa com alguma opção escolhida. */
    responderPergunta: protectedProcedure
      .input(responderPerguntaSchema)
      .mutation(async ({ input, ctx }) => {
        await servicoService.assertCanAccessExecucao(ctx.userId!, input.execucaoId)
        return servicoService.responderPergunta(
          { execucaoId: input.execucaoId, opcoes: input.opcoes, observacao: input.observacao ?? null },
          ctx.userId,
        )
      }),

    cancelarExecucao: protectedProcedure
      .input(z.object({ id: z.string() }))
      .mutation(async ({ input, ctx }) => {
        await servicoService.assertCanAccessExecucao(ctx.userId!, input.id)
        return servicoService.cancelarExecucao(input.id)
      }),

    /** Preview do impacto de cancelar — usado pelo confirm dialog do frontend
     *  pra avisar que cancelar afeta orçamento (e o card do CRM, se houver). */
    getCancelamentoImpacto: protectedProcedure
      .input(z.object({ id: z.string() }))
      .query(async ({ input, ctx }) => {
        await servicoService.assertCanAccessExecucao(ctx.userId!, input.id)
        return servicoService.getCancelamentoImpacto(input.id)
      }),

    // ── Atribuição/troca de responsável ────────────────────
    // Quem pode: master/empresa-master, role DIRETOR/COORDENADOR/GESTOR,
    // profile SUPERVISOR/GERENTE/ADMIN, ou líder da área (Area.leaderId).
    // Quando `execId` é passado, filtra candidatos pela área correspondente
    // à categoria do serviço (ex: serviço "Fiscal" → users da área Fiscal).
    listResponsaveisAtribuiveis: protectedProcedure
      .input(z.object({ execId: z.string().optional() }).optional())
      .query(({ input, ctx }) =>
        servicoService.listResponsaveisAtribuiveis(ctx.userId!, { execId: input?.execId }),
      ),

    setResponsavelExecucao: protectedProcedure
      .input(z.object({ id: z.string(), responsavelId: z.string().nullable() }))
      .mutation(({ input, ctx }) =>
        servicoService.setResponsavelExecucao(input.id, input.responsavelId, ctx.userId!),
      ),

    // ── Sucessores AGUARDANDO_INICIO (Fase 6) ──────────────
    iniciarSucessorManual: protectedProcedure
      .input(z.object({ id: z.string() }))
      .mutation(async ({ input, ctx }) => {
        await servicoService.assertCanAccessExecucao(ctx.userId!, input.id)
        return servicoService.iniciarSucessorManual(input.id, ctx.userId)
      }),

    pularSucessorOpcional: protectedProcedure
      .input(z.object({ id: z.string(), motivo: z.string().optional() }))
      .mutation(async ({ input, ctx }) => {
        await servicoService.assertCanAccessExecucao(ctx.userId!, input.id)
        return servicoService.pularSucessorOpcional(input.id, input.motivo ?? null, ctx.userId)
      }),

    // ── Stats ──────────────────────────────────────────────
    getStats: readProcedure(MODULE)
      .query(({ ctx }) => servicoService.getStats(ctx.empresaId)),

    // ── Indicadores para o Dashboard ──
    // Escopo: master/diretor/coordenador veem tudo; líder vê área; demais só os próprios
    getDashboardStats: protectedProcedure
      .query(({ ctx }) => servicoService.getDashboardStats(ctx.userId!)),

    // ── Painel "Meus Servicos" — execucoes atribuidas ao usuario logado ──
    listMeusServicos: protectedProcedure
      .input(z.object({
        status: z.string().optional(),
        atrasados: z.boolean().optional(),
        incluirArquivados: z.boolean().optional(),
      }).optional())
      .query(({ input, ctx }) => servicoService.listMeusServicos(ctx.userId!, input)),

    // ── Widget "Servicos em Andamento" do dashboard (versao expandida) ──
    // Reusa escopo do listMeusServicos; retorna so execucoes ativas com
    // situacao + passoAtual calculados.
    listServicosAndamentoDashboard: protectedProcedure
      .query(({ ctx }) => servicoService.listServicosAndamentoDashboard(ctx.userId!)),

    // Arquivar/desarquivar — protegidos por visibilidade da execucao
    arquivarExecucao: protectedProcedure
      .input(z.object({ id: z.string() }))
      .mutation(async ({ input, ctx }) => {
        await servicoService.assertCanAccessExecucao(ctx.userId!, input.id)
        return servicoService.arquivarExecucao(input.id, ctx.userId)
      }),

    desarquivarExecucao: protectedProcedure
      .input(z.object({ id: z.string() }))
      .mutation(async ({ input, ctx }) => {
        await servicoService.assertCanAccessExecucao(ctx.userId!, input.id)
        return servicoService.desarquivarExecucao(input.id)
      }),

    // Configuracao do modulo "Meus Servicos" — leitura para qualquer logado
    // (pra exibir info "concluidos somem em X dias"), escrita so para admin.
    getMeusServicosConfig: protectedProcedure
      .query(() => servicoService.getMeusServicosConfig()),

    updateMeusServicosConfig: writeProcedure(MODULE)
      .input(z.object({ concluidosDiasExibicao: z.number().int().min(1).max(365) }))
      .mutation(({ input }) => servicoService.updateMeusServicosConfig(input)),

    // ── Fase 4 — Pausa/Retomada da execucao ──
    pausarExecucao: protectedProcedure
      .input(pausarExecucaoSchema)
      .mutation(async ({ input, ctx }) => {
        await servicoService.assertCanAccessExecucao(ctx.userId!, input.id)
        return servicoService.pausarExecucao(input.id, input.motivo, ctx.userId)
      }),

    retomarExecucao: protectedProcedure
      .input(z.object({ id: z.string() }))
      .mutation(async ({ input, ctx }) => {
        await servicoService.assertCanAccessExecucao(ctx.userId!, input.id)
        return servicoService.retomarExecucao(input.id, ctx.userId)
      }),

    // ── Comentarios por passo ──
    listComentariosPasso: protectedProcedure
      .input(z.object({ execPassoId: z.string() }))
      .query(async ({ input, ctx }) => {
        await servicoService.assertCanAccessExecucaoPasso(ctx.userId!, input.execPassoId)
        return servicoService.listComentariosPasso(input.execPassoId)
      }),

    addComentarioPasso: protectedProcedure
      .input(addComentarioPassoSchema)
      .mutation(async ({ input, ctx }) => {
        await servicoService.assertCanAccessExecucaoPasso(ctx.userId!, input.execPassoId)
        return servicoService.addComentarioPasso(input.execPassoId, input.mensagem, ctx.userId)
      }),

    deleteComentarioPasso: protectedProcedure
      .input(z.object({ id: z.string() }))
      .mutation(async ({ input, ctx }) => {
        // Resolve o execPassoId via comentario antes de validar
        const com = await prisma.servicoExecucaoPassoComentario.findUnique({
          where: { id: input.id },
          select: { execPassoId: true },
        })
        if (!com) throw new Error('Comentário não encontrado')
        await servicoService.assertCanAccessExecucaoPasso(ctx.userId!, com.execPassoId)
        return servicoService.deleteComentarioPasso(input.id)
      }),

    // ── Anexos por passo ──
    listAnexosPasso: protectedProcedure
      .input(z.object({ execPassoId: z.string() }))
      .query(async ({ input, ctx }) => {
        await servicoService.assertCanAccessExecucaoPasso(ctx.userId!, input.execPassoId)
        return servicoService.listAnexosPasso(input.execPassoId)
      }),

    addAnexoPasso: protectedProcedure
      .input(addAnexoPassoSchema)
      .mutation(async ({ input, ctx }) => {
        await servicoService.assertCanAccessExecucaoPasso(ctx.userId!, input.execPassoId)
        return servicoService.addAnexoPasso(input, ctx.userId)
      }),

    deleteAnexoPasso: protectedProcedure
      .input(z.object({ id: z.string() }))
      .mutation(async ({ input, ctx }) => {
        const an = await prisma.servicoExecucaoPassoAnexo.findUnique({
          where: { id: input.id },
          select: { execPassoId: true },
        })
        if (!an) throw new Error('Anexo não encontrado')
        await servicoService.assertCanAccessExecucaoPasso(ctx.userId!, an.execPassoId)
        return servicoService.deleteAnexoPasso(input.id)
      }),

    // ── Watchers ──
    listWatchers: protectedProcedure
      .input(z.object({ execucaoId: z.string() }))
      .query(async ({ input, ctx }) => {
        await servicoService.assertCanAccessExecucao(ctx.userId!, input.execucaoId)
        return servicoService.listWatchers(input.execucaoId)
      }),

    addWatcher: protectedProcedure
      .input(addWatcherSchema)
      .mutation(async ({ input, ctx }) => {
        await servicoService.assertCanAccessExecucao(ctx.userId!, input.execucaoId)
        return servicoService.addWatcher(input.execucaoId, input.userId)
      }),

    removeWatcher: protectedProcedure
      .input(addWatcherSchema)
      .mutation(async ({ input, ctx }) => {
        await servicoService.assertCanAccessExecucao(ctx.userId!, input.execucaoId)
        return servicoService.removeWatcher(input.execucaoId, input.userId)
      }),

    // ── Timeline de eventos ──
    listEventos: protectedProcedure
      .input(z.object({ execucaoId: z.string() }))
      .query(async ({ input, ctx }) => {
        await servicoService.assertCanAccessExecucao(ctx.userId!, input.execucaoId)
        return servicoService.listEventos(input.execucaoId)
      }),

    // ── Materiais de apoio (template) ──────────────────────
    listMateriaisDeEtapa: readProcedure(MODULE)
      .input(z.object({ etapaId: z.string() }))
      .query(({ input }) => servicoService.listMateriaisDeEtapa(input.etapaId)),

    listMateriaisDePasso: readProcedure(MODULE)
      .input(z.object({ passoId: z.string() }))
      .query(({ input }) => servicoService.listMateriaisDePasso(input.passoId)),

    createMaterial: writeProcedure(MODULE)
      .input(createMaterialSchema)
      .mutation(({ input, ctx }) => servicoService.createMaterial(input, { empresaId: ctx.empresaId, userId: ctx.userId })),

    updateMaterial: writeProcedure(MODULE)
      .input(updateMaterialSchema)
      .mutation(({ input }) => servicoService.updateMaterial(input)),

    deleteMaterial: deleteProcedure(MODULE)
      .input(z.object({ id: z.string() }))
      .mutation(({ input }) => servicoService.deleteMaterial(input.id)),

    reorderMateriais: writeProcedure(MODULE)
      .input(reorderMateriaisSchema)
      .mutation(({ input }) => servicoService.reorderMateriais(input.ids)),

    // ── Grupos de serviço ──────────────────────────────────
    listGrupos: readProcedure(MODULE)
      .query(({ ctx }) => servicoService.listGrupos(ctx.empresaId)),

    getGrupo: readProcedure(MODULE)
      .input(z.object({ id: z.string() }))
      .query(({ input }) => servicoService.getGrupo(input.id)),

    createGrupo: writeProcedure(MODULE)
      .input(createGrupoSchema)
      .mutation(({ input, ctx }) => servicoService.createGrupo(input, ctx.empresaId)),

    updateGrupo: writeProcedure(MODULE)
      .input(updateGrupoSchema)
      .mutation(({ input }) => servicoService.updateGrupo(input)),

    deleteGrupo: deleteProcedure(MODULE)
      .input(z.object({ id: z.string() }))
      .mutation(({ input }) => servicoService.deleteGrupo(input.id)),

    setGrupoServicos: writeProcedure(MODULE)
      .input(setGrupoServicosSchema)
      .mutation(({ input }) => servicoService.setGrupoServicos(input.grupoId, input.servicoIds)),

    setServicoGrupos: writeProcedure(MODULE)
      .input(setServicoGruposSchema)
      .mutation(({ input }) => servicoService.setServicoGrupos(input.servicoId, input.grupoIds)),

    iniciarGrupo: writeProcedure(MODULE)
      .input(iniciarGrupoSchema)
      .mutation(({ input, ctx }) => servicoService.iniciarGrupo(input, ctx.userId)),
  })
}
