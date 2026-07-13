import { Injectable } from '@nestjs/common'
import Anthropic from '@anthropic-ai/sdk'

/**
 * Geração do parecer narrativo da Reforma Tributária (Claude / Anthropic).
 *
 * Reusa o padrão do OrcamentoAiService: SDK Anthropic, modelo Sonnet 4.6,
 * degrada graciosamente sem ANTHROPIC_API_KEY. Recebe a simulação estruturada
 * (cenários, transição ano a ano, sensibilidade, créditos, confiabilidade) e
 * devolve uma narrativa cliente-facing em pt-BR.
 *
 * Decisão consciente (igual ao resto do produto): a IA NÃO grava nada. Devolve
 * o texto; o humano revisa/edita antes de enviar ao cliente.
 */

// Forma estrutural mínima da simulação (evita acoplar ao tipo interno do service).
interface SimulacaoLike {
  cliente?: { razaoSocial?: string; tributacao?: string | null; cnaePrincipal?: string | null }
  metrics?: { faturamento12m?: number; fontePrincipal?: string; creditos?: { baseCreditavel12m?: number; baseRevisao12m?: number; baseNaoCreditavel12m?: number; confianca?: string } }
  cenarios?: { simplesDentro?: { cargaEstimativa?: number }; regular?: { cargaEstimativa?: number; creditoTransferidoCliente?: number }; diferenca?: number }
  transicao?: { isSimples?: boolean; cargaAtual?: number; observacao?: string; anos?: Array<{ ano: number; cargaReforma: number; delta: number }> }
  sensibilidade?: Array<{ label: string; diferenca: number; recomendacao: string }>
  confiabilidade?: { nivel?: string; score?: number; pendencias?: string[] }
  regraSetorial?: { premissaNome?: string; origem?: string }
  premissas?: { premissaNome?: string }
  planoAcao?: string[]
  recomendacao?: string
  resumo?: { texto?: string }
}

@Injectable()
export class ReformaAiService {
  private readonly MODEL = 'claude-sonnet-4-6'
  private client: Anthropic | null = null

  private getClient(): Anthropic | null {
    if (this.client) return this.client
    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) return null
    this.client = new Anthropic({ apiKey })
    return this.client
  }

  private fmt(v: unknown): string {
    const n = Number(v)
    if (!Number.isFinite(n)) return 'R$ 0,00'
    return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
  }

  private montarContexto(s: SimulacaoLike): string {
    const l: string[] = []
    l.push(`Cliente: ${s.cliente?.razaoSocial ?? '—'}`)
    l.push(`Regime atual: ${s.cliente?.tributacao ?? 'não informado'}`)
    if (s.cliente?.cnaePrincipal) l.push(`CNAE principal: ${s.cliente.cnaePrincipal}`)
    l.push(`Faturamento (12 meses): ${this.fmt(s.metrics?.faturamento12m)}`)
    l.push(`Fonte dos dados: ${s.metrics?.fontePrincipal ?? '—'}`)
    l.push('')
    l.push('Comparativo de carga:')
    l.push(`- IBS/CBS dentro do Simples: ${this.fmt(s.cenarios?.simplesDentro?.cargaEstimativa)}`)
    l.push(`- Apuração regular: ${this.fmt(s.cenarios?.regular?.cargaEstimativa)}`)
    l.push(`- Crédito transferível ao cliente B2B (regular): ${this.fmt(s.cenarios?.regular?.creditoTransferidoCliente)}`)
    l.push(`- Diferença ajustada entre cenários: ${this.fmt(s.cenarios?.diferenca)}`)
    l.push('')
    if (s.transicao?.anos?.length) {
      l.push(`Carga atual estimada (hoje): ${this.fmt(s.transicao.cargaAtual)}${s.transicao.isSimples ? ' (DAS)' : ''}`)
      l.push('Transição ano a ano (carga projetada / variação vs hoje):')
      for (const a of s.transicao.anos) {
        l.push(`- ${a.ano}: ${this.fmt(a.cargaReforma)} (${a.delta >= 0 ? '+' : ''}${this.fmt(a.delta)})`)
      }
      if (s.transicao.observacao) l.push(`Nota da transição: ${s.transicao.observacao}`)
      l.push('')
    }
    l.push('Créditos (base 12 meses):')
    l.push(`- Creditável: ${this.fmt(s.metrics?.creditos?.baseCreditavel12m)} (confiança ${s.metrics?.creditos?.confianca ?? '—'})`)
    l.push(`- Em revisão: ${this.fmt(s.metrics?.creditos?.baseRevisao12m)}`)
    l.push(`- Não creditável: ${this.fmt(s.metrics?.creditos?.baseNaoCreditavel12m)}`)
    l.push('')
    if (s.sensibilidade?.length) {
      l.push('Sensibilidade:')
      for (const it of s.sensibilidade) l.push(`- ${it.label}: diferença ${this.fmt(it.diferenca)} (${it.recomendacao})`)
      l.push('')
    }
    l.push(`Confiabilidade técnica: ${s.confiabilidade?.nivel ?? '—'} (${s.confiabilidade?.score ?? 0}%)`)
    if (s.confiabilidade?.pendencias?.length) l.push(`Pendências: ${s.confiabilidade.pendencias.join('; ')}`)
    if (s.regraSetorial?.premissaNome || s.regraSetorial?.origem) {
      l.push(`Regra setorial: ${s.regraSetorial.premissaNome ?? s.regraSetorial.origem}`)
    }
    if (s.premissas?.premissaNome) l.push(`Premissa aplicada: ${s.premissas.premissaNome}`)
    l.push(`Recomendação do sistema: ${s.recomendacao ?? '—'} — ${s.resumo?.texto ?? ''}`)
    if (s.planoAcao?.length) {
      l.push('')
      l.push('Plano de ação técnico sugerido:')
      for (const p of s.planoAcao) l.push(`- ${p}`)
    }
    return l.join('\n')
  }

  async gerarParecerNarrativo(simulacao: SimulacaoLike): Promise<string> {
    const client = this.getClient()
    if (!client) {
      throw new Error('Parecer por IA indisponível: configure ANTHROPIC_API_KEY no servidor.')
    }

    const sistema = [
      'Você é um consultor tributário sênior de um escritório de contabilidade, escrevendo um parecer sobre o impacto da Reforma Tributária (IBS/CBS/IS, LC 214/2025) para um cliente.',
      'A partir dos dados estruturados fornecidos, redija um parecer claro, profissional e acessível em português do Brasil, organizado em seções:',
      '1) Situação atual do cliente; 2) O que muda com a reforma; 3) Impacto estimado ano a ano na transição (2026–2033); 4) Recomendação; 5) Próximos passos.',
      'Use os números fornecidos (não invente valores). Explique em linguagem que o empresário entenda, sem jargão excessivo.',
      'Seja honesto sobre incertezas: deixe explícito que os valores são estimativas baseadas em premissas parametrizadas e nos dados disponíveis, e que não substituem a validação final do responsável técnico e a legislação/regulamentação vigente.',
      'Não use markdown pesado; texto corrido com títulos de seção curtos. Máximo ~500 palavras.',
    ].join(' ')

    const resp = await client.messages.create({
      model: this.MODEL,
      max_tokens: 2500,
      system: sistema,
      messages: [{ role: 'user', content: this.montarContexto(simulacao) }],
    })

    const texto = resp.content
      .filter((c): c is Anthropic.TextBlock => c.type === 'text')
      .map(c => c.text)
      .join('\n')
      .trim()
    if (!texto) throw new Error('A IA não retornou texto para o parecer.')
    return texto
  }
}
