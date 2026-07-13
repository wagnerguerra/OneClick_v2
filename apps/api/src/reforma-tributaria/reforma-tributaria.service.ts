import { Injectable, Logger } from '@nestjs/common'
import { TRPCError } from '@trpc/server'
import { prisma } from '@saas/db'
import { randomUUID } from 'crypto'
import { SciService } from '../cliente/sci.service'
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
  idSistema: string | null
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
  fontePrincipal: 'BALANCETE_ERP' | 'SNAPSHOT_SCI' | 'DOCUMENTOS_FISCAIS'
  erp: {
    consultado: boolean
    disponivel: boolean
    origem: 'balancete_importado' | 'sci_metricas' | 'snapshot' | 'nao_disponivel'
    periodo?: { datai: string; dataf: string }
    faturamento12m: number
    custosDespesas12m: number
    documentosEntrada: number
    documentosSaida: number
    margemOperacionalPercentual: number | null
    mensagem?: string
  }
  creditos: {
    origem: 'balancete_importado' | 'documentos_fiscais' | 'premissa'
    baseCreditavel12m: number
    baseNaoCreditavel12m: number
    baseRevisao12m: number
    baseAjustada12m: number
    confianca: 'ALTA' | 'MEDIA' | 'BAIXA'
    itens: Array<{
      conta: string
      nomeConta: string
      categoria: 'CREDITAVEL' | 'NAO_CREDITAVEL' | 'REVISAR'
      valor: number
      motivo: string
    }>
  }
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

interface RegraSetorial {
  origem: 'PREMISSA_CNAE' | 'BENEFICIO_CLIENTE' | 'ATIVIDADE_CLIENTE' | 'SEM_REGRA'
  setor: string | null
  reducaoSetorial: number
  premissaId?: string
  premissaNome?: string
  cnaePrefix?: string | null
  alertas: string[]
}

interface SimulacaoCompleta {
  cliente: ClienteBase
  cnaes: Array<{ codigo: string; descricao: string | null; principal: boolean }>
  atividades: string[]
  beneficios: string[]
  metrics: Metrics
  qualidade: { score: number; faltantes: string[] }
  confiabilidade: Confiabilidade
  regraSetorial: RegraSetorial
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
  transicao: TransicaoProjecao
}

const DEFAULT_PREMISSAS: ReformaPremissasInput = {
  aliquotaCbs: 0.088,
  aliquotaIbs: 0.177,
  aliquotaSimplesIbsCbs: 0.04,
  percentualVendasB2B: 0.55,
  percentualComprasCreditaveis: 0.35,
  pesoCreditoCliente: 0.35,
  reducaoSetorial: 0,
  dasEfetivoSimples: 0.10,
  aliquotaPisCofins: 0.0365,
  aliquotaIcms: 0.12,
  aliquotaIss: 0.05,
  percentualMercadorias: 0.5,
  impostoSeletivoPercent: 0,
}

// ── Calendário de transição da reforma (LC 214/2025) ─────────────────
// Fatores de vigência por ano: fração das alíquotas novas (CBS/IBS/IS) que
// incidem e fração dos tributos ATUAIS (PIS/COFINS, ICMS/ISS) que permanecem.
// São PREMISSAS de trabalho (o cronograma legal tem nuances por tributo/UF);
// começam como constante e o disclaimer acompanha o resultado.
//  2026: ano de teste (CBS 0,9% + IBS 0,1%, compensáveis) — tributos atuais cheios.
//  2027: CBS integral, PIS/COFINS extintos, IS entra; IBS ainda simbólico; ICMS/ISS cheios.
//  2029–2032: IBS sobe 10/20/30/40% e ICMS/ISS caem para 90/80/70/60%.
//  2033: IBS/CBS integrais, ICMS/ISS extintos.
interface FatorTransicao { cbs: number; ibs: number; is: number; pisCofins: number; icmsIss: number }
const TRANSICAO_CALENDARIO: Record<number, FatorTransicao> = {
  2026: { cbs: 0.102, ibs: 0.006, is: 0,   pisCofins: 1.0, icmsIss: 1.0 },
  2027: { cbs: 1.0,   ibs: 0.006, is: 1,   pisCofins: 0.0, icmsIss: 1.0 },
  2028: { cbs: 1.0,   ibs: 0.006, is: 1,   pisCofins: 0.0, icmsIss: 1.0 },
  2029: { cbs: 1.0,   ibs: 0.10,  is: 1,   pisCofins: 0.0, icmsIss: 0.90 },
  2030: { cbs: 1.0,   ibs: 0.20,  is: 1,   pisCofins: 0.0, icmsIss: 0.80 },
  2031: { cbs: 1.0,   ibs: 0.30,  is: 1,   pisCofins: 0.0, icmsIss: 0.70 },
  2032: { cbs: 1.0,   ibs: 0.40,  is: 1,   pisCofins: 0.0, icmsIss: 0.60 },
  2033: { cbs: 1.0,   ibs: 1.0,   is: 1,   pisCofins: 0.0, icmsIss: 0.0 },
}
const TRANSICAO_ANOS = Object.keys(TRANSICAO_CALENDARIO).map(Number).sort((a, b) => a - b)

