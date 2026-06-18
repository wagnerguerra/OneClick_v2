import { Injectable } from '@nestjs/common'
import Anthropic from '@anthropic-ai/sdk'
import { OrcamentoService } from './orcamento.service'

/**
 * Assistente de IA do orçamento (Claude / Anthropic).
 *
 * Chat conversacional dentro do detalhe do orçamento: o usuário pede pra
 * "analisar e redigir a proposta" e a IA compõe o texto com base em TODO o
 * contexto do orçamento — itens/valores, mensagens, arquivos (nomes) e o
 * histórico de orçamentos anteriores do cliente (atuais + legado).
 *
 * Reusa o padrão do Helpdesk (HelpdeskAiAgentService): SDK Anthropic, modelo
 * Sonnet 4.6, streaming via callback onEvent (SSE no controller). Degrada
 * graciosamente sem ANTHROPIC_API_KEY (emite evento de erro amigável).
 *
 * Decisão consciente: a IA NÃO grava nada sozinha. Ela só sugere texto; o
 * usuário revisa e clica "Aplicar à proposta" (grava em textoCorpoCliente
 * pelo fluxo tRPC normal).
 */

type StreamEvent = { type: string; [k: string]: unknown }
export type ChatMsg = { role: 'user' | 'assistant'; content: string }
/** Anexo enviado no chat (inline em base64). kind decide o tipo de bloco na API. */
export type AnexoIA = { name: string; mediaType: string; kind: 'image' | 'pdf'; data: string }

@Injectable()
export class OrcamentoAiService {
  /** Sonnet 4.6 — custo-benefício, mesmo do Helpdesk. */
  private readonly MODEL = 'claude-sonnet-4-6'
  private readonly PRICE_INPUT_USD_PER_MTOK = 3
  private readonly PRICE_OUTPUT_USD_PER_MTOK = 15

  private client: Anthropic | null = null

  constructor(private readonly orcamentoService: OrcamentoService) {}

