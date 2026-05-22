/**
 * Parser de XML de NFS-e (Nota Fiscal de Serviço Eletrônica) — padrão NACIONAL
 * do gov.br (Emissor Nacional ADN). Extrai metadata estruturada antes de jogar
 * em banco / gerar PDF auxiliar.
 *
 * Raízes aceitas (padrão nacional, mas com tolerância a wrappers de consulta):
 *  - <NFSe>...</NFSe>                                  → leiaute canônico ADN
 *  - <CompNfse>...<Nfse>...</Nfse></CompNfse>          → leiaute ABRASF/ADN (mais comum)
 *  - <consultaNFSeResponse>...</consultaNFSeResponse>  → envelope de consulta nacional
 *  - <ConsultarNfseResposta>...                        → resposta ABRASF clássica
 *
 * Observação: alguns campos VARIAM mesmo dentro do padrão nacional porque o
 * Emissor Nacional ainda conviva com layouts municipais ABRASF (Curitiba, SP,
 * BH, etc). Pra cada campo crítico tentamos múltiplos caminhos via `pick()`.
 *
 * Diferenças vs NFe (modelo 55):
 *   - Chave tem 50 dígitos (NFe: 44)
 *   - Não há "modelo" — é sempre serviço (ISSQN, não ICMS)
 *   - Tomador pode ser CPF (PF) ou CNPJ (PJ)
 *   - Discriminação é texto longo livre (vs xProd item-a-item da NFe)
 */

import { XMLParser } from 'fast-xml-parser'

/** Endereço estruturado (prestador, tomador, intermediário). */
export interface EnderecoNFSe {
  logradouro: string | null
  numero: string | null
  complemento: string | null
  bairro: string | null
  municipioIbge: string | null
  municipioNome: string | null
  uf: string | null
  cep: string | null
  pais: string | null
}

/** Pessoa (prestador, tomador, intermediário). */
export interface PessoaNFSe {
  cnpjCpf: string | null
  inscricaoMunicipal: string | null
  razaoSocial: string | null
  telefone: string | null
  email: string | null
  endereco: EnderecoNFSe | null
  /** Apenas prestador: 1=Não optante, 2=MEI, 3=ME/EPP */
  opcaoSimplesNacional: string | null
  /** Apenas prestador: 1=Apuração SN, 0=Outro */
  regimeApuracaoSN: string | null
  /** Apenas prestador: 0=Nenhum, 1=Microempresa, 2=Estimativa, 3=Soc. profissional */
  regimeEspecialTributacao: string | null
}

export interface ParsedNFSe {
  // ── Identificação ────────────────────────────────────────────
  chave: string | null
  numero: string
  serie: string | null
  codigoVerificacao: string | null
  /** Nome do município emissor (xLocEmi). */
  localEmissaoNome: string | null
  /** Nome do município da prestação (xLocPrestacao). */
  localPrestacaoNome: string | null
  /** Código IBGE do local de incidência do ISSQN (cLocIncid). */
  localIncidenciaIbge: string | null
  /** Nome do local de incidência (xLocIncid). */
  localIncidenciaNome: string | null
  /** Texto descritivo da tributação nacional aplicada (xTribNac). */
  descTributacaoNacional: string | null
  /** Ambiente do gerador (ambGer): 1=Produção, 2=Homologação. */
  ambienteGerador: string | null
  /** Tipo de emissão (tpEmis). */
  tipoEmissao: string | null
  /** Status do processamento (cStat): 100=emitida, 101=cancelada, etc. */
  cStat: string | null
  /** Data/hora do processamento (dhProc). */
  dataProcessamento: Date | null
  /** Número da DFSe gerado pelo provedor (nDFSe). */
  numeroDFSe: string | null

  // ── DPS ──────────────────────────────────────────────────────
  numeroDPS: string | null
  serieDPS: string | null
  dataEmissaoDPS: Date | null

  // ── Prestador ────────────────────────────────────────────────
  /** CNPJ do prestador (apenas dígitos). */
  prestadorCnpj: string
  /** Razão social do prestador. */
  prestadorRazao: string
  /** Código IBGE do município do prestador (7 dígitos). */
  prestadorMunicipio: string | null
  /** Dados completos do prestador. */
  prestador: PessoaNFSe

  // ── Tomador ──────────────────────────────────────────────────
  /** CPF/CNPJ do tomador (apenas dígitos). */
  tomadorCnpjCpf: string | null
  /** Razão social ou nome do tomador. */
  tomadorRazao: string | null
  /** Dados completos do tomador (null se não identificado). */
  tomador: PessoaNFSe | null

  // ── Intermediário ────────────────────────────────────────────
  intermediario: PessoaNFSe | null

