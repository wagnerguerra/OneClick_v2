import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { prisma } from '@saas/db'
import { router, readProcedure, writeProcedure, deleteProcedure, protectedProcedure } from '../trpc/trpc.service'
import { createClienteSchema, updateClienteSchema, listClienteSchema } from '@saas/types'
import { ClienteService } from './cliente.service'
import { LegacyImportService } from './legacy-import.service'
import { SciService } from './sci.service'
import { IntegrationService } from './integration.service'
import { ImportOneclickService } from './import-oneclick.service'
import { CnpjService } from '../cnpj/cnpj.service'

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
  importOneclickService?: ImportOneclickService,
  cnpjService?: CnpjService,
  enriquecimentoService?: import('./cliente-enriquecimento.service').ClienteEnriquecimentoService,
  sincronizarResponsaveisService?: import('./sincronizar-responsaveis.service').SincronizarResponsaveisService,
  contratoSyncService?: import('./contrato-sync.service').ContratoSyncService,
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

    // Lista para select (lookup leve usado em vários módulos: orçamentos, CRM,
    // contratos, sócios, etc.). Qualquer usuário logado pode consultar — retorna
    // só metadata mínima (id, razaoSocial, nomeFantasia, code, documento, situacao),
    // não dados sensíveis. Filtragem por empresa via ctx.empresaId é mantida.
    listForSelect: protectedProcedure
      .query(({ ctx }) => clienteService.listForSelect(ctx.isMaster, ctx.empresaId)),

    // ── Opcoes editaveis (Atividade, Origem) ───────────────
    listOpcoes: readProcedure(MODULE)
      .input(z.object({ tipo: z.string() }))
      .query(async ({ input }) => {
        return prisma.$queryRawUnsafe<Array<{ id: string; tipo: string; valor: string; ordem: number }>>(
          `SELECT id, tipo, valor, ordem FROM opcoes_cadastro WHERE tipo = $1 AND ativo = true ORDER BY ordem ASC`, input.tipo,
        )
      }),

    createOpcao: writeProcedure(MODULE)
      .input(z.object({ tipo: z.string(), valor: z.string().min(1) }))
      .mutation(async ({ input }) => {
        const max = await prisma.$queryRawUnsafe<Array<{ m: number }>>(`SELECT COALESCE(MAX(ordem), 0)::int as m FROM opcoes_cadastro WHERE tipo = $1`, input.tipo)
        const ordem = (max[0]?.m || 0) + 1
        await prisma.$executeRawUnsafe(
          `INSERT INTO opcoes_cadastro (id, tipo, valor, ordem) VALUES (gen_random_uuid()::text, $1, $2, $3)`, input.tipo, input.valor, ordem,
        )
        return { ok: true }
      }),

    updateOpcao: writeProcedure(MODULE)
      .input(z.object({ id: z.string(), valor: z.string().optional(), ordem: z.number().optional() }))
      .mutation(async ({ input }) => {
        if (input.valor !== undefined) await prisma.$executeRawUnsafe(`UPDATE opcoes_cadastro SET valor = $1 WHERE id = $2`, input.valor, input.id)
        if (input.ordem !== undefined) await prisma.$executeRawUnsafe(`UPDATE opcoes_cadastro SET ordem = $1 WHERE id = $2`, input.ordem, input.id)
        return { ok: true }
      }),

    deleteOpcao: deleteProcedure(MODULE)
      .input(z.object({ id: z.string() }))
      .mutation(async ({ input }) => {
        await prisma.$executeRawUnsafe(`DELETE FROM opcoes_cadastro WHERE id = $1`, input.id)
        return { ok: true }
      }),

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
          categoriaDre: z.string().nullable().optional(),
          sinal: z.number().int().nullable().optional(),
        })),
      }))
      .mutation(({ input }) => clienteService.biSaveCategorias(input.clienteId, input.categorias)),

    biDeleteCategoria: deleteProcedure(MODULE)
      .input(z.object({ clienteId: z.string(), conta: z.string() }))
      .mutation(({ input }) => clienteService.biDeleteCategoria(input.clienteId, input.conta)),

    biListPlanoContasPadrao: readProcedure(MODULE)
      .query(() => clienteService.biListPlanoContasPadrao()),

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

        // Tenta SCI local primeiro. Se falhar com erro indicativo de que o SCI
        // não está acessível (ENOENT no python, conexão recusada Firebird,
        // timeout), faz fallback pra Launcher remoto via SSE.
        try {
          return await sciService.buscarMetricasSci(cnpj, input.datai, input.dataf, input.indicadores)
        } catch (err) {
          const msg = (err as Error).message || ''
          const sciUnreachable = /ENOENT|conn|connect|refused|timeout|Firebird|python|Não foi possível conectar/i.test(msg)
          if (!sciUnreachable || !contratoSyncService) throw err

          // Fallback: pede ao Launcher local via SSE
          console.log(`[Cliente] SCI local indisponível, pedindo ao Launcher: ${msg.slice(0, 100)}`)
          return contratoSyncService.requestErpRemote({
            cnpj,
            datai: input.datai,
            dataf: input.dataf,
            indicadores: input.indicadores,
          })
        }
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

    // ── DT-e Mensagens ────────────────────────────────
    dteMensagens: readProcedure(MODULE)
      .input(z.object({ clienteId: z.string() }))
      .query(async ({ input }) => {
        await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS cliente_dte_mensagens (
          id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text, cliente_id TEXT NOT NULL,
          tipo TEXT, titulo TEXT, data_mensagem TIMESTAMPTZ, observacao TEXT,
          created_at TIMESTAMPTZ DEFAULT NOW()
        )`).catch(() => {})
        return prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
          `SELECT id, tipo, titulo, data_mensagem, observacao, created_at FROM cliente_dte_mensagens WHERE cliente_id = $1 ORDER BY data_mensagem DESC NULLS LAST`, input.clienteId,
        )
      }),

    dteAddMensagem: writeProcedure(MODULE)
      .input(z.object({ clienteId: z.string(), tipo: z.string().optional(), titulo: z.string(), dataMensagem: z.string().optional(), observacao: z.string().optional() }))
      .mutation(async ({ input }) => {
        await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS cliente_dte_mensagens (
          id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text, cliente_id TEXT NOT NULL,
          tipo TEXT, titulo TEXT, data_mensagem TIMESTAMPTZ, observacao TEXT,
          created_at TIMESTAMPTZ DEFAULT NOW()
        )`).catch(() => {})
        await prisma.$executeRawUnsafe(
          `INSERT INTO cliente_dte_mensagens (id, cliente_id, tipo, titulo, data_mensagem, observacao) VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5)`,
          input.clienteId, input.tipo || null, input.titulo, input.dataMensagem || null, input.observacao || null,
        )
        return { ok: true }
      }),

    dteDeleteMensagem: deleteProcedure(MODULE)
      .input(z.object({ id: z.string() }))
      .mutation(async ({ input }) => {
        await prisma.$executeRawUnsafe(`DELETE FROM cliente_dte_mensagens WHERE id = $1`, input.id)
        return { ok: true }
      }),

    // ── Capital Social ─────────────────────────────────
    getCapitalSocial: readProcedure(MODULE)
      .input(z.object({ clienteId: z.string() }))
      .query(async ({ input }) => {
        const rows = await prisma.$queryRawUnsafe<Array<{ capital_social: number | null }>>(
          `SELECT capital_social FROM clientes WHERE id = $1`, input.clienteId,
        )
        return { capitalSocial: rows[0]?.capital_social != null ? Number(rows[0].capital_social) : null }
      }),

    // ── Import CNAEs via Receita Federal ───────────────
    importCnaes: writeProcedure(MODULE)
      .input(z.object({ clienteId: z.string(), documento: z.string() }))
      .mutation(async ({ input }) => {
        const doc = input.documento.replace(/\D/g, '')

        // Usar CnpjService (SERPRO → BrasilAPI fallback) se disponível, senão BrasilAPI direto
        let data: { cnae_fiscal?: number; cnae_fiscal_descricao?: string; cnaes_secundarios?: Array<{ codigo: number; descricao: string }> }
        let fonte = 'brasilapi'

        if (cnpjService) {
          const result = await cnpjService.consultarCnpj(doc)
          fonte = result.fonte
          data = {
            cnae_fiscal: result.cnaePrincipalCodigo ? Number(result.cnaePrincipalCodigo) : undefined,
            cnae_fiscal_descricao: result.atividadePrincipal || undefined,
            cnaes_secundarios: result.cnaesSecundarios?.map(c => ({ codigo: Number(c.codigo), descricao: c.descricao })),
          }
        } else {
          const res = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${doc}`, { headers: { 'User-Agent': 'Mozilla/5.0' } })
          if (!res.ok) throw new Error('Erro ao consultar CNPJ na Receita Federal')
          data = await res.json()
        }

        let imported = 0
        let skipped = 0

        // Principal
        if (data.cnae_fiscal) {
          const codigo = String(data.cnae_fiscal)
          const descricao = String(data.cnae_fiscal_descricao || '')
          const exists = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
            `SELECT id FROM cliente_cnaes WHERE cliente_id = $1 AND codigo = $2 LIMIT 1`, input.clienteId, codigo,
          ).catch(() => [])
          if (exists.length === 0) {
            await prisma.$executeRawUnsafe(
              `INSERT INTO cliente_cnaes (id, cliente_id, codigo, descricao, principal, created_at) VALUES (gen_random_uuid()::text, $1, $2, $3, true, NOW())`,
              input.clienteId, codigo, descricao,
            )
            imported++
          } else { skipped++ }
        }

        // Secundários
        for (const cnae of data.cnaes_secundarios || []) {
          const codigo = String(cnae.codigo || '').trim()
          if (!codigo) continue
          const exists = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
            `SELECT id FROM cliente_cnaes WHERE cliente_id = $1 AND codigo = $2 LIMIT 1`, input.clienteId, codigo,
          ).catch(() => [])
          if (exists.length > 0) { skipped++; continue }
          await prisma.$executeRawUnsafe(
            `INSERT INTO cliente_cnaes (id, cliente_id, codigo, descricao, principal, created_at) VALUES (gen_random_uuid()::text, $1, $2, $3, false, NOW())`,
            input.clienteId, codigo, String(cnae.descricao || ''),
          ).catch(() => {})
          imported++
        }

        return { imported, skipped, message: imported > 0 ? `${imported} CNAE(s) importado(s)${skipped > 0 ? `, ${skipped} já existente(s)` : ''} — fonte: ${fonte}` : 'Nenhum CNAE novo encontrado' }
      }),

    // ── Import Sócios do OneClick Legado ────────────────
    importSociosOneclick: writeProcedure(MODULE)
      .input(z.object({ clienteId: z.string(), documento: z.string(), force: z.boolean().default(false) }))
      .mutation(async ({ input }) => {
        const doc = input.documento.replace(/\D/g, '')
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const mysql = require('mysql2/promise')
        const conn = await mysql.createConnection({
          host: process.env.LEGACY_DB_HOST || 'localhost', port: Number(process.env.LEGACY_DB_PORT || 3306),
          user: process.env.LEGACY_DB_USER || 'root', password: process.env.LEGACY_DB_PASSWORD || '',
          database: process.env.LEGACY_DB_NAME || 'oneclick_fiscal_serpro', connectTimeout: 8000,
        })

        try {
          // Resolver cliente no legado
          const [cliRows] = await conn.query(
            `SELECT id FROM clientes WHERE REPLACE(REPLACE(REPLACE(documento, '.', ''), '/', ''), '-', '') = ? LIMIT 1`, [doc],
          )
          if (!cliRows?.[0]) throw new Error('Cliente não encontrado no banco SERPRO2')

          // Se force=true, desativar sócios existentes
          if (input.force) {
            await prisma.socio.updateMany({ where: { clienteId: input.clienteId }, data: { isActive: false } })
          }

          const [socRows] = await conn.query(
            `SELECT nome, documento, qualificacao, percentual_participacao, valor_participacao, representante_nome, representante_qualificacao
             FROM clientes_socios WHERE cliente_id = ? AND ativo = 1`, [cliRows[0].id],
          )

          let imported = 0
          let skipped = 0

          for (const s of socRows || []) {
            const nome = String(s.nome || '').trim()
            if (!nome) continue

            // Verificar se já existe
            const exists = await prisma.socio.findFirst({ where: { clienteId: input.clienteId, nomeCompleto: { equals: nome, mode: 'insensitive' } }, select: { id: true } })
            if (exists) { skipped++; continue }

            // Mapear qualificação
            const qualStr = String(s.qualificacao || '').toLowerCase()
            let tipoSocio: 'SOCIO_ADMINISTRADOR' | 'SOCIO_DIRETOR' | 'REPRESENTANTE_LEGAL' | 'SOCIO_QUOTISTA' | 'TITULAR' = 'SOCIO_QUOTISTA'
            if (qualStr.includes('administrador')) tipoSocio = 'SOCIO_ADMINISTRADOR'
            else if (qualStr.includes('diretor') || qualStr.includes('presidente')) tipoSocio = 'SOCIO_DIRETOR'
            else if (qualStr.includes('titular')) tipoSocio = 'TITULAR'
            else if (qualStr.includes('representante') || qualStr.includes('procurador')) tipoSocio = 'REPRESENTANTE_LEGAL'

            await prisma.socio.create({
              data: {
                nomeCompleto: nome,
                cpf: s.documento ? String(s.documento).replace(/\D/g, '') : '',
                tipoSocio,
                participacao: s.percentual_participacao != null ? Number(s.percentual_participacao) : undefined,
                valorQuotas: s.valor_participacao != null ? Number(s.valor_participacao) : undefined,
                clienteId: input.clienteId,
                observacoes: `Importado do OneClick — ${s.qualificacao || ''}${s.representante_nome ? ' | Rep: ' + s.representante_nome : ''}`,
              },
            })
            imported++
          }

          return { imported, skipped, message: imported > 0 ? `${imported} sócio(s) importado(s) do OneClick${skipped > 0 ? `, ${skipped} já existente(s)` : ''}` : 'Nenhum sócio novo encontrado no OneClick' }
        } finally { try { await conn.end() } catch { /* */ } }
      }),

    // ── Import OneClick Legado ─────────────────────────
    importOneclick: writeProcedure(MODULE)
      .input(z.object({ clienteId: z.string(), documento: z.string() }))
      .mutation(async ({ input }) => {
        if (!importOneclickService) throw new Error('Serviço de importação OneClick não disponível')
        return importOneclickService.importar(input.clienteId, input.documento)
      }),

    // ── Resumo Legalização (para impressão) ─────────────
    resumoLegalizacao: readProcedure(MODULE)
      .input(z.object({ clienteId: z.string() }))
      .query(async ({ input }) => {
        const cli = await prisma.cliente.findUnique({
          where: { id: input.clienteId },
          select: {
            razaoSocial: true, nomeFantasia: true, documento: true,
            inscricaoEstadual: true, inscricaoMunicipal: true,
            cidade: true, uf: true, logradouro: true, numero: true, bairro: true, cep: true,
          },
        })
        if (!cli) return null

        const socios = await prisma.socio.findMany({
          where: { clienteId: input.clienteId, isActive: true },
          select: { nomeCompleto: true, cpf: true, tipoSocio: true, participacao: true },
          orderBy: { nomeCompleto: 'asc' },
        })

        const acessos = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
          `SELECT portal, usuario, observacoes FROM cliente_acessos WHERE cliente_id = $1 ORDER BY portal`, input.clienteId,
        ).catch(() => [])

        const vencimentos = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
          `SELECT descricao, data_vencimento, alerta_dias, observacoes, concluido FROM cliente_vencimentos WHERE cliente_id = $1 ORDER BY data_vencimento`, input.clienteId,
        ).catch(() => [])

        const andamentos = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
          `SELECT descricao, tipo, status, data_inicio, data_conclusao, observacoes, created_at FROM cliente_andamentos WHERE cliente_id = $1 ORDER BY created_at DESC`, input.clienteId,
        ).catch(() => [])

        const cnaes = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
          `SELECT codigo, descricao, principal FROM cliente_cnaes WHERE cliente_id = $1 ORDER BY principal DESC, codigo`, input.clienteId,
        ).catch(() => [])

        // Certidões (reusa mesma lógica)
        const certidoes: Array<{ label: string; situacao: string | null; dataValidade: string | null; sucesso: boolean }> = []
        const fed = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(`SELECT tipo_certidao, data_validade, sucesso FROM certidoes_cnd WHERE cliente_id = $1 AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 1`, input.clienteId).catch(() => [])
        if (fed[0]) certidoes.push({ label: 'CND Federal', situacao: fed[0].tipo_certidao as string, dataValidade: fed[0].data_validade ? (fed[0].data_validade as Date).toISOString().split('T')[0] : null, sucesso: fed[0].sucesso as boolean })
        const est = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(`SELECT sucesso FROM certidoes_cnd_estadual WHERE cliente_id = $1 ORDER BY created_at DESC LIMIT 1`, input.clienteId).catch(() => [])
        if (est[0]) certidoes.push({ label: 'CND Estadual', situacao: est[0].sucesso ? 'Negativa' : 'Não emitida', dataValidade: null, sucesso: est[0].sucesso as boolean })
        const mun = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(`SELECT tipo_certidao, municipio, data_validade, sucesso FROM certidoes_cnd_municipal WHERE cliente_id = $1 ORDER BY created_at DESC LIMIT 1`, input.clienteId).catch(() => [])
        if (mun[0]) certidoes.push({ label: `CND Municipal (${mun[0].municipio})`, situacao: mun[0].tipo_certidao as string, dataValidade: mun[0].data_validade ? (mun[0].data_validade as Date).toISOString().split('T')[0] : null, sucesso: mun[0].sucesso as boolean })
        const trb = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(`SELECT tipo_certidao, data_validade, sucesso FROM certidoes_cndt WHERE cliente_id = $1 ORDER BY created_at DESC LIMIT 1`, input.clienteId).catch(() => [])
        if (trb[0]) certidoes.push({ label: 'CNDT Trabalhista', situacao: trb[0].tipo_certidao as string, dataValidade: trb[0].data_validade ? (trb[0].data_validade as Date).toISOString().split('T')[0] : null, sucesso: trb[0].sucesso as boolean })
        const fgts = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(`SELECT tipo_certidao, data_validade, sucesso FROM certidoes_crf_fgts WHERE cliente_id = $1 ORDER BY created_at DESC LIMIT 1`, input.clienteId).catch(() => [])
        if (fgts[0]) certidoes.push({ label: 'CRF/FGTS', situacao: fgts[0].tipo_certidao as string, dataValidade: fgts[0].data_validade ? (fgts[0].data_validade as Date).toISOString().split('T')[0] : null, sucesso: fgts[0].sucesso as boolean })
        const cgu = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(`SELECT tipo_certidao, sucesso FROM certidoes_cgu WHERE cliente_id = $1 ORDER BY created_at DESC LIMIT 1`, input.clienteId).catch(() => [])
        if (cgu[0]) certidoes.push({ label: 'CGU', situacao: cgu[0].tipo_certidao as string, dataValidade: null, sucesso: cgu[0].sucesso as boolean })
        const alv = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(`SELECT status, data_fim_validade FROM alvaras_bombeiros WHERE cliente_id = $1 ORDER BY created_at DESC LIMIT 1`, input.clienteId).catch(() => [])
        if (alv[0]) certidoes.push({ label: 'Alvará Bombeiros', situacao: alv[0].status as string, dataValidade: alv[0].data_fim_validade ? String(alv[0].data_fim_validade).slice(0, 10) : null, sucesso: (alv[0].status as string) === 'Regular' })

        return { cliente: cli, socios, acessos, vencimentos, andamentos, cnaes, certidoes }
      }),

    // ── Capa do header (config global do modulo) ─────────────
    getHeaderCover: readProcedure(MODULE)
      .query(({ ctx }) => clienteService.getHeaderCover(ctx.empresaId)),

    setHeaderCover: protectedProcedure
      .input(z.object({ url: z.string().nullable() }))
      .mutation(({ input, ctx }) => {
        if (!ctx.isMaster) throw new TRPCError({ code: 'FORBIDDEN', message: 'Apenas o usuário master pode alterar a imagem de fundo' })
        return clienteService.setHeaderCover(input.url, ctx.empresaId)
      }),

    // ── Enriquecimento de CNAE (BrasilAPI → SERPRO fallback) ─────────
    enriquecerCnae: writeProcedure(MODULE)
      .input(z.object({ clienteId: z.string() }))
      .mutation(({ input }) => {
        if (!enriquecimentoService) throw new TRPCError({ code: 'NOT_IMPLEMENTED', message: 'Serviço de enriquecimento indisponível.' })
        return enriquecimentoService.enriquecerCnae(input.clienteId)
      }),

    enriquecerCnaeBulk: writeProcedure(MODULE)
      .input(z.object({
        apenasSemCnae: z.boolean().default(true),
        limite: z.coerce.number().int().min(1).max(2000).optional(),
      }))
      .mutation(({ input }) => {
        if (!enriquecimentoService) throw new TRPCError({ code: 'NOT_IMPLEMENTED', message: 'Serviço de enriquecimento indisponível.' })
        return enriquecimentoService.enriquecerCnaeBulk(input)
      }),

    // ── Sincronização de responsáveis (via Acessórias) ────────────
    sincronizarResponsaveis: writeProcedure(MODULE)
      .input(z.object({ mesesHistorico: z.coerce.number().int().min(1).max(60).optional() }).optional())
      .mutation(({ input, ctx }) => {
        if (!sincronizarResponsaveisService) throw new TRPCError({ code: 'NOT_IMPLEMENTED', message: 'Serviço indisponível.' })
        return sincronizarResponsaveisService.executar({
          mesesHistorico: input?.mesesHistorico,
          empresaId: ctx.empresaId,
        })
      }),
  })
}
