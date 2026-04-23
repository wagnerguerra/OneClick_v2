import { z } from 'zod'
import { router, readProcedure, writeProcedure, deleteProcedure } from '../trpc/trpc.service'
import { paginationSchema } from '@saas/types'
import { SitfisService } from './sitfis.service'
import { CnpjService } from '../cnpj/cnpj.service'
import { SocioService } from '../socio/socio.service'

const MODULE = 'situacao-fiscal'

export function createSitfisRouter(sitfisService: SitfisService, cnpjService: CnpjService, socioService: SocioService) {
  return router({
    // Consultar situação fiscal (fluxo completo com verificação 24h)
    consultar: writeProcedure(MODULE)
      .input(z.object({
        documento: z.string().min(11),
        periodo: z.string().optional(),
        clienteId: z.string().optional(),
        forcarNova: z.boolean().optional(),
        sincronizarSocios: z.boolean().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const result = await sitfisService.consultar(input.documento, {
          periodo: input.periodo,
          clienteId: input.clienteId,
          userId: ctx.userId,
          empresaId: ctx.empresaId,
          forcarNova: input.forcarNova,
        })

        // Sincronização automática de sócios via consulta CNPJ
        let sociosSincronizados: { importados: number; total: number; erros: string[] } | null = null
        const doc = input.documento.replace(/\D/g, '')
        const isCnpj = doc.length === 14
        const shouldSync = input.sincronizarSocios !== false // ativo por padrão

        console.log('[SITFIS-SYNC] Condições:', { sucesso: result.sucesso, isCnpj, clienteId: input.clienteId, shouldSync, doc })

        if (result.sucesso && isCnpj && input.clienteId && shouldSync) {
          try {
            console.log('[SITFIS-SYNC] Iniciando consulta CNPJ para QSA...')
            const cnpjResult = await cnpjService.consultarCnpj(doc)
            console.log('[SITFIS-SYNC] QSA retornado:', cnpjResult.qsa.length, 'sócios, fonte:', cnpjResult.fonte)

            if (cnpjResult.qsa.length > 0) {
              const erros: string[] = []
              let importados = 0

              for (const qsaSocio of cnpjResult.qsa) {
                try {
                  const cpfLimpo = qsaSocio.cpfCnpj.replace(/\D/g, '')
                  console.log('[SITFIS-SYNC] Processando sócio:', qsaSocio.nome, '| CPF limpo:', cpfLimpo, '| Original:', qsaSocio.cpfCnpj)
                  if (!cpfLimpo || cpfLimpo === '00000000000') continue

                  // Verificar se o sócio já existe para este cliente (por CPF)
                  const existente = await sitfisService.findSocioByCpfAndCliente(cpfLimpo, input.clienteId!)
                  if (existente) continue // Pular sócios já cadastrados

                  const tipoSocio = cnpjService.mapQualificacaoToTipoSocio(qsaSocio.codigoQualificacao)

                  await socioService.create({
                    nomeCompleto: qsaSocio.nome,
                    cpf: cpfLimpo,
                    tipoSocio: tipoSocio as 'SOCIO_QUOTISTA',
                    participacao: qsaSocio.percentualCapital,
                    dataEntrada: qsaSocio.dataEntrada || '',
                    clienteId: input.clienteId!,
                    isActive: true,
                    assinaNaEmpresa: tipoSocio === 'SOCIO_ADMINISTRADOR',
                    responsavelLegal: tipoSocio === 'REPRESENTANTE_LEGAL',
                    observacoes: `Importado automaticamente via Situação Fiscal (${cnpjResult.fonte === 'serpro' ? 'SERPRO' : 'BrasilAPI'}) — Qualificação: ${qsaSocio.qualificacao}`,
                  }, ctx.userId, ctx.isMaster ?? false, ctx.empresaId, ctx.tenantSchema)

                  importados++
                } catch (e) {
                  erros.push(`${qsaSocio.nome}: ${(e as Error).message}`)
                }
              }

              sociosSincronizados = { importados, total: cnpjResult.qsa.length, erros }
            }
          } catch (syncErr) {
            console.error('[SITFIS-SYNC] Erro geral na sincronização:', (syncErr as Error).message)
            // Falha na sincronização não deve impedir o resultado da consulta fiscal
          }
        }

        return { ...result, sociosSincronizados }
      }),

    // Consulta em lote (vários documentos)
    consultarLote: writeProcedure(MODULE)
      .input(z.object({
        documentos: z.array(z.string().min(11)).min(1).max(50),
      }))
      .mutation(({ input, ctx }) =>
        sitfisService.consultarLote(input.documentos, {
          userId: ctx.userId,
          empresaId: ctx.empresaId,
          forcarNova: true,
        }),
      ),

    // Verificar se existe consulta em cache
    verificarCache: readProcedure(MODULE)
      .input(z.object({
        documento: z.string().min(11),
        periodo: z.string().optional(),
      }))
      .query(({ input }) =>
        sitfisService.verificarCache(input.documento, input.periodo),
      ),

    // Listar consultas realizadas
    list: readProcedure(MODULE)
      .input(paginationSchema.extend({
        clienteId: z.string().optional(),
        situacao: z.string().optional(),
      }))
      .query(({ input, ctx }) =>
        sitfisService.list(input, ctx.empresaId),
      ),

    // Listar lixeira
    listTrash: readProcedure(MODULE)
      .input(paginationSchema)
      .query(({ input }) => sitfisService.listTrash(input)),

    // Detalhes de uma consulta
    getById: readProcedure(MODULE)
      .input(z.object({ id: z.string() }))
      .query(({ input }) => sitfisService.getById(input.id)),

    // Obter PDF em base64
    getPdf: readProcedure(MODULE)
      .input(z.object({ id: z.string() }))
      .query(({ input }) => sitfisService.getPdf(input.id)),

    // Consultas de um cliente específico
    getByClienteId: readProcedure(MODULE)
      .input(z.object({ clienteId: z.string() }))
      .query(({ input }) => sitfisService.getByClienteId(input.clienteId)),

    // Certidões que merecem atenção (Positiva / Positiva com Efeitos de Negativa)
    certidoesAtencao: readProcedure(MODULE)
      .query(({ ctx }) => sitfisService.certidoesAtencao(ctx.empresaId)),

    // Excluir consulta (soft delete)
    delete: deleteProcedure(MODULE)
      .input(z.object({ id: z.string() }))
      .mutation(({ input }) => sitfisService.softDelete(input.id)),

    // Restaurar da lixeira
    restore: writeProcedure(MODULE)
      .input(z.object({ id: z.string() }))
      .mutation(({ input }) => sitfisService.restore(input.id)),

    // Listar clientes com situação MENSAL (para o select de nova consulta)
    listClientesMensal: readProcedure(MODULE)
      .query(({ ctx }) => sitfisService.listClientesMensal(ctx.empresaId)),

    // ── SICALC / DARF ───────────────────────────────────

    consultarCodigoReceita: readProcedure(MODULE)
      .input(z.object({ codigoReceita: z.string().min(1) }))
      .query(({ input }) => sitfisService.consultarCodigoReceita(input.codigoReceita)),

    emitirDarf: writeProcedure(MODULE)
      .input(z.object({
        documento: z.string().min(11),
        tipoDocumento: z.number().int().min(1).max(2).default(2),
        codigoReceita: z.string().min(1),
        codigoReceitaExtensao: z.string().optional(),
        dataPA: z.string().min(1),
        valorImposto: z.number().positive(),
        dataConsolidacao: z.string().min(1),
        tipoPA: z.string().optional(),
        vencimento: z.string().optional(),
        cota: z.number().optional(),
        uf: z.string().optional(),
        municipio: z.string().optional(),
        valorMulta: z.number().optional(),
        valorJuros: z.number().optional(),
        observacao: z.string().optional(),
      }))
      .mutation(({ input }) => {
        const { documento, tipoDocumento, ...dados } = input
        return sitfisService.emitirDarf(documento, tipoDocumento, dados)
      }),
  })
}
