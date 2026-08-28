import { z } from 'zod'
import { router, readProcedure, writeProcedure, deleteProcedure } from '../trpc/trpc.service'
import {
  createProjetoSchema,
  updateProjetoSchema,
  listProjetosSchema,
  createTarefaSchema,
  updateTarefaSchema,
  listTarefasSchema,
  moverTarefaSchema,
  reordenarTarefasSchema,
  createProjetoTagSchema,
  updateProjetoTagSchema,
  addComentarioTarefaSchema,
  addAnexoTarefaSchema,
  createProjetoExecucaoSchema,
  updateProjetoExecucaoSchema,
  createRodadaSchema,
  updateRodadaSchema,
  createApontamentoSchema,
  updateApontamentoSchema,
  createRodadaMensagemSchema,
  addRodadaArquivoSchema,
} from '@saas/types'
import { ProjetoService } from './projeto.service'

const MODULE = 'projetos'

export function createProjetoRouter(svc: ProjetoService) {
  return router({
    // ── Projetos ──────────────────────────────────────────────
    list: readProcedure(MODULE)
      .input(listProjetosSchema)
      .query(({ input }) => svc.listProjetos(input)),

    getById: readProcedure(MODULE)
      .input(z.object({ id: z.string() }))
      .query(({ input }) => svc.getProjetoById(input.id)),

    create: writeProcedure(MODULE)
      .input(createProjetoSchema)
      .mutation(({ input, ctx }) => svc.createProjeto(input, ctx.userId ?? null)),

    update: writeProcedure(MODULE)
      .input(z.object({ id: z.string(), data: updateProjetoSchema }))
      .mutation(({ input, ctx }) => svc.updateProjeto(input.id, input.data, ctx.userId ?? null)),

    delete: deleteProcedure(MODULE)
      .input(z.object({ id: z.string() }))
      .mutation(({ input }) => svc.deleteProjeto(input.id)),

    // Alimentam os campos de vínculo do formulário. Ficam no módulo Projetos
    // porque quem edita projeto não tem, necessariamente, acesso ao cadastro
    // de clientes nem à administração de usuários.
    listClientesVinculaveis: readProcedure(MODULE)
      .input(z.object({ busca: z.string().optional() }).optional())
      .query(({ input, ctx }) => svc.listClientesVinculaveis(input?.busca, ctx)),

    listPessoas: readProcedure(MODULE)
      .input(z.object({ busca: z.string().optional() }).optional())
      .query(({ input, ctx }) => svc.listPessoas(input?.busca, ctx)),

    // ── Execuções (frentes de trabalho do projeto) ────────────
    listExecucoes: readProcedure(MODULE)
      .input(z.object({ projetoId: z.string() }))
      .query(({ input }) => svc.listExecucoes(input.projetoId)),

    createExecucao: writeProcedure(MODULE)
      .input(createProjetoExecucaoSchema)
      .mutation(({ input, ctx }) => svc.createExecucao(input, ctx.userId ?? null)),

    updateExecucao: writeProcedure(MODULE)
      .input(z.object({ id: z.string(), data: updateProjetoExecucaoSchema }))
      .mutation(({ input }) => svc.updateExecucao(input.id, input.data)),

    deleteExecucao: deleteProcedure(MODULE)
      .input(z.object({ id: z.string() }))
      .mutation(({ input }) => svc.deleteExecucao(input.id)),

    // ── Rodadas e apontamentos ────────────────────────────────
    listRodadas: readProcedure(MODULE)
      .input(z.object({ execucaoId: z.string() }))
      .query(({ input }) => svc.listRodadas(input.execucaoId)),

    createRodada: writeProcedure(MODULE)
      .input(createRodadaSchema)
      .mutation(({ input, ctx }) => svc.createRodada(input, ctx.userId ?? null)),

    updateRodada: writeProcedure(MODULE)
      .input(z.object({ id: z.string(), data: updateRodadaSchema }))
      .mutation(({ input }) => svc.updateRodada(input.id, input.data)),

    deleteRodada: deleteProcedure(MODULE)
      .input(z.object({ id: z.string() }))
      .mutation(({ input }) => svc.deleteRodada(input.id)),

    createApontamento: writeProcedure(MODULE)
      .input(createApontamentoSchema)
      .mutation(({ input, ctx }) => svc.createApontamento(input, ctx.userId ?? null)),

    updateApontamento: writeProcedure(MODULE)
      .input(z.object({ id: z.string(), data: updateApontamentoSchema }))
      .mutation(({ input, ctx }) => svc.updateApontamento(input.id, input.data, ctx.userId ?? null)),

    deleteApontamento: deleteProcedure(MODULE)
      .input(z.object({ id: z.string() }))
      .mutation(({ input }) => svc.deleteApontamento(input.id)),

    // ── Conversa e arquivos da rodada ─────────────────────────
    // A leitura vem dentro de listRodadas; aqui só se escreve e apaga.
    createRodadaMensagem: writeProcedure(MODULE)
      .input(createRodadaMensagemSchema)
      .mutation(({ input, ctx }) => svc.createRodadaMensagem(input, ctx.userId ?? null)),

    deleteRodadaMensagem: deleteProcedure(MODULE)
      .input(z.object({ id: z.string() }))
      .mutation(({ input }) => svc.deleteRodadaMensagem(input.id)),

    addRodadaArquivo: writeProcedure(MODULE)
      .input(addRodadaArquivoSchema)
      .mutation(({ input, ctx }) => svc.addRodadaArquivo(input, ctx.userId ?? null)),

    removerRodadaArquivo: deleteProcedure(MODULE)
      .input(z.object({ id: z.string() }))
      .mutation(({ input }) => svc.removerRodadaArquivo(input.id)),

    // ── Tarefas ───────────────────────────────────────────────
    listTarefas: readProcedure(MODULE)
      .input(listTarefasSchema)
      .query(({ input }) => svc.listTarefas(input)),

    listTarefasKanban: readProcedure(MODULE)
      .input(z.object({ projetoId: z.string() }))
      .query(({ input }) => svc.listTarefasKanban(input.projetoId)),

    getTarefa: readProcedure(MODULE)
      .input(z.object({ id: z.string() }))
      .query(({ input }) => svc.getTarefaById(input.id)),

    createTarefa: writeProcedure(MODULE)
      .input(createTarefaSchema)
      .mutation(({ input, ctx }) => svc.createTarefa(input, ctx.userId ?? null)),

    updateTarefa: writeProcedure(MODULE)
      .input(z.object({ id: z.string(), data: updateTarefaSchema }))
      .mutation(({ input, ctx }) => svc.updateTarefa(input.id, input.data, ctx.userId ?? null)),

    deleteTarefa: deleteProcedure(MODULE)
      .input(z.object({ id: z.string() }))
      .mutation(({ input }) => svc.deleteTarefa(input.id)),

    moverTarefa: writeProcedure(MODULE)
      .input(moverTarefaSchema)
      .mutation(({ input, ctx }) => svc.moverTarefa(input, ctx.userId ?? null)),

    reordenarTarefas: writeProcedure(MODULE)
      .input(reordenarTarefasSchema)
      .mutation(({ input }) => svc.reordenarTarefas(input)),

    // ── Tags ──────────────────────────────────────────────────
    listTags: readProcedure(MODULE)
      .input(z.object({ projetoId: z.string() }))
      .query(({ input }) => svc.listTags(input.projetoId)),

    createTag: writeProcedure(MODULE)
      .input(createProjetoTagSchema)
      .mutation(({ input }) => svc.createTag(input)),

    updateTag: writeProcedure(MODULE)
      .input(z.object({ id: z.string(), data: updateProjetoTagSchema }))
      .mutation(({ input }) => svc.updateTag(input.id, input.data)),

    deleteTag: deleteProcedure(MODULE)
      .input(z.object({ id: z.string() }))
      .mutation(({ input }) => svc.deleteTag(input.id)),

    // ── Comentário (timeline) ─────────────────────────────────
    addComentario: writeProcedure(MODULE)
      .input(addComentarioTarefaSchema)
      .mutation(({ input, ctx }) => svc.addComentario(input, ctx.userId ?? null)),

    // ── Anexo ─────────────────────────────────────────────────
    addAnexo: writeProcedure(MODULE)
      .input(addAnexoTarefaSchema)
      .mutation(({ input, ctx }) => svc.addAnexo(input, ctx.userId ?? null)),

    removerAnexo: deleteProcedure(MODULE)
      .input(z.object({ id: z.string() }))
      .mutation(({ input }) => svc.removerAnexo(input.id)),

    // ── Mensagens do PROJETO ──────────────────────────────────
    listMensagensProjeto: readProcedure(MODULE)
      .input(z.object({ projetoId: z.string() }))
      .query(({ input }) => svc.listMensagensProjeto(input.projetoId)),

    addMensagemProjeto: writeProcedure(MODULE)
      .input(z.object({ projetoId: z.string(), texto: z.string().min(1) }))
      .mutation(({ input, ctx }) => svc.addMensagemProjeto(input.projetoId, input.texto, ctx.userId ?? null)),

    // ── Anexos do PROJETO ─────────────────────────────────────
    listAnexosProjeto: readProcedure(MODULE)
      .input(z.object({ projetoId: z.string() }))
      .query(({ input }) => svc.listAnexosProjeto(input.projetoId)),

    addAnexoProjeto: writeProcedure(MODULE)
      .input(z.object({
        projetoId: z.string(),
        nome: z.string().min(1),
        url: z.string().min(1),
        tamanho: z.number().int().min(0),
        mimeType: z.string().nullable().optional(),
      }))
      .mutation(({ input, ctx }) => svc.addAnexoProjeto(
        input.projetoId, input.nome, input.url, input.tamanho,
        input.mimeType ?? null, ctx.userId ?? null,
      )),

    removerAnexoProjeto: deleteProcedure(MODULE)
      .input(z.object({ id: z.string() }))
      .mutation(({ input }) => svc.removerAnexoProjeto(input.id)),

    // ── Eventos/Histórico do PROJETO ──────────────────────────
    listEventosProjeto: readProcedure(MODULE)
      .input(z.object({ projetoId: z.string() }))
      .query(({ input }) => svc.listEventosProjeto(input.projetoId)),

    // ── Configurações do módulo ───────────────────────────────
    getConfig: readProcedure(MODULE)
      .query(() => svc.getConfig()),

    updateConfig: writeProcedure(MODULE)
      .input(z.object({
        autoArquivarHabilitado: z.boolean().optional(),
        autoArquivarDias: z.number().int().min(1).max(3650).optional(),
      }))
      .mutation(({ input }) => svc.updateConfig(input)),

    executarAutoArquivar: writeProcedure(MODULE)
      .mutation(() => svc.executarAutoArquivar()),
  })
}