  private getClient(): Anthropic | null {
    if (this.client) return this.client
    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) return null
    this.client = new Anthropic({ apiKey })
    return this.client
  }

  private fmtBRL(v: unknown): string {
    const n = Number(v)
    if (!isFinite(n)) return 'R$ 0,00'
    return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
  }

  private fmtData(d: unknown): string {
    if (!d) return '—'
    const dt = new Date(d as string)
    return isNaN(dt.getTime()) ? '—' : dt.toLocaleDateString('pt-BR', { timeZone: 'UTC' })
  }

  /** Remove tags HTML e entidades comuns, normaliza espaços e trunca. */
  private stripHtml(s: unknown, max = 600): string {
    if (!s) return ''
    let t = String(s)
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&deg;/gi, '°')
      .replace(/&amp;/gi, '&')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&quot;/gi, '"')
      .replace(/[ \t]+/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
    if (t.length > max) t = t.slice(0, max) + '…'
    return t
  }

  /**
   * Monta o bloco de contexto (texto) com tudo que a IA precisa pra redigir a
   * proposta. Retorna null se o orçamento não existir.
   */
  private async montarContexto(orcamentoId: string): Promise<string | null> {
    const orc = await this.orcamentoService.getById(orcamentoId).catch(() => null)
    if (!orc) return null

    const linhas: string[] = []
    const o = orc as Record<string, any>

    // Remetente (empresa contábil)
    if (o.empresa) {
      linhas.push(`## Empresa (remetente da proposta)`)
      linhas.push(`- Razão social: ${o.empresa.razaoSocial ?? '—'}`)
      if (o.empresa.nomeFantasia) linhas.push(`- Nome fantasia: ${o.empresa.nomeFantasia}`)
      linhas.push('')
    }

    // Cliente
    if (o.cliente) {
      linhas.push(`## Cliente (destinatário)`)
      linhas.push(`- Razão social: ${o.cliente.razaoSocial ?? '—'}`)
      if (o.cliente.nomeFantasia) linhas.push(`- Nome fantasia: ${o.cliente.nomeFantasia}`)
      if (o.cliente.documento) linhas.push(`- Documento: ${o.cliente.documento}`)
      linhas.push('')
    }

    // Cabeçalho do orçamento atual
    linhas.push(`## Orçamento atual (#${o.numero})`)
    linhas.push(`- Status: ${o.status}`)
    if (o.tipo) linhas.push(`- Tipo: ${o.tipo}`)
    linhas.push(`- Validade: ${o.validadeDias} dias`)
    if (o.formaPagamento) linhas.push(`- Forma de pagamento: ${o.formaPagamento}`)
    if (o.descontoPct) linhas.push(`- Desconto: ${Number(o.descontoPct)}%`)
    if (o.descontoValor) linhas.push(`- Desconto: ${this.fmtBRL(o.descontoValor)}`)
    linhas.push(`- Total de serviços: ${this.fmtBRL(o.totalServicos)}`)
    linhas.push(`- Total de taxas: ${this.fmtBRL(o.totalTaxas)}`)
    linhas.push(`- Total de despesas: ${this.fmtBRL(o.totalDespesas)}`)
    if (Number(o.descontoAplicado) > 0) linhas.push(`- Desconto aplicado: ${this.fmtBRL(o.descontoAplicado)}`)
    linhas.push(`- TOTAL GERAL: ${this.fmtBRL(o.totalGeral)}`)
    if (o.textoCorpoCliente) linhas.push(`\n- Texto da proposta JÁ existente (para referência/aprimoramento):\n"""${this.stripHtml(o.textoCorpoCliente, 2000)}"""`)
    if (o.observacoes) linhas.push(`- Observações: ${this.stripHtml(o.observacoes, 500)}`)
    linhas.push('')

    // Itens
    const itens = (o.itens ?? []) as any[]
    if (itens.length) {
      linhas.push(`## Itens do orçamento`)
      for (const it of itens) {
        const qtd = Number(it.quantidade)
        const unit = Number(it.valorUnitario)
        const total = qtd * unit
        linhas.push(`- [${it.tipo}] ${it.descricao} — ${qtd} × ${this.fmtBRL(unit)} = ${this.fmtBRL(total)}`)
      }
      linhas.push('')
    }

    // Mensagens (já filtradas por visibilidade no getById)
    const mensagens = (o.mensagens ?? []) as any[]
    if (mensagens.length) {
      linhas.push(`## Mensagens / negociação (mais recentes primeiro)`)
      for (const m of mensagens.slice(0, 20)) {
        const autor = m.usuario?.name ?? 'Sistema'
        const txt = this.stripHtml(m.mensagem, 400)
        if (txt) linhas.push(`- ${this.fmtData(m.createdAt)} · ${autor}: ${txt}`)
      }
      linhas.push('')
    }

    // Arquivos (só nomes/metadados — fase 1)
    const arquivos = (o.arquivos ?? []) as any[]
    if (arquivos.length) {
      linhas.push(`## Arquivos anexados (apenas nomes — conteúdo não lido)`)
      for (const a of arquivos) {
        linhas.push(`- ${a.fileName}${a.mimeType ? ` (${a.mimeType})` : ''}`)
      }
      linhas.push('')
    }

    // Timeline de eventos (resumida)
    const eventos = (o.eventos ?? []) as any[]
    if (eventos.length) {
      linhas.push(`## Histórico de movimentações (este orçamento)`)
      for (const e of eventos.slice(0, 12)) {
        const desc = e.tipo === 'status_change' ? `${e.de ?? '?'} → ${e.para ?? '?'}` : (e.descricao ?? e.tipo)
        linhas.push(`- ${this.fmtData(e.createdAt)}: ${desc}`)
      }
      linhas.push('')
    }

    // Histórico de orçamentos anteriores do cliente — atuais + legado
    if (o.clienteId) {
      const [atuais, legado] = await Promise.all([
        this.orcamentoService.listOrcamentosDoCliente(o.clienteId, orcamentoId).catch(() => [] as any[]),
        this.orcamentoService.listLegadoPorCliente(o.clienteId).catch(() => [] as any[]),
      ])
      if ((atuais as any[]).length) {
        linhas.push(`## Outros orçamentos atuais do mesmo cliente`)
        for (const a of (atuais as any[]).slice(0, 20)) {
          const serv = a.itens?.[0]?.descricao ? ` — ${a.itens[0].descricao}` : ''
          linhas.push(`- #${a.numero} · ${a.status} · ${this.fmtBRL(a.totalGeral)}${serv} (${this.fmtData(a.createdAt)})`)
        }
        linhas.push('')
      }
      if ((legado as any[]).length) {
        linhas.push(`## Orçamentos anteriores (sistema legado) do mesmo cliente`)
        for (const l of (legado as any[]).slice(0, 25)) {
          const serv = this.stripHtml(l.descricao, 120)
          linhas.push(`- #${l.numero} · ${l.status} · ${this.fmtBRL(l.valorTotal)}${serv ? ` — ${serv}` : ''} (${this.fmtData(l.dtNovo)})`)
        }
        linhas.push('')
      }
    }

    return linhas.join('\n')
  }

  private systemPrompt(contexto: string): string {
    return `Você é um assistente comercial de um escritório de contabilidade brasileiro. Sua função é ajudar o time a analisar um orçamento e a redigir o TEXTO DA PROPOSTA que será enviado ao cliente.

Diretrizes:
- Responda SEMPRE em português do Brasil, com tom profissional, cordial e objetivo.
- Quando pedirem para redigir/compor a proposta, escreva o texto FINAL pronto para enviar ao cliente — sem placeholders como "[inserir aqui]". Use os dados reais do contexto (valores, prazos, forma de pagamento, serviços).
- Use o histórico de orçamentos anteriores do cliente para dar contexto de relacionamento (ex.: cliente recorrente, serviços já contratados), mas não exponha valores de outros orçamentos no texto ao cliente a menos que solicitado.
- Não invente serviços, valores ou condições que não estejam no contexto. Se faltar informação essencial, pergunte de forma breve.
- Pode formatar o texto da proposta em HTML simples (parágrafos <p>, <strong>, listas <ul><li>) quando fizer sentido, pois o campo de proposta aceita HTML.
- Seja conciso nas conversas; só produza o texto longo da proposta quando for esse o pedido.

A seguir, todo o contexto do orçamento em questão:

${contexto}`
  }

  /**
   * Executa o chat com streaming. `mensagens` é o histórico da conversa
   * (alternando user/assistant), terminando na última mensagem do usuário.
   * Emite eventos: status, text (delta), done (com custo), error.
   */
  async chatStream(
    orcamentoId: string,
    mensagens: ChatMsg[],
    userId: string | undefined,
    anexos: AnexoIA[],
    onEvent: (e: StreamEvent) => void,
  ): Promise<void> {
    const client = this.getClient()
    if (!client) {
      onEvent({ type: 'error', message: 'ANTHROPIC_API_KEY não configurada — assistente de IA indisponível.' })
      return
    }
    if (!mensagens.length) {
      onEvent({ type: 'error', message: 'Nenhuma mensagem enviada.' })
      return
    }

    onEvent({ type: 'status', stage: 'preparando' })
    const contexto = await this.montarContexto(orcamentoId)
    if (contexto === null) {
      onEvent({ type: 'error', message: 'Orçamento não encontrado.' })
      return
    }

    onEvent({ type: 'status', stage: 'chamando_ia' })
    const start = Date.now()
    let tokensIn = 0
    let tokensOut = 0
    let resposta = ''

    // Monta as mensagens para a API. Anexos (imagens/PDF) entram como blocos
    // na ÚLTIMA mensagem do usuário; as demais permanecem texto puro.
    const lastIdx = mensagens.length - 1
    const anthropicMsgs = mensagens.map((m, i) => {
      if (i === lastIdx && m.role === 'user' && anexos.length) {
        const blocks: Anthropic.Messages.ContentBlockParam[] = []
        for (const a of anexos) {
          if (a.kind === 'image') {
            blocks.push({ type: 'image', source: { type: 'base64', media_type: a.mediaType as 'image/png', data: a.data } })
          } else if (a.kind === 'pdf') {
            blocks.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: a.data } })
          }
        }
        blocks.push({ type: 'text', text: m.content || 'Considere o(s) anexo(s) acima na análise.' })
        return { role: 'user' as const, content: blocks }
      }
      return { role: m.role, content: m.content }
    }) as Anthropic.Messages.MessageParam[]

    try {
      const stream = client.messages.stream({
        model: this.MODEL,
        max_tokens: 4000,
        system: this.systemPrompt(contexto),
        messages: anthropicMsgs,
      })

      stream.on('text', (delta) => {
        if (delta) { resposta += delta; onEvent({ type: 'text', text: delta }) }
      })

      const finalMessage = await stream.finalMessage()
      tokensIn = finalMessage.usage.input_tokens
      tokensOut = finalMessage.usage.output_tokens
    } catch (e) {
      onEvent({ type: 'error', message: (e as Error).message })
      return
    }

    const duracaoMs = Date.now() - start
    const custoUsd = (tokensIn / 1_000_000) * this.PRICE_INPUT_USD_PER_MTOK
                   + (tokensOut / 1_000_000) * this.PRICE_OUTPUT_USD_PER_MTOK

    // Persiste o turno: a última mensagem do usuário + a resposta da IA.
    // (As trocas anteriores já foram gravadas em chamadas anteriores.)
    const ultimaUser = [...mensagens].reverse().find(m => m.role === 'user')
    const aGravar: { role: string; conteudo: string }[] = []
    if (ultimaUser) aGravar.push({ role: 'user', conteudo: ultimaUser.content })
    if (resposta.trim()) aGravar.push({ role: 'assistant', conteudo: resposta })
    if (aGravar.length) {
      await this.orcamentoService.salvarIaMensagens(orcamentoId, userId, aGravar).catch(() => {})
    }

    onEvent({ type: 'done', custoUsd, tokensIn, tokensOut, duracaoMs })
  }
}
