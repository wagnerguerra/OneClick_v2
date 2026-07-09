import { Injectable } from '@nestjs/common'
import { TRPCError } from '@trpc/server'
import { prisma } from '@saas/db'
import type {
  ReformaDiagnosticoInput,
  ReformaListClientesInput,
  ReformaPremissasInput,
  ReformaSimulacaoInput,
} from '@saas/types'

type Recomendacao =
  | 'MANTER_SIMPLES'
  | 'AVALIAR_REGULAR'
  | 'REGULAR_TENDE_MELHOR'
  | 'REGIME_REGULAR_ANALISE_IMPACTO'
  | 'INCONCLUSIVO'

interface ClienteBase {
  id: string
  razaoSocial: string
  nomeFantasia: string | null
  documento: string | null
  tributacao: string | null
  regime: string | null
  cnaePrincipal: string | null
  uf: string | null
  cidade: string | null
}

interface Metrics {
  faturamento12m: number
  faturamentoMedioMensal: number
  comprasMercadorias12m: number
  servicosTomados12m: number
  documentosSaida: number
  documentosEntrada: number
  snapshots: Record<string, number>
}

const DEFAULT_PREMISSAS: ReformaPremissasInput = {
  aliquotaCbs: 0.088,
  aliquotaIbs: 0.177,
  aliquotaSimplesIbsCbs: 0.04,
  percentualVendasB2B: 0.55,
  percentualComprasCreditaveis: 0.35,
  pesoCreditoCliente: 0.35,
}

