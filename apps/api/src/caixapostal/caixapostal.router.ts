import { z } from 'zod'
import { router, readProcedure, writeProcedure, deleteProcedure, writeSubProcedure, readSubProcedure, deleteSubProcedure } from '../trpc/trpc.service'
import { CaixaPostalService } from './caixapostal.service'
import { CaixaPostalSchedulerService } from './caixapostal.scheduler'
import { TRPCError } from '@trpc/server'

const MODULE = 'caixapostal'

const contribuinteSchema = z.object({
  numero: z.string().min(11),
  tipo: z.number().int().min(1).max(2),
})

const regraCreateSchema = z.object({
  nome: z.string().min(1),
  descricao: z.string().optional(),
  tipo: z.enum(['PRIORIDADE', 'RELEVANCIA', 'DESCONSIDERAR']),
  ativo: z.boolean().optional(),
  ordem: z.number().int().optional(),
  palavrasChave: z.string().optional(),
  origemContem: z.string().optional(),
  assuntoContem: z.string().optional(),
  codigoSistema: z.string().optional(),
  pesoScore: z.number().int().optional(),
  prioridadeMinima: z.enum(['P0', 'P1', 'P2', 'P3']).optional(),
  marcarRelevante: z.boolean().optional(),
  desconsiderarSePesoMenor: z.number().int().optional(),
  // Ações automáticas
  autoNotificar: z.boolean().optional(),
  autoNotificarLider: z.boolean().optional(),
  autoNotificarGerente: z.boolean().optional(),
  autoCriarTarefa: z.boolean().optional(),
  autoMarcarLida: z.boolean().optional(),
  emailsExtras: z.string().optional(),
})