interface CargaAtual {
  regime: 'SIMPLES' | 'REGULAR'
  total: number
  pisCofins: number
  icmsIss: number
  das: number
}

interface TransicaoAno {
  ano: number
  cargaReforma: number
  delta: number
  componentes: { cbs: number; ibs: number; is: number; creditos: number; remanescenteAtual: number }
}

interface TransicaoProjecao {
  isSimples: boolean
  cargaAtual: number
  cargaAtualComponentes: CargaAtual
  anos: TransicaoAno[]
  observacao: string
}

const PREMISSAS_SETORIAIS_SEED: Array<Omit<PremissaFiscal, 'empresaId' | 'createdAt' | 'updatedAt' | 'ativo'>> = [
  { id: 'rt-seed-geral', nome: 'Geral - IBS/CBS padrao', ano: 2027, setor: 'Geral', cnaePrefix: null, ...DEFAULT_PREMISSAS, reducaoSetorial: 0, observacoes: 'Premissa operacional inicial. Validar aliquotas, regras legais e perfil do cliente antes do parecer.' },
  { id: 'rt-seed-agro-01', nome: 'Agropecuaria - CNAE 01', ano: 2027, setor: 'Agropecuaria', cnaePrefix: '01', ...DEFAULT_PREMISSAS, percentualVendasB2B: 0.75, percentualComprasCreditaveis: 0.45, reducaoSetorial: 0.6, observacoes: 'Premissa inicial para produtor/atividade agropecuaria. Confirmar enquadramento e reducao aplicavel.' },
  { id: 'rt-seed-industria-10', nome: 'Industria de alimentos - CNAE 10', ano: 2027, setor: 'Industria', cnaePrefix: '10', ...DEFAULT_PREMISSAS, percentualVendasB2B: 0.7, percentualComprasCreditaveis: 0.55, reducaoSetorial: 0, observacoes: 'Premissa inicial para industria de alimentos. Revisar cesta basica, regimes especificos e imposto seletivo quando aplicavel.' },
  { id: 'rt-seed-industria-14', nome: 'Industria textil/confeccao - CNAE 14', ano: 2027, setor: 'Industria', cnaePrefix: '14', ...DEFAULT_PREMISSAS, percentualVendasB2B: 0.65, percentualComprasCreditaveis: 0.5, reducaoSetorial: 0, observacoes: 'Premissa inicial para industria de confeccao. Validar cadeia de creditos e perfil B2B.' },
  { id: 'rt-seed-industria-25', nome: 'Industria metal/mecanica - CNAE 25', ano: 2027, setor: 'Industria', cnaePrefix: '25', ...DEFAULT_PREMISSAS, percentualVendasB2B: 0.8, percentualComprasCreditaveis: 0.6, reducaoSetorial: 0, observacoes: 'Premissa inicial para industria metal/mecanica. Validar insumos creditaveis e destino das vendas.' },
  { id: 'rt-seed-construcao-41', nome: 'Construcao civil - CNAE 41', ano: 2027, setor: 'Construcao', cnaePrefix: '41', ...DEFAULT_PREMISSAS, percentualVendasB2B: 0.55, percentualComprasCreditaveis: 0.4, reducaoSetorial: 0, observacoes: 'Premissa inicial para construcao. Confirmar regime especifico de operacoes imobiliarias e composicao de insumos.' },
  { id: 'rt-seed-construcao-43', nome: 'Servicos especializados construcao - CNAE 43', ano: 2027, setor: 'Construcao', cnaePrefix: '43', ...DEFAULT_PREMISSAS, percentualVendasB2B: 0.65, percentualComprasCreditaveis: 0.35, reducaoSetorial: 0, observacoes: 'Premissa inicial para servicos especializados de construcao. Validar contratos e materiais aplicados.' },
  { id: 'rt-seed-comercio-45', nome: 'Comercio/servicos veiculos - CNAE 45', ano: 2027, setor: 'Comercio', cnaePrefix: '45', ...DEFAULT_PREMISSAS, percentualVendasB2B: 0.45, percentualComprasCreditaveis: 0.55, reducaoSetorial: 0, observacoes: 'Premissa inicial para comercio e manutencao de veiculos. Validar margem e natureza das receitas.' },
  { id: 'rt-seed-comercio-46', nome: 'Comercio atacadista - CNAE 46', ano: 2027, setor: 'Comercio', cnaePrefix: '46', ...DEFAULT_PREMISSAS, percentualVendasB2B: 0.85, percentualComprasCreditaveis: 0.7, reducaoSetorial: 0, observacoes: 'Premissa inicial para atacado com maior peso B2B e creditos de mercadorias.' },
  { id: 'rt-seed-comercio-47', nome: 'Comercio varejista - CNAE 47', ano: 2027, setor: 'Comercio', cnaePrefix: '47', ...DEFAULT_PREMISSAS, percentualVendasB2B: 0.25, percentualComprasCreditaveis: 0.55, reducaoSetorial: 0, observacoes: 'Premissa inicial para varejo. Validar composicao B2C/B2B e margem por produto.' },
  { id: 'rt-seed-transporte-49', nome: 'Transporte terrestre - CNAE 49', ano: 2027, setor: 'Transporte', cnaePrefix: '49', ...DEFAULT_PREMISSAS, percentualVendasB2B: 0.7, percentualComprasCreditaveis: 0.35, reducaoSetorial: 0.6, observacoes: 'Premissa inicial para transporte. Confirmar se a operacao tem reducao/tratamento especifico aplicavel.' },
  { id: 'rt-seed-alimentacao-56', nome: 'Alimentacao/restaurantes - CNAE 56', ano: 2027, setor: 'Alimentacao', cnaePrefix: '56', ...DEFAULT_PREMISSAS, percentualVendasB2B: 0.2, percentualComprasCreditaveis: 0.45, reducaoSetorial: 0, observacoes: 'Premissa inicial para alimentacao. Validar cesta basica, insumos e perfil de consumidor final.' },
  { id: 'rt-seed-tecnologia-62', nome: 'Tecnologia/software - CNAE 62', ano: 2027, setor: 'Tecnologia', cnaePrefix: '62', ...DEFAULT_PREMISSAS, percentualVendasB2B: 0.8, percentualComprasCreditaveis: 0.2, reducaoSetorial: 0, observacoes: 'Premissa inicial para tecnologia e software. Validar receita recorrente, exportacao e servicos tomados.' },
  { id: 'rt-seed-consultoria-69', nome: 'Juridico/contabil/consultoria - CNAE 69', ano: 2027, setor: 'Servicos profissionais', cnaePrefix: '69', ...DEFAULT_PREMISSAS, percentualVendasB2B: 0.75, percentualComprasCreditaveis: 0.18, reducaoSetorial: 0, observacoes: 'Premissa inicial para servicos profissionais. Validar folha, subcontratacoes e baixo credito de insumos.' },
  { id: 'rt-seed-engenharia-71', nome: 'Engenharia/arquitetura - CNAE 71', ano: 2027, setor: 'Servicos profissionais', cnaePrefix: '71', ...DEFAULT_PREMISSAS, percentualVendasB2B: 0.7, percentualComprasCreditaveis: 0.25, reducaoSetorial: 0, observacoes: 'Premissa inicial para engenharia/arquitetura. Validar contratos, terceiros e materiais.' },
  { id: 'rt-seed-publicidade-73', nome: 'Publicidade/marketing - CNAE 73', ano: 2027, setor: 'Servicos profissionais', cnaePrefix: '73', ...DEFAULT_PREMISSAS, percentualVendasB2B: 0.8, percentualComprasCreditaveis: 0.3, reducaoSetorial: 0, observacoes: 'Premissa inicial para publicidade. Validar repasses de midia, subcontratacoes e creditos.' },
  { id: 'rt-seed-educacao-85', nome: 'Educacao - CNAE 85', ano: 2027, setor: 'Educacao', cnaePrefix: '85', ...DEFAULT_PREMISSAS, percentualVendasB2B: 0.15, percentualComprasCreditaveis: 0.2, reducaoSetorial: 0.6, observacoes: 'Premissa inicial para educacao. Confirmar requisitos legais e tipo de servico educacional.' },
  { id: 'rt-seed-saude-86', nome: 'Saude - CNAE 86', ano: 2027, setor: 'Saude', cnaePrefix: '86', ...DEFAULT_PREMISSAS, percentualVendasB2B: 0.35, percentualComprasCreditaveis: 0.3, reducaoSetorial: 0.6, observacoes: 'Premissa inicial para saude. Confirmar enquadramento do servico e reducao aplicavel.' },
  { id: 'rt-seed-servicos-96', nome: 'Servicos pessoais - CNAE 96', ano: 2027, setor: 'Servicos pessoais', cnaePrefix: '96', ...DEFAULT_PREMISSAS, percentualVendasB2B: 0.15, percentualComprasCreditaveis: 0.2, reducaoSetorial: 0, observacoes: 'Premissa inicial para servicos pessoais, tipicamente B2C e com menor base creditavel.' },
]

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

function isoDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function endOfLastCompleteMonth() {
  const d = new Date()
  return new Date(d.getFullYear(), d.getMonth(), 0)
}

function periodFromMonths(months: number) {
  const end = endOfLastCompleteMonth()
  const start = new Date(end.getFullYear(), end.getMonth() - Math.max(0, months - 1), 1)
  return { datai: isoDate(start), dataf: isoDate(end) }
}

function sumSciRows(value: unknown) {
  if (!Array.isArray(value)) return 0
  return value.reduce((acc, row) => acc + asNumber((row as Record<string, unknown>).movimentacao), 0)
}

function textoNormalizado(value: string) {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

function classificarContaCredito(row: { conta: string; nomeConta: string; categoriaDre: string | null }): {
  categoria: 'CREDITAVEL' | 'NAO_CREDITAVEL' | 'REVISAR'
  motivo: string
} {
  const nome = textoNormalizado(`${row.conta} ${row.nomeConta}`)
  const categoriaDre = row.categoriaDre ?? ''

  if (
    /salario|pro labore|pro-labore|ordenado|ferias|13|decimo|fgts|inss|folha|encargo|rescis|beneficio/.test(nome)
    || /irpj|csll|imposto de renda|contribuicao social|multa|juros|taxa|parcelamento|distribuicao|lucro|doacao/.test(nome)
  ) {
    return { categoria: 'NAO_CREDITAVEL', motivo: 'Natureza tipicamente nao creditavel ou ligada a folha/tributos/encargos.' }
  }

  if (
    categoriaDre === 'CUSTO_DAS_VENDAS'
    || categoriaDre === 'DESPESAS_VARIAVEIS'
    || row.conta.startsWith('04.1.')
    || row.conta.startsWith('4.1.')
    || /mercadoria|insumo|materia prima|material aplicado|embalagem|frete|energia|combustivel|aluguel|locacao|software|licenca|servico tomado|terceir/.test(nome)
  ) {
    return { categoria: 'CREDITAVEL', motivo: 'Custo/insumo/servico com potencial de credito a confirmar.' }
  }

  if (categoriaDre === 'DESPESAS_OPERACIONAIS' || row.conta.startsWith('04.2.') || row.conta.startsWith('4.2.')) {
    return { categoria: 'REVISAR', motivo: 'Despesa operacional exige validacao fiscal para definir creditamento.' }
  }

  return { categoria: 'REVISAR', motivo: 'Conta sem classificacao fiscal objetiva no plano atual.' }
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
    { ok: args.metrics.creditos.baseAjustada12m > 0 || args.metrics.comprasMercadorias12m + args.metrics.servicosTomados12m > 0, label: 'Base de compras/servicos para credito' },
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
  if (args.metrics.creditos.baseAjustada12m > 0) {
    score += args.metrics.creditos.confianca === 'ALTA' ? 8 : 4
    fatores.push(`Base de creditos classificada: ${args.metrics.creditos.confianca}`)
  } else if (baseCredito > 0) fatores.push('Base de compras/serviços disponível para estimar créditos')
  else pendencias.push('Sem base objetiva de compras e serviços tomados')

  if (args.metrics.creditos.baseRevisao12m > args.metrics.creditos.baseCreditavel12m) {
    pendencias.push('Contas em revisao superam a base creditavel classificada')
  }

  if (args.metrics.documentosSaida >= 12) score += 4
  else pendencias.push('Baixo volume de documentos de saída importados')

  if (args.metrics.documentosEntrada >= 12) score += 4
  else pendencias.push('Baixo volume de documentos de entrada importados')

  if ((args.reducaoSetorial ?? 0) > 0) {
    fatores.push('Redução setorial parametrizada')
  }

  if (args.metrics.erp.disponivel) {
    score += args.metrics.erp.origem === 'balancete_importado' ? 8 : 4
    fatores.push(`ERP contabil consultado: ${args.metrics.erp.origem}`)
  } else if (args.metrics.erp.consultado) {
    pendencias.push(args.metrics.erp.mensagem ?? 'ERP contabil indisponivel na consulta')
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
  private readonly logger = new Logger(ReformaTributariaService.name)

  constructor(private readonly sciService: SciService) {}

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
              c.id_sistema AS "idSistema", c.uf, c.cidade,
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
    const regraSetorial = await this.regraSetorial(cliente, cnaes, atividades, beneficios, empresaId)

    return {
      cliente,
      cnaes,
      atividades,
      beneficios,
      metrics,
      qualidade,
      regraSetorial,
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
    const baseCreditoClassificada = diagnostico.metrics.creditos.baseAjustada12m > 0
      ? diagnostico.metrics.creditos.baseAjustada12m
      : baseCompras
    const vendasB2B = receita * p.percentualVendasB2B
    const comprasCreditaveis = Math.max(baseCreditoClassificada, receita * p.percentualComprasCreditaveis)

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
    const sensibilidade = this.calcularSensibilidade(receita, baseCreditoClassificada, p, reducaoSetorial)
    const planoAcao = this.planoAcaoTecnico(diagnostico, confiabilidade, recomendacao, sensibilidade)
    const transicao = this.projetarTransicao(diagnostico.cliente, receita, comprasCreditaveis, p, reducaoSetorial)

    return {
      ...diagnostico,
      premissas: p,
      confiabilidade,
      regraSetorial: diagnostico.regraSetorial,
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
      transicao,
    }
  }

  /** Estima a carga tributária que o cliente paga HOJE (premissas de trabalho).
   *  Simples → DAS efetivo; Regular → PIS/COFINS + ICMS (mercadorias) + ISS (serviços). */
  private estimarCargaAtual(cliente: ClienteBase, receita: number, p: ReformaPremissasInput): CargaAtual {
    const isSimples = cliente.tributacao === 'SIMPLES_NACIONAL'
    if (isSimples) {
      const das = receita * (p.dasEfetivoSimples ?? 0.10)
      return { regime: 'SIMPLES', total: das, pisCofins: 0, icmsIss: 0, das }
    }
    const pisCofins = receita * (p.aliquotaPisCofins ?? 0.0365)
    const baseMerc = receita * (p.percentualMercadorias ?? 0.5)
    const baseServ = receita * (1 - (p.percentualMercadorias ?? 0.5))
    const icms = baseMerc * (p.aliquotaIcms ?? 0.12)
    const iss = baseServ * (p.aliquotaIss ?? 0.05)
    return { regime: 'REGULAR', total: pisCofins + icms + iss, pisCofins, icmsIss: icms + iss, das: 0 }
  }

  /** Projeta a carga ano a ano (2026→2033) somando os tributos NOVOS (CBS/IBS/IS,
   *  escalados pelo calendário) aos ATUAIS remanescentes (PIS/COFINS, ICMS/ISS que
   *  vão sendo extintos). Para Simples, a linha representa o cenário de migração ao
   *  regular; a carga atual de referência continua sendo o DAS. */
  private projetarTransicao(
    cliente: ClienteBase,
    receita: number,
    comprasCreditaveis: number,
    p: ReformaPremissasInput,
    reducaoSetorial: number,
  ): TransicaoProjecao {
    const isSimples = cliente.tributacao === 'SIMPLES_NACIONAL'
    const cargaAtualComp = this.estimarCargaAtual(cliente, receita, p)
    const cargaAtual = cargaAtualComp.total

    // Bases plenas (reforma 100%) — escaladas por ano via calendário.
    const fatorReducao = 1 - Math.max(0, Math.min(1, reducaoSetorial))
    const debitoCbsFull = receita * p.aliquotaCbs * fatorReducao
    const debitoIbsFull = receita * p.aliquotaIbs * fatorReducao
    const creditoCbsFull = comprasCreditaveis * p.aliquotaCbs * fatorReducao
    const creditoIbsFull = comprasCreditaveis * p.aliquotaIbs * fatorReducao
    const isFull = receita * (p.impostoSeletivoPercent ?? 0)

    // Componentes do sistema atual "regular" (para o remanescente durante a transição).
    // Para Simples, o remanescente atual não se aplica (a linha é a migração pura ao regular).
    const atualRegular = isSimples
      ? { pisCofins: 0, icmsIss: 0 }
      : { pisCofins: cargaAtualComp.pisCofins, icmsIss: cargaAtualComp.icmsIss }

    const anos: TransicaoAno[] = TRANSICAO_ANOS.map(ano => {
      const f = TRANSICAO_CALENDARIO[ano]!
      const cbs = Math.max(0, debitoCbsFull * f.cbs - creditoCbsFull * f.cbs)
      const ibs = Math.max(0, debitoIbsFull * f.ibs - creditoIbsFull * f.ibs)
      const is = isFull * f.is
      const creditos = creditoCbsFull * f.cbs + creditoIbsFull * f.ibs
      const remanescenteAtual = atualRegular.pisCofins * f.pisCofins + atualRegular.icmsIss * f.icmsIss
      const cargaReforma = cbs + ibs + is + remanescenteAtual
      return {
        ano,
        cargaReforma,
        delta: cargaReforma - cargaAtual,
        componentes: { cbs, ibs, is, creditos, remanescenteAtual },
      }
    })

    return {
      isSimples,
      cargaAtual,
      cargaAtualComponentes: cargaAtualComp,
      anos,
      observacao: isSimples
        ? 'Cliente no Simples: a carga atual é o DAS estimado; a projeção representa o cenário de migração ao regime regular durante a transição. O Simples permanece após a reforma, com adaptações.'
        : 'Projeção soma os tributos novos (CBS/IBS/IS) que vão entrando aos atuais (PIS/COFINS, ICMS/ISS) que vão sendo extintos, conforme o calendário da reforma. Alíquotas e fatores são premissas ajustáveis.',
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
        regraSetorial: simulacao.regraSetorial,
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
              documento, tributacao::text, regime::text, cnae_principal AS "cnaePrincipal",
              id_sistema AS "idSistema", uf, cidade
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
    const contabil = await this.getDadosContabeis(cliente.id, meses)
    const sci = await this.getDadosSci(cliente, meses)
    const creditoFallback = comprasDocs + servicosTomadosDocs
    const creditos = contabil.creditos.origem === 'balancete_importado'
      ? contabil.creditos
      : {
          origem: creditoFallback > 0 ? 'documentos_fiscais' as const : 'premissa' as const,
          baseCreditavel12m: creditoFallback,
          baseNaoCreditavel12m: 0,
          baseRevisao12m: 0,
          baseAjustada12m: creditoFallback,
          confianca: creditoFallback > 0 ? 'MEDIA' as const : 'BAIXA' as const,
          itens: [],
        }
    const faturamento12m = contabil.faturamento12m || snapshots.faturamento || sci.faturamento12m || receitaDocs
    const comprasMercadorias12m = creditos.baseAjustada12m || contabil.custosDespesas12m || comprasDocs || snapshots.nf_entrada
    const servicosTomados12m = servicosTomadosDocs
    const fontePrincipal: Metrics['fontePrincipal'] = contabil.faturamento12m > 0
      ? 'BALANCETE_ERP'
      : snapshots.faturamento > 0 || sci.disponivel
        ? 'SNAPSHOT_SCI'
        : 'DOCUMENTOS_FISCAIS'
    const erpDisponivel = contabil.disponivel || sci.disponivel || rows.length > 0

    return {
      faturamento12m,
      faturamentoMedioMensal: faturamento12m / Math.max(1, meses),
      comprasMercadorias12m,
      servicosTomados12m,
      documentosSaida: saidaDocs.reduce((acc, r) => acc + Number(r.docs), 0) + asNumber(snapshots.nf_saida) + asNumber(snapshots.nf_prestado) + sci.documentosSaida,
      documentosEntrada: entradaDocs.reduce((acc, r) => acc + Number(r.docs), 0) + asNumber(snapshots.nf_entrada) + asNumber(snapshots.nf_tomado) + sci.documentosEntrada,
      fontePrincipal,
      erp: {
        consultado: sci.consultado || contabil.consultado,
        disponivel: erpDisponivel,
        origem: contabil.disponivel ? 'balancete_importado' : sci.disponivel ? 'sci_metricas' : rows.length > 0 ? 'snapshot' : 'nao_disponivel',
        periodo: sci.periodo ?? periodFromMonths(meses),
        faturamento12m: contabil.faturamento12m || sci.faturamento12m || snapshots.faturamento || 0,
        custosDespesas12m: contabil.custosDespesas12m,
        documentosEntrada: sci.documentosEntrada + asNumber(snapshots.nf_entrada) + asNumber(snapshots.nf_tomado),
        documentosSaida: sci.documentosSaida + asNumber(snapshots.nf_saida) + asNumber(snapshots.nf_prestado),
        margemOperacionalPercentual: contabil.margemOperacionalPercentual,
        mensagem: contabil.mensagem || sci.mensagem,
      },
      creditos,
      snapshots,
    }
  }

  private async getDadosContabeis(clienteId: string, meses: number) {
    const end = endOfLastCompleteMonth()
    const start = new Date(end.getFullYear(), end.getMonth() - Math.max(0, meses - 1), 1)
    const periodoInicio = `${start.getFullYear()}${String(start.getMonth() + 1).padStart(2, '0')}`
    const periodoFim = `${end.getFullYear()}${String(end.getMonth() + 1).padStart(2, '0')}`
    const rows = await prisma.$queryRawUnsafe<Array<{
      receita: number | string | null
      custosDespesas: number | string | null
      periodos: number | bigint
    }>>(
      `SELECT
          COALESCE(SUM(CASE
            WHEN COALESCE(c.categoria_dre, '') IN ('RECEITA_BRUTA')
              OR l.conta LIKE '03.1.1%' OR l.conta LIKE '3.1.1%'
            THEN ABS(l.movimento) ELSE 0 END), 0) AS receita,
          COALESCE(SUM(CASE
            WHEN COALESCE(c.categoria_dre, '') IN ('CUSTO_DAS_VENDAS', 'DESPESAS_VARIAVEIS', 'DESPESAS_OPERACIONAIS')
              OR l.conta LIKE '04.1.%' OR l.conta LIKE '4.1.%' OR l.conta LIKE '04.2.1.%' OR l.conta LIKE '04.2.2.%'
            THEN ABS(l.movimento) ELSE 0 END), 0) AS "custosDespesas",
          COUNT(DISTINCT l.periodo) AS periodos
         FROM cliente_bi_linhas l
         LEFT JOIN cliente_bi_categorias c
           ON c.cliente_id = l.cliente_id AND c.conta = l.conta
        WHERE l.cliente_id = $1 AND l.periodo BETWEEN $2 AND $3`,
      clienteId,
      periodoInicio,
      periodoFim,
    )
    const creditoRows = await prisma.$queryRawUnsafe<Array<{
      conta: string
      nomeConta: string
      categoriaDre: string | null
      valor: number | string | null
    }>>(
      `SELECT l.conta, l.nome_conta AS "nomeConta",
              COALESCE(c.categoria_dre, p.categoria_dre) AS "categoriaDre",
              ABS(SUM(l.movimento)) AS valor
         FROM cliente_bi_linhas l
         LEFT JOIN cliente_bi_categorias c
           ON c.cliente_id = l.cliente_id AND c.conta = l.conta
         LEFT JOIN plano_contas_categoria_padrao p
           ON p.classificacao = l.conta
        WHERE l.cliente_id = $1
          AND l.periodo BETWEEN $2 AND $3
          AND (
            COALESCE(c.categoria_dre, p.categoria_dre) IN ('CUSTO_DAS_VENDAS', 'DESPESAS_VARIAVEIS', 'DESPESAS_OPERACIONAIS')
            OR l.conta LIKE '04.1.%' OR l.conta LIKE '4.1.%'
            OR l.conta LIKE '04.2.%' OR l.conta LIKE '4.2.%'
          )
        GROUP BY l.conta, l.nome_conta, COALESCE(c.categoria_dre, p.categoria_dre)
       HAVING ABS(SUM(l.movimento)) > 0.01
        ORDER BY ABS(SUM(l.movimento)) DESC
        LIMIT 80`,
      clienteId,
      periodoInicio,
      periodoFim,
    )
    const creditoItens = creditoRows.map(row => {
      const classificacao = classificarContaCredito(row)
      return {
        conta: row.conta,
        nomeConta: row.nomeConta,
        categoria: classificacao.categoria,
        valor: asNumber(row.valor),
        motivo: classificacao.motivo,
      }
    })
    const baseCreditavel12m = creditoItens.filter(i => i.categoria === 'CREDITAVEL').reduce((acc, i) => acc + i.valor, 0)
    const baseNaoCreditavel12m = creditoItens.filter(i => i.categoria === 'NAO_CREDITAVEL').reduce((acc, i) => acc + i.valor, 0)
    const baseRevisao12m = creditoItens.filter(i => i.categoria === 'REVISAR').reduce((acc, i) => acc + i.valor, 0)
    const creditos = {
      origem: creditoItens.length > 0 ? 'balancete_importado' as const : 'premissa' as const,
      baseCreditavel12m,
      baseNaoCreditavel12m,
      baseRevisao12m,
      baseAjustada12m: baseCreditavel12m + (baseRevisao12m * 0.25),
      confianca: creditoItens.length === 0
        ? 'BAIXA' as const
        : baseRevisao12m > baseCreditavel12m
          ? 'MEDIA' as const
          : 'ALTA' as const,
      itens: creditoItens.slice(0, 12),
    }
    const row = rows[0]
    const faturamento12m = asNumber(row?.receita)
    const custosDespesas12m = asNumber(row?.custosDespesas)
    const periodos = Number(row?.periodos ?? 0)
    return {
      consultado: true,
      disponivel: periodos > 0 && (faturamento12m > 0 || custosDespesas12m > 0),
      faturamento12m,
      custosDespesas12m,
      creditos,
      margemOperacionalPercentual: faturamento12m > 0 ? (faturamento12m - custosDespesas12m) / faturamento12m : null,
      mensagem: periodos > 0
        ? `Balancete ERP importado em ${periodos} periodo(s) entre ${periodoInicio} e ${periodoFim}.`
        : 'Sem balancete ERP importado para a janela analisada.',
    }
  }

  private async getDadosSci(cliente: ClienteBase, meses: number) {
    const doc = onlyDigits(cliente.documento)
    const periodo = periodFromMonths(meses)
    if (doc.length !== 14) {
      return { consultado: false, disponivel: false, periodo, faturamento12m: 0, documentosEntrada: 0, documentosSaida: 0, mensagem: 'CNPJ invalido para consulta SCI.' }
    }

    try {
      const metricas = await this.sciService.buscarMetricasSci(doc, periodo.datai, periodo.dataf, ['faturamento', 'nf_entrada', 'nf_saida', 'nf_prestado', 'nf_tomado'])
      const faturamento12m = sumSciRows(metricas.faturamento)
      return {
        consultado: true,
        disponivel: faturamento12m > 0 || Array.isArray(metricas.nf_entrada) || Array.isArray(metricas.nf_saida),
        periodo,
        faturamento12m,
        documentosEntrada: sumSciRows(metricas.nf_entrada) + sumSciRows(metricas.nf_tomado),
        documentosSaida: sumSciRows(metricas.nf_saida) + sumSciRows(metricas.nf_prestado),
        mensagem: 'Metricas SCI consultadas diretamente pelo CNPJ.',
      }
    } catch (e) {
      this.logger.warn(`Falha ao consultar SCI para cliente ${cliente.id}: ${(e as Error).message}`)
      return {
        consultado: true,
        disponivel: false,
        periodo,
        faturamento12m: 0,
        documentosEntrada: 0,
        documentosSaida: 0,
        mensagem: 'SCI indisponivel na consulta online; usados dados ja importados no OneClick.',
      }
    }
  }

  private async regraSetorial(
    cliente: ClienteBase,
    cnaes: Array<{ codigo: string; descricao: string | null; principal: boolean }>,
    atividades: string[],
    beneficios: string[],
    empresaId?: string | null,
  ): Promise<RegraSetorial> {
    await this.ensurePremissasTable()
    const codigos = [cliente.cnaePrincipal, ...cnaes.map(c => c.codigo)]
      .map(c => onlyDigits(c))
      .filter(Boolean)
    const rows = await prisma.$queryRawUnsafe<Array<{
      id: string
      nome: string
      setor: string | null
      cnaePrefix: string | null
      reducaoSetorial: number | string
    }>>(
      `SELECT id, nome, setor, cnae_prefix AS "cnaePrefix", reducao_setorial AS "reducaoSetorial"
         FROM reforma_tributaria_premissas
        WHERE ativo = true
          AND cnae_prefix IS NOT NULL
          AND cnae_prefix <> ''
          AND (empresa_id IS NULL OR $1::text IS NULL OR empresa_id = $1)
        ORDER BY length(regexp_replace(cnae_prefix, '\\D', '', 'g')) DESC, ano DESC, nome ASC`,
      empresaId ?? null,
    )
    for (const row of rows) {
      const prefix = onlyDigits(row.cnaePrefix)
      if (!prefix) continue
      if (codigos.some(codigo => codigo.startsWith(prefix))) {
        return {
          origem: 'PREMISSA_CNAE',
          setor: row.setor,
          reducaoSetorial: asNumber(row.reducaoSetorial),
          premissaId: row.id,
          premissaNome: row.nome,
          cnaePrefix: row.cnaePrefix,
          alertas: [`Premissa setorial sugerida por CNAE prefixo ${row.cnaePrefix}.`],
        }
      }
    }

    if (beneficios.length > 0) {
      return {
        origem: 'BENEFICIO_CLIENTE',
        setor: null,
        reducaoSetorial: 0,
        alertas: [
          'Cliente possui beneficio fiscal cadastrado, mas nao ha premissa IBS/CBS vinculada por CNAE.',
          'Cadastrar premissa setorial antes de emitir parecer conclusivo.',
        ],
      }
    }
    if (atividades.length > 0) {
      return {
        origem: 'ATIVIDADE_CLIENTE',
        setor: atividades[0] ?? null,
        reducaoSetorial: 0,
        alertas: ['Atividade do cliente encontrada, mas sem regra fiscal setorial parametrizada.'],
      }
    }
    return {
      origem: 'SEM_REGRA',
      setor: null,
      reducaoSetorial: 0,
      alertas: ['Sem regra setorial parametrizada para os CNAEs/atividades do cliente.'],
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
      `Fonte principal dos dados: ${simulacao.metrics.fontePrincipal}`,
      `Base creditavel classificada: R$ ${simulacao.metrics.creditos.baseCreditavel12m.toFixed(2)}`,
      `Base nao creditavel classificada: R$ ${simulacao.metrics.creditos.baseNaoCreditavel12m.toFixed(2)}`,
      `Base em revisao fiscal: R$ ${simulacao.metrics.creditos.baseRevisao12m.toFixed(2)}`,
    ]
    if (simulacao.metrics.erp.mensagem) {
      linhas.push(`ERP contabil: ${simulacao.metrics.erp.mensagem}`)
    }
    if (simulacao.regraSetorial.origem !== 'SEM_REGRA') {
      linhas.push(`Regra setorial: ${simulacao.regraSetorial.premissaNome ?? simulacao.regraSetorial.origem}`)
    }
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
    if (diagnostico.metrics.creditos.baseRevisao12m > 0) {
      passos.add('Revisar contas classificadas como duvidosas para confirmar direito a credito IBS/CBS')
    }
    if (diagnostico.metrics.creditos.origem !== 'balancete_importado') {
      passos.add('Importar balancete para substituir estimativa de creditos por classificacao contabil')
    }
    if (!diagnostico.metrics.erp.disponivel) {
      passos.add('Atualizar integracao ERP/SCI ou importar balancete do periodo para elevar a confiabilidade do parecer')
    }
    for (const alerta of diagnostico.regraSetorial.alertas) {
      passos.add(`Regra setorial: ${alerta}`)
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
    await this.seedPremissasSetoriais()
  }

  private async seedPremissasSetoriais() {
    for (const item of PREMISSAS_SETORIAIS_SEED) {
      await prisma.$executeRawUnsafe(
        `INSERT INTO reforma_tributaria_premissas
          (id, empresa_id, nome, ano, setor, cnae_prefix, aliquota_cbs, aliquota_ibs,
           aliquota_simples_ibs_cbs, percentual_vendas_b2b, percentual_compras_creditaveis,
           peso_credito_cliente, reducao_setorial, observacoes, ativo, created_at, updated_at)
         VALUES ($1,NULL,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,true,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
         ON CONFLICT (id) DO NOTHING`,
        item.id,
        item.nome,
        item.ano,
        item.setor ?? null,
        item.cnaePrefix ?? null,
        item.aliquotaCbs,
        item.aliquotaIbs,
        item.aliquotaSimplesIbsCbs,
        item.percentualVendasB2B,
        item.percentualComprasCreditaveis,
        item.pesoCreditoCliente,
        item.reducaoSetorial ?? 0,
        item.observacoes ?? null,
      )
    }
  }
}
