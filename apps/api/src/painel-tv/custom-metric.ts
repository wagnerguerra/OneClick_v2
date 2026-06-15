/**
 * Métrica personalizada (builder) — motor de query SEGURO.
 *
 * Segurança: identificadores (tabela/coluna/agregação/operador) vêm SOMENTE da
 * allowlist abaixo — nunca do input direto. Valores são sempre parametrizados
 * ($1, $2…). Multi-tenant: empresaId é forçado p/ não-master. Sem isso, NÃO
 * monte SQL com nomes vindos do cliente.
 */

export type CampoTipo = 'number' | 'text' | 'enum' | 'date'

export interface EntidadeDef {
  label: string
  tabela: string
  empresaCol: string
  dateCol: string
  campos: Record<string, { label: string; tipo: CampoTipo }>
}

export const ENTIDADES: Record<string, EntidadeDef> = {
  clientes: {
    label: 'Clientes', tabela: 'clientes', empresaCol: 'empresa_id', dateCol: 'created_at',
    campos: {
      status: { label: 'Status', tipo: 'enum' },
      regime: { label: 'Regime contábil', tipo: 'enum' },
      uf: { label: 'UF', tipo: 'text' },
      cidade: { label: 'Cidade', tipo: 'text' },
      categoria: { label: 'Categoria', tipo: 'text' },
      grupo: { label: 'Grupo', tipo: 'text' },
      origem: { label: 'Origem', tipo: 'text' },
      tipo_cliente: { label: 'Tipo de cliente', tipo: 'text' },
      is_active: { label: 'Ativo', tipo: 'enum' },
      created_at: { label: 'Cadastrado em', tipo: 'date' },
    },
  },
  orcamentos: {
    label: 'Orçamentos', tabela: 'orcamentos', empresaCol: 'empresa_id', dateCol: 'created_at',
    campos: {
      total_geral: { label: 'Valor total (R$)', tipo: 'number' },
      status: { label: 'Status', tipo: 'enum' },
      area: { label: 'Área', tipo: 'text' },
      arquivado: { label: 'Arquivado', tipo: 'enum' },
      created_at: { label: 'Criado em', tipo: 'date' },
      dt_enviado: { label: 'Enviado em', tipo: 'date' },
    },
  },
  contratos: {
    label: 'Contratos', tabela: 'contratos', empresaCol: 'empresa_id', dateCol: 'created_at',
    campos: {
      honorario_mensal: { label: 'Honorário mensal (R$)', tipo: 'number' },
      status: { label: 'Status', tipo: 'enum' },
      created_at: { label: 'Criado em', tipo: 'date' },
      data_inicio: { label: 'Início da vigência', tipo: 'date' },
      data_fim: { label: 'Fim da vigência', tipo: 'date' },
    },
  },
  tickets: {
    label: 'Helpdesk (tickets)', tabela: 'helpdesk_tickets', empresaCol: 'empresa_id', dateCol: 'created_at',
    campos: {
      status: { label: 'Status', tipo: 'enum' },
      prioridade: { label: 'Prioridade', tipo: 'enum' },
      tipo: { label: 'Tipo', tipo: 'enum' },
      created_at: { label: 'Criado em', tipo: 'date' },
      resolvido_em: { label: 'Resolvido em', tipo: 'date' },
    },
  },
}

const AGG: Record<string, string> = { count: 'COUNT', sum: 'SUM', avg: 'AVG', min: 'MIN', max: 'MAX' }
const OP: Record<string, string> = { eq: '=', ne: '!=', gt: '>', lt: '<', gte: '>=', lte: '<=', contains: 'ILIKE' }

export interface CustomDef {
  entidade: string
  agregacao: keyof typeof AGG | string
  campo?: string
  groupBy?: string
  formato?: 'number' | 'currency'
  usarPeriodo?: boolean
  filtros?: Array<{ campo: string; op: string; valor: any }>
}

/** Allowlist enxuta p/ a UI do builder. */
export function entidadesForUi() {
  return Object.entries(ENTIDADES).map(([id, e]) => ({
    id, label: e.label,
    campos: Object.entries(e.campos).map(([c, m]) => ({ id: c, label: m.label, tipo: m.tipo })),
  }))
}

function coerce(tipo: CampoTipo, v: any) {
  if (tipo === 'number') return Number(v)
  if (tipo === 'date') return new Date(v)
  if (tipo === 'enum' && (v === 'true' || v === 'false')) return v === 'true'
  return String(v)
}

/**
 * Monta a query parametrizada. Retorna null se a definição for inválida
 * (entidade/campo/agg fora da allowlist) — o caller trata como "sem dados".
 */
export function buildCustomQuery(
  def: CustomDef,
  ctx: { empresaId?: string | null; isMaster?: boolean; janela?: { inicio: Date; fim: Date } },
): { sql: string; params: any[]; grouped: boolean } | null {
  const ent = ENTIDADES[def.entidade]
  if (!ent) return null
  const agg = AGG[def.agregacao as string]
  if (!agg) return null

  let selectExpr: string
  if (def.agregacao === 'count') {
    selectExpr = 'COUNT(*)::float'
  } else {
    const c = def.campo && ent.campos[def.campo]
    if (!c || c.tipo !== 'number') return null
    selectExpr = `${agg}("${def.campo}")::float`
  }

  const where: string[] = []
  const params: any[] = []
  // Multi-tenant: não-master só vê a própria empresa.
  if (!ctx.isMaster && ctx.empresaId) {
    params.push(ctx.empresaId)
    where.push(`"${ent.empresaCol}" = $${params.length}`)
  }
  // Período (opcional) sobre a data da entidade.
  if (def.usarPeriodo && ctx.janela) {
    params.push(ctx.janela.inicio); where.push(`"${ent.dateCol}" >= $${params.length}`)
    params.push(ctx.janela.fim); where.push(`"${ent.dateCol}" <= $${params.length}`)
  }
  // Filtros (campo/op da allowlist; valor parametrizado).
  for (const f of def.filtros ?? []) {
    const col = ent.campos[f.campo]
    const op = OP[f.op]
    if (!col || !op) continue
    if (op === 'ILIKE') {
      params.push(`%${String(f.valor)}%`)
      where.push(`"${f.campo}"::text ILIKE $${params.length}`)
    } else {
      params.push(coerce(col.tipo, f.valor))
      where.push(`"${f.campo}" ${op} $${params.length}`)
    }
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : ''

  if (def.groupBy) {
    const g = ent.campos[def.groupBy]
    if (!g) return null
    return {
      sql: `SELECT "${def.groupBy}"::text AS name, ${selectExpr} AS value FROM "${ent.tabela}" ${whereSql} GROUP BY "${def.groupBy}" ORDER BY value DESC NULLS LAST LIMIT 30`,
      params, grouped: true,
    }
  }
  return { sql: `SELECT ${selectExpr} AS value FROM "${ent.tabela}" ${whereSql}`, params, grouped: false }
}