export function createCaixaPostalRouter(service: CaixaPostalService, scheduler: CaixaPostalSchedulerService) {
  return router({
    // ── Leitura ────────────────────────────────────────────

    listCache: readProcedure(MODULE)
      .input(z.object({ contribuinte: contribuinteSchema }))
      .query(({ input, ctx }) => service.listCache(input.contribuinte, ctx.empresaId ?? null)),

    totalizadores: readProcedure(MODULE)
      .query(({ ctx }) => service.totalizadores(ctx.empresaId ?? null)),

    listarPorPrioridade: readProcedure(MODULE)
      .input(z.object({ prioridade: z.enum(['P0', 'P1', 'P2', 'P3']).optional(), importante: z.boolean().optional() }))
      .query(({ input, ctx }) => service.listarPorPrioridade(input.prioridade, ctx.empresaId ?? null, input.importante)),

    status: readProcedure(MODULE)
      .input(z.object({ contribuinte: z.string().min(11) }))
      .query(({ input, ctx }) => service.status(input.contribuinte, ctx.empresaId ?? null)),

    statusLote: readProcedure(MODULE)
      .input(z.object({ documentos: z.array(z.string().min(11)).min(1) }))
      .mutation(({ input, ctx }) => service.statusLote(input.documentos, ctx.empresaId ?? null)),

    // ── Escrita (chamadas SERPRO) ──────────────────────────

    consultarClassificadas: writeProcedure(MODULE)
      .input(z.object({
        contribuinte: contribuinteSchema,
        statusLeitura: z.string().optional(),
        indicadorPagina: z.string().optional(),
        ponteiroPagina: z.string().optional(),
      }))
      .mutation(({ input, ctx }) => service.consultarClassificadas(input.contribuinte, ctx.empresaId ?? null, {
        statusLeitura: input.statusLeitura,
        indicadorPagina: input.indicadorPagina,
        ponteiroPagina: input.ponteiroPagina,
      })),

    detalhar: writeProcedure(MODULE)
      .input(z.object({ contribuinte: contribuinteSchema, isn: z.string().min(1) }))
      .mutation(({ input }) => service.detalharMensagem(input.contribuinte, input.isn)),

    indicadorNovas: writeProcedure(MODULE)
      .input(z.object({ contribuinte: contribuinteSchema }))
      .mutation(({ input }) => service.indicadorNovas(input.contribuinte)),

    marcarLida: writeProcedure(MODULE)
      .input(z.object({ isn: z.string(), contribuinte: z.string() }))
      .mutation(({ input, ctx }) => service.marcarLida(input.isn, input.contribuinte, ctx.userId)),

    marcarNaoLida: writeProcedure(MODULE)
      .input(z.object({ isn: z.string(), contribuinte: z.string() }))
      .mutation(({ input }) => service.marcarNaoLida(input.isn, input.contribuinte)),

    marcarLidasLote: writeProcedure(MODULE)
      .input(z.object({ itemIds: z.array(z.string()).min(1) }))
      .mutation(({ input, ctx }) => service.marcarLidasLote(input.itemIds, ctx.userId)),

    marcarNaoLidasLote: writeProcedure(MODULE)
      .input(z.object({ itemIds: z.array(z.string()).min(1) }))
      .mutation(({ input, ctx }) => service.marcarNaoLidasLote(input.itemIds, ctx.userId)),

    // ── Lote (sub: bulk_actions) ────────────────────────────

    consultarNovasLote: writeSubProcedure(MODULE, 'bulk_actions', 'Consulta em lote')
      .mutation(({ ctx }) => service.consultarNovasLote(ctx.empresaId ?? null)),

    classificarLote: writeSubProcedure(MODULE, 'bulk_actions', 'Consulta em lote')
      .mutation(({ ctx }) => service.classificarLote(ctx.empresaId ?? null)),

    // ── Reclassificação (sub: reclassify) ────────────────

    reclassificar: writeSubProcedure(MODULE, 'reclassify', 'Reclassificar mensagens')
      .input(z.object({ itemId: z.string() }))
      .mutation(({ input, ctx }) => service.reclassificarMensagem(input.itemId, ctx.empresaId ?? null)),

    reclassificarTodas: writeSubProcedure(MODULE, 'reclassify', 'Reclassificar mensagens')
      .input(z.object({ contribuinte: z.string() }))
      .mutation(({ input, ctx }) => service.reclassificarTodas(input.contribuinte, ctx.empresaId ?? null)),

    // ── Gestão de mensagens (sub: manage_gestao) ──────────

    itemDetalhes: readSubProcedure(MODULE, 'manage_gestao', 'Gestão e históricos')
      .input(z.object({ itemId: z.string() }))
      .query(({ input }) => service.getItemDetalhes(input.itemId)),

    itemByIsn: readProcedure(MODULE)
      .input(z.object({ isn: z.string(), contribuinte: z.string() }))
      .query(({ input }) => service.getItemByIsn(input.isn, input.contribuinte)),

    listarEventos: readSubProcedure(MODULE, 'manage_gestao', 'Gestão e históricos')
      .input(z.object({ itemId: z.string() }))
      .query(({ input }) => service.listarEventos(input.itemId)),

    definirResponsavel: writeSubProcedure(MODULE, 'manage_gestao', 'Gestão e históricos')
      .input(z.object({ itemId: z.string(), responsavelId: z.string() }))
      .mutation(({ input, ctx }) => service.definirResponsavel(input.itemId, input.responsavelId, ctx.userId)),

    alterarStatus: writeSubProcedure(MODULE, 'manage_gestao', 'Gestão e históricos')
      .input(z.object({ itemId: z.string(), status: z.enum(['pendente', 'em_andamento', 'concluido', 'arquivado']) }))
      .mutation(({ input, ctx }) => service.alterarStatus(input.itemId, input.status, ctx.userId)),

    adicionarObservacao: writeSubProcedure(MODULE, 'manage_gestao', 'Gestão e históricos')
      .input(z.object({ itemId: z.string(), texto: z.string().min(1) }))
      .mutation(({ input, ctx }) => service.adicionarObservacao(input.itemId, input.texto, ctx.userId)),

    encaminhar: writeSubProcedure(MODULE, 'manage_gestao', 'Gestão e históricos')
      .input(z.object({ itemId: z.string(), destinatarioIds: z.array(z.string()).min(1), observacao: z.string().optional(), enviarEmail: z.boolean().optional() }))
      .mutation(({ input, ctx }) => service.encaminharMensagem(input.itemId, input.destinatarioIds, input.observacao, ctx.userId, input.enviarEmail)),

    criarObrigacao: writeSubProcedure(MODULE, 'manage_gestao', 'Gestão e históricos')
      .input(z.object({
        itemId: z.string(),
        nome: z.string().min(1),
        tipo: z.string().default('sob_demanda'),
        areaId: z.string().optional(),
        responsavelId: z.string().optional(),
        diaVencimento: z.number().optional(),
        observacoes: z.string().optional(),
      }))
      .mutation(({ input, ctx }) => {
        if (!ctx.empresaId) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Empresa não selecionada' })
        const { itemId, ...dados } = input
        return service.criarObrigacaoFromMensagem(itemId, dados, ctx.empresaId, ctx.userId)
      }),

    listarUsuarios: readSubProcedure(MODULE, 'manage_gestao', 'Gestão e históricos')
      .query(({ ctx }) => service.listarUsuariosAtivos(ctx.empresaId ?? null)),

    // ── Importante ──────────────────────────────────────────

    toggleImportante: writeProcedure(MODULE)
      .input(z.object({ itemId: z.string() }))
      .mutation(({ input, ctx }) => service.toggleImportante(input.itemId, ctx.userId)),

    marcarImportanteLote: writeProcedure(MODULE)
      .input(z.object({ itemIds: z.array(z.string()).min(1), importante: z.boolean() }))
      .mutation(({ input, ctx }) => service.marcarImportanteLote(input.itemIds, input.importante, ctx.userId)),

    // ── Arquivamento de mensagens (sub: archive_delete) ──────

    arquivar: writeSubProcedure(MODULE, 'archive_delete', 'Arquivar mensagens')
      .input(z.object({ itemIds: z.array(z.string()).min(1) }))
      .mutation(({ input, ctx }) => service.arquivarMensagens(input.itemIds, ctx.userId)),

    desarquivar: writeSubProcedure(MODULE, 'archive_delete', 'Arquivar mensagens')
      .input(z.object({ itemIds: z.array(z.string()).min(1) }))
      .mutation(({ input, ctx }) => service.desarquivarMensagens(input.itemIds, ctx.userId)),

    arquivarAntigas: writeSubProcedure(MODULE, 'archive_delete', 'Arquivar mensagens')
      .input(z.object({ contribuinte: z.string(), dias: z.number().min(1).default(90) }))
      .mutation(({ input, ctx }) => service.arquivarAntigas(input.contribuinte, input.dias, ctx.empresaId ?? null, ctx.userId)),

    listarArquivadas: readSubProcedure(MODULE, 'archive_delete', 'Arquivar mensagens')
      .input(z.object({ contribuinte: z.string() }))
      .query(({ input, ctx }) => service.listarArquivadas(input.contribuinte, ctx.empresaId ?? null)),

    // ── Inativação de clientes ─────────────────────────────

    inativarCliente: writeProcedure(MODULE)
      .input(z.object({ clienteId: z.string() }))
      .mutation(({ input }) => service.inativarCliente(input.clienteId)),

    inativarClientesLote: writeProcedure(MODULE)
      .input(z.object({ clienteIds: z.array(z.string()).min(1) }))
      .mutation(({ input }) => service.inativarClientesLote(input.clienteIds)),

    // ── Limpeza (sub: archive_delete) ────────────────────────

    excluirCache: deleteSubProcedure(MODULE, 'archive_delete', 'Excluir mensagens')
      .input(z.object({ documentos: z.array(z.string()).min(1) }))
      .mutation(({ input }) => service.excluirCache(input.documentos)),

    limparTudo: deleteSubProcedure(MODULE, 'archive_delete', 'Excluir mensagens')
      .mutation(() => service.limparTudo()),

    // ── Configuração do classificador ─────────────────────

    config: router({
      get: readProcedure(MODULE)
        .query(async ({ ctx }) => {
          const empId = ctx.empresaId ?? await service.resolverEmpresaId()
          return service.getClassifierConfig(empId)
        }),

      update: writeProcedure(MODULE)
        .input(z.object({
          thresholds: z.object({ P0: z.number(), P1: z.number(), P2: z.number() }),
          keywords: z.object({
            criticas: z.object({ peso: z.number(), palavras: z.array(z.string()) }),
            medias: z.object({ peso: z.number(), palavras: z.array(z.string()) }),
            baixas: z.object({ peso: z.number(), palavras: z.array(z.string()) }),
          }),
          deadline: z.object({ vencido: z.number(), urgente: z.number(), proximo: z.number(), valido: z.number() }),
          relevance: z.object({ alta: z.number(), indicada: z.number() }),
          unread: z.object({ base: z.number(), ciencia: z.number(), prazoUrgente: z.number() }),
          acoesRecomendadas: z.object({ P0: z.string(), P1: z.string(), P2: z.string(), P3: z.string() }),
        }))
        .mutation(async ({ input, ctx }) => {
          if (!ctx.isMaster) throw new TRPCError({ code: 'FORBIDDEN', message: 'Apenas perfil MASTER pode alterar configurações' })
          const empId = ctx.empresaId ?? await service.resolverEmpresaId()
          return service.updateClassifierConfig(empId, input)
        }),

      reset: deleteProcedure(MODULE)
        .mutation(async ({ ctx }) => {
          if (!ctx.isMaster) throw new TRPCError({ code: 'FORBIDDEN', message: 'Apenas perfil MASTER pode alterar configurações' })
          const empId = ctx.empresaId ?? await service.resolverEmpresaId()
          return service.resetClassifierConfig(empId)
        }),
    }),

    // ── Regras de classificação (vinculadas à empresa, MASTER only) ──

    regras: router({
      list: readProcedure(MODULE)
        .query(async ({ ctx }) => {
          const empId = ctx.empresaId ?? await service.resolverEmpresaId()
          return service.listarRegras(empId)
        }),

      getById: readProcedure(MODULE)
        .input(z.object({ id: z.string() }))
        .query(async ({ input, ctx }) => {
          const empId = ctx.empresaId ?? await service.resolverEmpresaId()
          return service.buscarRegra(input.id, empId)
        }),

      create: writeProcedure(MODULE)
        .input(regraCreateSchema)
        .mutation(async ({ input, ctx }) => {
          if (!ctx.isMaster) throw new TRPCError({ code: 'FORBIDDEN', message: 'Apenas perfil MASTER pode gerenciar regras' })
          const empId = ctx.empresaId ?? await service.resolverEmpresaId()
          return service.criarRegra(input, empId, ctx.userId)
        }),

      update: writeProcedure(MODULE)
        .input(z.object({ id: z.string(), data: regraCreateSchema.partial() }))
        .mutation(async ({ input, ctx }) => {
          if (!ctx.isMaster) throw new TRPCError({ code: 'FORBIDDEN', message: 'Apenas perfil MASTER pode gerenciar regras' })
          const empId = ctx.empresaId ?? await service.resolverEmpresaId()
          return service.atualizarRegra(input.id, input.data, empId)
        }),

      delete: deleteProcedure(MODULE)
        .input(z.object({ id: z.string() }))
        .mutation(async ({ input, ctx }) => {
          if (!ctx.isMaster) throw new TRPCError({ code: 'FORBIDDEN', message: 'Apenas perfil MASTER pode gerenciar regras' })
          const empId = ctx.empresaId ?? await service.resolverEmpresaId()
          return service.excluirRegra(input.id, empId)
        }),
    }),

    // ── Agendamento automático ────────────────────────────

    schedule: router({
      get: readProcedure(MODULE)
        .query(({ ctx }) => scheduler.getStatus(ctx.empresaId ?? '')),

      update: writeProcedure(MODULE)
        .input(z.object({
          enabled: z.boolean(),
          cron: z.string().min(1),
          delayMs: z.number().min(1000).max(60000).optional(),
          filter: z.string().optional(),
          clienteIds: z.array(z.string()).optional(),
        }))
        .mutation(async ({ input, ctx }) => {
          if (!ctx.isMaster) throw new TRPCError({ code: 'FORBIDDEN', message: 'Apenas perfil MASTER pode alterar agendamentos' })
          return scheduler.updateConfig(ctx.empresaId ?? '', input)
        }),

      runNow: writeProcedure(MODULE)
        .mutation(async ({ ctx }) => {
          if (!ctx.isMaster) throw new TRPCError({ code: 'FORBIDDEN', message: 'Apenas perfil MASTER pode executar manualmente' })
          return scheduler.runNow(ctx.userId, ctx.empresaId ?? '')
        }),

      progress: readProcedure(MODULE)
        .query(({ ctx }) => scheduler.getProgress(ctx.empresaId ?? '')),

      clientes: readProcedure(MODULE)
        .query(({ ctx }) => scheduler.listarClientesDisponiveis(ctx.empresaId ?? '')),

      logs: readProcedure(MODULE)
        .input(z.object({ limit: z.number().min(1).max(100).default(20), offset: z.number().min(0).default(0) }).optional())
        .query(({ input, ctx }) => scheduler.listarExecLogs(input?.limit ?? 20, input?.offset ?? 0, ctx.empresaId ?? '')),

      logById: readProcedure(MODULE)
        .input(z.object({ id: z.string() }))
        .query(({ input, ctx }) => scheduler.getExecLogById(input.id, ctx.empresaId ?? '')),
    }),
  })
}
