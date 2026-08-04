import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { router, readProcedure, writeProcedure, protectedProcedure } from '../trpc/trpc.service'
import {
  createTicketSchema, updateTicketSchema, listTicketSchema,
  addMensagemSchema, editMensagemSchema, deleteMensagemSchema,
  csatSchema, HELPDESK_STATUS,
} from '@saas/types'
import { prisma } from '@saas/db'
import { HelpdeskService } from './helpdesk.service'
import { HelpdeskAiAgentService } from './helpdesk-ai-agent.service'

const MODULE = 'helpdesk'

export function createHelpdeskRouter(helpdeskService: HelpdeskService, aiAgent: HelpdeskAiAgentService) {
  return router({
    // ── Catálogo de categorias ─────────────────────────────────
    listCategorias: protectedProcedure
      .query(({ ctx }) => helpdeskService.listCategorias(ctx.empresaId ?? null)),

    // Probe: detecta canRead (agente) — usado pra mostrar painel /helpdesk
    probeAccess: readProcedure(MODULE)
      .query(() => ({ ok: true })),

    /**
     * Probe específico: o user pode ATUAR como agente (mover cards, atribuir,
     * etc.)? Diferente do probeAccess (que é só leitura), aqui exige:
     *  - master / empresa-master, OU
     *  - role DIRETOR / COORDENADOR, OU
     *  - sub-permissão helpdesk.atuar_agente = true
     *
     * Cenário: um usuário do fiscal pode ter `helpdesk.canRead` (acessar o módulo)
     * mas NÃO `atuar_agente` — então vê os tickets mas não move/atribui.
     */
    probeAtuarAgente: protectedProcedure
      .query(async ({ ctx }) => ({
        ok: await helpdeskService.canAtuarAgente(ctx.userId!),
      })),

    /**
     * Escopo efetivo de visualização do usuário (#HLP0139) — usado pela página
     * pra montar o filtro: opções disponíveis = as que o escopo abrange; padrão =
     * a mais abrangente. `temArea` habilita a opção "minha área".
     */
    meuEscopo: protectedProcedure
      .query(({ ctx }) => helpdeskService.getMeuEscopo(ctx.userId!)),

    /** Agentes (podem ser responsável) da empresa — filtro por responsável (#HLP0139). */
    listAgentes: readProcedure(MODULE)
      .query(({ ctx }) => helpdeskService.listAgentes(ctx.empresaId ?? null)),

    // ── Tickets ────────────────────────────────────────────────

    /** Qualquer logado abre ticket (mesmo sem permissão helpdesk admin). */
    create: protectedProcedure
      .input(createTicketSchema)
      .mutation(({ input, ctx }) => helpdeskService.create(input, ctx.userId!, ctx.empresaId ?? null)),

    /** Detalhe do ticket — visibilidade validada no service. */
    getById: protectedProcedure
      .input(z.object({ id: z.string() }))
      .query(async ({ input, ctx }) => {
        await helpdeskService.assertCanAccess(ctx.userId!, input.id)
        return helpdeskService.getById(input.id)
      }),

    /** Resolve número visível (#HLPNNNN) → id. Usado pelos links auto-gerados. */
    findByNumero: protectedProcedure
      .input(z.object({ numero: z.number().int().positive() }))
      .query(({ input, ctx }) => helpdeskService.findByNumero(input.numero, ctx.userId!)),

    /** Listagem do agente (kanban/tabela). Read-permission obrigatória. */
    list: readProcedure(MODULE)
      .input(listTicketSchema)
      .query(({ input, ctx }) => helpdeskService.list(input, ctx.userId!, ctx.empresaId ?? null)),

    /** Relatório de tickets em aberto (formato Relatório de QA). */
    relatorio: readProcedure(MODULE)
      .query(({ ctx }) => helpdeskService.relatorioTickets(ctx.userId!, ctx.empresaId ?? null)),

    /** Atalho do solicitante: meus tickets. */
    listMeus: protectedProcedure
      .input(z.object({
        status: z.array(z.enum(HELPDESK_STATUS)).optional(),
        incluirHistorico: z.boolean().optional(),
      }).optional())
      .query(({ input, ctx }) => helpdeskService.listMeus(ctx.userId!, input)),

    /** Update parcial. Permissão de escrita ou ser solicitante (próprio ticket em status inicial). */
    update: protectedProcedure
      .input(z.object({ id: z.string(), data: updateTicketSchema }))
      .mutation(async ({ input, ctx }) => {
        await helpdeskService.assertCanAccess(ctx.userId!, input.id)
        return helpdeskService.update(input.id, input.data, ctx.userId!)
      }),

    /** Arquivamento em massa de uma coluna inteira (usado pra "limpar" Cancelados/Concluídos). */
    arquivarPorStatus: writeProcedure(MODULE)
      .input(z.object({ status: z.enum(['CONCLUIDO', 'CANCELADO']) }))
      .mutation(({ input, ctx }) =>
        helpdeskService.arquivarPorStatus(input.status, ctx.userId!, ctx.empresaId ?? null),
      ),

    // ── Mensagens ──────────────────────────────────────────────
    addMensagem: protectedProcedure
      .input(addMensagemSchema)
      .mutation(async ({ input, ctx }) => {
        await helpdeskService.assertCanAccess(ctx.userId!, input.ticketId)
        return helpdeskService.addMensagem(input, ctx.userId!)
      }),

    listMensagens: protectedProcedure
      .input(z.object({ ticketId: z.string() }))
      .query(async ({ input, ctx }) => {
        await helpdeskService.assertCanAccess(ctx.userId!, input.ticketId)
        return helpdeskService.listMensagens(input.ticketId)
      }),

    /**
     * Editar mensagem (#HLP0067). Restrições aplicadas no service:
     * só o autor + dentro de 30min + ticket não cancelado.
     */
    editMensagem: protectedProcedure
      .input(editMensagemSchema)
      .mutation(({ input, ctx }) => helpdeskService.editMensagem(input, ctx.userId!)),

    /**
     * Excluir mensagem (#HLP0067). Mesmas restrições da edição.
     * Exclui anexos vinculados via cascade do Prisma.
     */
    deleteMensagem: protectedProcedure
      .input(deleteMensagemSchema)
      .mutation(({ input, ctx }) => helpdeskService.deleteMensagem(input, ctx.userId!)),

    // ── CSAT ──
    responderCsat: protectedProcedure
      .input(csatSchema)
      .mutation(({ input, ctx }) =>
        helpdeskService.responderCsat(input.ticketId, input.nota, input.comentario ?? null, ctx.userId!),
      ),

    // ── Watchers ──
    addWatcher: writeProcedure(MODULE)
      .input(z.object({ ticketId: z.string(), userId: z.string() }))
      .mutation(({ input }) => helpdeskService.addWatcher(input.ticketId, input.userId)),

    removeWatcher: writeProcedure(MODULE)
      .input(z.object({ ticketId: z.string(), userId: z.string() }))
      .mutation(({ input }) => helpdeskService.removeWatcher(input.ticketId, input.userId)),

    // ── Anexos ──
    addAnexo: protectedProcedure
      .input(z.object({
        ticketId: z.string(),
        mensagemId: z.string().nullable().optional(),
        fileName: z.string(),
        fileUrl: z.string(),
        mimeType: z.string().nullable().optional(),
        tamanho: z.number().int().nonnegative().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        await helpdeskService.assertCanAccess(ctx.userId!, input.ticketId)
        return helpdeskService.addAnexo(
          input.ticketId,
          ctx.userId!,
          {
            fileName: input.fileName,
            fileUrl: input.fileUrl,
            mimeType: input.mimeType,
            tamanho: input.tamanho,
          },
          input.mensagemId,
        )
      }),

    listAnexos: protectedProcedure
      .input(z.object({ ticketId: z.string() }))
      .query(async ({ input, ctx }) => {
        await helpdeskService.assertCanAccess(ctx.userId!, input.ticketId)
        return helpdeskService.listAnexos(input.ticketId)
      }),

    /**
     * Exclusão de anexo individual. Agente da TI (canAtuarAgente) ou o
     * solicitante (criador) do ticket podem excluir; ticket não pode estar
     * CANCELADO. Validações no service.
     */
    deleteAnexo: protectedProcedure
      .input(z.object({ id: z.string() }))
      .mutation(({ input, ctx }) => helpdeskService.deleteAnexo(input, ctx.userId!)),

    // ── Candidatos a responsável (filtrado pela área da categoria) ──
    listAgentesAtribuiveis: protectedProcedure
      .input(z.object({ ticketId: z.string() }))
      .query(({ input, ctx }) => helpdeskService.listAgentesAtribuiveis(input.ticketId, ctx.userId!)),

    /**
     * Dashboard COMPLETO de indicadores + relatórios (rota /helpdesk/indicadores).
     * Aceita intervalo de datas (ISO). Sem intervalo → últimos 30 dias.
     * Restrito: métricas de TODOS exigem panel_metricas / master / DIRETOR /
     * COORDENADOR. Quem não tem usa `minhasAvaliacoes` (visão própria).
     */
    dashboard: protectedProcedure
      .input(z.object({
        inicio: z.string().optional(),
        fim: z.string().optional(),
      }).optional())
      .query(async ({ input, ctx }) => {
        if (!(await helpdeskService.podeVerMetricasCompletas(ctx.userId!))) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Você não tem acesso às métricas completas do HelpDesk' })
        }
        return helpdeskService.getDashboard(ctx.empresaId ?? null, input)
      }),

    /** Probe pra UI: o usuário pode ver as métricas completas? Governa o link de
     *  indicadores e a bifurcação da tela (completa × só minhas avaliações). */
    probeMetricasCompletas: protectedProcedure
      .query(({ ctx }) => helpdeskService.podeVerMetricasCompletas(ctx.userId!)),

    /** Avaliações (CSAT) do próprio usuário como responsável — visão de quem NÃO
     *  tem acesso às métricas completas. Intervalo de datas opcional (ISO). */
    minhasAvaliacoes: protectedProcedure
      .input(z.object({ inicio: z.string().optional(), fim: z.string().optional() }).optional())
      .query(({ input, ctx }) => helpdeskService.minhasAvaliacoes(ctx.userId!, ctx.empresaId ?? null, input)),

    /** Lista de avaliações do PAINEL COMPLETO — todas, ou de um responsável
     *  específico. Mesmo gate do dashboard (métricas completas). */
    avaliacoesCompletas: protectedProcedure
      .input(z.object({ responsavelId: z.string().optional(), inicio: z.string().optional(), fim: z.string().optional() }).optional())
      .query(async ({ input, ctx }) => {
        if (!(await helpdeskService.podeVerMetricasCompletas(ctx.userId!))) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Você não tem acesso às métricas completas do HelpDesk' })
        }
        return helpdeskService.avaliacoesCompletas(ctx.empresaId ?? null, input ?? {})
      }),

    // ── Configurações do módulo (pill /configuracoes → Helpdesk) ──
    // Config — só TI real (master/empresa-master, DIRETOR/COORDENADOR ou
    // sub-permissão helpdesk.atuar_agente). Mesma porta do probeAtuarAgente.
    getConfig: protectedProcedure
      .query(async ({ ctx }) => {
        if (!(await helpdeskService.canAtuarAgente(ctx.userId!))) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Apenas a TI pode acessar as configurações' })
        }
        return helpdeskService.getConfig(ctx.empresaId ?? null)
      }),

    updateConfig: protectedProcedure
      .input(z.object({
        slaPorPrioridade: z.record(z.string(), z.number().int().min(1).max(2400)).optional(),
        autoFechamentoDias: z.number().int().min(1).max(30).optional(),
        avaliacaoPosConclusaoDias: z.number().int().min(1).max(365).optional(),
        inboundEmail: z.string().email().optional().or(z.literal('')),
        notificarTodosAgentes: z.boolean().optional(),
        // Lista de e-mails; entradas vazias são filtradas no service.
        destinatarios: z.array(z.string().email()).optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        if (!(await helpdeskService.canAtuarAgente(ctx.userId!))) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Apenas a TI pode alterar configurações' })
        }
        return helpdeskService.updateConfig(input)
      }),

    // ── Triagem IA (config + stats) ──────────────────────────────
    aiConfigGet: protectedProcedure
      .query(async () => {
        const [config, gastoMes] = await Promise.all([
          aiAgent.getConfig(),
          aiAgent.gastoUsdMesAtual(),
        ])
        return { ...config, gastoUsdMesAtual: gastoMes }
      }),

    aiConfigUpdate: protectedProcedure
      .input(z.object({
        enabled: z.boolean().optional(),
        capUsdMensal: z.number().min(0).max(10000).optional(),
        minCharsDescricao: z.number().int().min(0).max(1000).optional(),
        maxCharsDescricao: z.number().int().min(100).max(100000).optional(),
        scoreThreshold: z.number().int().min(0).max(500).optional(),
        regrasPeso: z.object({
          faixasChars: z.array(z.object({
            min: z.number().int().min(0),
            max: z.number().int().nullable(),
            pontos: z.number().int().min(-100).max(100),
          })),
          faixasAnexos: z.array(z.object({
            min: z.number().int().min(0),
            max: z.number().int().nullable(),
            pontos: z.number().int().min(-100).max(100),
          })),
          bonusCategoria: z.number().int().min(-100).max(100),
          pesosTipo: z.record(z.string(), z.number().int().min(-100).max(100)),
        }).nullable().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        // Master only — alterar parâmetros que afetam custo direto
        const u = await prisma.user.findUnique({ where: { id: ctx.userId! }, select: { isMaster: true } })
        if (!u?.isMaster) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Apenas o master pode alterar a configuração da IA.' })
        }
        return aiAgent.updateConfig(input)
      }),

    // ── Processamento manual / aprovação / rejeição (#HLP0083) ──
    /**
     * Força processamento de um ticket pela IA, ignorando o threshold de score
     * e a idempotência. Mantém os gates de custo (enabled, cap mensal, min/max
     * chars). Útil pra tickets que receberam score baixo mas o operador acha
     * que vale a pena planejar.
     */
    aiProcessarTicket: protectedProcedure
      .input(z.object({ ticketId: z.string() }))
      .mutation(async ({ input, ctx }) => {
        await helpdeskService.assertCanAccess(ctx.userId!, input.ticketId)
        // Síncrono — operador espera o resultado pra ver o plano aparecer
        await aiAgent.processarTicket(input.ticketId, { forcar: true })
        return { ok: true }
      }),

    /** Operador aprova o plano. Status → EM_ANDAMENTO, plano vira nota interna. */
    aiAprovarPlano: protectedProcedure
      .input(z.object({ ticketId: z.string() }))
      .mutation(async ({ input, ctx }) => {
        await helpdeskService.assertCanAccess(ctx.userId!, input.ticketId)
        return aiAgent.aprovarPlano(input.ticketId, ctx.userId!)
      }),

    /** Operador rejeita o plano. Status volta pra NOVO, motivo registrado. */
    aiRejeitarPlano: protectedProcedure
      .input(z.object({ ticketId: z.string(), motivo: z.string().max(500).optional() }))
      .mutation(async ({ input, ctx }) => {
        await helpdeskService.assertCanAccess(ctx.userId!, input.ticketId)
        return aiAgent.rejeitarPlano(input.ticketId, ctx.userId!, input.motivo ?? '')
      }),

    // ── Execução do plano (#HLP0083) ────────────────────────────
    /** Gera prompt formatado pra colar no Claude Code CLI local. Sem custo. */
    aiGerarPromptParaCli: protectedProcedure
      .input(z.object({ ticketId: z.string() }))
      .query(async ({ input, ctx }) => {
        await helpdeskService.assertCanAccess(ctx.userId!, input.ticketId)
        return { prompt: await aiAgent.gerarPromptParaCli(input.ticketId) }
      }),

    /** Lê arquivos do plano e estima quanto custaria a execução automática. Sem custo. */
    aiEstimarCustoExecucao: protectedProcedure
      .input(z.object({ ticketId: z.string() }))
      .query(async ({ input, ctx }) => {
        await helpdeskService.assertCanAccess(ctx.userId!, input.ticketId)
        return aiAgent.estimarCustoExecucao(input.ticketId)
      }),

    /** Executa o plano via Claude API. CONSOME crédito. Frontend deve confirmar antes. */
    aiExecutarPlanoAutomatico: protectedProcedure
      .input(z.object({ ticketId: z.string() }))
      .mutation(async ({ input, ctx }) => {
        await helpdeskService.assertCanAccess(ctx.userId!, input.ticketId)
        return aiAgent.executarPlanoAutomatico(input.ticketId)
      }),

    // ── Logs/estatísticas de uso (#HLP0083) ─────────────────────
    /** Agregado mensal pra gráfico — gasto USD + contagem por mês. */
    aiEstatisticasMensais: protectedProcedure
      .input(z.object({ meses: z.number().int().min(1).max(24).optional() }).optional())
      .query(({ input }) => aiAgent.estatisticasMensais(input?.meses ?? 6)),

    /** Histórico paginado de decisões — usado na tabela de logs. */
    aiHistorico: protectedProcedure
      .input(z.object({
        page: z.number().int().min(1).optional(),
        limit: z.number().int().min(1).max(100).optional(),
        complexidade: z.string().optional(),
        inicio: z.string().optional(),
        fim: z.string().optional(),
      }).optional())
      .query(({ input }) => aiAgent.historicoDecisoes({
        page: input?.page,
        limit: input?.limit,
        complexidade: input?.complexidade,
        inicio: input?.inicio ? new Date(input.inicio) : undefined,
        fim: input?.fim ? new Date(input.fim) : undefined,
      })),
  })
}
