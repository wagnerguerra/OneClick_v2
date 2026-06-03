import { Injectable } from '@nestjs/common'
import Anthropic from '@anthropic-ai/sdk'
import { prisma } from '@saas/db'

/**
 * Triagem automática de tickets do helpdesk usando Claude (Anthropic API).
 *
 * Fluxo:
 *   1. Ticket criado → enfileira processamento
 *   2. processarTicket carrega contexto (FAQ slugs, dados do ticket)
 *   3. Chama Claude com `tool_use` forçando resposta JSON estruturada
 *   4. Se 'simples' + resposta útil:
 *        - Adiciona mensagem pública no ticket (autor = user-sistema "IA")
 *        - Move status pra AGUARDANDO_AUDITORIA
 *        - Atribui pra o user-sistema da IA
 *   5. Se 'complexo':
 *        - Adiciona nota interna com o raciocínio (sugestão de categoria/prioridade)
 *        - Status fica em NOVO (humano atua)
 *   6. Auditoria: salva HelpdeskAiDecision com tokens, custo e latência
 *
 * Falha silenciosa: erros são logados em HelpdeskAiDecision (complexidade='erro')
 * mas NÃO interrompem o fluxo de criação do ticket — o usuário sempre vê o
 * ticket criado normalmente, com ou sem a triagem da IA.
 */
@Injectable()
export class HelpdeskAiAgentService {
  /** Modelo default — Sonnet 4.6 é o mais novo da família Sonnet (custo-benefício). */
  private readonly MODEL = 'claude-sonnet-4-6'
  /** Preços por milhão de tokens (USD) — Sonnet 4.6 atual. */
  private readonly PRICE_INPUT_USD_PER_MTOK = 3
  private readonly PRICE_OUTPUT_USD_PER_MTOK = 15

  private client: Anthropic | null = null

