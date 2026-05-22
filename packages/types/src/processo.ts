import { z } from 'zod'

// ============================================================
// Processo — agregador de cadeia de execucoes encadeadas
// ============================================================

export const PROCESSO_STATUS = ['EM_ANDAMENTO', 'CONCLUIDO', 'CANCELADO'] as const
export type ProcessoStatus = (typeof PROCESSO_STATUS)[number]

export const PROCESSO_STATUS_LABELS: Record<ProcessoStatus, string> = {
  EM_ANDAMENTO: 'Em andamento',
  CONCLUIDO: 'Concluído',
  CANCELADO: 'Cancelado',
}

// Status estendido em ServicoExecucao quando faz parte de um processo:
//  - AGUARDANDO_INICIO:   criada pela cascata, aguarda confirmacao manual
//  - PULADO:              sucessor opcional recusado pelo gestor
//  - AGUARDANDO_RESPOSTA: execução de bloco PERGUNTA pausada esperando o gestor responder
export const EXECUCAO_STATUS_ESTENDIDOS = [
  'EM_ANDAMENTO', 'CONCLUIDO', 'CANCELADO', 'AGUARDANDO_INICIO', 'PULADO', 'AGUARDANDO_RESPOSTA',
] as const
export type ExecucaoStatusEstendido = (typeof EXECUCAO_STATUS_ESTENDIDOS)[number]

// ============================================================
// Condicional DSL — avaliada em runtime contra cliente/orcamento
// ============================================================
//
// Exemplo:
// {
//   all: [
//     { campo: 'cliente.regime', op: 'eq', valor: 'SIMPLES' },
//     { campo: 'orcamento.tipo', op: 'in', valor: ['TRANSFERENCIA', 'CONSTITUICAO'] }
//   ]
// }
//
// `all` = todas as regras precisam ser verdade (AND).
// `any` = ao menos uma precisa ser verdade (OR).
// Pode combinar all + any (ambos avaliados; resultado final = all_ok && any_ok).

export const CAMPOS_CONDICAO = [
  'cliente.regime',         // RegimeContabil (SIMPLES | LUCRO_PRESUMIDO | LUCRO_REAL | MEI)
  'cliente.situacao',       // ClienteSituacao (MENSAL | EVENTUAL | ...)
  'cliente.tributacao',     // TaxRegime
  'cliente.categoria',      // string livre
  'cliente.tipoCliente',    // string livre
  'orcamento.tipo',         // string (SERVICO_EXTRA | SERVICO_MENSAL | ...)
  'orcamento.valorTotal',   // numerico — mapeia para Orcamento.totalGeral
] as const
export type CampoCondicao = (typeof CAMPOS_CONDICAO)[number]

export const OPERADORES_CONDICAO = ['eq', 'ne', 'in', 'not_in', 'is_null', 'is_not_null'] as const
export type OperadorCondicao = (typeof OPERADORES_CONDICAO)[number]

export const regraSchema = z.object({
  campo: z.enum(CAMPOS_CONDICAO),
  op: z.enum(OPERADORES_CONDICAO),
  valor: z.union([z.string(), z.number(), z.array(z.string())]).optional(),
})
export type Regra = z.infer<typeof regraSchema>

export const condicaoSchema = z.object({
  all: z.array(regraSchema).optional(),
  any: z.array(regraSchema).optional(),
})
export type Condicao = z.infer<typeof condicaoSchema>

// ============================================================
// CRUD Schemas
// ============================================================

export const listProcessoSchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
  search: z.string().optional(),
  status: z.enum(PROCESSO_STATUS).optional(),
  clienteId: z.string().optional(),
  responsavelId: z.string().optional(),
})
export type ListProcessoInput = z.infer<typeof listProcessoSchema>

export const createProcessoSchema = z.object({
  nome: z.string().min(1),
  clienteId: z.string(),
  servicoRaizId: z.string(),
  orcamentoId: z.string().optional(),
  responsavelId: z.string().optional(),
})
export type CreateProcessoInput = z.infer<typeof createProcessoSchema>

export const cancelarProcessoSchema = z.object({
  id: z.string(),
  motivo: z.string().min(1),
})
export type CancelarProcessoInput = z.infer<typeof cancelarProcessoSchema>

// ============================================================
// ServicoEncadeamento — aresta do DAG no template
// ============================================================

export const createEncadeamentoSchema = z.object({
  servicoOrigemId: z.string(),
  servicoDestinoId: z.string(),
  ordem: z.number().int().default(0),
  iniciaAuto: z.boolean().default(true),
  obrigatorio: z.boolean().default(true),
  herdaResponsavel: z.boolean().default(true),
  condicao: condicaoSchema.nullable().optional(),
  observacao: z.string().nullable().optional(),
  /** Rótulo curto exibido na aresta do editor visual (ex: "Sim", "Não") */
  rotulo: z.string().max(80).nullable().optional(),
})
export type CreateEncadeamentoInput = z.infer<typeof createEncadeamentoSchema>

export const updateEncadeamentoSchema = createEncadeamentoSchema.partial().extend({
  id: z.string(),
})
export type UpdateEncadeamentoInput = z.infer<typeof updateEncadeamentoSchema>

// ============================================================
// Resposta a bloco PERGUNTA
// ============================================================

export const responderPerguntaSchema = z.object({
  execucaoId: z.string(),
  /** Opções escolhidas. Devem existir em servico.perguntaOpcoes; multi=false aceita 1 só. */
  opcoes: z.array(z.string().min(1)).min(1),
  observacao: z.string().max(2000).nullable().optional(),
})
export type ResponderPerguntaInput = z.infer<typeof responderPerguntaSchema>
