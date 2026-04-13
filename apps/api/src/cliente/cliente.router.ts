import { z } from 'zod'
import { router, readProcedure, writeProcedure, deleteProcedure } from '../trpc/trpc.service'
import { createClienteSchema, updateClienteSchema, listClienteSchema } from '@saas/types'
import { ClienteService } from './cliente.service'
import { LegacyImportService } from './legacy-import.service'
import { SciService } from './sci.service'

const MODULE = 'clientes'

export function createClienteRouter(clienteService: ClienteService, legacyImportService: LegacyImportService, sciService: SciService) {
  return router({
    // Listagem (ativos)
    list: readProcedure(MODULE)
      .input(listClienteSchema)
      .query(({ input, ctx }) => clienteService.list(input, ctx.isMaster, ctx.empresaId)),

    // Lixeira (soft-deleted)
    listTrash: readProcedure(MODULE)
      .input(listClienteSchema)
      .query(({ input, ctx }) => clienteService.listTrash(input, ctx.isMaster, ctx.empresaId)),

    // Obter por ID (inclui arquivos e contatos)
    getById: readProcedure(MODULE)
      .input(z.object({ id: z.string() }))
      .query(({ input, ctx }) => clienteService.getById(input.id, ctx.isMaster, ctx.empresaId)),

    // Criar
    create: writeProcedure(MODULE)
      .input(createClienteSchema)
      .mutation(({ input, ctx }) => clienteService.create(input, ctx.userId, ctx.empresaId)),

    // Atualizar
    update: writeProcedure(MODULE)
      .input(z.object({ id: z.string(), data: updateClienteSchema }))
      .mutation(({ input, ctx }) => clienteService.update(input.id, input.data, ctx.userId, ctx.isMaster, ctx.empresaId)),

    // Soft delete (mover para lixeira)
    delete: deleteProcedure(MODULE)
      .input(z.object({ id: z.string() }))
      .mutation(({ input, ctx }) => clienteService.delete(input.id, ctx.userId, ctx.isMaster, ctx.empresaId)),

    // Restaurar da lixeira
    restore: writeProcedure(MODULE)
      .input(z.object({ id: z.string() }))
      .mutation(({ input, ctx }) => clienteService.restore(input.id, ctx.userId, ctx.isMaster, ctx.empresaId)),

    // Excluir permanentemente
    deletePermanent: deleteProcedure(MODULE)
      .input(z.object({ id: z.string() }))
      .mutation(({ input, ctx }) => clienteService.deletePermanent(input.id, ctx.isMaster, ctx.empresaId)),

    // Log de auditoria
    getEvents: readProcedure(MODULE)
      .input(z.object({ clienteId: z.string() }))
      .query(({ input }) => clienteService.getEvents(input.clienteId)),

    // Exportar todos
    exportAll: readProcedure(MODULE)
      .query(({ ctx }) => clienteService.exportAll(ctx.isMaster, ctx.empresaId)),

    // Lista para select
    listForSelect: readProcedure(MODULE)
      .query(({ ctx }) => clienteService.listForSelect(ctx.isMaster, ctx.empresaId)),

    // Opções de filtro (valores distintos)
    getFilterOptions: readProcedure(MODULE)
      .query(({ ctx }) => clienteService.getFilterOptions(ctx.isMaster, ctx.empresaId)),

    // Importação em lote
    importBulk: writeProcedure(MODULE)
      .input(z.object({ items: z.array(createClienteSchema) }))
      .mutation(({ input, ctx }) => clienteService.bulkCreate(input.items, ctx.userId, ctx.empresaId)),

    // === ARQUIVOS ===
    listArquivos: readProcedure(MODULE)
      .input(z.object({ clienteId: z.string() }))
      .query(({ input }) => clienteService.listArquivos(input.clienteId)),

    addArquivo: writeProcedure(MODULE)
      .input(z.object({
        clienteId: z.string(),
        fileName: z.string(),
        fileUrl: z.string(),
        fileSize: z.number().optional(),
        mimeType: z.string().optional(),
        vencimento: z.string().optional(),
      }))
      .mutation(({ input, ctx }) => clienteService.addArquivo(input.clienteId, input, ctx.userId)),

    renameArquivo: writeProcedure(MODULE)
      .input(z.object({ arquivoId: z.string(), fileName: z.string().min(1) }))
      .mutation(({ input }) => clienteService.renameArquivo(input.arquivoId, input.fileName)),

    removeArquivo: deleteProcedure(MODULE)
      .input(z.object({ arquivoId: z.string() }))
      .mutation(({ input }) => clienteService.removeArquivo(input.arquivoId)),

    // === CONTATOS ===
    listContatos: readProcedure(MODULE)
      .input(z.object({ clienteId: z.string() }))
      .query(({ input }) => clienteService.listContatos(input.clienteId)),

    addContato: writeProcedure(MODULE)
      .input(z.object({
        clienteId: z.string(),
        nome: z.string().min(1),
        cargo: z.string().optional(),
        telefone: z.string().optional(),
        email: z.string().optional(),
        observacoes: z.string().optional(),
        principal: z.boolean().optional(),
        areaId: z.string().optional(),
      }))
      .mutation(({ input }) => clienteService.addContato(input.clienteId, input)),

    updateContato: writeProcedure(MODULE)
      .input(z.object({
        contatoId: z.string(),
        nome: z.string().optional(),
        cargo: z.string().optional(),
        telefone: z.string().optional(),
        email: z.string().optional(),
        observacoes: z.string().optional(),
        principal: z.boolean().optional(),
        areaId: z.string().nullable().optional(),
      }))
      .mutation(({ input }) => clienteService.updateContato(input.contatoId, input)),

    removeContato: deleteProcedure(MODULE)
      .input(z.object({ contatoId: z.string() }))
      .mutation(({ input }) => clienteService.removeContato(input.contatoId)),

    setPrincipalContato: writeProcedure(MODULE)
      .input(z.object({ contatoId: z.string() }))
      .mutation(({ input }) => clienteService.setPrincipalContato(input.contatoId)),

    // === PARÂMETROS DO CONTRATO ===
    getContratoParams: readProcedure(MODULE)
      .input(z.object({ clienteId: z.string() }))
      .query(({ input, ctx }) => clienteService.getContratoParams(input.clienteId, ctx.empresaId)),

    saveContratoParams: writeProcedure(MODULE)
      .input(z.object({
        clienteId: z.string(),
        honorario: z.number().default(0),
        lancamentos: z.number().default(0),
        faturamento: z.number().default(0),
        nfEntrada: z.number().default(0),
        nfSaida: z.number().default(0),
        nfPrestado: z.number().default(0),
        nfTomado: z.number().default(0),
        funcionarios: z.number().default(0),
      }))
      .mutation(({ input, ctx }) => clienteService.saveContratoParams(input.clienteId, ctx.empresaId, input)),

    // === SNAPSHOTS ERP ===
    getErpSnapshots: readProcedure(MODULE)
      .input(z.object({ clienteId: z.string(), datai: z.string().optional(), dataf: z.string().optional() }))
      .query(({ input, ctx }) => clienteService.getErpSnapshots(input.clienteId, ctx.empresaId, input.datai, input.dataf)),

    // === HISTÓRICO COMERCIAL ===
    listHistoricos: readProcedure(MODULE)
      .input(z.object({ clienteId: z.string() }))
      .query(({ input }) => clienteService.listHistoricos(input.clienteId)),

    createHistorico: writeProcedure(MODULE)
      .input(z.object({ clienteId: z.string(), mensagem: z.string().min(1), tipo: z.enum(['equipe', 'cliente']).default('equipe') }))
      .mutation(({ input, ctx }) => clienteService.createHistorico(input.clienteId, ctx.userId, input.mensagem, input.tipo)),

    updateHistorico: writeProcedure(MODULE)
      .input(z.object({ id: z.string(), mensagem: z.string().min(1) }))
      .mutation(({ input }) => clienteService.updateHistorico(input.id, input.mensagem)),

    deleteHistorico: deleteProcedure(MODULE)
      .input(z.object({ id: z.string() }))
      .mutation(({ input }) => clienteService.deleteHistorico(input.id)),

    // === SCI / ERP ===
    buscarIdSistemaSci: readProcedure(MODULE)
      .input(z.object({ cnpj: z.string() }))
      .query(({ input }) => sciService.buscarIdSistemaPorCnpj(input.cnpj)),

    getParametrosSugeridos: readProcedure(MODULE)
      .input(z.object({ clienteId: z.string() }))
      .query(async ({ input, ctx }) => {
        const cliente = await clienteService.getById(input.clienteId, ctx.isMaster, ctx.empresaId)
        const cnpj = (cliente.documento || '').replace(/\D/g, '')
        if (cnpj.length !== 14) throw new Error('Apenas clientes CNPJ podem obter parametros do SCI.')
        return sciService.calcularParametrosSugeridos(cnpj)
      }),

    buscarMetricasSci: readProcedure(MODULE)
      .input(z.object({ clienteId: z.string(), datai: z.string(), dataf: z.string(), indicadores: z.array(z.string()).optional() }))
      .query(async ({ input, ctx }) => {
        const cliente = await clienteService.getById(input.clienteId, ctx.isMaster, ctx.empresaId)
        const cnpj = (cliente.documento || '').replace(/\D/g, '')
        return sciService.buscarMetricasSci(cnpj, input.datai, input.dataf, input.indicadores)
      }),

    atualizarIdSistemaSci: writeProcedure(MODULE)
      .input(z.object({ clienteId: z.string(), force: z.boolean().default(false) }))
      .mutation(async ({ input, ctx }) => {
        const cliente = await clienteService.getById(input.clienteId, ctx.isMaster, ctx.empresaId)
        const doc = (cliente.documento || '').replace(/\D/g, '')

        if (doc.length !== 14) {
          throw new Error('ID Sistema só pode ser importado para clientes com CNPJ (14 dígitos).')
        }

        if (cliente.idSistema && !input.force) {
          return {
            needsConfirmation: true,
            currentId: cliente.idSistema,
            message: `Este cliente já possui ID Sistema: ${cliente.idSistema}. Deseja sobrescrever?`,
          }
        }

        let sciResult
        try {
          sciResult = await sciService.buscarIdSistemaPorCnpj(doc)
        } catch (e) {
          throw new Error(`Erro ao conectar ao SCI: ${(e as Error).message}`)
        }

        if (!sciResult || !sciResult.idCliente) {
          throw new Error(`Cliente não encontrado no SCI com o CNPJ ${doc}.`)
        }

        const idAnterior = cliente.idSistema
        await clienteService.update(input.clienteId, { idSistema: String(sciResult.idCliente) } as never, ctx.userId, ctx.isMaster, ctx.empresaId)

        return {
          needsConfirmation: false,
          idSistema: String(sciResult.idCliente),
          idAnterior,
          razaoSocialSci: sciResult.razaoSocial,
          metodo: sciResult.metodo,
        }
      }),

    // === IMPORTAÇÃO DO LEGADO ===
    legacyPreview: writeProcedure(MODULE)
      .query(() => legacyImportService.previewLegacy()),

    legacyImport: writeProcedure(MODULE)
      .mutation(({ ctx }) => legacyImportService.importFromLegacy(ctx.empresaId, ctx.userId)),
  })
}
