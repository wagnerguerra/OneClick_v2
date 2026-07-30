import { z } from 'zod'
import {
  router, readProcedure, writeProcedure, deleteProcedure, readSubProcedure,
} from '../trpc/trpc.service'
import {
  createCompraSchema, updateCompraSchema, listCompraSchema,
  createCompraItemSchema, updateCompraItemSchema,
  reprovarCompraSchema, avaliarCompraSchema,
  createCompraAnexoSchema, updateCompraAnexoSchema,
  createCompraMensagemSchema, updateCompraMensagemSchema,
  createCompraCriterioSchema, updateCompraCriterioSchema,
  createCotacaoSchema, updateCotacaoSchema, listCotacaoSchema,
  createCotacaoItemSchema, updateCotacaoItemSchema,
  addCotacaoFornecedorSchema, updateCotacaoFornecedorSchema,
  setCotacaoPrecoSchema, premiarItemSchema, premiarLoteSchema, enviarCotacaoSchema,
} from '@saas/types'
import { CompraService } from './compra.service'
import { CotacaoService } from './cotacao.service'

// Slug do módulo nas permissões. Precisa ser EXATAMENTE o do cadastro de
// usuários e do menu ('aquisicoes'). Já esteve como 'compras', um slug que não
// existe no registro de módulos — com isso todo usuário sem master/empresa
// master levava FORBIDDEN no módulo inteiro, mesmo com Aquisições liberado.
const MODULE = 'aquisicoes'
const SUB_APROVAR = 'aprovar_pedidos'
const SUB_CONFIG = 'gerenciar_configuracoes'

