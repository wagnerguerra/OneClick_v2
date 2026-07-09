import { Injectable } from '@nestjs/common'
import { TRPCError } from '@trpc/server'
import { prisma } from '@saas/db'
import { randomUUID } from 'crypto'
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

interface PremissaFiscalInput extends ReformaPremissasInput {
  id?: string
  nome: string
  ano: number
  setor?: string | null
  cnaePrefix?: string | null
  reducaoSetorial?: number
  observacoes?: string | null
  ativo?: boolean
}

interface PremissaFiscal extends PremissaFiscalInput {
  id: string
  empresaId: string | null
  createdAt?: Date
  updatedAt?: Date
}

interface Confiabilidade {
  nivel: 'ALTA' | 'MEDIA' | 'BAIXA' | 'INCONCLUSIVA'
  score: number
  fatores: string[]
  pendencias: string[]
}

interface SensibilidadeItem {
  cenario: 'CONSERVADOR' | 'BASE' | 'FAVORAVEL_REGULAR'
  label: string
  cargaSimples: number
  cargaRegular: number
  diferenca: number
  creditoCliente: number
  recomendacao: Recomendacao
}

interface SimulacaoCompleta {
  cliente: ClienteBase
  cnaes: Array<{ codigo: string; descricao: string | null; principal: boolean }>
  atividades: string[]
  beneficios: string[]
  metrics: Metrics
  qualidade: { score: number; faltantes: string[] }
  confiabilidade: Confiabilidade
  sensibilidade: SensibilidadeItem[]
  planoAcao: string[]
  observacoes: string[]
  premissas: ReformaPremissasInput
  cenarios: {
    simplesDentro: { cargaEstimativa: number; creditoTransferidoCliente: number; complexidade: number }
    regular: { debito: number; creditoApropriavel: number; cargaEstimativa: number; creditoTransferidoCliente: number; complexidade: number }
    vantagemCreditoCliente: number
    custoRegularAjustado: number
    diferenca: number
  }
  recomendacao: Recomendacao
  resumo: { texto: string; impacto: { valor: number; percentualReceita: number } }
}

