import { z } from 'zod'
import { router, readProcedure, writeSubProcedure } from '../trpc/trpc.service'
import { CusteioService } from './custeio.service'

// Reusa as permissões do módulo de clientes (gestão de contratos/custeio).
const MODULE = 'clientes'
const mes = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Use o formato AAAA-MM')

export function createCusteioRouter(service: CusteioService) {
  return router({
    // Parâmetros de custeio por empresa
    getParametros: readProcedure(MODULE)
      .query(({ ctx }) => service.getParametros(ctx.empresaId)),

    saveParametros: writeSubProcedure(MODULE, 'manage_contracts', 'Gerenciar contratos dos clientes')
      .input(z.object({
        encargosPercentual: z.number().optional(),
        usarHorasServicos: z.boolean().optional(),
        aplicarAumentoFaturamento: z.boolean().optional(),
        horasMesReferencia: z.number().optional(),
        beneficioAlimentacaoDia: z.number().optional(),
        beneficioValeTransporteDia: z.number().optional(),
        beneficioPlanoSaudeMensal: z.number().optional(),
        multCategoriaStandard: z.number().optional(),
        multCategoriaAdvanced: z.number().optional(),
        multCategoriaPremium: z.number().optional(),
      }))
      .mutation(({ input, ctx }) => service.saveParametros(ctx.empresaId, input)),

    // Recalcula o custeio de um mês (todos os clientes ou um específico)
    recalcular: writeSubProcedure(MODULE, 'manage_contracts', 'Gerenciar contratos dos clientes')
      .input(z.object({ refMes: mes, clienteId: z.string().nullish() }))
      .mutation(({ input, ctx }) => service.recalcularMes(ctx.empresaId, input.refMes, input.clienteId ?? null)),

    // Consulta o custeio de um mês
    listarMes: readProcedure(MODULE)
      .input(z.object({ refMes: mes }))
      .query(({ input, ctx }) => service.listarMes(ctx.empresaId, input.refMes)),

    // Relatório agregado por cliente num intervalo de meses
    listarRelatorio: readProcedure(MODULE)
      .input(z.object({ refInicio: mes, refFim: mes }))
      .query(({ input, ctx }) => service.listarRelatorio(ctx.empresaId, input.refInicio, input.refFim)),
  })
}