  // ── Valores ──────────────────────────────────────────────────
  valorServicos: number
  valorIss: number | null
  valorLiquido: number | null
  aliquotaIss: number | null
  /** Base de cálculo do ISSQN (vBC). */
  baseCalculo: number | null
  /** Total dos tributos federais aproximados (Lei 12.741). */
  totalTribFed: number | null
  /** Total dos tributos estaduais aproximados. */
  totalTribEst: number | null
  /** Total dos tributos municipais aproximados. */
  totalTribMun: number | null

  // ── Serviço ──────────────────────────────────────────────────
  /** Código de tributação nacional (cTribNac). */
  itemListaServico: string | null
  /** Código CNAE da atividade. */
  cnae: string | null
  /** Código NBS (Nomenclatura Brasileira de Serviços). */
  codigoNBS: string | null
  /** Código de tributação municipal. */
  codigoTributacaoMunicipal: string | null
  /** Descrição livre do serviço prestado. */
  discriminacao: string | null

  // ── Tributação Municipal ─────────────────────────────────────
  /** Tipo de tributação ISSQN: 1=Tributável, 2=Imune, 3=Suspensão, 4=Exportação, 5=Não tributável. */
  tributacaoISSQN: string | null
  /** Tipo de retenção ISSQN: 1=Não retido, 2=Retido. */
  retencaoISSQN: string | null
  /** Tipo de imunidade ISSQN. */
  tipoImunidadeISSQN: string | null
  /** PIS/COFINS CST. */
  pisCofinsCST: string | null

  // ── Datas ────────────────────────────────────────────────────
  dataEmissao: Date
  competencia: Date | null

  // ── Status / origem ──────────────────────────────────────────
  status: 'EMITIDA' | 'CANCELADA' | 'SUBSTITUIDA'
  padrao: 'NACIONAL' | string
  municipio: string | null
}

export class XmlNFSeInvalidoError extends Error {
  constructor(msg: string) {
    super(msg)
    this.name = 'XmlNFSeInvalidoError'
  }
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '',
  parseAttributeValue: false,
  parseTagValue: false,
  // Remove namespaces (xmlns:nfse, ds:Signature, etc.) — leiautes nacional/ABRASF
  // misturam prefixos. Mantemos apenas o local-name.
  removeNSPrefix: true,
})

/** Pega o primeiro valor não-undefined em `obj` testando uma lista de chaves. */
function pick<T = unknown>(obj: Record<string, unknown> | undefined | null, ...keys: string[]): T | undefined {
  if (!obj) return undefined
  for (const k of keys) {
    const v = obj[k]
    if (v !== undefined && v !== null && v !== '') return v as T
  }
  return undefined
}

/** Caminha por um path de chaves; retorna undefined se qualquer nó for ausente. */
function path(obj: unknown, ...keys: string[]): unknown {
  let cur: unknown = obj
  for (const k of keys) {
    if (cur && typeof cur === 'object' && k in (cur as Record<string, unknown>)) {
      cur = (cur as Record<string, unknown>)[k]
    } else {
      return undefined
    }
  }
  return cur
}

/** Normaliza CNPJ/CPF: só dígitos. */
function digits(s: unknown): string {
  return String(s ?? '').replace(/\D/g, '')
}

