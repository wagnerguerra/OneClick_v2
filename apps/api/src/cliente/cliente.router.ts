import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { prisma } from '@saas/db'
import { router, readProcedure, writeProcedure, protectedProcedure, writeSubProcedure, deleteSubProcedure, writeSubOrModuleWrite, hasSubPermission } from '../trpc/trpc.service'
import { createClienteSchema, updateClienteSchema, listClienteSchema } from '@saas/types'
import { ClienteService } from './cliente.service'
import { LegacyImportService } from './legacy-import.service'
import { SciService } from './sci.service'
import { OmieService } from './omie.service'
import { IntegrationService } from './integration.service'
import { ImportOneclickService } from './import-oneclick.service'
import { DuplicidadeService } from './duplicidade.service'
import { MesclagemService } from './mesclagem.service'
import { CnpjService } from '../cnpj/cnpj.service'
import { consultasPublicas } from './dossie/consultas-publicas'

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
  omieService?: OmieService,
  duplicidadeService?: DuplicidadeService,
  mesclagemService?: MesclagemService,
  capaService?: import('./cliente-capa.service').ClienteCapaService,
  dossieService?: import('./dossie/dossie.service').DossieService,
  dossieBackfillService?: import('./dossie/dossie-backfill.service').DossieBackfillService,
  logoService?: import('./cliente-logo.service').ClienteLogoService,
  socioPerfisService?: import('./dossie/socio-perfis.service').SocioPerfisService,
) {
  return router({
    // Listagem (ativos)
    list: readProcedure(MODULE)
      .input(listClienteSchema)
      .query(({ input, ctx }) => clienteService.list(input, ctx.isMaster, ctx.empresaId)),

    // Lista filiais (CNPJ ordem != 0001) de uma matriz, dado o documento dela.
    // Usado pelo modal de filiais na listagem de clientes.
    listFiliais: readProcedure(MODULE)
      .input(z.object({ documento: z.string(), status: z.string().optional() }))
      .query(({ input, ctx }) => clienteService.listFiliais(input.documento, ctx.isMaster, ctx.empresaId, input.status)),

    // Demais CNPJs da mesma raiz (matriz + filiais), exceto o atual — seletor do header.
    listMesmaRaiz: readProcedure(MODULE)
      .input(z.object({ clienteId: z.string(), documento: z.string() }))
      .query(({ input, ctx }) => clienteService.listMesmaRaiz(input.clienteId, input.documento, ctx.isMaster, ctx.empresaId)),

    // Obter por ID (inclui arquivos e contatos)
    getById: readProcedure(MODULE)
      .input(z.object({ id: z.string() }))
      .query(({ input, ctx }) => clienteService.getById(input.id, ctx.isMaster, ctx.empresaId)),

    // ── Relatórios (portados do v1) ──
    reportMovimentacao: readProcedure(MODULE)
      .input(z.object({ dataInicio: z.string(), dataFim: z.string(), situacoes: z.array(z.string()).optional() }))
      .query(({ input, ctx }) => clienteService.reportMovimentacao(input.dataInicio, input.dataFim, input.situacoes, ctx.isMaster, ctx.empresaId)),

    reportPorArea: readProcedure(MODULE)
      .query(({ ctx }) => clienteService.reportPorArea(ctx.isMaster, ctx.empresaId)),

    reportPorResponsavel: readProcedure(MODULE)
      .query(({ ctx }) => clienteService.reportPorResponsavel(ctx.isMaster, ctx.empresaId)),

    // Criar — sub-permissão dedicada 'create_client' (separada de edit_details).
    create: writeSubProcedure(MODULE, 'create_client', 'Cadastrar novos clientes')
      .input(createClienteSchema)
      .mutation(({ input, ctx }) => clienteService.create(input, ctx.userId, ctx.empresaId)),

    // Atualizar
    update: writeSubProcedure(MODULE, 'edit_details', 'Editar detalhes do cliente')
      .input(z.object({ id: z.string(), data: updateClienteSchema }))
      .mutation(async ({ input, ctx }) => {
        // Campos comerciais (situação/origem/grupo) exigem a sub "manage_commercial"
        // — mesma regra da aba Comercial. O service só barra quando o VALOR muda,
        // então quem tem só "edit_details" segue salvando o resto do cadastro.
        const podeComercial = await hasSubPermission(ctx.userId, MODULE, 'manage_commercial', { isMaster: ctx.isMaster, isEmpresaMaster: ctx.isEmpresaMaster })
        return clienteService.update(input.id, input.data, ctx.userId, ctx.isMaster, ctx.empresaId, podeComercial)
      }),

    // Inativar (#HLP0209/0211) — status vira o soft-delete: exige dataSaida e
    // aceita um motivo (texto livre) que vai pro aviso do detalhe e pro histórico.
    inativar: deleteSubProcedure(MODULE, 'edit_details', 'Editar detalhes do cliente')
      .input(z.object({
        id: z.string(),
        dataSaida: z.string().optional(),
        motivo: z.string().trim().min(1, 'Informe o motivo da inativação.'),
        /** Preenchido = agenda para essa data em vez de inativar agora. */
        programadaPara: z.string().optional().nullable(),
      }))
      .mutation(({ input, ctx }) => clienteService.inativar(
        input.id, input.dataSaida, input.motivo, ctx.userId, ctx.isMaster, ctx.empresaId, input.programadaPara,
      )),

    cancelarInativacaoProgramada: writeSubProcedure(MODULE, 'edit_details', 'Editar detalhes do cliente')
      .input(z.object({ id: z.string(), motivo: z.string().optional() }))
      .mutation(({ input, ctx }) => clienteService.cancelarInativacaoProgramada(
        input.id, input.motivo, ctx.userId, ctx.isMaster, ctx.empresaId,
      )),

    // Reativar (#HLP0209) — volta status=ATIVO, limpa a dataSaida e registra o
    // motivo de reativação (texto livre) no histórico.
    reativar: writeSubProcedure(MODULE, 'edit_details', 'Editar detalhes do cliente')
      .input(z.object({ id: z.string(), motivo: z.string().trim().min(1, 'Informe o motivo da reativação.') }))
      .mutation(({ input, ctx }) => clienteService.reativar(input.id, input.motivo, ctx.userId, ctx.isMaster, ctx.empresaId)),

    // Exclusão PERMANENTE de cliente foi removida do sistema (decisão de produto,
    // 08/07/2026): cliente só é inativado (lixeira) e restaurado — nunca apagado
    // da base. Os endpoints deletePermanent/emptyTrash deixaram de existir.

    // Log de auditoria
    getEvents: readProcedure(MODULE)
      .input(z.object({ clienteId: z.string() }))
      .query(({ input }) => clienteService.getEvents(input.clienteId)),

    // Exportar respeitando os filtros ativos da listagem
    exportAll: readProcedure(MODULE)
      .input(listClienteSchema)
      .query(({ input, ctx }) => clienteService.exportAll(input, ctx.isMaster, ctx.empresaId)),

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
        const rows = await prisma.$queryRawUnsafe<Array<{ id: string; tipo: string; valor: string; ordem: number }>>(
          `SELECT id, tipo, valor, ordem FROM opcoes_cadastro WHERE tipo = $1 AND ativo = true ORDER BY ordem ASC`, input.tipo,
        )
        // Contagem de clientes vinculados por opção. GRUPO/ORIGEM = coluna direta
        // em `clientes`; ATIVIDADE = relação `cliente_atividades` (por valor).
        // `col` é whitelist (nunca vem do input) — sem risco de injeção.
        let counts: Array<{ chave: string; n: number }> = []
        if (input.tipo === 'GRUPO' || input.tipo === 'ORIGEM') {
          const col = input.tipo === 'GRUPO' ? 'grupo' : 'origem'
          counts = await prisma.$queryRawUnsafe<Array<{ chave: string; n: number }>>(
            `SELECT LOWER(TRIM(${col})) AS chave, COUNT(*)::int AS n
             FROM clientes WHERE ${col} IS NOT NULL AND TRIM(${col}) <> '' AND status = 'ATIVO'
             GROUP BY LOWER(TRIM(${col}))`,
          )
        } else if (input.tipo === 'ATIVIDADE') {
          counts = await prisma.$queryRawUnsafe<Array<{ chave: string; n: number }>>(
            `SELECT LOWER(TRIM(ca.valor)) AS chave, COUNT(DISTINCT ca.cliente_id)::int AS n
             FROM cliente_atividades ca JOIN clientes c ON c.id = ca.cliente_id AND c.status = 'ATIVO'
             WHERE ca.valor IS NOT NULL AND TRIM(ca.valor) <> '' GROUP BY LOWER(TRIM(ca.valor))`,
          )
        } else {
          return rows.map(r => ({ ...r, count: 0 }))
        }
        const map = new Map(counts.map(c => [c.chave, Number(c.n)]))
        return rows.map(r => ({ ...r, count: map.get(r.valor.toLowerCase().trim()) ?? 0 }))
      }),

    createOpcao: writeSubProcedure(MODULE, 'edit_details', 'Editar detalhes do cliente')
      .input(z.object({ tipo: z.string(), valor: z.string().min(1) }))
      .mutation(async ({ input }) => {
        const valor = input.valor.trim()
        if (!valor) throw new Error('Informe um valor.')
        // Não permite duplicata (mesmo tipo, comparação case-insensitive + trim).
        const existe = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
          `SELECT id FROM opcoes_cadastro WHERE tipo = $1 AND LOWER(TRIM(valor)) = LOWER(TRIM($2)) LIMIT 1`, input.tipo, valor,
        )
        if (existe.length > 0) throw new Error(`"${valor}" já está cadastrado nesta lista.`)
        const max = await prisma.$queryRawUnsafe<Array<{ m: number }>>(`SELECT COALESCE(MAX(ordem), 0)::int as m FROM opcoes_cadastro WHERE tipo = $1`, input.tipo)
        const ordem = (max[0]?.m || 0) + 1
        await prisma.$executeRawUnsafe(
          `INSERT INTO opcoes_cadastro (id, tipo, valor, ordem) VALUES (gen_random_uuid()::text, $1, $2, $3)`, input.tipo, valor, ordem,
        )
        return { ok: true }
      }),

    updateOpcao: writeSubProcedure(MODULE, 'edit_details', 'Editar detalhes do cliente')
      .input(z.object({ id: z.string(), valor: z.string().optional(), ordem: z.number().optional() }))
      .mutation(async ({ input }) => {
        if (input.valor !== undefined) await prisma.$executeRawUnsafe(`UPDATE opcoes_cadastro SET valor = $1 WHERE id = $2`, input.valor, input.id)
        if (input.ordem !== undefined) await prisma.$executeRawUnsafe(`UPDATE opcoes_cadastro SET ordem = $1 WHERE id = $2`, input.ordem, input.id)
        return { ok: true }
      }),

    deleteOpcao: deleteSubProcedure(MODULE, 'edit_details', 'Editar detalhes do cliente')
      .input(z.object({ id: z.string() }))
      .mutation(async ({ input }) => {
        // Bloqueia exclusão se houver clientes vinculados a esta opção.
        const opc = await prisma.$queryRawUnsafe<Array<{ tipo: string; valor: string }>>(
          `SELECT tipo, valor FROM opcoes_cadastro WHERE id = $1 LIMIT 1`, input.id,
        )
        const o = opc[0]
        if (o) {
          let n = 0
          if (o.tipo === 'GRUPO' || o.tipo === 'ORIGEM') {
            const col = o.tipo === 'GRUPO' ? 'grupo' : 'origem'
            const r = await prisma.$queryRawUnsafe<Array<{ n: number }>>(
              `SELECT COUNT(*)::int AS n FROM clientes WHERE LOWER(TRIM(${col})) = LOWER(TRIM($1)) AND status = 'ATIVO'`, o.valor,
            )
            n = Number(r[0]?.n || 0)
          } else if (o.tipo === 'ATIVIDADE') {
            const r = await prisma.$queryRawUnsafe<Array<{ n: number }>>(
              `SELECT COUNT(DISTINCT ca.cliente_id)::int AS n FROM cliente_atividades ca
               JOIN clientes c ON c.id = ca.cliente_id AND c.status = 'ATIVO'
               WHERE LOWER(TRIM(ca.valor)) = LOWER(TRIM($1))`, o.valor,
            )
            n = Number(r[0]?.n || 0)
          }
          if (n > 0) throw new Error(`Não é possível excluir "${o.valor}": ${n} cliente(s) vinculado(s).`)
        }
        await prisma.$executeRawUnsafe(`DELETE FROM opcoes_cadastro WHERE id = $1`, input.id)
        return { ok: true }
      }),

    // Opções de filtro (valores distintos)
    getFilterOptions: readProcedure(MODULE)
      .query(({ ctx }) => clienteService.getFilterOptions(ctx.isMaster, ctx.empresaId)),

    // Indicadores do topo da listagem (panorama da carteira, não do filtro).
    getStats: readProcedure(MODULE)
      .query(({ ctx }) => clienteService.getStats(ctx.isMaster, ctx.empresaId)),

    // Importação em lote
    importBulk: writeSubProcedure(MODULE, 'edit_details', 'Editar detalhes do cliente')
      .input(z.object({ items: z.array(createClienteSchema) }))
      .mutation(({ input, ctx }) => clienteService.bulkCreate(input.items, ctx.userId, ctx.empresaId)),

    // === ARQUIVOS ===
    listArquivos: readProcedure(MODULE)
      .input(z.object({ clienteId: z.string() }))
      .query(({ input }) => clienteService.listArquivos(input.clienteId)),

    // Arquivos do cliente: incluir/editar/excluir exigem a sub-permissão
    // 'manage_files' (master/empresa-master sempre passam).
    addArquivo: writeSubProcedure(MODULE, 'manage_files', 'Incluir, editar e excluir arquivos do cliente')
      .input(z.object({
        clienteId: z.string(),
        fileName: z.string(),
        fileUrl: z.string(),
        fileSize: z.number().optional(),
        mimeType: z.string().optional(),
        vencimento: z.string().optional(),
      }))
      .mutation(({ input, ctx }) => clienteService.addArquivo(input.clienteId, input, ctx.userId, ctx.isMaster, ctx.empresaId)),

    renameArquivo: writeSubProcedure(MODULE, 'manage_files', 'Incluir, editar e excluir arquivos do cliente')
      .input(z.object({ arquivoId: z.string(), fileName: z.string().min(1) }))
      .mutation(({ input, ctx }) => clienteService.renameArquivo(input.arquivoId, input.fileName, ctx.isMaster, ctx.empresaId)),

    // #2 — Editar arquivo (renomear + descrição/detalhes)
    updateArquivo: writeSubProcedure(MODULE, 'manage_files', 'Incluir, editar e excluir arquivos do cliente')
      .input(z.object({
        id: z.string(),
        fileName: z.string().min(1).optional(),
        descricao: z.string().nullable().optional(),
      }))
      .mutation(({ input, ctx }) => clienteService.updateArquivo(input.id, { fileName: input.fileName, descricao: input.descricao }, ctx.isMaster, ctx.empresaId)),

    removeArquivo: deleteSubProcedure(MODULE, 'manage_files', 'Incluir, editar e excluir arquivos do cliente')
      .input(z.object({ arquivoId: z.string() }))
      .mutation(({ input, ctx }) => clienteService.removeArquivo(input.arquivoId, ctx.isMaster, ctx.empresaId)),

    // === REGISTRO DE INSCRIÇÕES (estaduais — N por cliente, migrado do legado) ===
    listInscricoes: readProcedure(MODULE)
      .input(z.object({ clienteId: z.string() }))
      .query(({ input }) => clienteService.listInscricoes(input.clienteId)),

    addInscricao: writeSubProcedure(MODULE, 'manage_registration', 'Gerenciar aba de registro / legalização')
      .input(z.object({ clienteId: z.string(), estado: z.string().trim().min(2).max(2), inscricao: z.string().trim().min(1), descricao: z.string().trim().optional() }))
      .mutation(({ input, ctx }) => clienteService.addInscricao(input.clienteId, input.estado, input.inscricao, input.descricao, ctx.isMaster, ctx.empresaId)),

    updateInscricao: writeSubProcedure(MODULE, 'manage_registration', 'Gerenciar aba de registro / legalização')
      .input(z.object({ id: z.string(), estado: z.string().trim().min(2).max(2), inscricao: z.string().trim().min(1), descricao: z.string().trim().optional() }))
      .mutation(({ input, ctx }) => clienteService.updateInscricao(input.id, input.estado, input.inscricao, input.descricao, ctx.isMaster, ctx.empresaId)),

    removeInscricao: deleteSubProcedure(MODULE, 'manage_registration', 'Gerenciar aba de registro / legalização')
      .input(z.object({ id: z.string() }))
      .mutation(({ input, ctx }) => clienteService.removeInscricao(input.id, ctx.isMaster, ctx.empresaId)),

    // === ATIVIDADES E BENEFÍCIOS (#5/#6) ===
    // Leitura livre (qualquer um com read no módulo). Mutações gateadas pela
    // sub-permissão 'manage_activities_benefits' (#7) — master/empresa-master
    // sempre passam (tratado no writeSubProcedure/deleteSubProcedure).
    listAtividades: readProcedure(MODULE)
      .input(z.object({ clienteId: z.string() }))
      .query(({ input }) => clienteService.listAtividades(input.clienteId)),

    // Atividades: seção unificada "Atividades e Benefícios" — quem gerencia atividades
    // (clientes.manage_activities_benefits) OU benefícios (beneficios-fiscais.canWrite) pode mexer.
    addAtividade: writeSubOrModuleWrite(MODULE, 'manage_activities_benefits', 'beneficios-fiscais', 'Gerenciar atividades e benefícios fiscais')
      .input(z.object({ clienteId: z.string(), valor: z.string().min(1) }))
      .mutation(({ input, ctx }) => clienteService.addAtividade(input.clienteId, input.valor, ctx.isMaster, ctx.empresaId)),

    updateAtividade: writeSubOrModuleWrite(MODULE, 'manage_activities_benefits', 'beneficios-fiscais', 'Gerenciar atividades e benefícios fiscais')
      .input(z.object({ id: z.string(), valor: z.string().min(1) }))
      .mutation(({ input, ctx }) => clienteService.updateAtividade(input.id, input.valor, ctx.isMaster, ctx.empresaId)),

    removeAtividade: writeSubOrModuleWrite(MODULE, 'manage_activities_benefits', 'beneficios-fiscais', 'Gerenciar atividades e benefícios fiscais')
      .input(z.object({ id: z.string() }))
      .mutation(({ input, ctx }) => clienteService.removeAtividade(input.id, ctx.isMaster, ctx.empresaId)),

    listBeneficios: readProcedure(MODULE)
      .input(z.object({ clienteId: z.string() }))
      .query(({ input }) => clienteService.listBeneficios(input.clienteId)),

    addBeneficio: writeSubProcedure(MODULE, 'manage_activities_benefits', 'Gerenciar atividades e benefícios fiscais')
      .input(z.object({ clienteId: z.string(), valor: z.string().min(1) }))
      .mutation(({ input, ctx }) => clienteService.addBeneficio(input.clienteId, input.valor, ctx.isMaster, ctx.empresaId)),

    updateBeneficio: writeSubProcedure(MODULE, 'manage_activities_benefits', 'Gerenciar atividades e benefícios fiscais')
      .input(z.object({ id: z.string(), valor: z.string().min(1) }))
      .mutation(({ input, ctx }) => clienteService.updateBeneficio(input.id, input.valor, ctx.isMaster, ctx.empresaId)),

    removeBeneficio: deleteSubProcedure(MODULE, 'manage_activities_benefits', 'Gerenciar atividades e benefícios fiscais')
      .input(z.object({ id: z.string() }))
      .mutation(({ input, ctx }) => clienteService.removeBeneficio(input.id, ctx.isMaster, ctx.empresaId)),

    // === CONTATOS ===
    listContatos: readProcedure(MODULE)
      .input(z.object({ clienteId: z.string() }))
      .query(({ input }) => clienteService.listContatos(input.clienteId)),

    addContato: writeSubProcedure(MODULE, 'edit_details', 'Editar detalhes do cliente')
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
      .mutation(({ input, ctx }) => clienteService.addContato(input.clienteId, input, ctx.isMaster, ctx.empresaId)),

    updateContato: writeSubProcedure(MODULE, 'edit_details', 'Editar detalhes do cliente')
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
      .mutation(({ input, ctx }) => clienteService.updateContato(input.contatoId, input, ctx.isMaster, ctx.empresaId)),

    removeContato: deleteSubProcedure(MODULE, 'edit_details', 'Editar detalhes do cliente')
      .input(z.object({ contatoId: z.string() }))
      .mutation(({ input, ctx }) => clienteService.removeContato(input.contatoId, ctx.isMaster, ctx.empresaId)),

    setPrincipalContato: writeSubProcedure(MODULE, 'edit_details', 'Editar detalhes do cliente')
      .input(z.object({ contatoId: z.string() }))
      .mutation(({ input, ctx }) => clienteService.setPrincipalContato(input.contatoId, ctx.isMaster, ctx.empresaId)),

    // === PARÂMETROS DO CONTRATO ===
    getContratoParams: readProcedure(MODULE)
      .input(z.object({ clienteId: z.string() }))
      .query(({ input, ctx }) => clienteService.getContratoParams(input.clienteId, ctx.empresaId, ctx.isMaster)),

    saveContratoParams: writeSubProcedure(MODULE, 'manage_contracts', 'Gerenciar contratos dos clientes')
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
        // Metadata do contrato (Fase 2) — opcionais; ausência = "não alterar".
        numero: z.string().nullish(),
        tipo: z.string().nullish(),
        dataInicio: z.string().nullish(),
        dataFim: z.string().nullish(),
        permanente: z.boolean().optional(),
        diasAlertaRenovacao: z.number().nullish(),
        responsavelId: z.string().nullish(),
        gestaoIgnorar: z.boolean().optional(),
      }))
      .mutation(({ input, ctx }) => clienteService.saveContratoParams(input.clienteId, ctx.empresaId, input)),

    // Tira/devolve o cliente ao painel de gestão. Mutation própria porque o
    // `saveContratoParams` grava a baseline inteira e zeraria os parâmetros.
    setGestaoIgnorar: writeSubProcedure(MODULE, 'manage_contracts', 'Gerenciar contratos dos clientes')
      .input(z.object({ clienteId: z.string(), ignorar: z.boolean() }))
      .mutation(({ input, ctx }) => clienteService.setGestaoIgnorar(input.clienteId, ctx.empresaId, input.ignorar)),

    // === SNAPSHOTS ERP ===
    getErpSnapshots: readProcedure(MODULE)
      .input(z.object({ clienteId: z.string(), datai: z.string().optional(), dataf: z.string().optional() }))
      .query(({ input, ctx }) => clienteService.getErpSnapshots(input.clienteId, ctx.empresaId, input.datai, input.dataf)),

    // === INTEGRAÇÃO OMIE (cadastro de clientes) ===
    // Busca o cliente no Omie pelo CNPJ e retorna o código (idOmie) + empresa.
    // Não persiste — o front preenche os campos e o usuário salva o cadastro.
    omieBuscarCliente: readProcedure(MODULE)
      .input(z.object({ documento: z.string().min(1), omieEmpresa: z.string().optional() }))
      .query(({ input }) => {
        if (!omieService) throw new TRPCError({ code: 'NOT_IMPLEMENTED', message: 'Integração Omie indisponível.' })
        return omieService.detectar(input.documento, input.omieEmpresa)
      }),

    // === GESTÃO DE CONTRATOS (painel de carteira) ===
    gestaoContratos: readProcedure(MODULE)
      .input(z.object({
        page: z.number().min(1).default(1),
        limit: z.number().min(1).max(100).default(20),
        search: z.string().optional(),
        // Card da legenda em foco (recorte da carteira). Vazio = carteira toda.
        filtro: z.enum(['ok', 'sem_contrato', 'reavaliacao', 'sem_entrada', 'sem_parametros', 'indicadores', 'erp', 'ignorados']).optional(),
      }))
      .query(({ input, ctx }) => clienteService.gestaoContratos(input, ctx.isMaster, ctx.empresaId)),

    // === HISTÓRICO COMERCIAL ===
    listHistoricos: readProcedure(MODULE)
      .input(z.object({ clienteId: z.string() }))
      .query(({ input }) => clienteService.listHistoricos(input.clienteId)),

    createHistorico: writeSubProcedure(MODULE, 'edit_details', 'Editar detalhes do cliente')
      .input(z.object({ clienteId: z.string(), mensagem: z.string().min(1), tipo: z.enum(['equipe', 'cliente']).default('equipe') }))
      .mutation(({ input, ctx }) => clienteService.createHistorico(input.clienteId, ctx.userId, input.mensagem, input.tipo)),

    updateHistorico: writeSubProcedure(MODULE, 'edit_details', 'Editar detalhes do cliente')
      .input(z.object({ id: z.string(), mensagem: z.string().min(1) }))
      .mutation(({ input }) => clienteService.updateHistorico(input.id, input.mensagem)),

    deleteHistorico: deleteSubProcedure(MODULE, 'edit_details', 'Editar detalhes do cliente')
      .input(z.object({ id: z.string() }))
      .mutation(({ input }) => clienteService.deleteHistorico(input.id)),

    // === SERVIÇOS (ÁREAS CONTRATADAS) ===
    servicosListar: readProcedure(MODULE)
      .input(z.object({ clienteId: z.string() }))
      .query(({ input, ctx }) => clienteService.listServicos(input.clienteId, ctx.empresaId ?? null)),

    servicosSalvar: writeSubProcedure(MODULE, 'manage_services', 'Gerenciar serviços contratados')
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

    // Atualiza só o responsável/substituto de UMA área (popover do card de
    // Responsáveis por área, na aba Obrigações). Preserva os demais campos.
    setAreaResponsavel: writeSubProcedure(MODULE, 'manage_responsible', 'Gerenciar responsáveis pelos serviços')
      .input(z.object({
        clienteId: z.string(),
        areaId: z.string(),
        responsavelId: z.string().nullable(),
        substitutoId: z.string().nullable(),
      }))
      .mutation(({ input }) => clienteService.setAreaResponsavel(input.clienteId, input.areaId, input.responsavelId, input.substitutoId)),

    servicosGetParametros: readProcedure(MODULE)
      .input(z.object({ clienteAreaContratadaId: z.string() }))
      .query(({ input }) => clienteService.getParametros(input.clienteAreaContratadaId)),

    servicosSaveParametros: writeSubProcedure(MODULE, 'manage_services', 'Gerenciar serviços contratados')
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

    servicosCopiarEstrutura: writeSubProcedure(MODULE, 'manage_services', 'Gerenciar serviços contratados')
      .input(z.object({ fromClienteId: z.string(), toClienteAreaContratadaId: z.string() }))
      .mutation(({ input }) => clienteService.copiarEstrutura(input.fromClienteId, input.toClienteAreaContratadaId)),

    // === PARTICULARIDADES ===
    particularidadesListar: readProcedure(MODULE)
      .input(z.object({ clienteId: z.string() }))
      .query(({ input, ctx }) => clienteService.listParticularidades(input.clienteId, ctx.userId, !!(ctx.isMaster || ctx.isEmpresaMaster))),

    particularidadesSalvar: writeProcedure(MODULE)
      .input(z.object({
        clienteAreaContratadaId: z.string(),
        texto: z.string(),
      }))
      .mutation(({ input, ctx }) => clienteService.saveParticularidade(input.clienteAreaContratadaId, input.texto, ctx.userId, !!(ctx.isMaster || ctx.isEmpresaMaster))),

    // === ACESSOS (Legalização) ===
    listAcessos: readProcedure(MODULE)
      .input(z.object({ clienteId: z.string() }))
      .query(({ input }) => clienteService.listAcessos(input.clienteId)),

    addAcesso: writeSubProcedure(MODULE, 'manage_registration', 'Gerenciar aba de registro / legalização')
      .input(z.object({
        clienteId: z.string(),
        portal: z.string().min(1),
        usuario: z.string().optional(),
        senha: z.string().optional(),
        observacoes: z.string().optional(),
      }))
      .mutation(({ input }) => clienteService.addAcesso(input.clienteId, input)),

    updateAcesso: writeSubProcedure(MODULE, 'manage_registration', 'Gerenciar aba de registro / legalização')
      .input(z.object({
        id: z.string(),
        portal: z.string().optional(),
        usuario: z.string().optional(),
        senha: z.string().optional(),
        observacoes: z.string().optional(),
      }))
      .mutation(({ input }) => clienteService.updateAcesso(input.id, input)),

    removeAcesso: deleteSubProcedure(MODULE, 'manage_registration', 'Gerenciar aba de registro / legalização')
      .input(z.object({ id: z.string() }))
      .mutation(({ input }) => clienteService.removeAcesso(input.id)),

    // === VENCIMENTOS (Legalização) ===
    listVencimentos: readProcedure(MODULE)
      .input(z.object({ clienteId: z.string() }))
      .query(({ input }) => clienteService.listVencimentos(input.clienteId)),

    addVencimento: writeSubProcedure(MODULE, 'manage_registration', 'Gerenciar aba de registro / legalização')
      .input(z.object({
        clienteId: z.string(),
        descricao: z.string().min(1),
        dataVencimento: z.string(),
        alertaDias: z.number().default(30),
        observacoes: z.string().optional(),
      }))
      .mutation(({ input, ctx }) => clienteService.addVencimento(input.clienteId, input, ctx.isMaster, ctx.empresaId)),

    toggleVencimento: writeSubProcedure(MODULE, 'manage_registration', 'Gerenciar aba de registro / legalização')
      .input(z.object({ id: z.string() }))
      .mutation(({ input, ctx }) => clienteService.toggleVencimento(input.id, ctx.isMaster, ctx.empresaId)),

    removeVencimento: deleteSubProcedure(MODULE, 'manage_registration', 'Gerenciar aba de registro / legalização')
      .input(z.object({ id: z.string() }))
      .mutation(({ input, ctx }) => clienteService.removeVencimento(input.id, ctx.isMaster, ctx.empresaId)),

    // === ANDAMENTOS (Legalização) ===
    listAndamentos: readProcedure(MODULE)
      .input(z.object({ clienteId: z.string() }))
      .query(({ input }) => clienteService.listAndamentos(input.clienteId)),

    addAndamento: writeSubProcedure(MODULE, 'manage_registration', 'Gerenciar aba de registro / legalização')
      .input(z.object({
        clienteId: z.string(),
        descricao: z.string().min(1),
        tipo: z.string().default('geral'),
        status: z.string().default('pendente'),
        dataInicio: z.string().optional(),
        dataConclusao: z.string().optional(),
        observacoes: z.string().optional(),
      }))
      .mutation(({ input, ctx }) => clienteService.addAndamento(input.clienteId, input, ctx.userId, ctx.isMaster, ctx.empresaId)),

    updateAndamentoStatus: writeSubProcedure(MODULE, 'manage_registration', 'Gerenciar aba de registro / legalização')
      .input(z.object({ id: z.string(), status: z.string() }))
      .mutation(({ input, ctx }) => clienteService.updateAndamentoStatus(input.id, input.status, ctx.isMaster, ctx.empresaId)),

    removeAndamento: deleteSubProcedure(MODULE, 'manage_registration', 'Gerenciar aba de registro / legalização')
      .input(z.object({ id: z.string() }))
      .mutation(({ input, ctx }) => clienteService.removeAndamento(input.id, ctx.isMaster, ctx.empresaId)),

    // === CNAEs (Legalização) ===
    listCnaes: readProcedure(MODULE)
      .input(z.object({ clienteId: z.string() }))
      .query(({ input }) => clienteService.listCnaes(input.clienteId)),

    addCnae: writeSubProcedure(MODULE, 'manage_fiscal', 'Gerenciar aba fiscal')
      .input(z.object({
        clienteId: z.string(),
        codigo: z.string().min(1),
        descricao: z.string().optional(),
        principal: z.boolean().default(false),
      }))
      .mutation(({ input, ctx }) => clienteService.addCnae(input.clienteId, input, ctx.isMaster, ctx.empresaId)),

    removeCnae: deleteSubProcedure(MODULE, 'manage_fiscal', 'Gerenciar aba fiscal')
      .input(z.object({ id: z.string() }))
      .mutation(({ input, ctx }) => clienteService.removeCnae(input.id, ctx.isMaster, ctx.empresaId)),

    // === OBRIGAÇÕES ===
    listObrigacoes: readProcedure(MODULE)
      .input(z.object({ clienteId: z.string() }))
      .query(({ input }) => clienteService.listObrigacoes(input.clienteId)),

    addObrigacao: writeSubProcedure(MODULE, 'manage_registration', 'Gerenciar aba de registro / legalização')
      .input(z.object({
        clienteId: z.string(), nome: z.string().min(1),
        tipo: z.string().default('fixa'), periodicidade: z.string().default('mensal'),
        areaId: z.string().optional(), responsavelId: z.string().optional(),
        diaVencimento: z.number().optional(), observacoes: z.string().optional(),
      }))
      .mutation(({ input }) => clienteService.addObrigacao(input.clienteId, input)),

    updateObrigacaoStatus: writeSubProcedure(MODULE, 'manage_registration', 'Gerenciar aba de registro / legalização')
      .input(z.object({ id: z.string(), status: z.string() }))
      .mutation(({ input }) => clienteService.updateObrigacaoStatus(input.id, input.status)),

    toggleObrigacaoAtivo: writeSubProcedure(MODULE, 'manage_registration', 'Gerenciar aba de registro / legalização')
      .input(z.object({ id: z.string() }))
      .mutation(({ input }) => clienteService.toggleObrigacaoAtivo(input.id)),

    removeObrigacao: deleteSubProcedure(MODULE, 'manage_registration', 'Gerenciar aba de registro / legalização')
      .input(z.object({ id: z.string() }))
      .mutation(({ input }) => clienteService.removeObrigacao(input.id)),

    // === PROTOCOLOS ===
    // Ler segue o acesso ao módulo — ver o comprovante é parte de ver a ficha.
    // O que `manage_protocolos` governa é emitir, receber, editar e excluir.
    listProtocolos: readProcedure(MODULE)
      .input(z.object({ clienteId: z.string() }))
      .query(({ input, ctx }) => clienteService.listProtocolos(input.clienteId, ctx.empresaId)),

    getProtocolo: readProcedure(MODULE)
      .input(z.object({ id: z.string() }))
      .query(({ input, ctx }) => clienteService.getProtocolo(input.id, ctx.empresaId)),

    addProtocolo: writeSubProcedure(MODULE, 'manage_protocolos', 'Emitir e gerenciar protocolos de documentos')
      .input(z.object({
        clienteId: z.string(),
        data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida.'),
        documentos: z.string().optional().nullable(),
        recebido: z.boolean().optional(),
      }))
      .mutation(({ input, ctx }) => clienteService.addProtocolo(input.clienteId, input, ctx.userId, ctx.empresaId)),

    updateProtocolo: writeSubProcedure(MODULE, 'manage_protocolos', 'Emitir e gerenciar protocolos de documentos')
      .input(z.object({
        id: z.string(),
        data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        documentos: z.string().optional().nullable(),
        recebido: z.boolean().optional(),
      }))
      .mutation(({ input, ctx }) => clienteService.updateProtocolo(input.id, input, ctx.empresaId)),

    removeProtocolo: deleteSubProcedure(MODULE, 'manage_protocolos', 'Emitir e gerenciar protocolos de documentos')
      .input(z.object({ id: z.string() }))
      .mutation(({ input, ctx }) => clienteService.removeProtocolo(input.id, ctx.empresaId)),

    // === OCORRÊNCIAS (Reclamações/Elogios — backend pronto, frontend no módulo Qualidade) ===
    listOcorrencias: readProcedure(MODULE)
      .input(z.object({ clienteId: z.string() }))
      .query(({ input }) => clienteService.listOcorrencias(input.clienteId)),

    addOcorrencia: writeSubProcedure(MODULE, 'edit_details', 'Editar detalhes do cliente')
      .input(z.object({
        clienteId: z.string(), titulo: z.string().min(1),
        tipo: z.string().default('reclamacao'), descricao: z.string().optional(),
        prioridade: z.string().default('media'), areaId: z.string().optional(),
        responsavelId: z.string().optional(),
      }))
      .mutation(({ input, ctx }) => clienteService.addOcorrencia(input.clienteId, input, ctx.userId)),

    resolveOcorrencia: writeSubProcedure(MODULE, 'edit_details', 'Editar detalhes do cliente')
      .input(z.object({ id: z.string(), resolucao: z.string().min(1) }))
      .mutation(({ input }) => clienteService.resolveOcorrencia(input.id, input.resolucao)),

    removeOcorrencia: deleteSubProcedure(MODULE, 'edit_details', 'Editar detalhes do cliente')
      .input(z.object({ id: z.string() }))
      .mutation(({ input }) => clienteService.removeOcorrencia(input.id)),

    // === BI BALANCETE (Contábil) ===
    biListCategorias: readProcedure(MODULE)
      .input(z.object({ clienteId: z.string() }))
      .query(({ input }) => clienteService.biListCategorias(input.clienteId)),

    biSaveCategorias: writeSubProcedure(MODULE, 'manage_fiscal', 'Gerenciar aba fiscal')
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

    biDeleteCategoria: deleteSubProcedure(MODULE, 'manage_fiscal', 'Gerenciar aba fiscal')
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

    biImportLinhas: writeSubProcedure(MODULE, 'manage_fiscal', 'Gerenciar aba fiscal')
      .input(z.object({
        clienteId: z.string(), periodo: z.string(),
        linhas: z.array(z.object({
          conta: z.string(), nomeConta: z.string(),
          saldoAnterior: z.number(), debitos: z.number(), creditos: z.number(),
          saldoAtual: z.number(), movimento: z.number(),
        })),
      }))
      .mutation(({ input }) => clienteService.biImportLinhas(input.clienteId, input.periodo, input.linhas)),

    biDeletePeriodo: deleteSubProcedure(MODULE, 'manage_fiscal', 'Gerenciar aba fiscal')
      .input(z.object({ clienteId: z.string(), periodo: z.string() }))
      .mutation(({ input }) => clienteService.biDeletePeriodo(input.clienteId, input.periodo)),

    biGetLink: readProcedure(MODULE)
      .input(z.object({ clienteId: z.string() }))
      .query(({ input }) => clienteService.biGetOrCreateLink(input.clienteId)),

    biDeleteLink: deleteSubProcedure(MODULE, 'manage_fiscal', 'Gerenciar aba fiscal')
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
        // Métricas via SCI local; se indisponível (ex.: VPS sem python/Firebird),
        // cai pra ponte do Launcher — igual ao buscarMetricasSci.
        const periodo = sciService.periodoSugerido()
        let metricas: Record<string, unknown>
        try {
          metricas = await sciService.buscarMetricasSci(cnpj, periodo.datai, periodo.dataf)
        } catch (err) {
          const msg = (err as Error).message || ''
          const sciUnreachable = /ENOENT|conn|connect|refused|timeout|Firebird|python|Não foi possível conectar/i.test(msg)
          if (!sciUnreachable || !contratoSyncService) throw err
          console.log(`[Cliente] SCI local indisponível p/ parâmetros, pedindo ao Launcher: ${msg.slice(0, 100)}`)
          metricas = sciService.normalizarMetricas(await contratoSyncService.requestErpRemote({ cnpj, datai: periodo.datai, dataf: periodo.dataf }))
        }
        return sciService.calcularParametrosDeMetricas(metricas, periodo)
      }),

    buscarMetricasSci: readProcedure(MODULE)
      .input(z.object({ clienteId: z.string(), datai: z.string(), dataf: z.string(), indicadores: z.array(z.string()).optional() }))
      .query(async ({ input, ctx }) => {
        const cliente = await clienteService.getById(input.clienteId, ctx.isMaster, ctx.empresaId)
        const cnpj = (cliente.documento || '').replace(/\D/g, '')

        // Tenta SCI local primeiro. Se falhar com erro indicativo de que o SCI
        // não está acessível (ENOENT no python, conexão recusada Firebird,
        // timeout), faz fallback pra Launcher remoto via SSE.
        let metricas: Record<string, unknown>
        try {
          metricas = await sciService.buscarMetricasSci(cnpj, input.datai, input.dataf, input.indicadores)
        } catch (err) {
          const msg = (err as Error).message || ''
          const sciUnreachable = /ENOENT|conn|connect|refused|timeout|Firebird|python|Não foi possível conectar/i.test(msg)
          if (!sciUnreachable || !contratoSyncService) throw err

          // Fallback: pede ao Launcher local via SSE
          console.log(`[Cliente] SCI local indisponível, pedindo ao Launcher: ${msg.slice(0, 100)}`)
          // A ponte devolve o JSON cru do script; alinha os nomes igual ao
          // caminho local, senão nf_entrada/nf_saida somem só neste fluxo.
          metricas = sciService.normalizarMetricas(await contratoSyncService.requestErpRemote({
            cnpj,
            datai: input.datai,
            dataf: input.dataf,
            indicadores: input.indicadores,
          }))
        }

        // Persiste snapshot — gráficos passam a ler direto do DB sem tocar SCI.
        // Falha de gravação não interrompe a resposta ao user.
        try {
          const r = await clienteService.salvarSnapshotsSci(input.clienteId, ctx.empresaId, metricas)
          console.log(`[Cliente] Snapshot SCI salvo: ${r.salvos} registros (cliente=${input.clienteId})`)
        } catch (e) {
          console.error('[Cliente] Falha ao persistir snapshot SCI:', (e as Error).message)
        }

        return metricas
      }),

    // Lê do snapshot (DB) — usado pelos gráficos. Mesmo shape do `buscarMetricasSci`
    // mas sem tocar no SCI. Se o cliente nunca foi sincronizado, vem vazio.
    getMetricasSnapshot: readProcedure(MODULE)
      .input(z.object({ clienteId: z.string(), datai: z.string(), dataf: z.string() }))
      .query(({ input, ctx }) => clienteService.getMetricasSnapshot(input.clienteId, ctx.empresaId, input.datai, input.dataf)),

    atualizarIdSistemaSci: writeSubProcedure(MODULE, 'manage_fiscal', 'Gerenciar aba fiscal')
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
          // SCI local indisponível (ex.: em produção a VPS não tem python/Firebird)
          // → fallback pra Launcher local via SSE, igual ao buscarMetricasSci.
          const msg = (e as Error).message || ''
          const sciUnreachable = /ENOENT|conn|connect|refused|timeout|Firebird|python|Não foi possível conectar/i.test(msg)
          if (!sciUnreachable || !contratoSyncService) throw new Error(`Erro ao conectar ao SCI: ${msg}`)
          console.log(`[Cliente] SCI local indisponível p/ ID Sistema, pedindo ao Launcher: ${msg.slice(0, 100)}`)
          const remoto = await contratoSyncService.requestSciIdSistema(doc)
          if (remoto && remoto.error) {
            if (String(remoto.error).includes('Nao encontrado')) sciResult = null
            else throw new Error(String(remoto.error))
          } else if (remoto && remoto.id_cliente) {
            sciResult = {
              idCliente: Number(remoto.id_cliente),
              razaoSocial: String(remoto.razao_social || '').trim(),
              cnpj: doc,
              metodo: String(remoto.metodo || 'launcher'),
            }
          } else {
            sciResult = null
          }
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
    legacyPreview: writeSubProcedure(MODULE, 'edit_details', 'Editar detalhes do cliente')
      .query(() => legacyImportService.previewLegacy()),

    legacyImport: writeSubProcedure(MODULE, 'edit_details', 'Editar detalhes do cliente')
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
      cadastrarDasConsultas: writeSubProcedure(MODULE, 'edit_details', 'Editar detalhes do cliente')
        .mutation(({ ctx }) => integrationService.cadastrarDasConsultas(ctx.empresaId)),

      // 2. Cadastrar pelo CNPJ
      buscarDadosCnpj: readProcedure(MODULE)
        .input(z.object({ cnpj: z.string().min(14) }))
        .query(({ input }) => integrationService.buscarDadosCnpj(input.cnpj)),

      cadastrarPeloCnpj: writeSubProcedure(MODULE, 'edit_details', 'Editar detalhes do cliente')
        .input(z.object({ cnpj: z.string().min(14) }))
        .mutation(({ input, ctx }) => integrationService.cadastrarPeloCnpj(input.cnpj, ctx.empresaId)),

      // 3. Importar clientes (texto/CSV)
      importarJob: writeSubProcedure(MODULE, 'edit_details', 'Editar detalhes do cliente')
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
      fiscalSciLote: writeSubProcedure(MODULE, 'manage_fiscal', 'Gerenciar aba fiscal')
        .input(z.object({
          limit: z.number().min(1).max(500).default(50),
          force: z.boolean().default(false),
          onlyMissing: z.boolean().default(true),
        }))
        .mutation(({ input, ctx }) => integrationService.atualizarFiscalSciLote(input, ctx.empresaId)),

      // 5. OneClick lote (importar do legado com opções)
      oneclickJob: writeSubProcedure(MODULE, 'edit_details', 'Editar detalhes do cliente')
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
      idSistemaSciLote: writeSubProcedure(MODULE, 'manage_fiscal', 'Gerenciar aba fiscal')
        .input(z.object({
          limit: z.number().min(1).max(500).default(50),
          force: z.boolean().default(false),
        }))
        .mutation(({ input, ctx }) => integrationService.atualizarIdSistemaSciLote(input, ctx.empresaId)),

      // 7. ReceitaWS
      receitawsPreview: readProcedure(MODULE)
        .input(z.object({ filtros: filtrosSchema }))
        .query(({ input, ctx }) => integrationService.receitawsPreview(input.filtros, ctx.empresaId)),

      receitawsJob: writeSubProcedure(MODULE, 'edit_details', 'Editar detalhes do cliente')
        .input(z.object({ filtros: filtrosSchema }))
        .mutation(({ input, ctx }) => integrationService.receitawsIniciarJob(input.filtros, ctx.empresaId)),

      // 8. SERPRO CNPJ
      serproCnpjPreview: readProcedure(MODULE)
        .input(z.object({ filtros: filtrosSchema }))
        .query(({ input, ctx }) => integrationService.serproCnpjPreview(input.filtros, ctx.empresaId)),

      serproCnpjJob: writeSubProcedure(MODULE, 'edit_details', 'Editar detalhes do cliente')
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

    dteAddMensagem: writeSubProcedure(MODULE, 'manage_fiscal', 'Gerenciar aba fiscal')
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

    dteDeleteMensagem: deleteSubProcedure(MODULE, 'manage_fiscal', 'Gerenciar aba fiscal')
      .input(z.object({ id: z.string() }))
      .mutation(async ({ input }) => {
        await prisma.$executeRawUnsafe(`DELETE FROM cliente_dte_mensagens WHERE id = $1`, input.id)
        return { ok: true }
      }),

    // ── Capital Social ─────────────────────────────────
    getCapitalSocial: readProcedure(MODULE)
      .input(z.object({ clienteId: z.string() }))
      .query(async ({ input }) => {
        // Prisma type-safe (a coluna capital_social agora existe no schema). Defensivo:
        // se por drift a coluna ainda não existir em algum ambiente, devolve null em vez de 500.
        try {
          const cli = await prisma.cliente.findUnique({ where: { id: input.clienteId }, select: { capitalSocial: true } })
          return { capitalSocial: cli?.capitalSocial != null ? Number(cli.capitalSocial) : null }
        } catch {
          return { capitalSocial: null }
        }
      }),

    // ── Import CNAEs via Receita Federal ───────────────
    importCnaes: writeSubProcedure(MODULE, 'manage_fiscal', 'Gerenciar aba fiscal')
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
              `INSERT INTO cliente_cnaes (id, cliente_id, codigo, descricao, principal, created_at, updated_at) VALUES (gen_random_uuid()::text, $1, $2, $3, true, NOW(), NOW())`,
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
            `INSERT INTO cliente_cnaes (id, cliente_id, codigo, descricao, principal, created_at, updated_at) VALUES (gen_random_uuid()::text, $1, $2, $3, false, NOW(), NOW())`,
            input.clienteId, codigo, String(cnae.descricao || ''),
          ).catch(() => {})
          imported++
        }

        return { imported, skipped, message: imported > 0 ? `${imported} CNAE(s) importado(s)${skipped > 0 ? `, ${skipped} já existente(s)` : ''} — fonte: ${fonte}` : 'Nenhum CNAE novo encontrado' }
      }),

    // ── Import Sócios do OneClick Legado ────────────────
    importSociosOneclick: writeSubProcedure(MODULE, 'manage_registration', 'Gerenciar aba de registro / legalização')
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

            // Importar APENAS sócios cotistas (não administradores/demais).
            const qualStr = String(s.qualificacao || '').toLowerCase()
            const ehCotista = qualStr.includes('cotista') || qualStr.includes('quotista')
            if (!ehCotista) { skipped++; continue }

            const doc = s.documento ? String(s.documento).replace(/\D/g, '') : ''
            const participacao = s.percentual_participacao != null ? Number(s.percentual_participacao) : undefined
            const valorQuotas = s.valor_participacao != null ? Number(s.valor_participacao) : undefined

            // Casa por documento (mais confiável que nome) e cai pro nome. Se já existir
            // (ex.: veio do QSA sem participação), completa participação/valor em vez de pular.
            const existing = await prisma.socio.findFirst({
              where: { clienteId: input.clienteId, OR: [...(doc ? [{ cpf: doc }] : []), { nomeCompleto: { equals: nome, mode: 'insensitive' as const } }] },
              select: { id: true },
            })
            if (existing) {
              await prisma.socio.update({ where: { id: existing.id }, data: { tipoSocio: 'SOCIO_QUOTISTA', participacao, valorQuotas, ...(doc ? { cpf: doc } : {}) } })
            } else {
              await prisma.socio.create({
                data: {
                  nomeCompleto: nome,
                  cpf: doc,
                  tipoSocio: 'SOCIO_QUOTISTA',
                  participacao,
                  valorQuotas,
                  clienteId: input.clienteId,
                  observacoes: `Importado do OneClick — ${s.qualificacao || ''}${s.representante_nome ? ' | Rep: ' + s.representante_nome : ''}`,
                },
              })
            }
            imported++
          }

          return { imported, skipped, message: imported > 0 ? `${imported} sócio(s) importado(s) do OneClick${skipped > 0 ? `, ${skipped} já existente(s)` : ''}` : 'Nenhum sócio novo encontrado no OneClick' }
        } finally { try { await conn.end() } catch { /* */ } }
      }),

    // ── Import OneClick Legado (direto — só na LAN) ────
    importOneclick: writeSubProcedure(MODULE, 'edit_details', 'Editar detalhes do cliente')
      .input(z.object({ clienteId: z.string(), documento: z.string() }))
      .mutation(async ({ input }) => {
        if (!importOneclickService) throw new Error('Serviço de importação OneClick não disponível')
        return importOneclickService.importar(input.clienteId, input.documento)
      }),

    // ── Import OneClick via Service Manager (ponte p/ o legado na LAN) ──
    // O SM (na LAN) lê o MySQL legado e devolve as linhas; a API só aplica.
    // Incorpora registros + acessos + vencimentos + andamentos + SÓCIOS.
    importOneclickViaLauncher: writeSubProcedure(MODULE, 'edit_details', 'Editar detalhes do cliente')
      .input(z.object({ clienteId: z.string(), documento: z.string() }))
      .mutation(async ({ input }) => {
        if (!importOneclickService) throw new Error('Serviço de importação OneClick não disponível')
        if (!contratoSyncService) throw new Error('Service Manager não conectado (ponte indisponível)')
        const cnpj = input.documento.replace(/\D/g, '')
        if (cnpj.length !== 14) throw new Error('CNPJ inválido — importação apenas para 14 dígitos')
        let dados: import('./import-oneclick.service').ImportLegadoDados
        try {
          dados = (await contratoSyncService.requestClienteImport(cnpj)) as unknown as import('./import-oneclick.service').ImportLegadoDados
        } catch (e) {
          // O SM devolve o erro cru da leitura do MySQL legado (ex.: "connect
          // ETIMEDOUT 192.168.0.7:3306"). Traduz para algo acionável, mantendo o
          // detalhe técnico. O timeout/"não conectado" já são claros e passam direto.
          const msg = (e as Error).message || 'Falha ao importar do OneClick.'
          if (/etimedout|econnrefused|ehostunreach|enetunreach|getaddrinfo|enotfound|\bconnect\b|access denied|er_|handshake|pool is closed/i.test(msg)) {
            throw new Error(
              `Cadastro legado (OneClick v1) inacessível: o Service Manager não conseguiu ler o MySQL do escritório. ` +
              `Verifique a VPN/rede na máquina do Service Manager. Detalhe: ${msg}`,
            )
          }
          throw new Error(msg)
        }
        return importOneclickService.aplicar(input.clienteId, dados)
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
        if (fed[0]) certidoes.push({ label: 'CND Federal', situacao: fed[0].tipo_certidao as string, dataValidade: fed[0].data_validade ? (fed[0].data_validade as Date).toISOString().split('T')[0] ?? null : null, sucesso: fed[0].sucesso as boolean })
        const est = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(`SELECT sucesso FROM certidoes_cnd_estadual WHERE cliente_id = $1 ORDER BY created_at DESC LIMIT 1`, input.clienteId).catch(() => [])
        if (est[0]) certidoes.push({ label: 'CND Estadual', situacao: est[0].sucesso ? 'Negativa' : 'Não emitida', dataValidade: null, sucesso: est[0].sucesso as boolean })
        const mun = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(`SELECT tipo_certidao, municipio, data_validade, sucesso FROM certidoes_cnd_municipal WHERE cliente_id = $1 ORDER BY created_at DESC LIMIT 1`, input.clienteId).catch(() => [])
        if (mun[0]) certidoes.push({ label: `CND Municipal (${mun[0].municipio})`, situacao: mun[0].tipo_certidao as string, dataValidade: mun[0].data_validade ? (mun[0].data_validade as Date).toISOString().split('T')[0] ?? null : null, sucesso: mun[0].sucesso as boolean })
        const trb = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(`SELECT tipo_certidao, data_validade, sucesso FROM certidoes_cndt WHERE cliente_id = $1 ORDER BY created_at DESC LIMIT 1`, input.clienteId).catch(() => [])
        if (trb[0]) certidoes.push({ label: 'CNDT Trabalhista', situacao: trb[0].tipo_certidao as string, dataValidade: trb[0].data_validade ? (trb[0].data_validade as Date).toISOString().split('T')[0] ?? null : null, sucesso: trb[0].sucesso as boolean })
        const fgts = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(`SELECT tipo_certidao, data_validade, sucesso FROM certidoes_crf_fgts WHERE cliente_id = $1 ORDER BY created_at DESC LIMIT 1`, input.clienteId).catch(() => [])
        if (fgts[0]) certidoes.push({ label: 'CRF/FGTS', situacao: fgts[0].tipo_certidao as string, dataValidade: fgts[0].data_validade ? (fgts[0].data_validade as Date).toISOString().split('T')[0] ?? null : null, sucesso: fgts[0].sucesso as boolean })
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

    // ── Logomarca do cliente (envio manual ou busca pelo domínio) ────
    sugerirLogos: readProcedure(MODULE)
      .input(z.object({ clienteId: z.string().optional(), dominio: z.string().optional() }))
      .query(({ input }) => {
        if (!logoService) throw new TRPCError({ code: 'NOT_IMPLEMENTED', message: 'Busca de logomarca indisponível.' })
        return logoService.sugerirLogos(input)
      }),

    // ── Perfis dos sócios nas redes (preparo de reunião) ────────
    //
    // Guarda o ENDEREÇO do perfil, nunca o que a pessoa publica. Leitura sob a
    // permissão do cadastro; escrita sob `edit_details`, porque confirmar um
    // perfil é afirmar que aquela pessoa é aquela.
    listPerfisSocios: readProcedure(MODULE)
      .input(z.object({ clienteId: z.string() }))
      .query(({ input }) => {
        if (!socioPerfisService) throw new TRPCError({ code: 'NOT_IMPLEMENTED', message: 'Perfis de sócios indisponível.' })
        return socioPerfisService.listarPorCliente(input.clienteId)
      }),

    // Aplica de uma vez o que só preenche campo vazio — ver o comentário do
    // service para a diferença entre preencher e sobrescrever.
    preencherVaziosDossie: writeSubProcedure(MODULE, 'edit_details', 'Editar detalhes do cliente')
      .input(z.object({ clienteId: z.string() }))
      .mutation(({ input, ctx }) => {
        if (!dossieService) throw new TRPCError({ code: 'NOT_IMPLEMENTED', message: 'Dossiê indisponível.' })
        return dossieService.preencherVazios(input.clienteId, ctx.userId ?? undefined)
      }),

    // Atalhos das consultas públicas sobre pessoa física. Só a LISTA vem do
    // servidor; quem troca {cpf} e {nome} é a tela, por sócio.
    listConsultasPublicas: readProcedure(MODULE)
      .query(() => consultasPublicas()),

    // Onde mais os sócios aparecem, dentro da própria carteira.
    listParticipacoesSocios: readProcedure(MODULE)
      .input(z.object({ clienteId: z.string() }))
      .query(({ input }) => {
        if (!socioPerfisService) throw new TRPCError({ code: 'NOT_IMPLEMENTED', message: 'Perfis de sócios indisponível.' })
        return socioPerfisService.participacoes(input.clienteId)
      }),

    addPerfilSocio: writeSubProcedure(MODULE, 'edit_details', 'Editar detalhes do cliente')
      .input(z.object({
        socioId: z.string(),
        rede: z.string().default('OUTRO'),
        url: z.string().min(1),
        observacao: z.string().optional().nullable(),
      }))
      .mutation(({ input, ctx }) => {
        if (!socioPerfisService) throw new TRPCError({ code: 'NOT_IMPLEMENTED', message: 'Perfis de sócios indisponível.' })
        return socioPerfisService.adicionar(input, ctx.userId ?? null)
      }),

    confirmarPerfilSocio: writeSubProcedure(MODULE, 'edit_details', 'Editar detalhes do cliente')
      .input(z.object({ id: z.string() }))
      .mutation(({ input, ctx }) => {
        if (!socioPerfisService) throw new TRPCError({ code: 'NOT_IMPLEMENTED', message: 'Perfis de sócios indisponível.' })
        return socioPerfisService.confirmar(input.id, ctx.userId ?? null)
      }),

    anotarPerfilSocio: writeSubProcedure(MODULE, 'edit_details', 'Editar detalhes do cliente')
      .input(z.object({ id: z.string(), observacao: z.string().nullable() }))
      .mutation(({ input }) => {
        if (!socioPerfisService) throw new TRPCError({ code: 'NOT_IMPLEMENTED', message: 'Perfis de sócios indisponível.' })
        return socioPerfisService.anotar(input.id, input.observacao)
      }),

    removerPerfilSocio: deleteSubProcedure(MODULE, 'edit_details', 'Editar detalhes do cliente')
      .input(z.object({ id: z.string() }))
      .mutation(({ input }) => {
        if (!socioPerfisService) throw new TRPCError({ code: 'NOT_IMPLEMENTED', message: 'Perfis de sócios indisponível.' })
        return socioPerfisService.remover(input.id)
      }),

    sugerirPerfisSocio: writeSubProcedure(MODULE, 'edit_details', 'Editar detalhes do cliente')
      .input(z.object({ socioId: z.string() }))
      .mutation(({ input }) => {
        if (!socioPerfisService) throw new TRPCError({ code: 'NOT_IMPLEMENTED', message: 'Perfis de sócios indisponível.' })
        return socioPerfisService.sugerir(input.socioId)
      }),

    aplicarLogoSugerida: writeSubProcedure(MODULE, 'edit_details', 'Editar detalhes do cliente')
      .input(z.object({ clienteId: z.string(), url: z.string() }))
      .mutation(({ input }) => {
        if (!logoService) throw new TRPCError({ code: 'NOT_IMPLEMENTED', message: 'Busca de logomarca indisponível.' })
        return logoService.aplicarLogoSugerida(input.clienteId, input.url)
      }),

    // ── Dossiê do Cliente (enriquecimento por CNPJ) ──────────────────
    // Ler é leitura do módulo; aprovar divergência escreve no cadastro e por
    // isso exige a mesma permissão de editar detalhes.
    getDossie: readProcedure(MODULE)
      .input(z.object({ clienteId: z.string() }))
      .query(({ input, ctx }) => {
        if (!dossieService) throw new TRPCError({ code: 'NOT_IMPLEMENTED', message: 'Dossiê indisponível.' })
        return dossieService.getDossie(input.clienteId, ctx.userId ?? undefined)
      }),

    atualizarDossie: writeSubProcedure(MODULE, 'edit_details', 'Editar detalhes do cliente')
      .input(z.object({ clienteId: z.string(), forcar: z.boolean().default(true) }))
      .mutation(({ input, ctx }) => {
        if (!dossieService) throw new TRPCError({ code: 'NOT_IMPLEMENTED', message: 'Dossiê indisponível.' })
        return dossieService.enriquecer(input.clienteId, { forcar: input.forcar, usuarioId: ctx.userId ?? undefined })
      }),

    decidirSugestaoDossie: writeSubProcedure(MODULE, 'edit_details', 'Editar detalhes do cliente')
      .input(z.object({
        id: z.string(),
        decisao: z.enum(['aprovada', 'rejeitada']),
        observacao: z.string().optional(),
      }))
      .mutation(({ input, ctx }) => {
        if (!dossieService) throw new TRPCError({ code: 'NOT_IMPLEMENTED', message: 'Dossiê indisponível.' })
        return dossieService.decidirSugestao(input.id, input.decisao, ctx.userId ?? undefined, input.observacao)
      }),

    // Varredura da base. Master-only: fala com fontes externas em nome de toda
    // a carteira e, na cauda da cadeia, gasta consulta paga do SERPRO.
    backfillDossie: protectedProcedure
      .input(z.object({
        dryRun: z.boolean().default(true),
        limite: z.number().int().min(1).max(5000).optional(),
        delayMs: z.number().int().min(0).max(5000).optional(),
      }))
      .mutation(({ input, ctx }) => {
        if (!ctx.isMaster) throw new TRPCError({ code: 'FORBIDDEN', message: 'Apenas o usuário master pode rodar a varredura.' })
        if (!dossieBackfillService) throw new TRPCError({ code: 'NOT_IMPLEMENTED', message: 'Varredura indisponível.' })
        return dossieBackfillService.executar({ ...input, empresaId: ctx.empresaId, usuarioId: ctx.userId ?? undefined })
      }),

    progressoBackfillDossie: protectedProcedure
      .query(({ ctx }) => {
        if (!ctx.isMaster) throw new TRPCError({ code: 'FORBIDDEN', message: 'Apenas o usuário master.' })
        if (!dossieBackfillService) throw new TRPCError({ code: 'NOT_IMPLEMENTED', message: 'Varredura indisponível.' })
        return dossieBackfillService.getProgresso()
      }),

    cancelarBackfillDossie: protectedProcedure
      .mutation(({ ctx }) => {
        if (!ctx.isMaster) throw new TRPCError({ code: 'FORBIDDEN', message: 'Apenas o usuário master.' })
        if (!dossieBackfillService) throw new TRPCError({ code: 'NOT_IMPLEMENTED', message: 'Varredura indisponível.' })
        dossieBackfillService.pedirCancelamento()
        return { ok: true }
      }),

    // ── Capa DO CLIENTE (personalizada; cai na global quando vazia) ──
    // Quem edita os detalhes do cliente edita a capa dele: a imagem virou dado
    // do cadastro, não mais configuração do módulo (essa continua master-only).
    getCapaCliente: readProcedure(MODULE)
      .input(z.object({ clienteId: z.string() }))
      .query(({ input }) => {
        if (!capaService) throw new TRPCError({ code: 'NOT_IMPLEMENTED', message: 'Serviço de capa indisponível.' })
        return capaService.getCapa(input.clienteId)
      }),

    setCapaCliente: writeSubProcedure(MODULE, 'edit_details', 'Editar detalhes do cliente')
      .input(z.object({ clienteId: z.string(), url: z.string().nullable() }))
      .mutation(({ input }) => {
        if (!capaService) throw new TRPCError({ code: 'NOT_IMPLEMENTED', message: 'Serviço de capa indisponível.' })
        return capaService.setCapa(input.clienteId, input.url)
      }),

    sugerirCapas: readProcedure(MODULE)
      .input(z.object({ clienteId: z.string().optional(), termo: z.string().optional(), page: z.number().int().min(1).max(20).optional() }))
      .query(({ input }) => {
        if (!capaService) throw new TRPCError({ code: 'NOT_IMPLEMENTED', message: 'Serviço de capa indisponível.' })
        return capaService.sugerirCapas(input)
      }),

    aplicarCapaSugerida: writeSubProcedure(MODULE, 'edit_details', 'Editar detalhes do cliente')
      .input(z.object({ clienteId: z.string(), url: z.string() }))
      .mutation(({ input }) => {
        if (!capaService) throw new TRPCError({ code: 'NOT_IMPLEMENTED', message: 'Serviço de capa indisponível.' })
        return capaService.aplicarCapaSugerida(input.clienteId, input.url)
      }),

    // Busca a atividade na Receita sem sair do modal da capa.
    buscarAtividadeParaCapa: writeSubProcedure(MODULE, 'manage_fiscal', 'Gerenciar aba fiscal')
      .input(z.object({ clienteId: z.string() }))
      .mutation(({ input }) => {
        if (!capaService) throw new TRPCError({ code: 'NOT_IMPLEMENTED', message: 'Serviço de capa indisponível.' })
        return capaService.enriquecerEDevolverTermo(input.clienteId)
      }),

    // ── Enriquecimento de CNAE (BrasilAPI → SERPRO fallback) ─────────
    enriquecerCnae: writeSubProcedure(MODULE, 'manage_fiscal', 'Gerenciar aba fiscal')
      .input(z.object({ clienteId: z.string() }))
      .mutation(({ input }) => {
        if (!enriquecimentoService) throw new TRPCError({ code: 'NOT_IMPLEMENTED', message: 'Serviço de enriquecimento indisponível.' })
        return enriquecimentoService.enriquecerCnae(input.clienteId)
      }),

    enriquecerCnaeBulk: writeSubProcedure(MODULE, 'manage_fiscal', 'Gerenciar aba fiscal')
      .input(z.object({
        apenasSemCnae: z.boolean().default(true),
        limite: z.coerce.number().int().min(1).max(2000).optional(),
      }))
      .mutation(({ input }) => {
        if (!enriquecimentoService) throw new TRPCError({ code: 'NOT_IMPLEMENTED', message: 'Serviço de enriquecimento indisponível.' })
        return enriquecimentoService.enriquecerCnaeBulk(input)
      }),

    // ── Sincronização de responsáveis (via Acessórias) ────────────
    sincronizarResponsaveis: writeSubProcedure(MODULE, 'manage_responsible', 'Gerenciar responsáveis pelos serviços')
      .input(z.object({ mesesHistorico: z.coerce.number().int().min(1).max(60).optional() }).optional())
      .mutation(({ input, ctx }) => {
        if (!sincronizarResponsaveisService) throw new TRPCError({ code: 'NOT_IMPLEMENTED', message: 'Serviço indisponível.' })
        return sincronizarResponsaveisService.executar({
          mesesHistorico: input?.mesesHistorico,
          empresaId: ctx.empresaId,
        })
      }),

    // ── Cadastros repetidos (relatório, só leitura) ──
    // Restrito a master/empresa-master: expõe o mapa de inconsistências da base
    // e é a porta de entrada da mesclagem, que é operação destrutiva e rara.
    duplicidades: readProcedure(MODULE)
      .input(z.object({ apenasComDado: z.boolean().optional() }).optional())
      .query(({ input, ctx }) => {
        if (!ctx.isMaster && !ctx.isEmpresaMaster) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Relatório restrito ao administrador.' })
        }
        if (!duplicidadeService) throw new TRPCError({ code: 'NOT_IMPLEMENTED', message: 'Serviço indisponível.' })
        return duplicidadeService.listar(ctx.isMaster ?? false, ctx.empresaId, {
          apenasComDado: input?.apenasComDado,
        })
      }),
    duplicidadesTipos: readProcedure(MODULE)
      .query(() => duplicidadeService?.tiposVinculo ?? []),

    // ── Mesclagem de cadastros repetidos ──
    // Só master/empresa-master: move histórico e inativa cadastro, sem desfazer.
    mesclarPreview: readProcedure(MODULE)
      .input(z.object({ origemId: z.string(), destinoId: z.string() }))
      .query(({ input, ctx }) => {
        if (!ctx.isMaster && !ctx.isEmpresaMaster) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Operação restrita ao administrador.' })
        }
        if (!mesclagemService) throw new TRPCError({ code: 'NOT_IMPLEMENTED', message: 'Serviço indisponível.' })
        return mesclagemService.previsualizar(input.origemId, input.destinoId, ctx.isMaster ?? false, ctx.empresaId)
      }),
    mesclarExecutar: writeProcedure(MODULE)
      .input(z.object({ origemId: z.string(), destinoId: z.string() }))
      .mutation(({ input, ctx }) => {
        if (!ctx.isMaster && !ctx.isEmpresaMaster) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Operação restrita ao administrador.' })
        }
        if (!mesclagemService) throw new TRPCError({ code: 'NOT_IMPLEMENTED', message: 'Serviço indisponível.' })
        return mesclagemService.executar(input.origemId, input.destinoId, ctx.userId, ctx.isMaster ?? false, ctx.empresaId)
      }),
  })
}