export function createCompraRouter(compraService: CompraService, cotacaoService: CotacaoService) {
  return router({
    list: readProcedure(MODULE)
      .input(listCompraSchema)
      .query(({ input, ctx }) => compraService.list(input, ctx.isMaster ?? false, ctx.empresaId, ctx.tenantSchema)),
    getById: readProcedure(MODULE)
      .input(z.object({ id: z.string() }))
      .query(({ input, ctx }) => compraService.getById(input.id, ctx.isMaster ?? false, ctx.empresaId, ctx.tenantSchema)),
    create: writeProcedure(MODULE)
      .input(createCompraSchema)
      .mutation(({ input, ctx }) => compraService.create(input, ctx.userId, ctx.empresaId, ctx.tenantSchema)),
    update: writeProcedure(MODULE)
      .input(z.object({ id: z.string(), data: updateCompraSchema }))
      .mutation(({ input, ctx }) => compraService.update(input.id, input.data, ctx.isMaster ?? false, ctx.empresaId, ctx.tenantSchema)),
    delete: deleteProcedure(MODULE)
      .input(z.object({ id: z.string() }))
      .mutation(({ input, ctx }) => compraService.delete(input.id, ctx.tenantSchema)),

    fornecedoresSelect: readProcedure(MODULE)
      .query(({ ctx }) => compraService.listForSelectFornecedores(ctx.isMaster ?? false, ctx.empresaId, ctx.tenantSchema)),

    // ── Workflow ──
    enviar: writeProcedure(MODULE)
      .input(z.object({ id: z.string() }))
      .mutation(({ input, ctx }) => compraService.enviar(input.id, ctx.tenantSchema)),
    // Aprovar/reprovar: LEITURA no módulo + sub-permissão de aprovação. De
    // propósito não exige escrita — ser aprovador (um diretor, p.ex.) não deve
    // implicar o direito de criar/editar pedidos.
    aprovar: readSubProcedure(MODULE, SUB_APROVAR, 'Aprovar pedidos de compra')
      .input(z.object({ id: z.string() }))
      .mutation(({ input, ctx }) => compraService.aprovar(input.id, ctx.userId, ctx.tenantSchema)),
    reprovar: readSubProcedure(MODULE, SUB_APROVAR, 'Aprovar pedidos de compra')
      .input(reprovarCompraSchema)
      .mutation(({ input, ctx }) => compraService.reprovar(input, ctx.userId, ctx.tenantSchema)),
    receber: writeProcedure(MODULE)
      .input(z.object({ id: z.string() }))
      .mutation(({ input, ctx }) => compraService.receber(input.id, ctx.userId, ctx.tenantSchema)),
    avaliar: writeProcedure(MODULE)
      .input(avaliarCompraSchema)
      .mutation(({ input, ctx }) => compraService.avaliar(input, ctx.tenantSchema)),
    getAvaliacao: readProcedure(MODULE)
      .input(z.object({ compraId: z.string() }))
      .query(({ input, ctx }) => compraService.getAvaliacao(input.compraId, ctx.isMaster ?? false, ctx.empresaId, ctx.tenantSchema)),

    // ── Itens ──
    addItem: writeProcedure(MODULE).input(createCompraItemSchema).mutation(({ input, ctx }) => compraService.addItem(input, ctx.tenantSchema)),
    updateItem: writeProcedure(MODULE).input(updateCompraItemSchema).mutation(({ input, ctx }) => compraService.updateItem(input, ctx.tenantSchema)),
    removeItem: deleteProcedure(MODULE).input(z.object({ id: z.string() })).mutation(({ input, ctx }) => compraService.removeItem(input.id, ctx.tenantSchema)),

    // ── Anexos ──
    listAnexos: readProcedure(MODULE).input(z.object({ compraId: z.string() })).query(({ input, ctx }) => compraService.listAnexos(input.compraId, ctx.tenantSchema)),
    addAnexo: writeProcedure(MODULE).input(createCompraAnexoSchema).mutation(({ input, ctx }) => compraService.addAnexo(input, ctx.userId, ctx.tenantSchema)),
    updateAnexo: writeProcedure(MODULE).input(updateCompraAnexoSchema).mutation(({ input, ctx }) => compraService.updateAnexo(input, ctx.tenantSchema)),
    removeAnexo: deleteProcedure(MODULE).input(z.object({ id: z.string() })).mutation(({ input, ctx }) => compraService.removeAnexo(input.id, ctx.tenantSchema)),

    // ── Mensagens ──
    listMensagens: readProcedure(MODULE).input(z.object({ compraId: z.string() })).query(({ input, ctx }) => compraService.listMensagens(input.compraId, ctx.tenantSchema)),
    addMensagem: writeProcedure(MODULE).input(createCompraMensagemSchema).mutation(({ input, ctx }) => compraService.addMensagem(input, ctx.userId, ctx.tenantSchema)),
    updateMensagem: writeProcedure(MODULE).input(updateCompraMensagemSchema).mutation(({ input, ctx }) => compraService.updateMensagem(input, ctx.userId, ctx.tenantSchema)),
    removeMensagem: deleteProcedure(MODULE).input(z.object({ id: z.string() })).mutation(({ input, ctx }) => compraService.removeMensagem(input.id, ctx.userId, ctx.tenantSchema)),

    // ── Critérios de avaliação ──
    // Listar é livre p/ quem lê o módulo (o modal de avaliação precisa deles);
    // manter o cadastro é da alçada de quem gerencia as configurações.
    listCriterios: readProcedure(MODULE).query(({ ctx }) => compraService.listCriterios(ctx.isMaster ?? false, ctx.empresaId, ctx.tenantSchema)),
    createCriterio: readSubProcedure(MODULE, SUB_CONFIG, 'Gerenciar configurações de Aquisições').input(createCompraCriterioSchema).mutation(({ input, ctx }) => compraService.createCriterio(input, ctx.empresaId, ctx.tenantSchema)),
    updateCriterio: readSubProcedure(MODULE, SUB_CONFIG, 'Gerenciar configurações de Aquisições').input(updateCompraCriterioSchema).mutation(({ input, ctx }) => compraService.updateCriterio(input, ctx.tenantSchema)),
    deleteCriterio: readSubProcedure(MODULE, SUB_CONFIG, 'Gerenciar configurações de Aquisições').input(z.object({ id: z.string() })).mutation(({ input, ctx }) => compraService.deleteCriterio(input.id, ctx.tenantSchema)),

    // ── Configurações › Aprovadores ──
    // A marca de aprovador é a MESMA sub-permissão do cadastro do usuário; esta
    // tela é só o caminho pelo módulo, para o gestor não abrir usuário por usuário.
    listAprovadores: readSubProcedure(MODULE, SUB_CONFIG, 'Gerenciar configurações de Aquisições')
      .query(({ ctx }) => compraService.listAprovadores(ctx.isMaster ?? false, ctx.empresaId)),
    setAprovador: readSubProcedure(MODULE, SUB_CONFIG, 'Gerenciar configurações de Aquisições')
      .input(z.object({ userId: z.string(), ativo: z.boolean() }))
      .mutation(({ input, ctx }) => compraService.setAprovador(input.userId, input.ativo, ctx.isMaster ?? false, ctx.empresaId)),

    // ── Cotação (RFQ) — o passo antes do pedido ──
    listCotacoes: readProcedure(MODULE)
      .input(listCotacaoSchema)
      .query(({ input, ctx }) => cotacaoService.list(input, ctx.isMaster ?? false, ctx.empresaId, ctx.tenantSchema)),
    getCotacao: readProcedure(MODULE)
      .input(z.object({ id: z.string() }))
      .query(({ input, ctx }) => cotacaoService.getById(input.id, ctx.isMaster ?? false, ctx.empresaId, ctx.tenantSchema)),
    createCotacao: writeProcedure(MODULE)
      .input(createCotacaoSchema)
      .mutation(({ input, ctx }) => cotacaoService.create(input, ctx.userId, ctx.empresaId, ctx.tenantSchema)),
    updateCotacao: writeProcedure(MODULE)
      .input(updateCotacaoSchema)
      .mutation(({ input, ctx }) => cotacaoService.update(input, ctx.tenantSchema)),
    deleteCotacao: deleteProcedure(MODULE)
      .input(z.object({ id: z.string() }))
      .mutation(({ input, ctx }) => cotacaoService.delete(input.id, ctx.tenantSchema)),

    addCotacaoItem: writeProcedure(MODULE).input(createCotacaoItemSchema)
      .mutation(({ input, ctx }) => cotacaoService.addItem(input, ctx.tenantSchema)),
    updateCotacaoItem: writeProcedure(MODULE).input(updateCotacaoItemSchema)
      .mutation(({ input, ctx }) => cotacaoService.updateItem(input, ctx.tenantSchema)),
    removeCotacaoItem: writeProcedure(MODULE).input(z.object({ id: z.string() }))
      .mutation(({ input, ctx }) => cotacaoService.removeItem(input.id, ctx.tenantSchema)),
    // Repartir a quantidade do mesmo material entre fornecedores = quebrar a
    // linha em duas; a premiação segue sendo por item.
    dividirCotacaoItem: writeProcedure(MODULE)
      .input(z.object({ id: z.string(), quantidadeNova: z.coerce.number().int().min(1) }))
      .mutation(({ input, ctx }) => cotacaoService.dividirItem(input.id, input.quantidadeNova, ctx.tenantSchema)),

    addCotacaoFornecedor: writeProcedure(MODULE).input(addCotacaoFornecedorSchema)
      .mutation(({ input, ctx }) => cotacaoService.addFornecedor(input, ctx.tenantSchema)),
    updateCotacaoFornecedor: writeProcedure(MODULE).input(updateCotacaoFornecedorSchema)
      .mutation(({ input, ctx }) => cotacaoService.updateFornecedor(input, ctx.tenantSchema)),
    removeCotacaoFornecedor: writeProcedure(MODULE).input(z.object({ id: z.string() }))
      .mutation(({ input, ctx }) => cotacaoService.removeFornecedor(input.id, ctx.tenantSchema)),

    setCotacaoPreco: writeProcedure(MODULE).input(setCotacaoPrecoSchema)
      .mutation(({ input, ctx }) => cotacaoService.setPreco(input, ctx.tenantSchema)),
    premiarCotacaoItem: writeProcedure(MODULE).input(premiarItemSchema)
      .mutation(({ input, ctx }) => cotacaoService.premiarItem(input, ctx.tenantSchema)),
    premiarCotacaoLote: writeProcedure(MODULE).input(premiarLoteSchema)
      .mutation(({ input, ctx }) => cotacaoService.premiarLote(input, ctx.tenantSchema)),

    enviarCotacao: writeProcedure(MODULE).input(enviarCotacaoSchema)
      .mutation(({ input, ctx }) => cotacaoService.enviar(input, ctx.tenantSchema)),
    gerarPedidosCotacao: writeProcedure(MODULE).input(z.object({ cotacaoId: z.string() }))
      .mutation(({ input, ctx }) => cotacaoService.gerarPedidos(input.cotacaoId, ctx.userId, ctx.tenantSchema)),
  })
}