const DEFAULT_PREMISSAS: ReformaPremissasInput = {
  aliquotaCbs: 0.088,
  aliquotaIbs: 0.177,
  aliquotaSimplesIbsCbs: 0.04,
  percentualVendasB2B: 0.55,
  percentualComprasCreditaveis: 0.35,
  pesoCreditoCliente: 0.35,
  reducaoSetorial: 0,
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

function scoreConfiabilidade(args: {
  qualidadeScore: number
  metrics: Metrics
  premissaNome?: string | null
  reducaoSetorial?: number
}): Confiabilidade {
  let score = args.qualidadeScore
  const fatores: string[] = []
  const pendencias: string[] = []

  if (args.premissaNome) {
    score += 8
    fatores.push(`Premissa fiscal aplicada: ${args.premissaNome}`)
  } else {
    pendencias.push('Premissas digitadas manualmente, sem cadastro setorial versionado')
  }

  if (args.metrics.faturamento12m > 0) fatores.push('Faturamento anual disponível')
  else pendencias.push('Sem faturamento anual consolidado')

  const baseCredito = args.metrics.comprasMercadorias12m + args.metrics.servicosTomados12m
  if (baseCredito > 0) fatores.push('Base de compras/serviços disponível para estimar créditos')
  else pendencias.push('Sem base objetiva de compras e serviços tomados')

  if (args.metrics.documentosSaida >= 12) score += 4
  else pendencias.push('Baixo volume de documentos de saída importados')

  if (args.metrics.documentosEntrada >= 12) score += 4
  else pendencias.push('Baixo volume de documentos de entrada importados')

  if ((args.reducaoSetorial ?? 0) > 0) {
    fatores.push('Redução setorial parametrizada')
  }

  const normalized = Math.max(0, Math.min(100, Math.round(score)))
  const nivel: Confiabilidade['nivel'] = normalized >= 82
    ? 'ALTA'
    : normalized >= 65
      ? 'MEDIA'
      : normalized >= 45
        ? 'BAIXA'
        : 'INCONCLUSIVA'

  return { nivel, score: normalized, fatores, pendencias }
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

  async listarPremissas(empresaId?: string | null): Promise<PremissaFiscal[]> {
    await this.ensurePremissasTable()
    const rows = await prisma.$queryRawUnsafe<Array<{
      id: string
      empresaId: string | null
      nome: string
      ano: number
      setor: string | null
      cnaePrefix: string | null
      aliquotaCbs: string | number
      aliquotaIbs: string | number
      aliquotaSimplesIbsCbs: string | number
      percentualVendasB2B: string | number
      percentualComprasCreditaveis: string | number
      pesoCreditoCliente: string | number
      reducaoSetorial: string | number
      observacoes: string | null
      ativo: boolean
      createdAt: Date
      updatedAt: Date
    }>>(
      `SELECT id, empresa_id AS "empresaId", nome, ano, setor, cnae_prefix AS "cnaePrefix",
              aliquota_cbs AS "aliquotaCbs", aliquota_ibs AS "aliquotaIbs",
              aliquota_simples_ibs_cbs AS "aliquotaSimplesIbsCbs",
              percentual_vendas_b2b AS "percentualVendasB2B",
              percentual_compras_creditaveis AS "percentualComprasCreditaveis",
              peso_credito_cliente AS "pesoCreditoCliente",
              reducao_setorial AS "reducaoSetorial",
              observacoes, ativo, created_at AS "createdAt", updated_at AS "updatedAt"
         FROM reforma_tributaria_premissas
        WHERE ativo = true AND (empresa_id IS NULL OR $1::text IS NULL OR empresa_id = $1)
        ORDER BY ano DESC, setor ASC NULLS LAST, nome ASC`,
      empresaId ?? null,
    )
    const defaults = rows.length > 0 ? [] : [this.defaultPremissa()]
    return [
      ...defaults,
      ...rows.map(r => ({
        ...r,
        aliquotaCbs: asNumber(r.aliquotaCbs),
        aliquotaIbs: asNumber(r.aliquotaIbs),
        aliquotaSimplesIbsCbs: asNumber(r.aliquotaSimplesIbsCbs),
        percentualVendasB2B: asNumber(r.percentualVendasB2B),
        percentualComprasCreditaveis: asNumber(r.percentualComprasCreditaveis),
        pesoCreditoCliente: asNumber(r.pesoCreditoCliente),
        reducaoSetorial: asNumber(r.reducaoSetorial),
      })),
    ]
  }

  async salvarPremissa(input: PremissaFiscalInput, empresaId?: string | null) {
    await this.ensurePremissasTable()
    const id = input.id || randomUUID()
    if (input.id) {
      await prisma.$executeRawUnsafe(
        `UPDATE reforma_tributaria_premissas SET
           nome = $2, ano = $3, setor = $4, cnae_prefix = $5,
           aliquota_cbs = $6, aliquota_ibs = $7, aliquota_simples_ibs_cbs = $8,
           percentual_vendas_b2b = $9, percentual_compras_creditaveis = $10,
           peso_credito_cliente = $11, reducao_setorial = $12,
           observacoes = $13, ativo = $14, updated_at = CURRENT_TIMESTAMP
         WHERE id = $1 AND ($15::text IS NULL OR empresa_id = $15)`,
        id, input.nome, input.ano, input.setor ?? null, input.cnaePrefix ?? null,
        input.aliquotaCbs, input.aliquotaIbs, input.aliquotaSimplesIbsCbs,
        input.percentualVendasB2B, input.percentualComprasCreditaveis,
        input.pesoCreditoCliente, input.reducaoSetorial ?? 0,
        input.observacoes ?? null, input.ativo ?? true, empresaId ?? null,
      )
      return { id }
    }

    await prisma.$executeRawUnsafe(
      `INSERT INTO reforma_tributaria_premissas
        (id, empresa_id, nome, ano, setor, cnae_prefix, aliquota_cbs, aliquota_ibs,
         aliquota_simples_ibs_cbs, percentual_vendas_b2b, percentual_compras_creditaveis,
         peso_credito_cliente, reducao_setorial, observacoes, ativo, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`,
      id, empresaId ?? null, input.nome, input.ano, input.setor ?? null, input.cnaePrefix ?? null,
      input.aliquotaCbs, input.aliquotaIbs, input.aliquotaSimplesIbsCbs,
      input.percentualVendasB2B, input.percentualComprasCreditaveis,
      input.pesoCreditoCliente, input.reducaoSetorial ?? 0,
      input.observacoes ?? null, input.ativo ?? true,
    )
    return { id }
  }

  async removerPremissa(id: string, empresaId?: string | null) {
    await this.ensurePremissasTable()
    await prisma.$executeRawUnsafe(
      `UPDATE reforma_tributaria_premissas
          SET ativo = false, updated_at = CURRENT_TIMESTAMP
        WHERE id = $1 AND ($2::text IS NULL OR empresa_id = $2)`,
      id,
      empresaId ?? null,
    )
    return { id }
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

  async simular(input: ReformaSimulacaoInput, empresaId?: string | null): Promise<SimulacaoCompleta> {
    const diagnostico = await this.diagnostico(input, empresaId)
    const p = { ...DEFAULT_PREMISSAS, ...input.premissas }
    const reducaoSetorial = Math.max(0, Math.min(1, p.reducaoSetorial ?? 0))
    const totalAliquota = (p.aliquotaCbs + p.aliquotaIbs) * (1 - reducaoSetorial)
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
    const confiabilidade = scoreConfiabilidade({
      qualidadeScore: diagnostico.qualidade.score,
      metrics: diagnostico.metrics,
      premissaNome: p.premissaNome,
      reducaoSetorial,
    })
    const sensibilidade = this.calcularSensibilidade(receita, baseCompras, p, reducaoSetorial)
    const planoAcao = this.planoAcaoTecnico(diagnostico, confiabilidade, recomendacao, sensibilidade)

    return {
      ...diagnostico,
      premissas: p,
      confiabilidade,
      sensibilidade,
      planoAcao,
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

  async historico(clienteId: string, empresaId?: string | null) {
    await this.ensureHistoricoTable()
    await this.getCliente(clienteId, empresaId)
    const rows = await prisma.$queryRawUnsafe<Array<{
      id: string
      clienteId: string
      userId: string | null
      recomendacao: Recomendacao
      parecer: string
      qualidadeScore: number | bigint
      faturamento12m: string | number
      premissas: unknown
      resumo: unknown
      cenarios: unknown
      createdAt: Date
      usuarioNome: string | null
    }>>(
      `SELECT s.id, s.cliente_id AS "clienteId", s.user_id AS "userId",
              s.recomendacao, s.parecer, s.qualidade_score AS "qualidadeScore",
              s.faturamento_12m AS "faturamento12m", s.premissas, s.resumo, s.cenarios,
              s.created_at AS "createdAt", u.name AS "usuarioNome"
         FROM reforma_tributaria_simulacoes s
         LEFT JOIN users u ON u.id = s.user_id
        WHERE s.cliente_id = $1
          AND ($2::text IS NULL OR s.empresa_id = $2)
        ORDER BY s.created_at DESC
        LIMIT 12`,
      clienteId,
      empresaId ?? null,
    )
    return rows.map(r => ({
      ...r,
      qualidadeScore: Number(r.qualidadeScore),
      faturamento12m: asNumber(r.faturamento12m),
    }))
  }

  async salvar(input: ReformaSimulacaoInput, userId?: string | null, empresaId?: string | null) {
    await this.ensureHistoricoTable()
    const simulacao = await this.simular(input, empresaId)
    const id = randomUUID()
    const parecer = this.gerarParecer(simulacao)

    await prisma.$executeRawUnsafe(
      `INSERT INTO reforma_tributaria_simulacoes
        (id, empresa_id, cliente_id, user_id, premissas, diagnostico, cenarios, recomendacao, resumo, parecer, qualidade_score, faturamento_12m, created_at)
       VALUES
        ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7::jsonb, $8, $9::jsonb, $10, $11, $12, CURRENT_TIMESTAMP)`,
      id,
      empresaId ?? null,
      simulacao.cliente.id,
      userId ?? null,
      JSON.stringify(simulacao.premissas),
      JSON.stringify({
        cliente: simulacao.cliente,
        cnaes: simulacao.cnaes,
        atividades: simulacao.atividades,
        beneficios: simulacao.beneficios,
        metrics: simulacao.metrics,
        qualidade: simulacao.qualidade,
        confiabilidade: simulacao.confiabilidade,
        sensibilidade: simulacao.sensibilidade,
        planoAcao: simulacao.planoAcao,
        observacoes: simulacao.observacoes,
      }),
      JSON.stringify(simulacao.cenarios),
      simulacao.recomendacao,
      JSON.stringify(simulacao.resumo),
      parecer,
      simulacao.qualidade.score,
      simulacao.metrics.faturamento12m,
    )

    return { id, parecer, ...simulacao }
  }

  async remover(id: string, empresaId?: string | null) {
    await this.ensureHistoricoTable()
    const rows = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
      `SELECT id FROM reforma_tributaria_simulacoes
        WHERE id = $1 AND ($2::text IS NULL OR empresa_id = $2)
        LIMIT 1`,
      id,
      empresaId ?? null,
    )
    if (!rows[0]) throw new TRPCError({ code: 'NOT_FOUND', message: 'Simulacao nao encontrada' })
    await prisma.$executeRawUnsafe('DELETE FROM reforma_tributaria_simulacoes WHERE id = $1', id)
    return { id }
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

  private gerarParecer(simulacao: SimulacaoCompleta) {
    const cliente = simulacao.cliente
    const receita = simulacao.metrics.faturamento12m
    const cargaSimples = simulacao.cenarios.simplesDentro.cargaEstimativa
    const cargaRegular = simulacao.cenarios.regular.cargaEstimativa
    const creditoCliente = simulacao.cenarios.regular.creditoTransferidoCliente
    const diferenca = simulacao.cenarios.diferenca
    const linhas = [
      `Cliente: ${cliente.razaoSocial}`,
      `Regime atual: ${cliente.tributacao ?? 'Nao informado'}`,
      `Receita analisada em 12 meses: R$ ${receita.toFixed(2)}`,
      `Carga estimada com IBS/CBS dentro do Simples: R$ ${cargaSimples.toFixed(2)}`,
      `Carga estimada na apuracao regular: R$ ${cargaRegular.toFixed(2)}`,
      `Credito potencial transferido ao cliente B2B na apuracao regular: R$ ${creditoCliente.toFixed(2)}`,
      `Diferenca ajustada entre cenarios: R$ ${diferenca.toFixed(2)}`,
      `Recomendacao: ${simulacao.resumo.texto}`,
      `Qualidade dos dados: ${simulacao.qualidade.score}%`,
      `Confiabilidade tecnica: ${simulacao.confiabilidade.nivel} (${simulacao.confiabilidade.score}%)`,
    ]
    if (simulacao.premissas.premissaNome) {
      linhas.push(`Premissa aplicada: ${simulacao.premissas.premissaNome}`)
    }
    if (simulacao.qualidade.faltantes.length > 0) {
      linhas.push(`Pontos pendentes: ${simulacao.qualidade.faltantes.join('; ')}`)
    }
    if (simulacao.confiabilidade.pendencias.length > 0) {
      linhas.push(`Pendencias tecnicas: ${simulacao.confiabilidade.pendencias.join('; ')}`)
    }
    if (simulacao.sensibilidade.length > 0) {
      linhas.push('Sensibilidade:')
      for (const item of simulacao.sensibilidade) {
        linhas.push(`- ${item.label}: diferenca ajustada R$ ${item.diferenca.toFixed(2)}; recomendacao ${item.recomendacao}`)
      }
    }
    if (simulacao.planoAcao.length > 0) {
      linhas.push(`Plano de acao: ${simulacao.planoAcao.join('; ')}`)
    }
    linhas.push('Observacao: parecer gerado por premissas parametrizadas no sistema; validar aliquotas, regras setoriais e dados contabeis antes da recomendacao final ao cliente.')
    return linhas.join('\n')
  }

  private calcularSensibilidade(
    receita: number,
    baseCompras: number,
    premissas: ReformaPremissasInput,
    reducaoSetorial: number,
  ): SensibilidadeItem[] {
    const variacoes = [
      { cenario: 'CONSERVADOR' as const, label: 'Conservador', b2b: 0.85, compras: 0.85, aliquota: 1.05 },
      { cenario: 'BASE' as const, label: 'Base', b2b: 1, compras: 1, aliquota: 1 },
      { cenario: 'FAVORAVEL_REGULAR' as const, label: 'Favoravel ao regular', b2b: 1.15, compras: 1.15, aliquota: 0.95 },
    ]

    return variacoes.map(v => {
      const percentualB2B = Math.min(1, (premissas.percentualVendasB2B ?? 0) * v.b2b)
      const percentualCompras = Math.min(1, (premissas.percentualComprasCreditaveis ?? 0) * v.compras)
      const totalAliquota = (premissas.aliquotaCbs + premissas.aliquotaIbs) * (1 - reducaoSetorial) * v.aliquota
      const vendasB2B = receita * percentualB2B
      const comprasCreditaveis = Math.max(baseCompras * v.compras, receita * percentualCompras)
      const cargaSimples = receita * premissas.aliquotaSimplesIbsCbs
      const cargaRegular = Math.max(0, (receita * totalAliquota) - (comprasCreditaveis * totalAliquota))
      const creditoCliente = vendasB2B * totalAliquota
      const creditoSimples = vendasB2B * premissas.aliquotaSimplesIbsCbs
      const diferenca = (cargaRegular - (Math.max(0, creditoCliente - creditoSimples) * premissas.pesoCreditoCliente)) - cargaSimples
      return {
        cenario: v.cenario,
        label: v.label,
        cargaSimples,
        cargaRegular,
        diferenca,
        creditoCliente,
        recomendacao: this.recomendar(true, 100, diferenca, receita),
      }
    })
  }

  private planoAcaoTecnico(
    diagnostico: Awaited<ReturnType<ReformaTributariaService['diagnostico']>>,
    confiabilidade: Confiabilidade,
    recomendacao: Recomendacao,
    sensibilidade: SensibilidadeItem[],
  ) {
    const passos = new Set<string>()
    for (const item of diagnostico.qualidade.faltantes) passos.add(`Saneamento: ${item}`)
    for (const item of confiabilidade.pendencias) passos.add(`Validar: ${item}`)

    const recomendacoes = new Set(sensibilidade.map(s => s.recomendacao))
    if (recomendacoes.size > 1) {
      passos.add('Rodar entrevista com o cliente para confirmar percentual B2B e capacidade de aproveitamento de creditos')
    }
    if (recomendacao === 'REGULAR_TENDE_MELHOR' || recomendacao === 'AVALIAR_REGULAR') {
      passos.add('Validar impacto comercial dos creditos transferidos para clientes B2B antes de recomendar mudanca de apuracao')
    }
    if (diagnostico.metrics.comprasMercadorias12m + diagnostico.metrics.servicosTomados12m === 0) {
      passos.add('Consultar ERP contabil para separar compras creditaveis, despesas nao creditaveis e servicos tomados')
    }
    if (diagnostico.cliente.cnaePrincipal) {
      passos.add(`Confirmar se o CNAE ${diagnostico.cliente.cnaePrincipal} possui regra setorial especifica ou reducao legal aplicavel`)
    }
    passos.add('Revisar premissas fiscais com responsavel tecnico antes de enviar parecer ao cliente')
    return Array.from(passos)
  }

  private defaultPremissa(): PremissaFiscal {
    return {
      id: 'default',
      empresaId: null,
      nome: 'Premissa padrão IBS/CBS',
      ano: 2027,
      setor: 'Geral',
      cnaePrefix: null,
      ...DEFAULT_PREMISSAS,
      reducaoSetorial: 0,
      observacoes: 'Premissa inicial do sistema. Ajuste conforme regra setorial e entendimento técnico vigente.',
      ativo: true,
    }
  }

  private async ensureHistoricoTable() {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS reforma_tributaria_simulacoes (
        id                text PRIMARY KEY,
        empresa_id        text,
        cliente_id        text NOT NULL,
        user_id           text,
        premissas         jsonb NOT NULL,
        diagnostico       jsonb NOT NULL,
        cenarios          jsonb NOT NULL,
        recomendacao      text NOT NULL,
        resumo            jsonb NOT NULL,
        parecer           text NOT NULL,
        qualidade_score   integer NOT NULL DEFAULT 0,
        faturamento_12m   numeric(14, 2) NOT NULL DEFAULT 0,
        created_at        timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `)
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS reforma_tributaria_simulacoes_cliente_created_idx
        ON reforma_tributaria_simulacoes (cliente_id, created_at DESC)
    `)
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS reforma_tributaria_simulacoes_empresa_created_idx
        ON reforma_tributaria_simulacoes (empresa_id, created_at DESC)
    `)
  }

  private async ensurePremissasTable() {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS reforma_tributaria_premissas (
        id                             text PRIMARY KEY,
        empresa_id                     text,
        nome                           text NOT NULL,
        ano                            integer NOT NULL DEFAULT 2027,
        setor                          text,
        cnae_prefix                    text,
        aliquota_cbs                   numeric(7, 6) NOT NULL DEFAULT 0.088,
        aliquota_ibs                   numeric(7, 6) NOT NULL DEFAULT 0.177,
        aliquota_simples_ibs_cbs       numeric(7, 6) NOT NULL DEFAULT 0.04,
        percentual_vendas_b2b          numeric(7, 6) NOT NULL DEFAULT 0.55,
        percentual_compras_creditaveis numeric(7, 6) NOT NULL DEFAULT 0.35,
        peso_credito_cliente           numeric(7, 6) NOT NULL DEFAULT 0.35,
        reducao_setorial               numeric(7, 6) NOT NULL DEFAULT 0,
        observacoes                    text,
        ativo                          boolean NOT NULL DEFAULT true,
        created_at                     timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at                     timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `)
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS reforma_tributaria_premissas_empresa_ativo_idx
        ON reforma_tributaria_premissas (empresa_id, ativo)
    `)
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS reforma_tributaria_premissas_ano_setor_idx
        ON reforma_tributaria_premissas (ano, setor)
    `)
  }
}
