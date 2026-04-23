import { z } from 'zod'
import { router, readProcedure, writeProcedure, deleteProcedure } from '../trpc/trpc.service'
import { createClienteSchema, updateClienteSchema, listClienteSchema } from '@saas/types'
import { ClienteService } from './cliente.service'
import { LegacyImportService } from './legacy-import.service'
import { SciService } from './sci.service'
import { IntegrationService } from './integration.service'

const MODULE = 'clientes'

const filtrosSchema = z.object({
  numero: z.string().optional(),
  situacao: z.string().optional(),
  estado: z.string().optional(),
  municipio: z.string().optional(),
  tributacao: z.string().optional(),
}).default({})

export function createClienteRouter(
  clienteService: ClienteService,
  legacyImportService: LegacyImportService,
  sciService: SciService,
  integrationService?: IntegrationService,
) {
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

    // Esvaziar lixeira
    emptyTrash: deleteProcedure(MODULE)
      .mutation(({ ctx }) => clienteService.emptyTrash(ctx.isMaster, ctx.empresaId)),

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

    // === SERVIÇOS (ÁREAS CONTRATADAS) ===
    servicosListar: readProcedure(MODULE)
      .input(z.object({ clienteId: z.string() }))
      .query(({ input }) => clienteService.listServicos(input.clienteId)),

    servicosSalvar: writeProcedure(MODULE)
      .input(z.object({
        clienteId: z.string(),
        items: z.array(z.object({
          areaId: z.string(),
          contratado: z.boolean(),
          responsavelId: z.string().nullable().optional(),
          substitutoId: z.string().nullable().optional(),
          dataEncerramento: z.string().nullable().optional(),
          observacoes: z.string().nullable().optional(),
        })),
      }))
      .mutation(({ input, ctx }) => clienteService.saveServicos(input.clienteId, input.items, ctx.userId, ctx.isMaster)),

    servicosGetParametros: readProcedure(MODULE)
      .input(z.object({ clienteAreaContratadaId: z.string() }))
      .query(({ input }) => clienteService.getParametros(input.clienteAreaContratadaId)),

    servicosSaveParametros: writeProcedure(MODULE)
      .input(z.object({
        clienteAreaContratadaId: z.string(),
        params: z.array(z.object({
          tipo: z.string().min(1),
          nome: z.string().min(1),
          descricao: z.string().optional(),
          valor: z.number().min(0).max(5).default(0),
        })),
      }))
      .mutation(({ input }) => clienteService.saveParametros(input.clienteAreaContratadaId, input.params)),

    servicosClientesParaCopiar: readProcedure(MODULE)
      .input(z.object({ clienteId: z.string() }))
      .query(({ input, ctx }) => clienteService.getClientesParaCopiarEstrutura(input.clienteId, ctx.empresaId)),

    servicosCopiarEstrutura: writeProcedure(MODULE)
      .input(z.object({ fromClienteId: z.string(), toClienteAreaContratadaId: z.string() }))
      .mutation(({ input }) => clienteService.copiarEstrutura(input.fromClienteId, input.toClienteAreaContratadaId)),

    // === PARTICULARIDADES ===
    particularidadesListar: readProcedure(MODULE)
      .input(z.object({ clienteId: z.string() }))
      .query(({ input }) => clienteService.listParticularidades(input.clienteId)),

    particularidadesSalvar: writeProcedure(MODULE)
      .input(z.object({
        clienteAreaContratadaId: z.string(),
        texto: z.string(),
      }))
      .mutation(({ input, ctx }) => clienteService.saveParticularidade(input.clienteAreaContratadaId, input.texto, ctx.userId)),

    // === ACESSOS (Legalização) ===
    listAcessos: readProcedure(MODULE)
      .input(z.object({ clienteId: z.string() }))
      .query(({ input }) => clienteService.listAcessos(input.clienteId)),

    addAcesso: writeProcedure(MODULE)
      .input(z.object({
        clienteId: z.string(),
        portal: z.string().min(1),
        usuario: z.string().optional(),
        senha: z.string().optional(),
        observacoes: z.string().optional(),
      }))
      .mutation(({ input }) => clienteService.addAcesso(input.clienteId, input)),

    updateAcesso: writeProcedure(MODULE)
      .input(z.object({
        id: z.string(),
        portal: z.string().optional(),
        usuario: z.string().optional(),
        senha: z.string().optional(),
        observacoes: z.string().optional(),
      }))
      .mutation(({ input }) => clienteService.updateAcesso(input.id, input)),

    removeAcesso: deleteProcedure(MODULE)
      .input(z.object({ id: z.string() }))
      .mutation(({ input }) => clienteService.removeAcesso(input.id)),

    // === VENCIMENTOS (Legalização) ===
    listVencimentos: readProcedure(MODULE)
      .input(z.object({ clienteId: z.string() }))
      .query(({ input }) => clienteService.listVencimentos(input.clienteId)),

    addVencimento: writeProcedure(MODULE)
      .input(z.object({
        clienteId: z.string(),
        descricao: z.string().min(1),
        dataVencimento: z.string(),
        alertaDias: z.number().default(30),
        observacoes: z.string().optional(),
      }))
      .mutation(({ input }) => clienteService.addVencimento(input.clienteId, input)),

    toggleVencimento: writeProcedure(MODULE)
      .input(z.object({ id: z.string() }))
      .mutation(({ input }) => clienteService.toggleVencimento(input.id)),

    removeVencimento: deleteProcedure(MODULE)
      .input(z.object({ id: z.string() }))
      .mutation(({ input }) => clienteService.removeVencimento(input.id)),

    // === ANDAMENTOS (Legalização) ===
    listAndamentos: readProcedure(MODULE)
      .input(z.object({ clienteId: z.string() }))
      .query(({ input }) => clienteService.listAndamentos(input.clienteId)),

    addAndamento: writeProcedure(MODULE)
      .input(z.object({
        clienteId: z.string(),
        descricao: z.string().min(1),
        tipo: z.string().default('geral'),
        status: z.string().default('pendente'),
        dataInicio: z.string().optional(),
        dataConclusao: z.string().optional(),
        observacoes: z.string().optional(),
      }))
      .mutation(({ input, ctx }) => clienteService.addAndamento(input.clienteId, input, ctx.userId)),

    updateAndamentoStatus: writeProcedure(MODULE)
      .input(z.object({ id: z.string(), status: z.string() }))
      .mutation(({ input }) => clienteService.updateAndamentoStatus(input.id, input.status)),

    removeAndamento: deleteProcedure(MODULE)
      .input(z.object({ id: z.string() }))
      .mutation(({ input }) => clienteService.removeAndamento(input.id)),

    // === CNAEs (Legalização) ===
    listCnaes: readProcedure(MODULE)
      .input(z.object({ clienteId: z.string() }))
      .query(({ input }) => clienteService.listCnaes(input.clienteId)),

    addCnae: writeProcedure(MODULE)
      .input(z.object({
        clienteId: z.string(),
        codigo: z.string().min(1),
        descricao: z.string().optional(),
        principal: z.boolean().default(false),
      }))
      .mutation(({ input }) => clienteService.addCnae(input.clienteId, input)),

    removeCnae: deleteProcedure(MODULE)
      .input(z.object({ id: z.string() }))
      .mutation(({ input }) => clienteService.removeCnae(input.id)),

    // === OBRIGAÇÕES ===
    listObrigacoes: readProcedure(MODULE)
      .input(z.object({ clienteId: z.string() }))
      .query(({ input }) => clienteService.listObrigacoes(input.clienteId)),

    addObrigacao: writeProcedure(MODULE)
      .input(z.object({
        clienteId: z.string(), nome: z.string().min(1),
        tipo: z.string().default('fixa'), periodicidade: z.string().default('mensal'),
        areaId: z.string().optional(), responsavelId: z.string().optional(),
        diaVencimento: z.number().optional(), observacoes: z.string().optional(),
      }))
      .mutation(({ input }) => clienteService.addObrigacao(input.clienteId, input)),

    updateObrigacaoStatus: writeProcedure(MODULE)
      .input(z.object({ id: z.string(), status: z.string() }))
      .mutation(({ input }) => clienteService.updateObrigacaoStatus(input.id, input.status)),

    toggleObrigacaoAtivo: writeProcedure(MODULE)
      .input(z.object({ id: z.string() }))
      .mutation(({ input }) => clienteService.toggleObrigacaoAtivo(input.id)),

    removeObrigacao: deleteProcedure(MODULE)
      .input(z.object({ id: z.string() }))
      .mutation(({ input }) => clienteService.removeObrigacao(input.id)),

    // === PROTOCOLOS ===
    listProtocolos: readProcedure(MODULE)
      .input(z.object({ clienteId: z.string() }))
      .query(({ input }) => clienteService.listProtocolos(input.clienteId)),

    addProtocolo: writeProcedure(MODULE)
      .input(z.object({
        clienteId: z.string(), orgao: z.string().min(1),
        tipo: z.string().default('consulta'), protocolo: z.string().min(1),
        descricao: z.string().optional(),
      }))
      .mutation(({ input, ctx }) => clienteService.addProtocolo(input.clienteId, input, ctx.userId)),

    updateProtocoloStatus: writeProcedure(MODULE)
      .input(z.object({ id: z.string(), status: z.string(), resultado: z.string().optional() }))
      .mutation(({ input }) => clienteService.updateProtocoloStatus(input.id, input.status, input.resultado)),

    removeProtocolo: deleteProcedure(MODULE)
      .input(z.object({ id: z.string() }))
      .mutation(({ input }) => clienteService.removeProtocolo(input.id)),

    // === OCORRÊNCIAS (Reclamações/Elogios — backend pronto, frontend no módulo Qualidade) ===
    listOcorrencias: readProcedure(MODULE)
      .input(z.object({ clienteId: z.string() }))
      .query(({ input }) => clienteService.listOcorrencias(input.clienteId)),

    addOcorrencia: writeProcedure(MODULE)
      .input(z.object({
        clienteId: z.string(), titulo: z.string().min(1),
        tipo: z.string().default('reclamacao'), descricao: z.string().optional(),
        prioridade: z.string().default('media'), areaId: z.string().optional(),
        responsavelId: z.string().optional(),
      }))
      .mutation(({ input, ctx }) => clienteService.addOcorrencia(input.clienteId, input, ctx.userId)),

    resolveOcorrencia: writeProcedure(MODULE)
      .input(z.object({ id: z.string(), resolucao: z.string().min(1) }))
      .mutation(({ input }) => clienteService.resolveOcorrencia(input.id, input.resolucao)),

    removeOcorrencia: deleteProcedure(MODULE)
      .input(z.object({ id: z.string() }))
      .mutation(({ input }) => clienteService.removeOcorrencia(input.id)),

    // === BI BALANCETE (Contábil) ===
    biListCategorias: readProcedure(MODULE)
      .input(z.object({ clienteId: z.string() }))
      .query(({ input }) => clienteService.biListCategorias(input.clienteId)),

    biSaveCategorias: writeProcedure(MODULE)
      .input(z.object({
        clienteId: z.string(),
        categorias: z.array(z.object({
          conta: z.string(), nomeSci: z.string().optional(), nomeExibicao: z.string().optional(),
          parentConta: z.string().nullable().optional(), nivel: z.number().optional(),
          ordem: z.number().optional(), tipo: z.string().optional(),
          ativo: z.boolean().optional(), formula: z.any().optional(),
        })),
      }))
      .mutation(({ input }) => clienteService.biSaveCategorias(input.clienteId, input.categorias)),

    biDeleteCategoria: deleteProcedure(MODULE)
      .input(z.object({ clienteId: z.string(), conta: z.string() }))
      .mutation(({ input }) => clienteService.biDeleteCategoria(input.clienteId, input.conta)),

    biListLinhas: readProcedure(MODULE)
      .input(z.object({ clienteId: z.string(), periodo: z.string().optional() }))
      .query(({ input }) => clienteService.biListLinhas(input.clienteId, input.periodo)),

    biGetPeriodos: readProcedure(MODULE)
      .input(z.object({ clienteId: z.string() }))
      .query(({ input }) => clienteService.biGetPeriodosDisponiveis(input.clienteId)),

    biImportLinhas: writeProcedure(MODULE)
      .input(z.object({
        clienteId: z.string(), periodo: z.string(),
        linhas: z.array(z.object({
          conta: z.string(), nomeConta: z.string(),
          saldoAnterior: z.number(), debitos: z.number(), creditos: z.number(),
          saldoAtual: z.number(), movimento: z.number(),
        })),
      }))
      .mutation(({ input }) => clienteService.biImportLinhas(input.clienteId, input.periodo, input.linhas)),

    biDeletePeriodo: deleteProcedure(MODULE)
      .input(z.object({ clienteId: z.string(), periodo: z.string() }))
      .mutation(({ input }) => clienteService.biDeletePeriodo(input.clienteId, input.periodo)),

    biGetLink: readProcedure(MODULE)
      .input(z.object({ clienteId: z.string() }))
      .query(({ input }) => clienteService.biGetOrCreateLink(input.clienteId)),

    biDeleteLink: deleteProcedure(MODULE)
      .input(z.object({ clienteId: z.string() }))
      .mutation(({ input }) => clienteService.biDeleteLink(input.clienteId)),

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

    // === INTEGRAÇÕES ===
    integration: integrationService ? router({
      // Job polling (compartilhado por todos os jobs)
      jobStatus: readProcedure(MODULE)
        .input(z.object({ jobId: z.string() }))
        .query(({ input }) => integrationService.getJobStatus(input.jobId)),

      jobResult: readProcedure(MODULE)
        .input(z.object({ jobId: z.string() }))
        .query(({ input }) => integrationService.getJobResult(input.jobId)),

      jobLogs: readProcedure(MODULE)
        .input(z.object({ jobId: z.string(), offset: z.number().default(0) }))
        .query(({ input }) => integrationService.getJobLogs(input.jobId, input.offset)),

      // 1. Cadastrar das Consultas
      cadastrarDasConsultas: writeProcedure(MODULE)
        .mutation(({ ctx }) => integrationService.cadastrarDasConsultas(ctx.empresaId)),

      // 2. Cadastrar pelo CNPJ
      buscarDadosCnpj: readProcedure(MODULE)
        .input(z.object({ cnpj: z.string().min(14) }))
        .query(({ input }) => integrationService.buscarDadosCnpj(input.cnpj)),

      cadastrarPeloCnpj: writeProcedure(MODULE)
        .input(z.object({ cnpj: z.string().min(14) }))
        .mutation(({ input, ctx }) => integrationService.cadastrarPeloCnpj(input.cnpj, ctx.empresaId)),

      // 3. Importar clientes (texto/CSV)
      importarJob: writeProcedure(MODULE)
        .input(z.object({
          clientes: z.array(z.object({
            documento: z.string(),
            razao_social: z.string().optional(),
            email: z.string().optional(),
            telefone: z.string().optional(),
            cidade: z.string().optional(),
            estado: z.string().optional(),
          })),
          atualizarExistentes: z.boolean().default(true),
          preencherPorCnpj: z.boolean().default(false),
        }))
        .mutation(({ input, ctx }) => integrationService.iniciarImportacaoJob(
          input.clientes, { atualizarExistentes: input.atualizarExistentes, preencherPorCnpj: input.preencherPorCnpj }, ctx.empresaId,
        )),

      // 4. SCI fiscal lote
      fiscalSciLote: writeProcedure(MODULE)
        .input(z.object({
          limit: z.number().min(1).max(500).default(50),
          force: z.boolean().default(false),
          onlyMissing: z.boolean().default(true),
        }))
        .mutation(({ input, ctx }) => integrationService.atualizarFiscalSciLote(input, ctx.empresaId)),

      // 5. OneClick lote (importar do legado com opções)
      oneclickJob: writeProcedure(MODULE)
        .input(z.object({
          limit: z.number().min(1).max(10000).default(50),
          allClients: z.boolean().default(false),
          force: z.boolean().default(false),
          importFlags: z.object({
            razao: z.boolean().optional(),
            comercial: z.boolean().optional(),
            grupo: z.boolean().optional(),
            contato: z.boolean().optional(),
            endereco: z.boolean().optional(),
            fiscal: z.boolean().optional(),
            registros: z.boolean().optional(),
            datas: z.boolean().optional(),
            areasContratadas: z.boolean().optional(),
            socios: z.boolean().optional(),
            servicosContratados: z.boolean().optional(),
            status: z.boolean().optional(),
            particularidades: z.boolean().optional(),
          }).default({}),
          includeNewFromOneclick: z.boolean().default(false),
          onlyNewFromOneclick: z.boolean().default(false),
          skipLeads: z.boolean().default(true),
        }))
        .mutation(({ input, ctx }) => integrationService.iniciarImportacaoOneClickJob(input, ctx.empresaId)),

      // 6. ID Sistema SCI (lote)
      idSistemaSciLote: writeProcedure(MODULE)
        .input(z.object({
          limit: z.number().min(1).max(500).default(50),
          force: z.boolean().default(false),
        }))
        .mutation(({ input, ctx }) => integrationService.atualizarIdSistemaSciLote(input, ctx.empresaId)),

      // 7. ReceitaWS
      receitawsPreview: readProcedure(MODULE)
        .input(z.object({ filtros: filtrosSchema }))
        .query(({ input, ctx }) => integrationService.receitawsPreview(input.filtros, ctx.empresaId)),

      receitawsJob: writeProcedure(MODULE)
        .input(z.object({ filtros: filtrosSchema }))
        .mutation(({ input, ctx }) => integrationService.receitawsIniciarJob(input.filtros, ctx.empresaId)),

      // 8. SERPRO CNPJ
      serproCnpjPreview: readProcedure(MODULE)
        .input(z.object({ filtros: filtrosSchema }))
        .query(({ input, ctx }) => integrationService.serproCnpjPreview(input.filtros, ctx.empresaId)),

      serproCnpjJob: writeProcedure(MODULE)
        .input(z.object({
          filtros: filtrosSchema,
          atualizarSocios: z.boolean().default(true),
          forceSocios: z.boolean().default(false),
        }))
        .mutation(({ input, ctx }) => integrationService.serproCnpjIniciarJob(
          input.filtros, { atualizarSocios: input.atualizarSocios, forceSocios: input.forceSocios }, ctx.empresaId,
        )),
    }) : undefined as never,
  })
}
