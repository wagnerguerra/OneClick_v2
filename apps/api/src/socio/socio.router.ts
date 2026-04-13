import { z } from 'zod'
import { router, readProcedure, writeProcedure, deleteProcedure } from '../trpc/trpc.service'
import { createSocioSchema, updateSocioSchema, listSocioSchema } from '@saas/types'
import { SocioService } from './socio.service'
import { CnpjService } from '../cnpj/cnpj.service'

const MODULE = 'socios'

export function createSocioRouter(socioService: SocioService, cnpjService: CnpjService) {
  return router({
    list: readProcedure(MODULE)
      .input(listSocioSchema)
      .query(({ input, ctx }) => socioService.list(input, ctx.isMaster ?? false, ctx.empresaId, ctx.tenantSchema)),

    getById: readProcedure(MODULE)
      .input(z.object({ id: z.string() }))
      .query(({ input, ctx }) => socioService.getById(input.id, ctx.isMaster ?? false, ctx.empresaId, ctx.tenantSchema)),

    create: writeProcedure(MODULE)
      .input(createSocioSchema)
      .mutation(({ input, ctx }) => socioService.create(input, ctx.userId, ctx.isMaster ?? false, ctx.empresaId, ctx.tenantSchema)),

    update: writeProcedure(MODULE)
      .input(z.object({ id: z.string(), data: updateSocioSchema }))
      .mutation(({ input, ctx }) => socioService.update(input.id, input.data, ctx.userId, ctx.isMaster ?? false, ctx.empresaId, ctx.tenantSchema)),

    delete: deleteProcedure(MODULE)
      .input(z.object({ id: z.string() }))
      .mutation(({ input, ctx }) => socioService.delete(input.id, ctx.userId, ctx.isMaster ?? false, ctx.empresaId, ctx.tenantSchema)),

    listForSelect: readProcedure(MODULE)
      .query(({ ctx }) => socioService.listForSelect(ctx.isMaster ?? false, ctx.empresaId, ctx.tenantSchema)),

    getEvents: readProcedure(MODULE)
      .input(z.object({ id: z.string() }))
      .query(({ input }) => socioService.getEvents(input.id)),

    exportAll: readProcedure(MODULE)
      .query(({ ctx }) => socioService.exportAll(ctx.isMaster ?? false, ctx.empresaId, ctx.tenantSchema)),

    importBulk: writeProcedure(MODULE)
      .input(z.object({ items: z.array(createSocioSchema) }))
      .mutation(({ input, ctx }) => socioService.bulkCreate(input.items, ctx.userId, ctx.isMaster ?? false, ctx.empresaId, ctx.tenantSchema)),

    // ── ARQUIVOS ──────────────────────────────────────────────
    listArquivos: readProcedure(MODULE)
      .input(z.object({ socioId: z.string() }))
      .query(({ input, ctx }) => socioService.listArquivos(input.socioId, ctx.tenantSchema)),

    addArquivo: writeProcedure(MODULE)
      .input(z.object({
        socioId: z.string(),
        fileName: z.string(),
        fileUrl: z.string(),
        fileSize: z.number().optional(),
        mimeType: z.string().optional(),
        vencimento: z.string().optional(),
      }))
      .mutation(({ input, ctx }) => socioService.addArquivo(input.socioId, input, ctx.userId, ctx.tenantSchema)),

    renameArquivo: writeProcedure(MODULE)
      .input(z.object({ arquivoId: z.string(), fileName: z.string().min(1) }))
      .mutation(({ input, ctx }) => socioService.renameArquivo(input.arquivoId, input.fileName, ctx.tenantSchema)),

    removeArquivo: deleteProcedure(MODULE)
      .input(z.object({ arquivoId: z.string() }))
      .mutation(({ input, ctx }) => socioService.removeArquivo(input.arquivoId, ctx.tenantSchema)),

    // ── MENSAGENS ───────────────────────────────────────────
    listMensagens: readProcedure(MODULE)
      .input(z.object({ socioId: z.string() }))
      .query(({ input, ctx }) => socioService.listMensagens(input.socioId, ctx.tenantSchema)),

    createMensagem: writeProcedure(MODULE)
      .input(z.object({
        socioId: z.string(),
        mensagem: z.string().min(1),
        tipo: z.enum(['interna', 'socio']).default('interna'),
      }))
      .mutation(({ input, ctx }) => socioService.createMensagem(input.socioId, ctx.userId, input.mensagem, input.tipo, ctx.tenantSchema)),

    updateMensagem: writeProcedure(MODULE)
      .input(z.object({ id: z.string(), mensagem: z.string().min(1) }))
      .mutation(({ input, ctx }) => socioService.updateMensagem(input.id, input.mensagem, ctx.tenantSchema)),

    deleteMensagem: deleteProcedure(MODULE)
      .input(z.object({ id: z.string() }))
      .mutation(({ input, ctx }) => socioService.deleteMensagem(input.id, ctx.tenantSchema)),

    // ── Consulta CNPJ (retorna dados + QSA) ─────────────────
    consultarCnpj: readProcedure(MODULE)
      .input(z.object({ cnpj: z.string().min(14) }))
      .query(({ input }) => cnpjService.consultarCnpj(input.cnpj)),

    // ── Importar QSA de um CNPJ ─────────────────────────────
    // Consulta o CNPJ, extrai o QSA e cria os sócios vinculados ao cliente
    importarQsa: writeProcedure(MODULE)
      .input(z.object({
        cnpj: z.string().min(14),
        clienteId: z.string().optional(),
        substituir: z.boolean().default(false),
      }))
      .mutation(async ({ input, ctx }) => {
        // 1. Consultar CNPJ
        const resultado = await cnpjService.consultarCnpj(input.cnpj)

        if (!resultado.qsa.length) {
          return { importados: 0, total: 0, erros: [], razaoSocial: resultado.razaoSocial, message: 'Nenhum sócio encontrado no QSA deste CNPJ.' }
        }

        // 2. Se substituir=true, remover sócios existentes do cliente
        if (input.substituir && input.clienteId) {
          await socioService.deleteByClienteId(input.clienteId, ctx.tenantSchema)
        }

        // 3. Importar cada sócio do QSA
        const erros: string[] = []
        let importados = 0

        for (const qsaSocio of resultado.qsa) {
          try {
            const cpfLimpo = qsaSocio.cpfCnpj.replace(/\D/g, '')

            // Ignorar CPF zerado (representante legal placeholder)
            if (!cpfLimpo || cpfLimpo === '00000000000') continue

            const tipoSocio = cnpjService.mapQualificacaoToTipoSocio(qsaSocio.codigoQualificacao)

            await socioService.create({
              nomeCompleto: qsaSocio.nome,
              cpf: cpfLimpo,
              tipoSocio: tipoSocio as 'SOCIO_QUOTISTA',
              participacao: qsaSocio.percentualCapital,
              dataEntrada: qsaSocio.dataEntrada || '',
              clienteId: input.clienteId || '',
              isActive: true,
              assinaNaEmpresa: tipoSocio === 'SOCIO_ADMINISTRADOR',
              responsavelLegal: tipoSocio === 'REPRESENTANTE_LEGAL',
              observacoes: `Importado do QSA (${resultado.fonte === 'serpro' ? 'SERPRO' : 'BrasilAPI'}) — Qualificação: ${qsaSocio.qualificacao}`,
            }, ctx.userId, ctx.isMaster ?? false, ctx.empresaId, ctx.tenantSchema)

            importados++
          } catch (e) {
            erros.push(`${qsaSocio.nome}: ${(e as Error).message}`)
          }
        }

        return {
          importados,
          total: resultado.qsa.length,
          erros,
          razaoSocial: resultado.razaoSocial,
          message: erros.length
            ? `${importados} de ${resultado.qsa.length} sócio(s) importado(s). ${erros.length} erro(s).`
            : `${importados} sócio(s) importado(s) com sucesso.`,
        }
      }),
  })
}