  private getClient(): Anthropic | null {
    if (this.client) return this.client
    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) return null
    this.client = new Anthropic({ apiKey })
    return this.client
  }

  /**
   * Get-or-create do user-sistema da IA. Toda mensagem/atribuição criada
   * pela IA usa esse user como autor. Email fixo + isAi=true pra a UI
   * exibir badge especial.
   */
  private async ensureAiUser(): Promise<{ id: string; name: string }> {
    const email = 'ia-assistente@central-rnc.com.br'
    const existing = await prisma.user.findUnique({ where: { email }, select: { id: true, name: true } })
    if (existing) return existing
    const created = await prisma.user.create({
      data: {
        email,
        name: 'IA Assistente',
        emailVerified: true,
        isAi: true,
        isActive: true,
        role: 'COLABORADOR_INTERNO',
      },
      select: { id: true, name: true },
    })
    return created
  }

  /**
   * Lista os slugs dos módulos cobertos pelo FAQ — usados como referência
   * no system prompt pra que o modelo conheça os tópicos do produto.
   * Lê /apps/web/src/app/(dashboard)/faq/* em runtime; cacheada.
   */
  private faqSlugsCache: string[] | null = null
  private async listarFaqSlugs(): Promise<string[]> {
    if (this.faqSlugsCache) return this.faqSlugsCache
    try {
      const fs = await import('node:fs/promises')
      const path = await import('node:path')
      const faqDir = path.resolve(process.cwd(), 'apps/web/src/app/(dashboard)/faq')
      const entries = await fs.readdir(faqDir, { withFileTypes: true })
      this.faqSlugsCache = entries
        .filter(e => e.isDirectory() && !e.name.startsWith('_') && !e.name.startsWith('.'))
        .map(e => e.name)
        .sort()
      return this.faqSlugsCache
    } catch {
      this.faqSlugsCache = []
      return []
    }
  }

  /**
   * System prompt — contexto do produto + regras de comportamento.
   * Mantido curto e direto pra economizar tokens de input em cada ticket.
   */
  private async buildSystemPrompt(): Promise<string> {
    const slugs = await this.listarFaqSlugs()
    const topicosCobertos = slugs.length > 0
      ? `\n\nTópicos cobertos pelo FAQ interno (mencione ao usuário se for o caso):\n${slugs.map(s => `- ${s}`).join('\n')}`
      : ''

    return `Você é o assistente automático do helpdesk do **OneClick**, um SaaS ERP/CRM da Central Contábil que atende escritórios contábeis.

Sua função é fazer a TRIAGEM INICIAL de tickets recém-criados. Classifique como:

- **simples**: pergunta de FAQ, dúvida operacional comum, erro óbvio com solução conhecida. Você responde diretamente e o ticket vai pra "Aguardando auditoria" (revisão humana).
- **complexo**: bug técnico específico, problema que exige acesso ao banco/código, pedido de feature, dúvida que envolve dados sensíveis do usuário. Você NÃO responde — só sugere categoria/prioridade. O ticket continua aberto pra humano atender.

REGRAS:
1. NUNCA invente funcionalidades. Se não souber, marque como 'complexo' e deixe pra humano.
2. NUNCA prometa prazos. Apenas explique como fazer/onde clicar.
3. Sempre em português brasileiro, tom cordial mas direto. Máximo 3 parágrafos curtos.
4. Se o ticket mencionar dados de cliente/sócio/CPF/CNPJ específicos, marque como 'complexo' (privacidade).
5. Bugs reproduzíveis (\"clico em X e dá erro Y\") → quase sempre 'complexo'.
6. Sugira a categoria mais provável baseada na página de origem (vem no fim da descrição como \`Página: /xxx\`).${topicosCobertos}

Use a tool \`responder_triagem\` pra estruturar sua resposta.`
  }

  /**
   * Processa um ticket recém-criado. Idempotente: se já foi processado
   * (existe HelpdeskAiDecision pra ele), só loga e ignora.
   */
  async processarTicket(ticketId: string): Promise<void> {
    const client = this.getClient()
    if (!client) {
      console.warn('[HelpdeskAI] ANTHROPIC_API_KEY não configurada — triagem desativada')
      return
    }

    // Idempotência: se já processado, não duplica
    const jaProcessado = await prisma.helpdeskAiDecision.findFirst({
      where: { ticketId, complexidade: { not: 'erro' } },
    })
    if (jaProcessado) {
      console.log(`[HelpdeskAI] Ticket ${ticketId} já processado anteriormente — pulando`)
      return
    }

    const ticket = await prisma.helpdeskTicket.findUnique({
      where: { id: ticketId },
      select: {
        id: true, numero: true, titulo: true, descricao: true, tipo: true,
        prioridade: true, status: true,
        categoria: { select: { id: true, nome: true } },
        solicitante: { select: { id: true, name: true } },
      },
    })
    if (!ticket) return
    if (ticket.status !== 'NOVO') {
      console.log(`[HelpdeskAI] Ticket ${ticketId} já saiu de NOVO — pulando`)
      return
    }

    const start = Date.now()
    const systemPrompt = await this.buildSystemPrompt()

    const userContent = `**Ticket #HLP${String(ticket.numero).padStart(4, '0')}**
Tipo: ${ticket.tipo}
Prioridade atual: ${ticket.prioridade}
Categoria: ${ticket.categoria?.nome ?? '(sem categoria)'}
Solicitante: ${ticket.solicitante?.name ?? '(externo)'}

Título: ${ticket.titulo}

Descrição:
${ticket.descricao.slice(0, 4000)}`

    try {
      const resp = await client.messages.create({
        model: this.MODEL,
        max_tokens: 1500,
        system: systemPrompt,
        tools: [{
          name: 'responder_triagem',
          description: 'Devolve a triagem estruturada do ticket',
          input_schema: {
            type: 'object',
            properties: {
              complexidade: {
                type: 'string',
                enum: ['simples', 'complexo'],
                description: 'simples = você responde e move pra auditoria; complexo = humano atende',
              },
              categoria_sugerida: {
                type: 'string',
                description: 'Categoria provável (ex.: "Agenda", "Orçamentos", "Helpdesk", "Clientes"). Use null se não souber.',
              },
              prioridade_sugerida: {
                type: 'string',
                enum: ['BAIXA', 'MEDIA', 'ALTA', 'URGENTE'],
                description: 'Reavaliação da prioridade baseada na descrição',
              },
              resposta_proposta: {
                type: 'string',
                description: 'Mensagem em PT-BR pra publicar no ticket (markdown leve OK). OBRIGATÓRIO se complexidade=simples; null se complexo.',
              },
              raciocinio: {
                type: 'string',
                description: '2-3 frases explicando a decisão (visível só pra TI como nota interna)',
              },
            },
            required: ['complexidade', 'prioridade_sugerida', 'raciocinio'],
          },
        }],
        tool_choice: { type: 'tool', name: 'responder_triagem' },
        messages: [{ role: 'user', content: userContent }],
      })

      // Extrai o tool_use block
      const toolUse = resp.content.find(c => c.type === 'tool_use')
      if (!toolUse || toolUse.type !== 'tool_use') throw new Error('Resposta sem tool_use')

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const decisao: any = toolUse.input
      const duracaoMs = Date.now() - start
      const tokensIn = resp.usage.input_tokens
      const tokensOut = resp.usage.output_tokens
      const custoUsd = (tokensIn / 1_000_000) * this.PRICE_INPUT_USD_PER_MTOK
                     + (tokensOut / 1_000_000) * this.PRICE_OUTPUT_USD_PER_MTOK

      // Aplica ações conforme complexidade
      const aiUser = await this.ensureAiUser()

      if (decisao.complexidade === 'simples' && decisao.resposta_proposta) {
        // Mensagem pública no ticket
        await prisma.helpdeskMensagem.create({
          data: {
            ticketId: ticket.id,
            autorId: aiUser.id,
            conteudo: String(decisao.resposta_proposta),
            interna: false,
          },
        })
        // Atualiza status pra auditoria + atribui pra IA
        await prisma.helpdeskTicket.update({
          where: { id: ticket.id },
          data: {
            status: 'AGUARDANDO_AUDITORIA',
            responsavelId: aiUser.id,
            primeiroAtendimentoEm: new Date(),
            prioridade: decisao.prioridade_sugerida ?? ticket.prioridade,
          },
        })
        await prisma.helpdeskEvento.create({
          data: {
            ticketId: ticket.id,
            autorId: aiUser.id,
            tipo: 'status_alterado',
            descricao: 'IA respondeu o ticket — aguardando auditoria',
            metadata: { raciocinio: decisao.raciocinio ?? null },
          },
        })
      } else {
        // Complexo — só registra raciocínio como nota interna pra TI revisar
        await prisma.helpdeskEvento.create({
          data: {
            ticketId: ticket.id,
            autorId: aiUser.id,
            tipo: 'nota_interna',
            descricao: `🤖 Triagem IA (complexo): ${decisao.raciocinio ?? '(sem raciocínio)'}\nCategoria sugerida: ${decisao.categoria_sugerida ?? '—'}\nPrioridade sugerida: ${decisao.prioridade_sugerida ?? '—'}`,
            metadata: decisao as object,
          },
        })
      }

      await prisma.helpdeskAiDecision.create({
        data: {
          ticketId: ticket.id,
          modelo: this.MODEL,
          complexidade: String(decisao.complexidade),
          decisao: decisao as object,
          tokensInput: tokensIn,
          tokensOutput: tokensOut,
          custoUsd,
          duracaoMs,
        },
      })

      console.log(`[HelpdeskAI] #HLP${String(ticket.numero).padStart(4, '0')} processado: ${decisao.complexidade} (${duracaoMs}ms, $${custoUsd.toFixed(4)})`)
    } catch (e) {
      const erro = (e as Error).message
      console.error(`[HelpdeskAI] Falha ao processar ticket ${ticketId}:`, erro)
      await prisma.helpdeskAiDecision.create({
        data: {
          ticketId: ticket.id,
          modelo: this.MODEL,
          complexidade: 'erro',
          duracaoMs: Date.now() - start,
          erro: erro.slice(0, 1000),
        },
      }).catch(() => {})
    }
  }
}
