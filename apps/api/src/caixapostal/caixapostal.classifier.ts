/**
 * Classificador Automático de Prioridade para Mensagens da Caixa Postal e-CAC
 *
 * Classifica mensagens com base em metadados, palavras-chave e regras de negócio.
 * Configuração carregada do banco de dados (CaixaPostalConfig).
 */

import type { CaixaPostalPrioridade, CaixaPostalRegra } from '@saas/db'

// ============================================================
// Tipos
// ============================================================

export interface RawMessage {
  isn?: string
  ISN?: string
  id?: string
  assuntoModelo?: string
  origemModelo?: string
  descricaoOrigem?: string
  codigoSistemaRemetente?: string
  dataEnvio?: string
  horaEnvio?: string
  dataValidade?: string
  dataExpiracao?: string
  dataCiencia?: string
  dataLeitura?: string | null
  foiLida?: boolean
  indicadorLeitura?: number | string
  lida?: boolean
  isFavorita?: boolean
  indFavorito?: number | string
  favorito?: boolean
  temAltaRelevancia?: boolean
  relevancia?: string | number
  relevante?: boolean
  numeroControle?: string
  [key: string]: unknown
}

export interface ClassifiedMessage extends RawMessage {
  prioridade: CaixaPostalPrioridade
  score: number
  motivos: string[]
  acao_recomendada: string
  sla_dias: number | null
  prazo_urgente: boolean
  precisa_triagem_humana: boolean
  relevante: boolean
}

// ============================================================
// Configuração do classificador (editável via banco)
// ============================================================

export interface KeywordCategory {
  peso: number
  palavras: string[]
}

export interface ClassifierConfig {
  thresholds: { P0: number; P1: number; P2: number }
  keywords: {
    criticas: KeywordCategory
    medias: KeywordCategory
    baixas: KeywordCategory
  }
  deadline: {
    vencido: number
    urgente: number
    proximo: number
    valido: number
  }
  relevance: {
    alta: number
    indicada: number
  }
  unread: {
    base: number
    ciencia: number
    prazoUrgente: number
  }
  acoesRecomendadas: {
    P0: string
    P1: string
    P2: string
    P3: string
  }
}

export const DEFAULT_CONFIG: ClassifierConfig = {
  thresholds: { P0: 80, P1: 55, P2: 25 },
  keywords: {
    criticas: {
      peso: 30,
      palavras: [
        'INTIMACAO', 'TERMO DE INTIMACAO', 'NOTIFICACAO', 'AUTO DE INFRACAO', 'LANCAMENTO',
        'FISCALIZACAO', 'DILIGENCIA', 'EXIGENCIA', 'PROCESSO', 'PRAZO', 'PENALIDADE',
        'EXCLUSAO', 'SIMPLES', 'DTE', 'DTE-SN', 'PER/DCOMP', 'NAO HOMOLOGACAO', 'COMPENSACAO',
        'DEBITO', 'INSCRICAO', 'COBRANCA', 'MULTA', 'APURACAO', 'DEFERIMENTO', 'INDEFERIMENTO',
      ],
    },
    medias: {
      peso: 15,
      palavras: [
        'PENDENCIA', 'INCONSISTENCIA', 'MALHA', 'DIVERGENCIA', 'REGULARIDADE',
        'CERTIDAO', 'CND', 'CPEND', 'RETIFICACAO', 'COMPLEMENTACAO',
      ],
    },
    baixas: {
      peso: 5,
      palavras: [
        'COMUNICADO', 'ORIENTACAO', 'INFORMATIVO', 'AVISO', 'ATUALIZACAO',
      ],
    },
  },
  deadline: {
    vencido: 50,
    urgente: 40,
    proximo: 25,
    valido: 10,
  },
  relevance: {
    alta: 35,
    indicada: 15,
  },
  unread: {
    base: 10,
    ciencia: 15,
    prazoUrgente: 20,
  },
  acoesRecomendadas: {
    P0: 'Ler imediatamente, registrar tarefa e acionar responsável (Fiscal/Contábil/Jurídico). Verificar prazo e anexos.',
    P1: 'Ler hoje/esta semana e abrir tarefa de tratamento. Verificar prazo e anexos.',
    P2: 'Monitorar e tratar em rotina',
    P3: 'Somente ciência/arquivo',
  },
}

