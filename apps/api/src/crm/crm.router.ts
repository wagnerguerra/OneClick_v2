import { z } from 'zod'
import { router, readProcedure, writeProcedure, deleteProcedure } from '../trpc/trpc.service'
import { createOportunidadeSchema, updateOportunidadeSchema, listOportunidadeSchema, updateCrmEtapaSchema } from '@saas/types'
import { CrmService } from './crm.service'
import { ImportComercialService } from './import-comercial.service'

const MODULE = 'crm'

export function createCrmRouter(crmService: CrmService, importComercialService?: ImportComercialService) {
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

    // ── Tarefas ────────────────────────────────────────────
    addTarefa: writeProcedure(MODULE)
      .input(z.object({
        oportunidadeId: z.string(),
        titulo: z.string().min(1),
        responsavelId: z.string().optional(),
        prazo: z.string().optional(),
      }))
      .mutation(({ input, ctx }) => crmService.addTarefa(input.oportunidadeId, input.titulo, input.responsavelId, input.prazo, ctx.userId)),

    toggleTarefa: writeProcedure(MODULE)
      .input(z.object({ id: z.string() }))
      .mutation(({ input, ctx }) => crmService.toggleTarefa(input.id, ctx.userId)),

    deleteTarefa: deleteProcedure(MODULE)
      .input(z.object({ id: z.string() }))
      .mutation(({ input, ctx }) => crmService.deleteTarefa(input.id, ctx.userId)),

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