/** Converte string para number tolerante a vírgula decimal (alguns municípios). */
function toNumber(v: unknown): number | null {
  if (v === undefined || v === null || v === '') return null
  const s = String(v).replace(',', '.')
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

/** Parse de data ISO ou yyyy-MM-dd. Retorna null em formatos inesperados. */
function toDate(v: unknown): Date | null {
  if (!v) return null
  const d = new Date(String(v))
  return Number.isNaN(d.getTime()) ? null : d
}

/**
 * Encontra o nó `InfNfse` (ou equivalente) navegando pelos wrappers comuns.
 * O bloco InfNfse contém o "DPS recebida" (Declaração de Prestação de Serviços)
 * mais os dados de identificação da nota emitida.
 */
function findInfNfse(root: Record<string, unknown>): Record<string, unknown> | null {
  // Caminhos possíveis, em ordem de preferência:
  const candidates: Array<string[]> = [
    ['NFSe', 'infNFSe'],                              // ADN nacional canônico (camelCase)
    ['NFSe', 'InfNFSe'],                              // ADN nacional canônico (PascalCase)
    ['NFSe', 'InfNfse'],                              // variação
    ['CompNfse', 'Nfse', 'InfNfse'],                  // ABRASF/ADN com CompNfse
    ['consultaNFSeResponse', 'NFSe', 'infNFSe'],      // envelope nacional
    ['consultaNFSeResponse', 'CompNfse', 'Nfse', 'InfNfse'],
    ['ConsultarNfseResposta', 'ListaNfse', 'CompNfse', 'Nfse', 'InfNfse'],
    ['ListaNfse', 'CompNfse', 'Nfse', 'InfNfse'],
    ['Nfse', 'InfNfse'],
  ]
  for (const p of candidates) {
    const node = path(root, ...p)
    if (node && typeof node === 'object') return node as Record<string, unknown>
  }
  return null
}

/**
 * Parser principal. Recebe XML string e devolve `ParsedNFSe` normalizado.
 * Lança `XmlNFSeInvalidoError` se o XML não tiver a estrutura mínima esperada.
 */
export function parseNFSeXml(xmlString: string): ParsedNFSe {
  let root: Record<string, unknown>
  try {
    root = parser.parse(xmlString) as Record<string, unknown>
  } catch (e) {
    throw new XmlNFSeInvalidoError(`XML mal-formado: ${(e as Error).message}`)
  }

  const inf = findInfNfse(root)
  if (!inf) {
    throw new XmlNFSeInvalidoError(
      'XML não parece ser uma NFS-e padrão nacional/ABRASF (não achei <InfNfse>/<infNFSe>).',
    )
  }

  // No padrão nacional moderno (gov.br/NFSe), a maior parte dos dados está aninhada
  // em <DPS><infDPS>...</infDPS></DPS> — tomador, valores, serviços, datas. O bloco
  // <infNFSe> raiz só tem identificação + valores agregados (vLiq).
  const dpsInf = (path(inf, 'DPS', 'infDPS') as Record<string, unknown> | undefined) ?? {}

  // ── Identificação da nota ────────────────────────────────────
  // Chave: vem como atributo "Id" do nó <InfNfse> em alguns layouts (ex: "Nfse...50dig"),
  // ou como tag <ChaveAcesso>/<chNFSe>/<chaveAcesso>. Padrão nacional usa 50 dígitos.
  let chave: string | null = null
  const idAttr = inf.Id ?? inf.id
  if (idAttr) chave = String(idAttr).replace(/^NFSe/i, '').replace(/\D/g, '')
  if (!chave || chave.length === 0) {
    const tagChave = pick<string>(inf, 'ChaveAcesso', 'chNFSe', 'chaveAcesso', 'chaveNFSe')
    if (tagChave) chave = String(tagChave).replace(/\D/g, '')
  }
  if (chave && chave.length !== 50 && chave.length !== 44) {
    // Não é fatal — municipais podem usar formato próprio. Mantemos null se for inválido.
    if (!/^\d+$/.test(chave)) chave = null
  }
  if (chave && chave.length === 0) chave = null

  const numero = String(
    pick<string>(inf, 'Numero', 'numero', 'nNFSe', 'NumeroNfse', 'numeroNfse') ?? '0',
  )
  const serie = pick<string>(inf, 'Serie', 'serie', 'SerieNfse', 'serieNfse')
    ? String(pick<string>(inf, 'Serie', 'serie', 'SerieNfse', 'serieNfse'))
    : null

  const codigoVerificacao = pick<string>(inf, 'CodigoVerificacao', 'codigoVerificacao', 'cdVerif')
    ? String(pick<string>(inf, 'CodigoVerificacao', 'codigoVerificacao', 'cdVerif'))
    : null

  // ── Prestador ────────────────────────────────────────────────
  // Caminhos: <PrestadorServico>/<Prestador> > <IdentificacaoPrestador>/<CpfCnpj>/<Cnpj>
  // No ADN nacional: <emit>/<CNPJ> no infNFSe + <prest>/<CNPJ> no infDPS.
  const prestadorNode =
    (pick<Record<string, unknown>>(inf, 'PrestadorServico', 'Prestador', 'prest', 'emit') as
      | Record<string, unknown>
      | undefined) ??
    (pick<Record<string, unknown>>(dpsInf, 'prest', 'emit') as Record<string, unknown> | undefined) ??
    {}

  const prestIdent =
    (pick<Record<string, unknown>>(
      prestadorNode,
      'IdentificacaoPrestador',
      'identificacaoPrestador',
      'Identificacao',
    ) as Record<string, unknown> | undefined) ?? prestadorNode

  const prestCpfCnpj =
    (pick<Record<string, unknown>>(prestIdent, 'CpfCnpj', 'cpfCnpj') as
      | Record<string, unknown>
      | undefined) ?? prestIdent

  const prestadorCnpj = digits(
    pick<string>(prestCpfCnpj, 'Cnpj', 'CNPJ', 'cnpj') ?? pick<string>(prestIdent, 'CNPJ', 'Cnpj'),
  )
  if (!prestadorCnpj || prestadorCnpj.length < 11) {
    throw new XmlNFSeInvalidoError('CNPJ do prestador ausente ou inválido.')
  }

  const prestadorRazao = String(
    pick<string>(prestadorNode, 'RazaoSocial', 'razaoSocial', 'xNome', 'xRazao') ??
      pick<string>(prestIdent, 'RazaoSocial', 'razaoSocial') ??
      '(sem razão social)',
  )

  // Município do prestador: <Endereco>/<CodigoMunicipio> ou <enderNac>/<cMun>
  const prestEndereco =
    (pick<Record<string, unknown>>(prestadorNode, 'Endereco', 'endereco', 'enderNac', 'enderEmit') as
      | Record<string, unknown>
      | undefined) ?? {}
  const prestadorMunicipio =
    pick<string>(prestEndereco, 'CodigoMunicipio', 'codigoMunicipio', 'cMun', 'cMunFG')
      ? String(pick<string>(prestEndereco, 'CodigoMunicipio', 'codigoMunicipio', 'cMun', 'cMunFG'))
      : null

  // ── Tomador ──────────────────────────────────────────────────
  // Padrão nacional: <toma>/<CNPJ> dentro de <DPS><infDPS>. Padrão ABRASF: <TomadorServico>.
  const tomadorNode =
    (pick<Record<string, unknown>>(inf, 'TomadorServico', 'Tomador', 'toma', 'dest') as
      | Record<string, unknown>
      | undefined) ??
    (pick<Record<string, unknown>>(dpsInf, 'toma', 'dest') as Record<string, unknown> | undefined) ??
    {}

  const tomIdent =
    (pick<Record<string, unknown>>(
      tomadorNode,
      'IdentificacaoTomador',
      'identificacaoTomador',
      'Identificacao',
    ) as Record<string, unknown> | undefined) ?? tomadorNode

  const tomCpfCnpj =
    (pick<Record<string, unknown>>(tomIdent, 'CpfCnpj', 'cpfCnpj') as Record<string, unknown> | undefined) ??
    tomIdent

  const tomadorRaw =
    pick<string>(tomCpfCnpj, 'Cnpj', 'CNPJ', 'cnpj', 'Cpf', 'CPF', 'cpf') ??
    pick<string>(tomIdent, 'CNPJ', 'Cnpj', 'CPF', 'Cpf')
  const tomadorCnpjCpf = tomadorRaw ? digits(tomadorRaw) : null

  const tomadorRazao =
    pick<string>(tomadorNode, 'RazaoSocial', 'razaoSocial', 'xNome', 'xRazao') ??
    pick<string>(tomIdent, 'RazaoSocial', 'razaoSocial')
      ? String(
          pick<string>(tomadorNode, 'RazaoSocial', 'razaoSocial', 'xNome', 'xRazao') ??
            pick<string>(tomIdent, 'RazaoSocial', 'razaoSocial'),
        )
      : null

  // ── Serviço (descrição, valores, alíquotas) ──────────────────
  // Padrão nacional moderno: <serv>/<cServ>/<xDescServ> dentro do DPS.
  // Padrão ABRASF: <Servico>/<Valores> direto no InfNfse.
  const servicoNode =
    (pick<Record<string, unknown>>(inf, 'Servico', 'servico', 'Servicos', 'servicos', 'serv') as
      | Record<string, unknown>
      | undefined) ??
    (pick<Record<string, unknown>>(dpsInf, 'serv', 'Servico') as Record<string, unknown> | undefined) ??
    {}

  // Bloco de valores: pode estar em vários níveis.
  //  - <InfNfse><valores><vLiq> (padrão nacional — só valor líquido agregado)
  //  - <Servico><Valores><ValorServicos> (ABRASF clássico)
  //  - <DPS><infDPS><valores><vServPrest><vServ> (padrão nacional — valor bruto dos serviços)
  const valoresInfNFSe =
    (pick<Record<string, unknown>>(inf, 'Valores', 'valores') as Record<string, unknown> | undefined) ?? {}
  const valoresServico =
    (pick<Record<string, unknown>>(servicoNode, 'Valores', 'valores', 'vlServ') as
      | Record<string, unknown>
      | undefined) ?? {}
  const valoresDps =
    (pick<Record<string, unknown>>(dpsInf, 'valores') as Record<string, unknown> | undefined) ?? {}
  const vServPrest =
    (pick<Record<string, unknown>>(valoresDps, 'vServPrest') as Record<string, unknown> | undefined) ?? {}

  const valorServicos =
    toNumber(pick(valoresServico, 'ValorServicos', 'valorServicos', 'vServ', 'vServicos', 'vlServ')) ??
    toNumber(pick(valoresInfNFSe, 'ValorServicos', 'valorServicos', 'vServ', 'vServicos')) ??
    toNumber(pick(vServPrest, 'vServ', 'ValorServicos', 'valorServicos')) ??
    toNumber(pick(valoresDps, 'vServ', 'ValorServicos')) ??
    toNumber(pick(servicoNode, 'ValorServicos', 'valorServicos', 'vServ')) ??
    0

  const valorIss =
    toNumber(pick(valoresInfNFSe, 'vISSQN', 'vIss', 'ValorIss', 'valorIss')) ??
    toNumber(pick(valoresServico, 'ValorIss', 'valorIss', 'ValorIssRetido', 'vIss', 'vISSQN')) ??
    toNumber(pick(valoresDps, 'vISSQN', 'vIss', 'ValorIss'))

  const valorLiquido =
    toNumber(pick(valoresInfNFSe, 'vLiq', 'ValorLiquidoNfse', 'valorLiquidoNfse')) ??
    toNumber(pick(valoresServico, 'ValorLiquidoNfse', 'valorLiquidoNfse', 'vLiq')) ??
    toNumber(pick(valoresDps, 'vLiq'))

  const aliquotaIss =
    toNumber(pick(valoresInfNFSe, 'pAliqAplic', 'pAliq', 'Aliquota', 'aliquota')) ??
    toNumber(pick(valoresServico, 'Aliquota', 'aliquota', 'pAliq', 'pAliqAplic', 'pISS')) ??
    toNumber(pick(valoresDps, 'Aliquota', 'aliquota', 'pAliq', 'pAliqAplic', 'pISS'))

  const itemListaServico = pick<string>(servicoNode, 'ItemListaServico', 'itemListaServico', 'cListServ')
    ? String(pick<string>(servicoNode, 'ItemListaServico', 'itemListaServico', 'cListServ'))
    : null

  const cnae = pick<string>(servicoNode, 'CodigoCnae', 'codigoCnae', 'CNAE', 'cnae')
    ? String(pick<string>(servicoNode, 'CodigoCnae', 'codigoCnae', 'CNAE', 'cnae'))
    : null

  // Descrição: padrão nacional aninha em <serv><cServ><xDescServ>; ABRASF usa <Discriminacao>.
  const cServ =
    (pick<Record<string, unknown>>(servicoNode, 'cServ') as Record<string, unknown> | undefined) ?? {}
  const discriminacaoRaw =
    pick<string>(servicoNode, 'Discriminacao', 'discriminacao', 'xDescServ', 'xDesc') ??
    pick<string>(cServ, 'xDescServ', 'xDesc', 'Discriminacao')
  const discriminacao = discriminacaoRaw ? String(discriminacaoRaw) : null

  // ── Datas ────────────────────────────────────────────────────
  // Padrão nacional: <dhEmi> dentro de <DPS><infDPS>. Padrão ABRASF: <DataEmissao> no InfNfse.
  const dataEmissaoRaw =
    pick<string>(inf, 'DataEmissao', 'dataEmissao', 'dhEmi', 'DhEmi') ??
    pick<string>(dpsInf, 'dhEmi', 'DhEmi', 'DataEmissao', 'dataEmissao') ??
    pick<string>(servicoNode, 'DataEmissao', 'dataEmissao')
  const dataEmissao = toDate(dataEmissaoRaw) ?? new Date()

  const competenciaRaw =
    pick<string>(inf, 'Competencia', 'competencia', 'dCompetencia') ??
    pick<string>(dpsInf, 'dCompet', 'Competencia', 'competencia')
  const competencia = toDate(competenciaRaw)

  // ── Status / cancelamento ────────────────────────────────────
  // No padrão nacional, NFS-e cancelada vem com o nó <NfseCancelamento> ou
  // atributo <Situacao>/<situacao> = "2" (cancelada). Substituída = <NfseSubstituicao>.
  let status: ParsedNFSe['status'] = 'EMITIDA'
  const situacao = String(
    pick<string>(inf, 'Situacao', 'situacao', 'SituacaoNfse', 'situacaoNfse') ?? '',
  )
  if (situacao === '2' || situacao.toUpperCase() === 'CANCELADA') status = 'CANCELADA'
  else if (situacao === '3' || situacao.toUpperCase() === 'SUBSTITUIDA') status = 'SUBSTITUIDA'

  // Wrappers explícitos vencem o flag:
  if (path(root, 'CompNfse', 'NfseCancelamento') || path(root, 'NFSe', 'NfseCancelamento')) {
    status = 'CANCELADA'
  }
  if (path(root, 'CompNfse', 'NfseSubstituicao') || path(root, 'NFSe', 'NfseSubstituicao')) {
    status = 'SUBSTITUIDA'
  }

  // ── Município emissor / padrão ───────────────────────────────
  // O padrão NACIONAL geralmente carrega <enderNac>/<cMunIncid> no DPS embutido.
  // Se não achar nada explícito mas o XML estiver no leiaute <NFSe> root, marcamos NACIONAL.
  const municipioIncidencia =
    pick<string>(
      pick<Record<string, unknown>>(servicoNode, 'CodigoMunicipio', 'codigoMunicipio') as
        | Record<string, unknown>
        | undefined,
    ) ??
    pick<string>(servicoNode, 'CodigoMunicipio', 'codigoMunicipio', 'cMunIncid') ??
    pick<string>(inf, 'CodigoMunicipio', 'codigoMunicipio', 'cMunIncid')

  const municipio = municipioIncidencia ? String(municipioIncidencia) : prestadorMunicipio

  // Heurística de padrão: se a chave tem 50 dígitos OU o root é <NFSe>, é nacional.
  const isNacional =
    (chave?.length === 50) ||
    Boolean(root.NFSe) ||
    Boolean(root.consultaNFSeResponse)
  const padrao: ParsedNFSe['padrao'] = isNacional
    ? 'NACIONAL'
    : municipio
    ? `MUNICIPAL_${municipio}`
    : 'NACIONAL'

  // ─────────────────────────────────────────────────────────────────────────
  // Expansão de campos (NT 008/2026): endereço, contato, regime SN, tributação
  // ─────────────────────────────────────────────────────────────────────────

  /** Lê endereço (logradouro/número/bairro/município/UF/CEP) de um nó pessoa. */
  function lerEndereco(pessoa: Record<string, unknown>): EnderecoNFSe | null {
    // Caminhos possíveis: pessoa.endereco | pessoa.end.endNac | pessoa.enderNac | pessoa.Endereco
    const endRoot =
      (pick<Record<string, unknown>>(pessoa, 'Endereco', 'endereco', 'enderNac', 'enderEmit') as Record<string, unknown> | undefined) ??
      (path(pessoa, 'end', 'endNac') as Record<string, unknown> | undefined) ??
      (path(pessoa, 'end') as Record<string, unknown> | undefined)
    if (!endRoot) return null

    // No padrão nacional <end> tem <endNac> + outros campos no mesmo nível
    const endNac = (pick<Record<string, unknown>>(endRoot, 'endNac', 'enderNac') as Record<string, unknown> | undefined) ?? endRoot
    const endOuter = (path(pessoa, 'end') as Record<string, unknown> | undefined) ?? endRoot

    const logr = pick<string>(endRoot, 'Logradouro', 'logradouro', 'xLgr') ?? pick<string>(endOuter, 'xLgr', 'Logradouro')
    const nro = pick<string>(endRoot, 'Numero', 'numero', 'nro') ?? pick<string>(endOuter, 'nro', 'Numero')
    const comp = pick<string>(endRoot, 'Complemento', 'complemento', 'xCpl') ?? pick<string>(endOuter, 'xCpl', 'Complemento')
    const bairro = pick<string>(endRoot, 'Bairro', 'bairro', 'xBairro') ?? pick<string>(endOuter, 'xBairro', 'Bairro')
    const mun = pick<string>(endNac, 'CodigoMunicipio', 'codigoMunicipio', 'cMun') ?? pick<string>(endRoot, 'cMun', 'CodigoMunicipio')
    const munNome = pick<string>(endRoot, 'xMun', 'NomeMunicipio') ?? pick<string>(endNac, 'xMun')
    const uf = pick<string>(endNac, 'UF', 'uf', 'Uf') ?? pick<string>(endRoot, 'UF', 'uf')
    const cep = pick<string>(endNac, 'CEP', 'cep', 'Cep') ?? pick<string>(endRoot, 'CEP', 'cep')
    const pais = pick<string>(endRoot, 'CodigoPais', 'codigoPais', 'xPais', 'cPais') ?? pick<string>(endNac, 'cPais', 'xPais')

    // Se nada útil foi achado, retorna null pra evitar objeto vazio
    if (!logr && !bairro && !mun && !cep) return null
    return {
      logradouro: logr ? String(logr) : null,
      numero: nro ? String(nro) : null,
      complemento: comp ? String(comp) : null,
      bairro: bairro ? String(bairro) : null,
      municipioIbge: mun ? String(mun) : null,
      municipioNome: munNome ? String(munNome) : null,
      uf: uf ? String(uf).toUpperCase() : null,
      cep: cep ? String(cep).replace(/\D/g, '') : null,
      pais: pais ? String(pais) : null,
    }
  }

  /** Lê regime tributário do prestador (<regTrib>). */
  function lerRegimeTrib(node: Record<string, unknown>): {
    opcaoSimplesNacional: string | null
    regimeApuracaoSN: string | null
    regimeEspecialTributacao: string | null
  } {
    const regTrib =
      (pick<Record<string, unknown>>(node, 'regTrib', 'RegimeTributario') as Record<string, unknown> | undefined) ?? {}
    return {
      opcaoSimplesNacional: pick<string>(regTrib, 'opSimpNac', 'OpcaoSimplesNacional')?.toString() ?? null,
      regimeApuracaoSN: pick<string>(regTrib, 'regApTribSN', 'RegimeApuracaoSN')?.toString() ?? null,
      regimeEspecialTributacao: pick<string>(regTrib, 'regEspTrib', 'RegimeEspecialTributacao')?.toString() ?? null,
    }
  }

  // ── Identificação extra ──────────────────────────────────────
  const localEmissaoNome = pick<string>(inf, 'xLocEmi', 'NomeLocalEmissao')?.toString() ?? null
  const localPrestacaoNome = pick<string>(inf, 'xLocPrestacao', 'NomeLocalPrestacao')?.toString() ?? null
  const localIncidenciaIbge = pick<string>(inf, 'cLocIncid', 'CodigoLocalIncidencia')?.toString() ?? null
  const localIncidenciaNome = pick<string>(inf, 'xLocIncid', 'NomeLocalIncidencia')?.toString() ?? null
  const descTributacaoNacional = pick<string>(inf, 'xTribNac', 'DescTributacaoNacional')?.toString() ?? null
  const ambienteGerador = pick<string>(inf, 'ambGer', 'AmbienteGerador')?.toString() ?? null
  const tipoEmissao = pick<string>(inf, 'tpEmis', 'TipoEmissao')?.toString() ?? null
  const cStat = pick<string>(inf, 'cStat', 'Status')?.toString() ?? null
  const dataProcessamento = toDate(pick<string>(inf, 'dhProc', 'DataProcessamento'))
  const numeroDFSe = pick<string>(inf, 'nDFSe', 'NumeroDFSe')?.toString() ?? null

  // ── DPS ──────────────────────────────────────────────────────
  const numeroDPS = pick<string>(dpsInf, 'nDPS', 'NumeroDPS')?.toString() ?? null
  const serieDPS = pick<string>(dpsInf, 'serie', 'SerieDPS')?.toString() ?? null
  const dataEmissaoDPS = toDate(pick<string>(dpsInf, 'dhEmi', 'DataEmissao'))

  // ── Prestador (estruturado) ──────────────────────────────────
  // O regTrib só vem dentro de DPS.infDPS.prest, e algumas infos podem estar
  // tanto em <emit> (cabeçalho) quanto em <prest> (DPS embutido). Combinamos.
  const prestNodeDps = (pick<Record<string, unknown>>(dpsInf, 'prest', 'emit') as Record<string, unknown> | undefined) ?? {}
  const prestRegime = lerRegimeTrib(prestNodeDps)  // regTrib só existe no DPS
  const prestador: PessoaNFSe = {
    cnpjCpf: prestadorCnpj,
    inscricaoMunicipal: pick<string>(prestadorNode, 'IM', 'InscricaoMunicipal', 'inscricaoMunicipal')?.toString() ??
                        pick<string>(prestNodeDps, 'IM', 'InscricaoMunicipal')?.toString() ?? null,
    razaoSocial: prestadorRazao,
    telefone: pick<string>(prestadorNode, 'fone', 'Telefone', 'telefone', 'Contato')?.toString() ??
              pick<string>(prestNodeDps, 'fone', 'Telefone')?.toString() ?? null,
    email: pick<string>(prestadorNode, 'email', 'Email', 'EmailContato')?.toString() ??
           pick<string>(prestNodeDps, 'email', 'Email')?.toString() ?? null,
    endereco: lerEndereco(prestadorNode) ?? lerEndereco(prestNodeDps),
    ...prestRegime,
  }

  // ── Tomador (estruturado) ────────────────────────────────────
  const tomador: PessoaNFSe | null = (!tomadorCnpjCpf && !tomadorRazao) ? null : {
    cnpjCpf: tomadorCnpjCpf,
    inscricaoMunicipal: pick<string>(tomadorNode, 'IM', 'InscricaoMunicipal', 'inscricaoMunicipal')?.toString() ?? null,
    razaoSocial: tomadorRazao,
    telefone: pick<string>(tomadorNode, 'fone', 'Telefone', 'telefone', 'Contato')?.toString() ?? null,
    email: pick<string>(tomadorNode, 'email', 'Email', 'EmailContato')?.toString() ?? null,
    endereco: lerEndereco(tomadorNode),
    opcaoSimplesNacional: null,
    regimeApuracaoSN: null,
    regimeEspecialTributacao: null,
  }

  // ── Intermediário ────────────────────────────────────────────
  const intermNode =
    (pick<Record<string, unknown>>(inf, 'Intermediario', 'IntermediarioServico', 'interm') as Record<string, unknown> | undefined) ??
    (pick<Record<string, unknown>>(dpsInf, 'interm', 'Intermediario') as Record<string, unknown> | undefined)
  const intermediario: PessoaNFSe | null = !intermNode ? null : {
    cnpjCpf: digits(pick<string>(intermNode, 'CNPJ', 'Cnpj', 'CPF', 'Cpf')) || null,
    inscricaoMunicipal: pick<string>(intermNode, 'IM', 'InscricaoMunicipal')?.toString() ?? null,
    razaoSocial: pick<string>(intermNode, 'xNome', 'RazaoSocial')?.toString() ?? null,
    telefone: pick<string>(intermNode, 'fone', 'Telefone')?.toString() ?? null,
    email: pick<string>(intermNode, 'email', 'Email')?.toString() ?? null,
    endereco: lerEndereco(intermNode),
    opcaoSimplesNacional: null,
    regimeApuracaoSN: null,
    regimeEspecialTributacao: null,
  }

  // ── Valores extras ───────────────────────────────────────────
  const baseCalculo =
    toNumber(pick(valoresInfNFSe, 'vBC', 'BaseCalculo', 'baseCalculo')) ??
    toNumber(pick(valoresDps, 'vBC', 'BaseCalculo'))

  // Reaproveita aliquotaIss capturada: se veio como % bruta (5.00), normaliza pra 0.05
  // Aplica heurística: se valor > 1, assume que é %.
  let aliquotaIssNorm = aliquotaIss
  if (aliquotaIssNorm != null && aliquotaIssNorm > 1) aliquotaIssNorm = aliquotaIssNorm / 100

  // Totais aproximados (Lei 12.741)
  const totTribNode = (path(valoresDps, 'trib', 'totTrib', 'vTotTrib') as Record<string, unknown> | undefined) ??
                       (path(valoresInfNFSe, 'totTrib', 'vTotTrib') as Record<string, unknown> | undefined) ?? {}
  const totalTribFed = toNumber(pick(totTribNode, 'vTotTribFed', 'TotalTributosFederais'))
  const totalTribEst = toNumber(pick(totTribNode, 'vTotTribEst', 'TotalTributosEstaduais'))
  const totalTribMun = toNumber(pick(totTribNode, 'vTotTribMun', 'TotalTributosMunicipais'))

  // ── Serviço extras ───────────────────────────────────────────
  // No padrão nacional moderno, cTribNac (cServ) é o item da lista LC 116
  const itemListaServicoNorm = itemListaServico ?? (pick<string>(cServ, 'cTribNac', 'CTribNac')?.toString() ?? null)
  const codigoNBS = pick<string>(cServ, 'cNBS', 'CodigoNBS', 'codigoNBS')?.toString() ?? null
  const codigoTributacaoMunicipal = pick<string>(servicoNode, 'cTribMun', 'CodigoTributacaoMunicipal')?.toString() ?? null

  // ── Tributação Municipal ─────────────────────────────────────
  const tribMun = (path(valoresDps, 'trib', 'tribMun') as Record<string, unknown> | undefined) ?? {}
  const tributacaoISSQN = pick<string>(tribMun, 'tribISSQN', 'TributacaoISSQN')?.toString() ?? null
  const retencaoISSQN = pick<string>(tribMun, 'tpRetISSQN', 'RetencaoISSQN')?.toString() ?? null
  const tipoImunidadeISSQN = pick<string>(tribMun, 'tpImunidade', 'TipoImunidadeISSQN')?.toString() ?? null

  const tribFed = (path(valoresDps, 'trib', 'tribFed') as Record<string, unknown> | undefined) ?? {}
  const piscofins = (pick<Record<string, unknown>>(tribFed, 'piscofins', 'PISCofins') as Record<string, unknown> | undefined) ?? {}
  const pisCofinsCST = pick<string>(piscofins, 'CST', 'cst')?.toString() ?? null

  return {
    // identificação
    chave, numero, serie, codigoVerificacao,
    localEmissaoNome, localPrestacaoNome, localIncidenciaIbge, localIncidenciaNome,
    descTributacaoNacional, ambienteGerador, tipoEmissao, cStat, dataProcessamento, numeroDFSe,
    // DPS
    numeroDPS, serieDPS, dataEmissaoDPS,
    // prestador
    prestadorCnpj, prestadorRazao, prestadorMunicipio, prestador,
    // tomador
    tomadorCnpjCpf, tomadorRazao, tomador,
    // intermediário
    intermediario,
    // valores
    valorServicos, valorIss, valorLiquido, aliquotaIss: aliquotaIssNorm,
    baseCalculo, totalTribFed, totalTribEst, totalTribMun,
    // serviço
    itemListaServico: itemListaServicoNorm, cnae, codigoNBS, codigoTributacaoMunicipal, discriminacao,
    // tributação
    tributacaoISSQN, retencaoISSQN, tipoImunidadeISSQN, pisCofinsCST,
    // datas
    dataEmissao, competencia,
    // status / origem
    status, padrao, municipio,
  }
}