// ============================================================
// Helpers
// ============================================================

function normalizeText(text: string | null | undefined): string {
  if (!text || typeof text !== 'string') return ''
  return text.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim()
}

function parseDateSafe(dateStr: string | null | undefined): Date | null {
  if (!dateStr) return null
  const d = new Date(dateStr)
  if (!isNaN(d.getTime())) return d

  if (typeof dateStr === 'string' && dateStr.length === 8 && /^\d+$/.test(dateStr)) {
    const y = parseInt(dateStr.substring(0, 4))
    const m = parseInt(dateStr.substring(4, 6)) - 1
    const day = parseInt(dateStr.substring(6, 8))
    const d2 = new Date(y, m, day)
    if (!isNaN(d2.getTime())) return d2
  }
  return null
}

function calcularDiasAteData(dataValidade: string | null | undefined, agora: Date): number | null {
  const data = parseDateSafe(dataValidade)
  if (!data) return null
  const hoje = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate())
  const validade = new Date(data.getFullYear(), data.getMonth(), data.getDate())
  return Math.ceil((validade.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24))
}

function detectarKeywords(textoNormalizado: string, cfg: ClassifierConfig): { score: number; motivos: string[] } {
  let score = 0
  const motivos: string[] = []
  const categories: [string, KeywordCategory][] = [
    ['criticas', cfg.keywords.criticas],
    ['medias', cfg.keywords.medias],
    ['baixas', cfg.keywords.baixas],
  ]
  for (const [tipo, config] of categories) {
    for (const palavra of config.palavras) {
      if (textoNormalizado.includes(normalizeText(palavra))) {
        score += config.peso
        const label = tipo === 'criticas' ? 'crítica' : tipo === 'medias' ? 'média' : 'baixa'
        motivos.push(`Keyword ${label} detectada: ${palavra}`)
        break
      }
    }
  }
  return { score, motivos }
}

function foiLida(msg: RawMessage): boolean {
  return msg.foiLida === true || msg.indicadorLeitura === 1 || msg.indicadorLeitura === '1' || msg.dataLeitura != null || msg.lida === true
}

function ehFavorita(msg: RawMessage): boolean {
  return msg.isFavorita === true || msg.indFavorito === 1 || msg.indFavorito === '1' || msg.favorito === true
}

function temAltaRelevancia(msg: RawMessage): boolean {
  return msg.temAltaRelevancia === true || msg.relevancia === 'ALTA' || msg.relevancia === 1 || msg.relevancia === '1' || msg.relevante === true
}

// ============================================================
// Scoring
// ============================================================

function computeScoreAndReasons(msg: RawMessage, cfg: ClassifierConfig, agora: Date) {
  let score = 0
  const motivos: string[] = []
  let prazoUrgente = false
  let slaDias: number | null = null
  let precisaTriagemHumana = false

  // 1) Urgência por prazo
  const dataVal = msg.dataValidade || msg.dataExpiracao
  if (dataVal) {
    slaDias = calcularDiasAteData(dataVal, agora)
    if (slaDias !== null) {
      if (slaDias <= 0) { score += cfg.deadline.vencido; motivos.push('Prazo vencido'); prazoUrgente = true }
      else if (slaDias <= 3) { score += cfg.deadline.urgente; motivos.push(`Prazo urgente (${slaDias}d)`); prazoUrgente = true }
      else if (slaDias <= 10) { score += cfg.deadline.proximo; motivos.push(`Prazo próximo (${slaDias}d)`) }
      else { score += cfg.deadline.valido; motivos.push(`Prazo válido (${slaDias}d)`) }
    }
  }

  // 2) Alta relevância
  if (temAltaRelevancia(msg)) { score += cfg.relevance.alta; motivos.push('Alta relevância (API)') }
  else if (msg.relevancia) { score += cfg.relevance.indicada; motivos.push('Relevância indicada') }

  // 3) Não lida
  const lida = foiLida(msg)
  if (!lida) {
    score += cfg.unread.base; motivos.push('Mensagem não lida')
    if (msg.dataCiencia) { score += cfg.unread.ciencia; motivos.push('Ciência registrada e não lida') }
    if (prazoUrgente) { score += cfg.unread.prazoUrgente; motivos.push('Não lida e prazo urgente') }
  }

  // 4) Palavras-chave
  const textoCompleto = [msg.assuntoModelo || '', msg.origemModelo || '', msg.descricaoOrigem || '', msg.codigoSistemaRemetente || ''].join(' ')
  const textoNorm = normalizeText(textoCompleto)
  const kw = detectarKeywords(textoNorm, cfg)
  score += kw.score
  motivos.push(...kw.motivos)

  // 5) Favorito
  if (ehFavorita(msg)) {
    if (score < cfg.thresholds.P2) score = cfg.thresholds.P2
    motivos.push('Marcada como favorita')
  }

  // 6) Falta de dados
  if (!msg.assuntoModelo && !msg.descricaoOrigem && !temAltaRelevancia(msg) && !dataVal) {
    precisaTriagemHumana = true
    if (score < cfg.thresholds.P2) score = cfg.thresholds.P2
    motivos.push('Dados insuficientes - requer triagem humana')
  }

  return { score: Math.min(100, Math.max(0, Math.round(score))), motivos, prazoUrgente, slaDias, precisaTriagemHumana }
}

