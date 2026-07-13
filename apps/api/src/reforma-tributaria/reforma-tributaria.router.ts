import {
  reformaDiagnosticoSchema,
  reformaListClientesSchema,
  reformaSimulacaoSchema,
  reformaClassificarCreditoSchema,
} from '@saas/types'
import { z } from 'zod'
import { deleteProcedure, readProcedure, router, writeProcedure } from '../trpc/trpc.service'
import { ReformaTributariaService } from './reforma-tributaria.service'

const MODULE = 'reforma-tributaria'

const premissaFiscalSchema = z.object({
  id: z.string().optional(),
  nome: z.string().min(2),
  ano: z.coerce.number().int().min(2026).max(2100).default(2027),
  setor: z.string().optional().nullable(),
  cnaePrefix: z.string().optional().nullable(),
  aliquotaCbs: z.coerce.number().min(0).max(1),
  aliquotaIbs: z.coerce.number().min(0).max(1),
  aliquotaSimplesIbsCbs: z.coerce.number().min(0).max(1),
  percentualVendasB2B: z.coerce.number().min(0).max(1),
  percentualComprasCreditaveis: z.coerce.number().min(0).max(1),
  pesoCreditoCliente: z.coerce.number().min(0).max(1),
  reducaoSetorial: z.coerce.number().min(0).max(1).default(0),
  observacoes: z.string().optional().nullable(),
  ativo: z.boolean().default(true),
})

export function createReformaTributariaRouter(service: ReformaTributariaService) {
  return router({
    dashboard: readProcedure(MODULE)
      .query(({ ctx }) => service.dashboard(ctx.empresaId)),

    clientes: readProcedure(MODULE)
      .input(reformaListClientesSchema.optional())
      .query(({ input, ctx }) => service.listarClientes(input ?? {}, ctx.empresaId)),

    premissas: readProcedure(MODULE)
      .query(({ ctx }) => service.listarPremissas(ctx.empresaId)),

    salvarPremissa: writeProcedure(MODULE)
      .input(premissaFiscalSchema)
      .mutation(({ input, ctx }) => service.salvarPremissa(input, ctx.empresaId)),

    removerPremissa: deleteProcedure(MODULE)
      .input(z.object({ id: z.string().min(1) }))
      .mutation(({ input, ctx }) => service.removerPremissa(input.id, ctx.empresaId)),

    diagnostico: readProcedure(MODULE)
      .input(reformaDiagnosticoSchema)
      .query(({ input, ctx }) => service.diagnostico(input, ctx.empresaId)),

    classificarCredito: writeProcedure(MODULE)
      .input(reformaClassificarCreditoSchema)
      .mutation(({ input, ctx }) => service.classificarCredito(input, ctx.userId ?? null, ctx.empresaId)),

    simular: readProcedure(MODULE)
      .input(reformaSimulacaoSchema)
      .query(({ input, ctx }) => service.simular(input, ctx.empresaId)),

    historico: readProcedure(MODULE)
      .input(z.object({ clienteId: z.string().min(1) }))
      .query(({ input, ctx }) => service.historico(input.clienteId, ctx.empresaId)),

    salvar: writeProcedure(MODULE)
      .input(reformaSimulacaoSchema)
      .mutation(({ input, ctx }) => service.salvar(input, ctx.userId ?? null, ctx.empresaId)),

    remover: deleteProcedure(MODULE)
      .input(z.object({ id: z.string().min(1) }))
      .mutation(({ input, ctx }) => service.remover(input.id, ctx.empresaId)),
  })
}
