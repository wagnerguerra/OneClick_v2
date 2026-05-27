import { z } from 'zod'
import { router, readProcedure, writeProcedure, protectedProcedure } from '../trpc/trpc.service'
import {
  createTicketSchema, updateTicketSchema, listTicketSchema,
  addMensagemSchema, csatSchema, HELPDESK_STATUS,
} from '@saas/types'
import { prisma } from '@saas/db'
import { HelpdeskService } from './helpdesk.service'

const MODULE = 'helpdesk'

export function createHelpdeskRouter(helpdeskService: HelpdeskService) {
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
      .query(async ({ ctx }) => {
        const user = await prisma.user.findUnique({
          where: { id: ctx.userId! },
          select: { isMaster: true, isEmpresaMaster: true, role: true },
        })
        if (!user) return { ok: false }
        if (user.isMaster || user.isEmpresaMaster) return { ok: true }
        if (user.role === 'DIRETOR' || user.role === 'COORDENADOR') return { ok: true }
        const perm = await prisma.userPermission.findFirst({
          where: { userId: ctx.userId!, moduleSlug: 'helpdesk' },
          select: { subPermissions: true },
        })
        const sub = (perm?.subPermissions ?? {}) as Record<string, boolean>
        return { ok: sub.atuar_agente === true }
      }),

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

    // ── Candidatos a responsável (filtrado pela área da categoria) ──
    listAgentesAtribuiveis: protectedProcedure
      .input(z.object({ ticketId: z.string() }))
      .query(({ input, ctx }) => helpdeskService.listAgentesAtribuiveis(input.ticketId, ctx.userId!)),

    // ── Métricas (painel TI) — requer permissão helpdesk ──
    getMetricas: readProcedure(MODULE)
      .input(z.object({ periodoDias: z.number().int().min(7).max(365).optional() }).optional())
      .query(({ input, ctx }) => helpdeskService.getMetricas(ctx.empresaId ?? null, input?.periodoDias ?? 30)),

    // ── Configurações do módulo (pill /configuracoes → Helpdesk) ──
    // Config exige canRead helpdesk (mesma porta de entrada que define "agente"):
    // colaborador comum não consegue ver configurações.
    getConfig: readProcedure(MODULE)
      .query(() => helpdeskService.getConfig()),

    updateConfig: writeProcedure(MODULE)
      .input(z.object({
        slaPorPrioridade: z.record(z.string(), z.number().int().min(1).max(2400)).optional(),
        autoFechamentoDias: z.number().int().min(1).max(30).optional(),
        inboundEmail: z.string().email().optional().or(z.literal('')),
        emailNotificacao: z.string().email().optional().or(z.literal('')),
      }))
      .mutation(({ input }) => helpdeskService.updateConfig(input)),
  })
}