function mapearPrioridade(score: number, cfg: ClassifierConfig): CaixaPostalPrioridade {
  if (score >= cfg.thresholds.P0) return 'P0'
  if (score >= cfg.thresholds.P1) return 'P1'
  if (score >= cfg.thresholds.P2) return 'P2'
  return 'P3'
}

function gerarAcaoRecomendada(prioridade: CaixaPostalPrioridade, cfg: ClassifierConfig): string {
  return cfg.acoesRecomendadas[prioridade] || 'Revisar manualmente'
}

// ============================================================
// Aplicar regras personalizadas
// ============================================================

function aplicarRegras(msg: RawMessage, regras: CaixaPostalRegra[]): {
  scoreAdicional: number
  prioridadeMinima: CaixaPostalPrioridade | null
  marcarComoRelevante: boolean
  desconsiderar: boolean
  motivosRegras: string[]
} {
  const regrasAtivas = regras.filter(r => r.ativo)
  let scoreAdicional = 0
  let prioridadeMinima: CaixaPostalPrioridade | null = null
  let marcarComoRelevante = false
  let desconsiderar = false
  const motivosRegras: string[] = []

  const assuntoNorm = normalizeText(msg.assuntoModelo || '')
  const origemNorm = normalizeText(msg.descricaoOrigem || msg.origemModelo || '')
  const codigoSistema = msg.codigoSistemaRemetente || ''

  for (const regra of regrasAtivas) {
    let aplicada = false

    if (regra.palavrasChave) {
      const palavras = regra.palavrasChave.split(',').map(p => p.trim()).filter(Boolean)
      const textoCompleto = `${assuntoNorm} ${origemNorm}`
      if (!palavras.some(p => textoCompleto.includes(normalizeText(p)))) continue
      aplicada = true
    }
    if (regra.origemContem && !origemNorm.includes(normalizeText(regra.origemContem))) continue
    if (regra.origemContem) aplicada = true
    if (regra.assuntoContem && !assuntoNorm.includes(normalizeText(regra.assuntoContem))) continue
    if (regra.assuntoContem) aplicada = true
    if (regra.codigoSistema && codigoSistema !== regra.codigoSistema) continue
    if (regra.codigoSistema) aplicada = true
    if (!regra.palavrasChave && !regra.origemContem && !regra.assuntoContem && !regra.codigoSistema) aplicada = true
    if (!aplicada) continue

    if (regra.tipo === 'DESCONSIDERAR') {
      desconsiderar = true
      motivosRegras.push(`Regra "${regra.nome}": desconsiderada`)
    } else if (regra.tipo === 'PRIORIDADE') {
      scoreAdicional += regra.pesoScore
      if (regra.prioridadeMinima) {
        const ordem: Record<string, number> = { P3: 3, P2: 2, P1: 1, P0: 0 }
        if ((ordem[regra.prioridadeMinima] ?? 3) < (ordem[prioridadeMinima ?? 'P3'] ?? 3)) {
          prioridadeMinima = regra.prioridadeMinima
        }
      }
      motivosRegras.push(`Regra "${regra.nome}": +${regra.pesoScore} pontos`)
    } else if (regra.tipo === 'RELEVANCIA') {
      if (regra.marcarRelevante) marcarComoRelevante = true
      scoreAdicional += regra.pesoScore
      motivosRegras.push(`Regra "${regra.nome}": relevante`)
    }
  }

  return { scoreAdicional, prioridadeMinima, marcarComoRelevante, desconsiderar, motivosRegras }
}

