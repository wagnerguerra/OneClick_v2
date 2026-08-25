import { z } from 'zod'
import { paginationSchema } from './pagination'

/**
 * Controle de Férias — port do `crp_ferias` do OneClick v1.
 * Um registro por período aquisitivo do colaborador, com gozos, pagamentos
 * (até três, como o v1) e recibos. O saldo é derivado no backend.
 */

const dataISO = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida.')
const ano = z.coerce.number().int().min(2000).max(2100)

export const criarFeriasPeriodoSchema = z.object({
  colaboradorId: z.string().min(1, 'Escolha o colaborador.'),
  periodoInicial: ano,
  periodoFinal: ano,
  descricao: z.string().max(200).optional().nullable(),
  saldoAnterior: z.coerce.number().int().min(-60).max(60).default(0),
  dias: z.coerce.number().int().min(0).max(60).default(30),
  previsao: dataISO.optional().nullable(),
}).refine((v) => v.periodoFinal >= v.periodoInicial, {
  message: 'O ano final não pode ser menor que o inicial.',
  path: ['periodoFinal'],
})

export const atualizarFeriasPeriodoSchema = z.object({
  id: z.string().min(1),
  descricao: z.string().max(200).optional().nullable(),
  saldoAnterior: z.coerce.number().int().min(-60).max(60).optional(),
  dias: z.coerce.number().int().min(0).max(60).optional(),
  previsao: dataISO.optional().nullable(),
  pagamento1: dataISO.optional().nullable(),
  pagamento2: dataISO.optional().nullable(),
  pagamento3: dataISO.optional().nullable(),
  pago: z.boolean().optional(),
  historico: z.boolean().optional(),
})

export const criarFeriasEventoSchema = z.object({
  periodoId: z.string().min(1),
  dataInicio: dataISO,
  dataFim: dataISO,
  descricao: z.string().max(200).optional().nullable(),
}).refine((v) => v.dataFim >= v.dataInicio, {
  message: 'O fim do gozo não pode vir antes do início.',
  path: ['dataFim'],
})

export const listarFeriasPeriodosSchema = paginationSchema.extend({
  colaboradorId: z.string().optional(),
  /** ABERTOS = fora do histórico; HISTORICO = consolidados. */
  situacao: z.enum(['ABERTOS', 'HISTORICO']).optional(),
  /**
   * A lista segue o cadastro de usuários: por padrão mostra só quem está ATIVO
   * no v2. `TODOS` inclui desligados e os que nem existem mais no cadastro
   * (períodos que ficaram só com o nome no resíduo).
   */
  colaboradores: z.enum(['ATIVOS', 'TODOS']).optional(),
})

/** Filtro comum dos relatórios: recorte por área e inclusão de desligados. */
export const filtroRelatorioFeriasSchema = z.object({
  areaId: z.string().optional(),
  incluirInativos: z.boolean().optional(),
})

export type FiltroRelatorioFeriasInput = z.infer<typeof filtroRelatorioFeriasSchema>
export type CriarFeriasPeriodoInput = z.infer<typeof criarFeriasPeriodoSchema>
export type AtualizarFeriasPeriodoInput = z.infer<typeof atualizarFeriasPeriodoSchema>
export type CriarFeriasEventoInput = z.infer<typeof criarFeriasEventoSchema>
export type ListarFeriasPeriodosInput = z.infer<typeof listarFeriasPeriodosSchema>