function asNumber(value: unknown): number {
  if (value == null) return 0
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

function onlyDigits(value: string | null | undefined) {
  return (value ?? '').replace(/\D/g, '')
}

function monthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

function startMonthWindow(months: number) {
  const d = new Date()
  d.setDate(1)
  d.setHours(0, 0, 0, 0)
  d.setMonth(d.getMonth() - Math.max(0, months - 1))
  return d
}

function scoreQualidade(args: {
  cliente: ClienteBase
  metrics: Metrics
  cnaes: Array<{ codigo: string; descricao: string | null; principal: boolean }>
}) {
  const items = [
    { ok: !!args.cliente.tributacao, label: 'Regime tributario cadastrado' },
    { ok: !!args.cliente.cnaePrincipal || args.cnaes.length > 0, label: 'CNAE informado' },
    { ok: args.metrics.faturamento12m > 0, label: 'Faturamento dos ultimos 12 meses' },
    { ok: args.metrics.comprasMercadorias12m + args.metrics.servicosTomados12m > 0, label: 'Base de compras/servicos para credito' },
    { ok: args.metrics.documentosSaida + args.metrics.documentosEntrada > 0, label: 'Documentos fiscais importados' },
  ]
  const pontos = items.filter(i => i.ok).length
  return {
    score: Math.round((pontos / items.length) * 100),
    faltantes: items.filter(i => !i.ok).map(i => i.label),
  }
}

@Injectable()
export class ReformaTributariaService {
  async dashboard(empresaId?: string | null) {
    const rows = await prisma.$queryRawUnsafe<Array<{ tributacao: string | null; total: number | bigint }>>(
      `SELECT tributacao, count(*) AS total
        FROM clientes
        WHERE deleted_at IS NULL AND status <> 'INATIVA' AND situacao = 'MENSAL'
          AND ($1::text IS NULL OR empresa_id = $1)
        GROUP BY tributacao`,
      empresaId ?? null,
    )

    const porRegime = rows.map(r => ({ regime: r.tributacao ?? 'NAO_INFORMADO', total: Number(r.total) }))
    const totalClientes = porRegime.reduce((acc, r) => acc + r.total, 0)
    const simples = porRegime.find(r => r.regime === 'SIMPLES_NACIONAL')?.total ?? 0
    return { totalClientes, simples, porRegime }
  }

  async listarClientes(input: Partial<ReformaListClientesInput>, empresaId?: string | null) {
    const limit = Math.min(Math.max(input.limit ?? 40, 1), 100)
    const busca = input.busca?.trim() || null
    const rows = await prisma.$queryRawUnsafe<Array<ClienteBase & {
      faturamento12m: number | string | null
      snapshots: number | bigint
      danfes: number | bigint
      nfse: number | bigint
    }>>(
      `SELECT c.id, c.razao_social AS "razaoSocial", c.nome_fantasia AS "nomeFantasia",
              c.documento, c.tributacao::text, c.regime::text, c.cnae_principal AS "cnaePrincipal",
              c.uf, c.cidade,
              COALESCE((
                SELECT sum(s.valor) FROM cliente_erp_snapshots s
                 WHERE s.cliente_id = c.id AND s.indicador = 'faturamento'
                   AND s.mes >= $4
              ), 0) AS "faturamento12m",
              COALESCE((SELECT count(*) FROM cliente_erp_snapshots s WHERE s.cliente_id = c.id AND s.mes >= $4), 0) AS snapshots,
              COALESCE((SELECT count(*) FROM danfes d WHERE d.cliente_id = c.id AND d.status = 'AUTORIZADA'), 0) AS danfes,
              COALESCE((SELECT count(*) FROM nfse_importadas n WHERE n.cliente_id = c.id AND n.status = 'EMITIDA'), 0) AS nfse
         FROM clientes c
        WHERE c.deleted_at IS NULL AND c.status <> 'INATIVA' AND c.situacao = 'MENSAL'
          AND ($1::text IS NULL OR c.empresa_id = $1)
          AND ($2::text IS NULL OR c.razao_social ILIKE '%'||$2||'%' OR c.documento ILIKE '%'||$2||'%')
          AND ($3::boolean IS NOT TRUE OR c.tributacao = 'SIMPLES_NACIONAL')
        ORDER BY c.razao_social ASC
        LIMIT ${limit}`,
      empresaId ?? null,
      busca,
      input.apenasSimples ?? false,
      monthKey(startMonthWindow(12)),
    )

    return rows.map(r => ({
      ...r,
      faturamento12m: asNumber(r.faturamento12m),
      snapshots: Number(r.snapshots),
      danfes: Number(r.danfes),
      nfse: Number(r.nfse),
      prontidao: Math.min(100, Math.round(
        (r.tributacao ? 25 : 0)
        + (r.cnaePrincipal ? 20 : 0)
        + (asNumber(r.faturamento12m) > 0 ? 35 : 0)
        + (Number(r.danfes) + Number(r.nfse) > 0 ? 20 : 0),
      )),
    }))
  }

  async diagnostico(input: ReformaDiagnosticoInput, empresaId?: string | null) {
    const cliente = await this.getCliente(input.clienteId, empresaId)
    const [cnaes, atividades, beneficios, metrics] = await Promise.all([
      this.getCnaes(cliente.id),
      this.getValores('cliente_atividades', cliente.id),
      this.getValores('cliente_beneficios', cliente.id),
      this.getMetrics(cliente, input.meses),
    ])
    const qualidade = scoreQualidade({ cliente, metrics, cnaes })

    return {
      cliente,
      cnaes,
      atividades,
      beneficios,
      metrics,
      qualidade,
      observacoes: this.observacoes(cliente, qualidade.score),
    }
  }

  async simular(input: ReformaSimulacaoInput, empresaId?: string | null) {
    const diagnostico = await this.diagnostico(input, empresaId)
    const p = { ...DEFAULT_PREMISSAS, ...input.premissas }
    const totalAliquota = p.aliquotaCbs + p.aliquotaIbs
    const receita = diagnostico.metrics.faturamento12m
    const baseCompras = diagnostico.metrics.comprasMercadorias12m + diagnostico.metrics.servicosTomados12m
    const vendasB2B = receita * p.percentualVendasB2B
    const comprasCreditaveis = Math.max(baseCompras, receita * p.percentualComprasCreditaveis)

    const simplesDentro = {
      cargaEstimativa: receita * p.aliquotaSimplesIbsCbs,
      creditoTransferidoCliente: vendasB2B * p.aliquotaSimplesIbsCbs,
      complexidade: 35,
    }
    const regular = {
      debito: receita * totalAliquota,
      creditoApropriavel: comprasCreditaveis * totalAliquota,
      cargaEstimativa: Math.max(0, (receita * totalAliquota) - (comprasCreditaveis * totalAliquota)),
      creditoTransferidoCliente: vendasB2B * totalAliquota,
      complexidade: 78,
    }
    const vantagemCreditoCliente = Math.max(0, regular.creditoTransferidoCliente - simplesDentro.creditoTransferidoCliente)
    const custoRegularAjustado = regular.cargaEstimativa - (vantagemCreditoCliente * p.pesoCreditoCliente)
    const diferenca = custoRegularAjustado - simplesDentro.cargaEstimativa
    const isSimples = diagnostico.cliente.tributacao === 'SIMPLES_NACIONAL'
    const recomendacao = this.recomendar(isSimples, diagnostico.qualidade.score, diferenca, receita)

    return {
      ...diagnostico,
      premissas: p,
      cenarios: {
        simplesDentro,
        regular,
        vantagemCreditoCliente,
        custoRegularAjustado,
        diferenca,
      },
      recomendacao,
      resumo: this.resumo(recomendacao, diferenca, receita),
    }
  }

  private async getCliente(clienteId: string, empresaId?: string | null): Promise<ClienteBase> {
    const rows = await prisma.$queryRawUnsafe<ClienteBase[]>(
      `SELECT id, razao_social AS "razaoSocial", nome_fantasia AS "nomeFantasia",
              documento, tributacao::text, regime::text, cnae_principal AS "cnaePrincipal", uf, cidade
         FROM clientes
        WHERE id = $1 AND deleted_at IS NULL AND status <> 'INATIVA' AND situacao = 'MENSAL'
          AND ($2::text IS NULL OR empresa_id = $2)
        LIMIT 1`,
      clienteId,
      empresaId ?? null,
    )
    const cliente = rows[0]
    if (!cliente) throw new TRPCError({ code: 'NOT_FOUND', message: 'Cliente nao encontrado' })
    return cliente
  }

  private async getCnaes(clienteId: string) {
    return prisma.$queryRawUnsafe<Array<{ codigo: string; descricao: string | null; principal: boolean }>>(
      `SELECT codigo, descricao, principal FROM cliente_cnaes WHERE cliente_id = $1 ORDER BY principal DESC, codigo ASC`,
      clienteId,
    )
  }

  private async getValores(table: 'cliente_atividades' | 'cliente_beneficios', clienteId: string) {
    const rows = await prisma.$queryRawUnsafe<Array<{ valor: string }>>(
      `SELECT valor FROM ${table} WHERE cliente_id = $1 ORDER BY valor ASC`,
      clienteId,
    )
    return rows.map(r => r.valor)
  }

  private async getMetrics(cliente: ClienteBase, meses: number): Promise<Metrics> {
    const start = startMonthWindow(meses)
    const mesInicio = monthKey(start)
    const doc = onlyDigits(cliente.documento)
    const rows = await prisma.$queryRawUnsafe<Array<{ indicador: string; valor: number | string | null }>>(
      `SELECT indicador, sum(valor) AS valor
         FROM cliente_erp_snapshots
        WHERE cliente_id = $1 AND mes >= $2
        GROUP BY indicador`,
      cliente.id,
      mesInicio,
    )
    const snapshots: Record<string, number> = {}
    for (const r of rows) snapshots[r.indicador] = asNumber(r.valor)

    const [danfeRows, nfseRows] = await Promise.all([
      prisma.$queryRawUnsafe<Array<{ direcao: string; total: number | string | null; docs: number | bigint }>>(
        `SELECT CASE WHEN regexp_replace(emitente_cnpj, '\\D', '', 'g') = $2 THEN 'saida' ELSE 'entrada' END AS direcao,
                sum(valor_total) AS total, count(*) AS docs
           FROM danfes
          WHERE cliente_id = $1 AND status = 'AUTORIZADA' AND data_emissao >= $3
          GROUP BY direcao`,
        cliente.id,
        doc,
        start,
      ),
      prisma.$queryRawUnsafe<Array<{ direcao: string; total: number | string | null; docs: number | bigint }>>(
        `SELECT CASE WHEN regexp_replace(prestador_cnpj, '\\D', '', 'g') = $2 THEN 'saida' ELSE 'entrada' END AS direcao,
                sum(valor_servicos) AS total, count(*) AS docs
           FROM nfse_importadas
          WHERE cliente_id = $1 AND status = 'EMITIDA' AND data_emissao >= $3
          GROUP BY direcao`,
        cliente.id,
        doc,
        start,
      ),
    ])

    const saidaDocs = [...danfeRows, ...nfseRows].filter(r => r.direcao === 'saida')
    const entradaDocs = [...danfeRows, ...nfseRows].filter(r => r.direcao === 'entrada')
    const receitaDocs = saidaDocs.reduce((acc, r) => acc + asNumber(r.total), 0)
    const comprasDocs = danfeRows.filter(r => r.direcao === 'entrada').reduce((acc, r) => acc + asNumber(r.total), 0)
    const servicosTomadosDocs = nfseRows.filter(r => r.direcao === 'entrada').reduce((acc, r) => acc + asNumber(r.total), 0)
    const faturamento12m = snapshots.faturamento || receitaDocs

    return {
      faturamento12m,
      faturamentoMedioMensal: faturamento12m / Math.max(1, meses),
      comprasMercadorias12m: snapshots.nf_entrada || comprasDocs,
      servicosTomados12m: snapshots.nf_tomado || servicosTomadosDocs,
      documentosSaida: saidaDocs.reduce((acc, r) => acc + Number(r.docs), 0) + asNumber(snapshots.nf_saida) + asNumber(snapshots.nf_prestado),
      documentosEntrada: entradaDocs.reduce((acc, r) => acc + Number(r.docs), 0) + asNumber(snapshots.nf_entrada) + asNumber(snapshots.nf_tomado),
      snapshots,
    }
  }

  private observacoes(cliente: ClienteBase, score: number) {
    const obs: string[] = []
    if (cliente.tributacao !== 'SIMPLES_NACIONAL') {
      obs.push('Cliente fora do Simples: o MVP apresenta impacto estimado no regime regular, nao uma opcao de permanencia no Simples.')
    }
    if (score < 70) {
      obs.push('Qualidade de dados abaixo do ideal: revise faturamento, compras creditaveis e documentos fiscais antes de usar como parecer final.')
    }
    obs.push('Aliquotas e pesos sao premissas de trabalho ajustaveis; nao substituem parametrizacao legal/setorial final.')
    return obs
  }

  private recomendar(isSimples: boolean, score: number, diferenca: number, receita: number): Recomendacao {
    if (score < 45 || receita <= 0) return 'INCONCLUSIVO'
    if (!isSimples) return 'REGIME_REGULAR_ANALISE_IMPACTO'
    const tolerancia = Math.max(receita * 0.01, 5000)
    if (diferenca < -tolerancia) return 'REGULAR_TENDE_MELHOR'
    if (Math.abs(diferenca) <= tolerancia) return 'AVALIAR_REGULAR'
    return 'MANTER_SIMPLES'
  }

  private resumo(recomendacao: Recomendacao, diferenca: number, receita: number) {
    const abs = Math.abs(diferenca)
    const pct = receita > 0 ? abs / receita : 0
    const impacto = { valor: abs, percentualReceita: pct }
    const textos: Record<Recomendacao, string> = {
      MANTER_SIMPLES: 'Manter IBS/CBS dentro do Simples tende a ser mais eficiente nas premissas atuais.',
      AVALIAR_REGULAR: 'Resultado proximo do equilibrio: validar margem, perfil B2B e compras creditaveis antes de decidir.',
      REGULAR_TENDE_MELHOR: 'Apuracao regular tende a melhorar competitividade/carga efetiva nas premissas atuais.',
      REGIME_REGULAR_ANALISE_IMPACTO: 'Cliente ja esta fora do Simples; use o comparativo como estimativa de impacto e creditos.',
      INCONCLUSIVO: 'Dados insuficientes para recomendacao confiavel.',
    }
    return { texto: textos[recomendacao], impacto }
  }
}