// ============================================================
// API pública
// ============================================================

export async function classificarMensagens(
  mensagens: RawMessage[],
  regras: CaixaPostalRegra[],
  config?: ClassifierConfig,
  agora = new Date(),
): Promise<ClassifiedMessage[]> {
  if (!Array.isArray(mensagens) || mensagens.length === 0) return []

  const cfg = config ?? DEFAULT_CONFIG

  const classificadas: (ClassifiedMessage | null)[] = mensagens.map(msg => {
    const { score, motivos, prazoUrgente, slaDias, precisaTriagemHumana } = computeScoreAndReasons(msg, cfg, agora)

    let scoreFinal = score
    const motivosFinal = [...motivos]
    let marcarRelevante = false
    let desconsiderar = false

    // Aplicar regras personalizadas
    if (regras.length > 0) {
      const r = aplicarRegras(msg, regras)
      scoreFinal += r.scoreAdicional
      motivosFinal.push(...r.motivosRegras)
      if (r.marcarComoRelevante) marcarRelevante = true
      if (r.desconsiderar) desconsiderar = true

      if (r.prioridadeMinima) {
        const ordem: Record<string, number> = { P0: 0, P1: 1, P2: 2, P3: 3 }
        const prioridadeCalculada = mapearPrioridade(scoreFinal, cfg)
        if ((ordem[r.prioridadeMinima] ?? 3) < (ordem[prioridadeCalculada] ?? 3)) {
          scoreFinal = Math.max(scoreFinal, cfg.thresholds[r.prioridadeMinima as keyof typeof cfg.thresholds] ?? 0)
        }
      }
    }

    if (desconsiderar) return null

    const prioridade = mapearPrioridade(scoreFinal, cfg)
    const textoNorm = normalizeText([msg.assuntoModelo || '', msg.origemModelo || '', msg.descricaoOrigem || ''].join(' '))
    const temCriticas = cfg.keywords.criticas.palavras.some(p => textoNorm.includes(normalizeText(p)))

    return {
      ...msg,
      prioridade,
      score: Math.min(100, Math.max(0, Math.round(scoreFinal))),
      motivos: motivosFinal,
      acao_recomendada: temCriticas && (prioridade === 'P0' || prioridade === 'P1')
        ? gerarAcaoRecomendada(prioridade, cfg)
        : gerarAcaoRecomendada(prioridade, cfg),
      sla_dias: slaDias,
      prazo_urgente: prazoUrgente,
      precisa_triagem_humana: precisaTriagemHumana,
      relevante: marcarRelevante || msg.relevante || false,
    }
  })

  const filtradas = classificadas.filter((m): m is ClassifiedMessage => m !== null)

  // Ordenar: P0 primeiro, prazo urgente, menor SLA, maior score
  filtradas.sort((a, b) => {
    const ordem: Record<string, number> = { P0: 0, P1: 1, P2: 2, P3: 3 }
    const dp = (ordem[a.prioridade] ?? 3) - (ordem[b.prioridade] ?? 3)
    if (dp !== 0) return dp
    if (a.prazo_urgente !== b.prazo_urgente) return a.prazo_urgente ? -1 : 1
    if (a.sla_dias !== b.sla_dias) {
      if (a.sla_dias === null) return 1
      if (b.sla_dias === null) return -1
      return a.sla_dias - b.sla_dias
    }
    return b.score - a.score
  })

  return filtradas
}
