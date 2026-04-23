import { z } from 'zod'
import { router, protectedProcedure } from '../trpc/trpc.service'
import { FolhaService } from './folha.service'
import { folhaFilialSchema, folhaSetorSchema, folhaEventoContaSchema, folhaImportarSchema } from '@saas/types'

export function createFolhaRouter(folhaService: FolhaService) {
  return router({
    // ── Filiais ──
    listarFiliais: protectedProcedure
      .input(z.object({ clienteId: z.string() }))
      .query(({ input }) => folhaService.listarFiliais(input.clienteId)),

    criarFilial: protectedProcedure
      .input(folhaFilialSchema)
      .mutation(({ input }) => folhaService.criarFilial(input)),

    atualizarFilial: protectedProcedure
      .input(z.object({
        id: z.string(),
        cnpj: z.string().optional(),
        codigoFilial: z.string().optional(),
        endereco: z.string().optional(),
        contaLiquido: z.coerce.number().optional(),
        contaLiquidoAlt: z.coerce.number().nullable().optional(),
        ativo: z.boolean().optional(),
      }))
      .mutation(({ input }) => { const { id, ...data } = input; return folhaService.atualizarFilial(id, data) }),

    excluirFilial: protectedProcedure
      .input(z.object({ id: z.string() }))
      .mutation(({ input }) => folhaService.excluirFilial(input.id)),

    // ── Setores ──
    criarSetor: protectedProcedure
      .input(folhaSetorSchema)
      .mutation(({ input }) => folhaService.criarSetor(input)),

    excluirSetor: protectedProcedure
      .input(z.object({ id: z.string() }))
      .mutation(({ input }) => folhaService.excluirSetor(input.id)),

    // ── Evento -> Conta (tabela de-para) ──
    listarEventoContas: protectedProcedure
      .input(z.object({ clienteId: z.string() }))
      .query(({ input }) => folhaService.listarEventoContas(input.clienteId)),

    salvarEventoConta: protectedProcedure
      .input(folhaEventoContaSchema)
      .mutation(({ input }) => folhaService.salvarEventoConta(input)),

    salvarEventoContasBulk: protectedProcedure
      .input(z.object({
        clienteId: z.string(),
        items: z.array(folhaEventoContaSchema.omit({ clienteId: true })),
      }))
      .mutation(({ input }) => folhaService.salvarEventoContasBulk(input.clienteId, input.items)),

    excluirEventoConta: protectedProcedure
      .input(z.object({ id: z.string() }))
      .mutation(({ input }) => folhaService.excluirEventoConta(input.id)),

    // ── Importação ──
    importar: protectedProcedure
      .input(folhaImportarSchema)
      .mutation(({ input }) => folhaService.importarTxt(input.clienteId, input.competencia, input.conteudo, input.nomeArquivo)),

    contabilizar: protectedProcedure
      .input(z.object({ importacaoId: z.string() }))
      .mutation(({ input }) => folhaService.contabilizar(input.importacaoId)),

    // ── Listagem ──
    listarImportacoes: protectedProcedure
      .input(z.object({ clienteId: z.string() }))
      .query(({ input }) => folhaService.listarImportacoes(input.clienteId)),

    listarLancamentos: protectedProcedure
      .input(z.object({ importacaoId: z.string() }))
      .query(({ input }) => folhaService.listarLancamentos(input.importacaoId)),

    listarDadosImportados: protectedProcedure
      .input(z.object({ importacaoId: z.string() }))
      .query(({ input }) => folhaService.listarDadosImportados(input.importacaoId)),

    // ── Exportação ──
    listarFiliaisImportacao: protectedProcedure
      .input(z.object({ importacaoId: z.string() }))
      .query(({ input }) => folhaService.listarFiliaisImportacao(input.importacaoId)),

    exportar: protectedProcedure
      .input(z.object({ importacaoId: z.string(), tipo: z.enum(['DEBITO', 'CREDITO']), filialId: z.string().optional() }))
      .mutation(({ input }) => folhaService.exportarTxt(input.importacaoId, input.tipo, input.filialId)),

    // ── Exclusão ──
    excluirImportacao: protectedProcedure
      .input(z.object({ id: z.string() }))
      .mutation(({ input }) => folhaService.excluirImportacao(input.id)),

    // ── Importar configuração do XLSM ──
    importarXlsm: protectedProcedure
      .input(z.object({ clienteId: z.string(), base64: z.string() }))
      .mutation(async ({ input }) => {
        const buffer = Buffer.from(input.base64, 'base64')
        return folhaService.importarXlsm(input.clienteId, buffer)
      }),
  })
}
