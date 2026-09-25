import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { router, readProcedure, writeProcedure, deleteProcedure } from '../trpc/trpc.service'
import { createOportunidadeSchema, updateOportunidadeSchema, listOportunidadeSchema, listForaDoFunilSchema, updateCrmEtapaSchema } from '@saas/types'
import { CrmService } from './crm.service'
import { ImportComercialService } from './import-comercial.service'
import type { AgendaTarefaService } from '../agenda/agenda-tarefa.service'
import { interacaoSchema, lembreteAcaoSchema, lembretesDaAcao, tituloDaAcao } from './crm-acao'

const MODULE = 'crm'

const dataIso = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const hora = z.string().regex(/^\d{2}:\d{2}$/)

export function createCrmRouter(crmService: CrmService, tarefaService: AgendaTarefaService, importComercialService?: ImportComercialService) {
  const oportunidade = async (id: string, empresaId?: string | null) => {
    const op = await crmService.oportunidadeNoEscopo(id, empresaId)
    if (!op) throw new TRPCError({ code: 'NOT_FOUND', message: 'Oportunidade não encontrada.' })
    return op
  }
  const acao = async (id: string, empresaId?: string | null) => {
    const t = await crmService.acaoNoEscopo(id, empresaId)
    if (!t) throw new TRPCError({ code: 'NOT_FOUND', message: 'Ação não encontrada.' })
    return t
  }
  const interacao = async (id: string, empresaId?: string | null) => {
    const i = await crmService.interacaoNoEscopo(id, empresaId)
    if (!i) throw new TRPCError({ code: 'NOT_FOUND', message: 'Interação não encontrada.' })
    return i
  }

  return router({
    // ── Etapas do Pipeline ─────────────────────────────────
    listEtapas: readProcedure(MODULE)
      .query(({ ctx }) => crmService.listEtapas(ctx.empresaId)),

    createEtapa: writeProcedure(MODULE)
      .input(z.object({ nome: z.string().min(1), cor: z.string().optional(), probabilidade: z.number().optional(), ordem: z.number().optional() }))
      .mutation(({ input, ctx }) => crmService.createEtapa(input, ctx.empresaId)),

    updateEtapa: writeProcedure(MODULE)
      .input(z.object({ id: z.string(), data: updateCrmEtapaSchema }))
      .mutation(({ input }) => crmService.updateEtapa(input.id, input.data)),

    deleteEtapa: deleteProcedure(MODULE)
      .input(z.object({ id: z.string() }))
      .mutation(({ input }) => crmService.deleteEtapa(input.id)),

    // ── Verificar cliente existente ───────────────────────
    checkCliente: readProcedure(MODULE)
      .input(z.object({ cpfCnpj: z.string().optional(), razaoSocial: z.string().optional() }))
      .query(({ input }) => crmService.checkCliente(input.cpfCnpj, input.razaoSocial)),

    // ── Auto-complete por CPF (busca em Cliente PF + Socio cadastrados) ──
    lookupPorCpf: readProcedure(MODULE)
      .input(z.object({ cpf: z.string() }))
      .query(({ input }) => crmService.lookupPorCpf(input.cpf)),

    // ── Oportunidades ──────────────────────────────────────
    list: readProcedure(MODULE)
      .input(listOportunidadeSchema)
      .query(({ input, ctx }) => crmService.list(input, ctx.isMaster ?? false, ctx.empresaId)),

    /** Cards fora do funil ativo: arquivados + em Declinio. Tela /crm/arquivados. */
    listForaDoFunil: readProcedure(MODULE)
      .input(listForaDoFunilSchema)
      .query(({ input, ctx }) => crmService.listForaDoFunil(input, ctx.isMaster ?? false, ctx.empresaId)),

    /**
     * Devolve um card arquivado ao funil. Mutacao propria em vez de
     * `update({ isActive: true })`: o update generico registra na timeline
     * "Campos alterados: isActive", que nao diz nada a quem le o historico.
     */
    reativar: writeProcedure(MODULE)
      .input(z.object({ id: z.string() }))
      .mutation(({ input, ctx }) => crmService.reativar(input.id, ctx.userId)),

    listKanban: readProcedure(MODULE)
      .input(z.object({ search: z.string().optional(), campanhaSlug: z.string().optional() }).optional())
      .query(({ ctx, input }) => crmService.listKanban(ctx.isMaster ?? false, ctx.empresaId, input?.search, input?.campanhaSlug)),

    getById: readProcedure(MODULE)
      .input(z.object({ id: z.string() }))
      .query(({ input }) => crmService.getById(input.id)),

    create: writeProcedure(MODULE)
      .input(createOportunidadeSchema)
      .mutation(({ input, ctx }) => crmService.create(input, ctx.userId, ctx.empresaId)),

    update: writeProcedure(MODULE)
      .input(z.object({ id: z.string(), data: updateOportunidadeSchema }))
      .mutation(({ input, ctx }) => crmService.update(input.id, input.data, ctx.userId)),

    moverEtapa: writeProcedure(MODULE)
      .input(z.object({ id: z.string(), etapaId: z.string() }))
      .mutation(({ input, ctx }) => crmService.moverEtapa(input.id, input.etapaId, ctx.userId, ctx.empresaId)),

    reordenar: writeProcedure(MODULE)
      .input(z.object({ ids: z.array(z.string()) }))
      .mutation(({ input }) => crmService.reordenar(input.ids)),

    delete: deleteProcedure(MODULE)
      .input(z.object({ id: z.string() }))
      .mutation(({ input, ctx }) => crmService.delete(input.id, ctx.userId)),

    // ── Ações ──────────────────────────────────────────────
    // O andamento do atendimento, com prazo e responsáveis. Por baixo são
    // AgendaTarefas vinculadas ao card (ver crm-acao.ts): ciência por membro,
    // lembretes por sino/e-mail e presença na lista de tarefas da Agenda. As
    // rotas moram aqui, e não em `agenda.tarefa.*`, para valerem pela permissão
    // do CRM — quem atende lead nem sempre tem a Agenda liberada.
    acoes: router({
      list: readProcedure(MODULE)
        .input(z.object({ oportunidadeId: z.string() }))
        .query(async ({ input, ctx }) => {
          await oportunidade(input.oportunidadeId, ctx.empresaId)
          return tarefaService.list({ oportunidadeId: input.oportunidadeId })
        }),

      create: writeProcedure(MODULE)
        .input(z.object({
          oportunidadeId: z.string(),
          descricao: z.string().min(1),
          prazo: dataIso,
          horaPrazo: hora.nullable().optional(),
          /** Usuários responsáveis. Vazio = só quem registra. */
          responsaveis: z.array(z.string()).default([]),
          lembrete: lembreteAcaoSchema.default({ minutosAntes: null, email: false }),
          /** Registro de algo que JÁ foi feito: nasce concluída, sem lembrete. */
          realizada: z.boolean().default(false),
        }))
        .mutation(async ({ input, ctx }) => {
          const op = await oportunidade(input.oportunidadeId, ctx.empresaId)
          const titulo = tituloDaAcao(input.descricao)
          // Quem registra é sempre membro (regra da AgendaTarefa). Numa ação já
          // realizada os responsáveis não entram: não há o que lembrar a eles.
          const t = await tarefaService.create({
            titulo,
            descricao: input.descricao,
            prazo: input.prazo,
            horaPrazo: input.horaPrazo ?? null,
            participantes: input.realizada ? [] : input.responsaveis,
            empresaId: op.empresaId,
            oportunidadeId: op.id,
          }, ctx.userId)
          if (input.realizada) {
            await tarefaService.darCiencia(t.id, ctx.userId, true)
          } else {
            await tarefaService.saveLembretes(t.id, lembretesDaAcao(input.lembrete))
          }
          await crmService.addEvento(op.id, ctx.userId, 'tarefa', `Ação registrada: ${titulo}`)
          return tarefaService.getById(t.id)
        }),

      update: writeProcedure(MODULE)
        .input(z.object({
          id: z.string(),
          descricao: z.string().min(1).optional(),
          prazo: dataIso.optional(),
          horaPrazo: hora.nullable().optional(),
          responsaveis: z.array(z.string()).optional(),
          /** Só vem quando o usuário mexeu no lembrete — senão os atuais ficam. */
          lembrete: lembreteAcaoSchema.optional(),
        }))
        .mutation(async ({ input, ctx }) => {
          const t = await acao(input.id, ctx.empresaId)
          const titulo = input.descricao !== undefined ? tituloDaAcao(input.descricao) : t.titulo
          await tarefaService.update(t.id, {
            ...(input.descricao !== undefined ? { titulo, descricao: input.descricao } : {}),
            ...(input.prazo !== undefined ? { prazo: input.prazo } : {}),
            ...(input.horaPrazo !== undefined ? { horaPrazo: input.horaPrazo } : {}),
            ...(input.responsaveis !== undefined ? { participantes: input.responsaveis } : {}),
          })
          if (input.lembrete) await tarefaService.saveLembretes(t.id, lembretesDaAcao(input.lembrete))
          await crmService.addEvento(t.oportunidadeId, ctx.userId, 'tarefa', `Ação editada: ${titulo}`)
          return tarefaService.getById(t.id)
        }),

      /**
       * Concluir = o usuário atual dá ciência. A ação só fica concluída quando
       * todos os responsáveis derem (regra da AgendaTarefa).
       */
      alternarConclusao: writeProcedure(MODULE)
        .input(z.object({ id: z.string(), concluida: z.boolean() }))
        .mutation(async ({ input, ctx }) => {
          const t = await acao(input.id, ctx.empresaId)
          const r = await tarefaService.darCiencia(t.id, ctx.userId, input.concluida)
          await crmService.addEvento(t.oportunidadeId, ctx.userId, 'tarefa',
            r.concluida ? `Ação concluída: ${t.titulo}` : input.concluida ? `Ciência dada na ação: ${t.titulo}` : `Ação reaberta: ${t.titulo}`)
          return r
        }),

      delete: deleteProcedure(MODULE)
        .input(z.object({ id: z.string() }))
        .mutation(async ({ input, ctx }) => {
          const t = await acao(input.id, ctx.empresaId)
          await tarefaService.delete(t.id)
          await crmService.addEvento(t.oportunidadeId, ctx.userId, 'tarefa', `Ação excluída: ${t.titulo}`)
          return { id: t.id }
        }),
    }),

    // ── Interações ─────────────────────────────────────────
    // Cada contato com o lead. A lista vem no `getById` (campo `interacoes`).
    interacoes: router({
      create: writeProcedure(MODULE)
        .input(interacaoSchema.extend({ oportunidadeId: z.string() }))
        .mutation(async ({ input, ctx }) => {
          const { oportunidadeId, ...dados } = input
          await oportunidade(oportunidadeId, ctx.empresaId)
          return crmService.addInteracao(oportunidadeId, ctx.userId || '', dados)
        }),

      update: writeProcedure(MODULE)
        .input(interacaoSchema.extend({ id: z.string() }))
        .mutation(async ({ input, ctx }) => {
          const { id, ...dados } = input
          await interacao(id, ctx.empresaId)
          return crmService.updateInteracao(id, ctx.userId || '', dados)
        }),

      delete: deleteProcedure(MODULE)
        .input(z.object({ id: z.string() }))
        .mutation(async ({ input, ctx }) => {
          await interacao(input.id, ctx.empresaId)
          return crmService.deleteInteracao(input.id, ctx.userId || '')
        }),
    }),

    // ── Mensagens ──────────────────────────────────────────
    addMensagem: writeProcedure(MODULE)
      .input(z.object({
        oportunidadeId: z.string(),
        mensagem: z.string().min(1),
      }))
      .mutation(({ input, ctx }) => crmService.addMensagem(input.oportunidadeId, ctx.userId || '', input.mensagem)),

    // ── Arquivos ───────────────────────────────────────────
    addArquivo: writeProcedure(MODULE)
      .input(z.object({
        oportunidadeId: z.string(),
        fileName: z.string(),
        fileUrl: z.string(),
        fileSize: z.number().optional(),
        mimeType: z.string().optional(),
      }))
      .mutation(({ input, ctx }) => crmService.addArquivo(input.oportunidadeId, input, ctx.userId)),

    removeArquivo: deleteProcedure(MODULE)
      .input(z.object({ id: z.string() }))
      .mutation(({ input, ctx }) => crmService.removeArquivo(input.id, ctx.userId)),

    // ── Tags ───────────────────────────────────────────────
    listTags: readProcedure(MODULE)
      .query(({ ctx }) => crmService.listTags(ctx.empresaId)),

    createTag: writeProcedure(MODULE)
      .input(z.object({ nome: z.string().min(1), cor: z.string().optional() }))
      .mutation(({ input, ctx }) => crmService.createTag(input, ctx.empresaId)),

    updateTag: writeProcedure(MODULE)
      .input(z.object({ id: z.string(), nome: z.string().optional(), cor: z.string().optional() }))
      .mutation(({ input }) => crmService.updateTag(input.id, input)),

    deleteTag: deleteProcedure(MODULE)
      .input(z.object({ id: z.string() }))
      .mutation(({ input }) => crmService.deleteTag(input.id)),

    addTag: writeProcedure(MODULE)
      .input(z.object({ oportunidadeId: z.string(), tagId: z.string() }))
      .mutation(({ input, ctx }) => crmService.addTagToOportunidade(input.oportunidadeId, input.tagId, ctx.userId)),

    removeTag: writeProcedure(MODULE)
      .input(z.object({ oportunidadeId: z.string(), tagId: z.string() }))
      .mutation(({ input, ctx }) => crmService.removeTagFromOportunidade(input.oportunidadeId, input.tagId, ctx.userId)),

    // ── Eventos (log) ───────────────────────────────────────
    listEventos: readProcedure(MODULE)
      .input(z.object({ oportunidadeId: z.string() }))
      .query(({ input }) => crmService.listEventos(input.oportunidadeId)),

    // ── Configuracoes ───────────────────────────────────────
    getConfig: readProcedure(MODULE)
      .query(({ ctx }) => crmService.getConfig(ctx.empresaId)),

    saveConfig: writeProcedure(MODULE)
      .input(z.object({ key: z.string(), value: z.string() }))
      .mutation(({ input, ctx }) => crmService.saveConfig(input.key, input.value, ctx.empresaId)),

    // ── Estatisticas ───────────────────────────────────────
    getStats: readProcedure(MODULE)
      .query(({ ctx }) => crmService.getStats(ctx.isMaster ?? false, ctx.empresaId)),

    // ── Relatorios ────────────────────────────────────────
    reportFunil: readProcedure(MODULE)
      .input(z.object({ dias: z.number().optional() }))
      .query(({ input, ctx }) => crmService.reportFunil(ctx.empresaId, input.dias)),

    reportDesempenho: readProcedure(MODULE)
      .input(z.object({ dias: z.number().optional() }))
      .query(({ input, ctx }) => crmService.reportDesempenho(ctx.empresaId, input.dias)),

    reportOrigem: readProcedure(MODULE)
      .input(z.object({ dias: z.number().optional() }))
      .query(({ input, ctx }) => crmService.reportOrigem(ctx.empresaId, input.dias)),

    reportTempoMedio: readProcedure(MODULE)
      .query(({ ctx }) => crmService.reportTempoMedio(ctx.empresaId)),

    // ── Importacao do legado (v1) ─────────────────────────
    importarLegado: writeProcedure(MODULE)
      .mutation(() => {
        if (!importComercialService) throw new Error('Servico de importacao nao disponivel')
        // Disparar em background — nao aguardar conclusao
        importComercialService.importarTudo().catch(e => console.error('[IMPORT] Erro:', e.message))
        return { ok: true, message: 'Importacao iniciada em background' }
      }),

    getImportProgress: readProcedure(MODULE)
      .query(() => importComercialService?.getProgress() || { status: 'idle', fase: '', current: 0, total: 0, logs: [] }),
  })
}
