import { Injectable } from '@nestjs/common'
import Anthropic from '@anthropic-ai/sdk'
import { prisma } from '@saas/db'

/**
 * Triagem automática de tickets do helpdesk usando Claude (Anthropic API).
 *
 * Fluxo (#HLP0083 — refeito):
 *   1. Ticket criado → enfileira processamento (fire-and-forget)
 *   2. calcularScore() aplica regras de peso (descrição, anexos, categoria, tipo)
 *      sem consultar a API. Tickets abaixo do scoreThreshold são marcados como
 *      não-elegíveis e NÃO GASTAM CRÉDITO.
 *   3. Score ≥ threshold → chama Claude pra gerar PLANO DE RESOLUÇÃO (não
 *      mais "resposta direta ao usuário"). Plano em markdown + metadados
 *      (arquivos, riscos, tempo estimado).
 *   4. Plano gravado em ticket.aiPlano, status → AGUARDANDO_AUDITORIA.
 *      Operador (Wagner) revisa e aprova/rejeita.
 *   5. Aprovar: vira mensagem oficial, status → EM_ANDAMENTO. Operador
 *      executa o plano manualmente na próxima rodada de desenvolvimento.
 *      Sem auto-deploy (decisão consciente — IA não tem permissão de
 *      escrever direto no repo de produção).
 *   6. Rejeitar: motivo registrado como nota interna, status → NOVO,
 *      humano trata normalmente.
 *
 * Auditoria: cada chamada gera HelpdeskAiDecision com tokens/custo/duração.
 *
 * Falha silenciosa: erros são logados em HelpdeskAiDecision (complexidade='erro')
 * mas NÃO interrompem o fluxo de criação do ticket.
 */

/**
 * Regras de peso default — aplicadas se HelpdeskAiConfig.regrasPeso for null.
 * Master pode sobrescrever via /configuracoes → Helpdesk → Triagem IA.
 */
const DEFAULT_REGRAS_PESO = {
  faixasChars: [
    { min: 0,    max: 50,    pontos: 0  },
    { min: 50,   max: 200,   pontos: 10 },
    { min: 200,  max: 1000,  pontos: 20 },
    { min: 1000, max: null,  pontos: 15 },
  ],
  faixasAnexos: [
    { min: 0, max: 0,    pontos: 0  },
    { min: 1, max: 1,    pontos: 10 },
    { min: 2, max: null, pontos: 15 },
  ],
  bonusCategoria: 5,
  pesosTipo: { DUVIDA: 15, INCIDENTE: 10, REQUISICAO: 10, MELHORIA: 0 } as Record<string, number>,
}

interface Faixa { min: number; max: number | null; pontos: number }
interface RegrasPeso {
  faixasChars: Faixa[]
  faixasAnexos: Faixa[]
  bonusCategoria: number
  pesosTipo: Record<string, number>
}

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
   * Agora pede PLANO DE RESOLUÇÃO ao invés de resposta direta ao usuário.
   */
  private async buildSystemPrompt(): Promise<string> {
    const slugs = await this.listarFaqSlugs()
    const topicos = slugs.length > 0
      ? `\n\nMódulos do produto (use como referência ao indicar arquivos):\n${slugs.map(s => `- apps/web/src/app/(dashboard)/${s}/`).join('\n')}`
      : ''

    return `Você é o assistente técnico do helpdesk do **OneClick** (SaaS ERP/CRM da Central Contábil). Stack: Next.js 15 App Router + NestJS + tRPC + Prisma + Postgres.

Sua função é gerar um **PLANO DE RESOLUÇÃO** pra cada ticket — passos concretos que o desenvolvedor (Wagner) executará manualmente.

NÃO responda ao usuário final. Você fala apenas com o desenvolvedor.

Para cada ticket, devolva via tool \`gerar_plano_resolucao\`:

- **plano_resolucao** (markdown): passos numerados, do mais simples ao mais complexo. Linguagem direta, sem floreio. Indique caminhos de arquivo prováveis quando souber. Se for bug, sugira hipótese de causa-raiz antes do fix.
- **arquivos_envolvidos**: array de paths relativos ao repo (ex.: "apps/web/src/app/(dashboard)/agenda/page.tsx"). Vazio se não tiver certeza.
- **riscos**: 1-2 frases sobre o que pode quebrar (regressões, dados, integrações). "Sem riscos relevantes" se for trivial.
- **tempo_estimado**: faixa curta tipo "15min", "1-2h", "meio dia".
- **raciocinio**: 2-3 frases sobre por que esse plano e não outro.
- **elegivel_para_plano** (boolean): false se for absurdamente vago, ambíguo, ou pedido fora de escopo (ex.: "fazer site novo"). Nesse caso, NÃO precisa preencher os outros campos — só o raciocínio explicando por quê.

REGRAS DURAS:
1. NUNCA invente arquivos. Se não souber, deixe arquivos_envolvidos = [].
2. NUNCA prometa que algo "vai funcionar". Você sugere; o dev decide.
3. Sempre em português brasileiro, tom técnico mas conciso. Plano máximo 10 passos.
4. Se ticket mencionar dados sensíveis (CPF, CNPJ, senha específica), o plano deve evitar manipular esses dados diretamente.${topicos}`
  }

  // ============================================================
  // Config (HelpdeskAiConfig)
  // ============================================================

  /** Lê (ou cria com defaults) a configuração singleton. */
  async getConfig() {
    const existing = await prisma.helpdeskAiConfig.findFirst()
    if (existing) return existing
    return prisma.helpdeskAiConfig.create({ data: {} })
  }

  /** Lê config + parseia regrasPeso (com fallback pros defaults). */
  private async getRegrasPeso(): Promise<RegrasPeso> {
    const config = await this.getConfig()
    if (!config.regrasPeso) return DEFAULT_REGRAS_PESO
    try {
      const parsed = config.regrasPeso as unknown as Partial<RegrasPeso>
      return {
        faixasChars:    Array.isArray(parsed.faixasChars)  && parsed.faixasChars.length  > 0 ? parsed.faixasChars  : DEFAULT_REGRAS_PESO.faixasChars,
        faixasAnexos:   Array.isArray(parsed.faixasAnexos) && parsed.faixasAnexos.length > 0 ? parsed.faixasAnexos : DEFAULT_REGRAS_PESO.faixasAnexos,
        bonusCategoria: typeof parsed.bonusCategoria === 'number' ? parsed.bonusCategoria : DEFAULT_REGRAS_PESO.bonusCategoria,
        pesosTipo:      (parsed.pesosTipo && typeof parsed.pesosTipo === 'object') ? parsed.pesosTipo : DEFAULT_REGRAS_PESO.pesosTipo,
      }
    } catch {
      return DEFAULT_REGRAS_PESO
    }
  }

  async updateConfig(data: {
    enabled?: boolean
    capUsdMensal?: number
    minCharsDescricao?: number
    maxCharsDescricao?: number
    scoreThreshold?: number
    regrasPeso?: RegrasPeso | null
  }) {
    const patch: Record<string, unknown> = {}
    if (typeof data.enabled === 'boolean') patch.enabled = data.enabled
    if (typeof data.capUsdMensal === 'number') patch.capUsdMensal = Math.max(0, data.capUsdMensal)
    if (typeof data.minCharsDescricao === 'number') patch.minCharsDescricao = Math.max(0, Math.round(data.minCharsDescricao))
    if (typeof data.maxCharsDescricao === 'number') patch.maxCharsDescricao = Math.max(100, Math.round(data.maxCharsDescricao))
    if (typeof data.scoreThreshold === 'number') patch.scoreThreshold = Math.max(0, Math.round(data.scoreThreshold))
    if (data.regrasPeso !== undefined) patch.regrasPeso = data.regrasPeso as object | null
    const existing = await prisma.helpdeskAiConfig.findFirst()
    if (existing) {
      return prisma.helpdeskAiConfig.update({ where: { id: existing.id }, data: patch })
    }
    return prisma.helpdeskAiConfig.create({ data: patch })
  }

  /** Soma do gasto USD do mês corrente — usado pra impor o cap mensal. */
  async gastoUsdMesAtual(): Promise<number> {
    const inicioMes = new Date()
    inicioMes.setDate(1)
    inicioMes.setHours(0, 0, 0, 0)
    const agg = await prisma.helpdeskAiDecision.aggregate({
      where: { createdAt: { gte: inicioMes } },
      _sum: { custoUsd: true },
    })
    return Number(agg._sum.custoUsd ?? 0)
  }

  // ============================================================
  // Score
  // ============================================================

  /**
   * Calcula o score de elegibilidade de um ticket APLICANDO AS REGRAS LOCAIS.
   * Nenhuma chamada à API aqui — é só matemática sobre os dados do ticket.
   */
  private async calcularScore(input: {
    descricao: string
    tipo: string
    categoriaId: string | null
    anexosCount: number
  }, regras: RegrasPeso): Promise<{ score: number; breakdown: Record<string, number> }> {
    const chars = input.descricao.replace(/<[^>]+>/g, '').trim().length
    const ptsChars = this.pontosNaFaixa(regras.faixasChars, chars)
    const ptsAnexos = this.pontosNaFaixa(regras.faixasAnexos, input.anexosCount)
    const ptsCategoria = input.categoriaId ? regras.bonusCategoria : 0
    const ptsTipo = regras.pesosTipo[input.tipo] ?? 0
    const score = ptsChars + ptsAnexos + ptsCategoria + ptsTipo
    return {
      score,
      breakdown: { chars: ptsChars, anexos: ptsAnexos, categoria: ptsCategoria, tipo: ptsTipo },
    }
  }

  private pontosNaFaixa(faixas: Faixa[], valor: number): number {
    for (const f of faixas) {
      const dentroMin = valor >= f.min
      const dentroMax = f.max === null || f.max === undefined || valor <= f.max
      if (dentroMin && dentroMax) return f.pontos
    }
    return 0
  }

  // ============================================================
  // Processamento principal
  // ============================================================

  /**
   * Processa um ticket — chamado automaticamente no create() do ticket.
   *
   * Sequência:
   *  1. Idempotência (skip se já decidido)
   *  2. Calcular score → salva ticket.aiScore sempre
   *  3. Se score < threshold → marca aiElegivel=false, registra evento, NÃO chama API
   *  4. Se score ≥ threshold → marca aiElegivel=true, aplica defesas (enabled, cap)
   *  5. Chama Claude pra gerar plano
   *  6. Salva plano + status → AGUARDANDO_AUDITORIA OU registra "não consegui planejar"
   *  7. Sempre grava HelpdeskAiDecision
   *
   * @param opts.forcar — quando true (operador clicou "Processar com IA" no detalhe),
   *   pula a checagem de idempotência E o gate de score baixo. Mantém cap mensal +
   *   enabled + min/max chars (gates de custo). Aceita ticket fora de NOVO também.
   */
  async processarTicket(ticketId: string, opts?: { forcar?: boolean }): Promise<void> {
    const forcar = opts?.forcar === true

    if (!forcar) {
      // Idempotência: se já processado (sucesso), não duplica
      const jaProcessado = await prisma.helpdeskAiDecision.findFirst({
        where: { ticketId, complexidade: { not: 'erro' } },
      })
      if (jaProcessado) {
        console.log(`[HelpdeskAI] Ticket ${ticketId} já processado — pulando`)
        return
      }
    }

    const ticket = await prisma.helpdeskTicket.findUnique({
      where: { id: ticketId },
      select: {
        id: true, numero: true, titulo: true, descricao: true, tipo: true,
        prioridade: true, status: true, categoriaId: true,
        categoria: { select: { id: true, nome: true } },
        solicitante: { select: { id: true, name: true } },
        _count: { select: { anexos: true } },
        // Últimas N mensagens (ordem desc + take) — usado no modo forçado pra
        // dar contexto adicional à IA quando o operador clica "Processar com IA"
        // em ticket que já teve troca de mensagens.
        mensagens: {
          orderBy: { createdAt: 'desc' },
          take: 10,
          select: {
            interna: true,
            conteudo: true,
            createdAt: true,
            autor: { select: { name: true } },
          },
        },
      },
    })
    if (!ticket) return
    // Modo automático respeita o status NOVO; modo forçado aceita qualquer
    // status (operador pode querer revisar plano de ticket EM_ANDAMENTO etc).
    if (!forcar && ticket.status !== 'NOVO') {
      console.log(`[HelpdeskAI] Ticket ${ticketId} já saiu de NOVO — pulando`)
      return
    }

    const regras = await this.getRegrasPeso()
    const config = await this.getConfig()

    // ── Stage 1: SCORE LOCAL (sem custo) ──
    const { score, breakdown } = await this.calcularScore({
      descricao: ticket.descricao ?? '',
      tipo: ticket.tipo,
      categoriaId: ticket.categoriaId,
      anexosCount: ticket._count.anexos,
    }, regras)

    const elegivel = score >= config.scoreThreshold

    // Sempre persiste o score calculado (visibilidade pro debug)
    await prisma.helpdeskTicket.update({
      where: { id: ticket.id },
      data: { aiScore: score, aiElegivel: elegivel },
    })

    if (!elegivel && !forcar) {
      // Não chama API — pula com economia total.
      // Modo forçado ignora esse gate (operador clicou "Processar com IA").
      console.log(`[HelpdeskAI] #HLP${String(ticket.numero).padStart(4, '0')} score ${score} < ${config.scoreThreshold} — não elegível`)
      const aiUser = await this.ensureAiUser()
      await prisma.helpdeskEvento.create({
        data: {
          ticketId: ticket.id,
          autorId: aiUser.id,
          tipo: 'nota_interna',
          descricao: `Triagem IA: ticket não elegível (score ${score}, threshold ${config.scoreThreshold}). Breakdown: chars=${breakdown.chars}, anexos=${breakdown.anexos}, categoria=${breakdown.categoria}, tipo=${breakdown.tipo}.`,
          metadata: { score, breakdown, threshold: config.scoreThreshold },
        },
      })
      return
    }

    // ── Stage 2: defesas anti-gasto ──
    const client = this.getClient()
    if (!client) {
      console.warn('[HelpdeskAI] ANTHROPIC_API_KEY não configurada — triagem desativada')
      return
    }
    if (!config.enabled) {
      console.log('[HelpdeskAI] Triagem desabilitada via config — pulando')
      return
    }
    // Min/max ainda valem como hard guards independentes do score
    const descricaoTexto = (ticket.descricao ?? '').replace(/<[^>]+>/g, '').trim()
    if (descricaoTexto.length < config.minCharsDescricao || descricaoTexto.length > config.maxCharsDescricao) {
      console.log(`[HelpdeskAI] Ticket ${ticketId}: chars fora da faixa (${descricaoTexto.length}) — pulando`)
      return
    }
    if (Number(config.capUsdMensal) > 0) {
      const gastoMes = await this.gastoUsdMesAtual()
      if (gastoMes >= Number(config.capUsdMensal)) {
        console.warn(`[HelpdeskAI] Cap mensal atingido (USD ${gastoMes.toFixed(4)} / ${Number(config.capUsdMensal).toFixed(2)}) — pausando até virar o mês`)
        return
      }
    }

    // ── Stage 3: chama Claude pra gerar plano ──
    const start = Date.now()
    const systemPrompt = await this.buildSystemPrompt()

    // Bloco de contexto adicional — últimas mensagens do ticket (até 10, mais
    // antigas primeiro). Cada mensagem truncada em 500 chars sem HTML.
    // Marca [NOTA INTERNA] vs [PÚBLICA] pra IA não confundir info de bastidor
    // com mensagem dirigida ao solicitante. Vem vazio em tickets recém-criados.
    const stripHtml = (s: string) => s.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()
    const mensagensOrdenadas = [...ticket.mensagens].reverse() // cronológica
    const bloocoMensagens = mensagensOrdenadas.length > 0
      ? '\n\nÚltimas mensagens (' + mensagensOrdenadas.length + ', ordem cronológica):\n' +
        mensagensOrdenadas.map(m => {
          const tag = m.interna ? '[NOTA INTERNA]' : '[PÚBLICA]'
          const autor = m.autor?.name ?? '(externo)'
          const data = new Date(m.createdAt).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
          const texto = stripHtml(m.conteudo).slice(0, 500)
          return `${tag} ${data} · ${autor}: ${texto}`
        }).join('\n')
      : ''

    const userContent = `**Ticket #HLP${String(ticket.numero).padStart(4, '0')}**
Tipo: ${ticket.tipo}
Prioridade: ${ticket.prioridade}
Categoria: ${ticket.categoria?.nome ?? '(sem categoria)'}
Solicitante: ${ticket.solicitante?.name ?? '(externo)'}
Anexos: ${ticket._count.anexos}
Score calculado: ${score} (breakdown chars=${breakdown.chars}, anexos=${breakdown.anexos}, categoria=${breakdown.categoria}, tipo=${breakdown.tipo})

Título: ${ticket.titulo}

Descrição:
${ticket.descricao.slice(0, 4000)}${bloocoMensagens}`

    try {
      const resp = await client.messages.create({
        model: this.MODEL,
        max_tokens: 2500,
        system: systemPrompt,
        tools: [{
          name: 'gerar_plano_resolucao',
          description: 'Devolve um plano de resolução estruturado pro desenvolvedor executar',
          input_schema: {
            type: 'object',
            properties: {
              elegivel_para_plano: {
                type: 'boolean',
                description: 'false se o ticket for tão vago/absurdo que nem dá pra planejar. Default true.',
              },
              plano_resolucao: {
                type: 'string',
                description: 'Plano em markdown — passos numerados, do mais simples ao mais complexo. Obrigatório se elegivel_para_plano=true.',
              },
              arquivos_envolvidos: {
                type: 'array',
                items: { type: 'string' },
                description: 'Paths relativos ao repo (ex.: apps/web/src/app/(dashboard)/agenda/page.tsx). Vazio se não tiver certeza.',
              },
              riscos: {
                type: 'string',
                description: '1-2 frases sobre regressões/dados/integrações que podem quebrar. "Sem riscos relevantes" pra triviais.',
              },
              tempo_estimado: {
                type: 'string',
                description: 'Faixa curta — "15min", "1-2h", "meio dia".',
              },
              raciocinio: {
                type: 'string',
                description: '2-3 frases sobre por que esse plano e não outro. Se elegivel=false, explica o motivo aqui.',
              },
            },
            required: ['elegivel_para_plano', 'raciocinio'],
          },
        }],
        tool_choice: { type: 'tool', name: 'gerar_plano_resolucao' },
        messages: [{ role: 'user', content: userContent }],
      })

      const toolUse = resp.content.find(c => c.type === 'tool_use')
      if (!toolUse || toolUse.type !== 'tool_use') throw new Error('Resposta sem tool_use')

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const decisao: any = toolUse.input
      const duracaoMs = Date.now() - start
      const tokensIn = resp.usage.input_tokens
      const tokensOut = resp.usage.output_tokens
      const custoUsd = (tokensIn / 1_000_000) * this.PRICE_INPUT_USD_PER_MTOK
                     + (tokensOut / 1_000_000) * this.PRICE_OUTPUT_USD_PER_MTOK

      const aiUser = await this.ensureAiUser()

      if (decisao.elegivel_para_plano && decisao.plano_resolucao) {
        // Plano gerado: salva no ticket + status → AGUARDANDO_AUDITORIA
        await prisma.helpdeskTicket.update({
          where: { id: ticket.id },
          data: {
            status: 'AGUARDANDO_AUDITORIA',
            responsavelId: aiUser.id,
            primeiroAtendimentoEm: new Date(),
            aiPlano: String(decisao.plano_resolucao),
            aiPlanoMeta: {
              arquivosEnvolvidos: Array.isArray(decisao.arquivos_envolvidos) ? decisao.arquivos_envolvidos : [],
              riscos: String(decisao.riscos ?? ''),
              tempoEstimado: String(decisao.tempo_estimado ?? ''),
              raciocinio: String(decisao.raciocinio ?? ''),
            },
            aiPlanoStatus: 'pendente',
          },
        })
        await prisma.helpdeskEvento.create({
          data: {
            ticketId: ticket.id,
            autorId: aiUser.id,
            tipo: 'status_alterado',
            descricao: 'IA gerou plano de resolução — aguardando aprovação',
            metadata: { score, breakdown, custoUsd, tempoEstimado: decisao.tempo_estimado ?? null },
          },
        })
      } else {
        // IA bateu o pé: ticket não é planejável
        await prisma.helpdeskEvento.create({
          data: {
            ticketId: ticket.id,
            autorId: aiUser.id,
            tipo: 'nota_interna',
            descricao: `Triagem IA: não foi possível gerar plano. ${decisao.raciocinio ?? '(sem raciocínio)'}`,
            metadata: decisao as object,
          },
        })
      }

      await prisma.helpdeskAiDecision.create({
        data: {
          ticketId: ticket.id,
          modelo: this.MODEL,
          complexidade: decisao.elegivel_para_plano ? 'plano' : 'complexo',
          decisao: decisao as object,
          tokensInput: tokensIn,
          tokensOutput: tokensOut,
          custoUsd,
          duracaoMs,
        },
      })

      console.log(`[HelpdeskAI] #HLP${String(ticket.numero).padStart(4, '0')} ${decisao.elegivel_para_plano ? 'PLANO' : 'sem plano'} (${duracaoMs}ms, $${custoUsd.toFixed(4)})`)
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

  // ============================================================
  // Aprovação / Rejeição de plano
  // ============================================================

  /**
   * Operador aprovou o plano da IA. Vira mensagem oficial no ticket,
   * status → EM_ANDAMENTO. O dev executa manualmente na próxima rodada.
   */
  async aprovarPlano(ticketId: string, userId: string) {
    const ticket = await prisma.helpdeskTicket.findUnique({
      where: { id: ticketId },
      select: { id: true, aiPlano: true, aiPlanoStatus: true, aiPlanoMeta: true },
    })
    if (!ticket) throw new Error('Ticket não encontrado')
    if (!ticket.aiPlano) throw new Error('Ticket sem plano da IA')
    if (ticket.aiPlanoStatus !== 'pendente') {
      throw new Error(`Plano já está em status "${ticket.aiPlanoStatus}"`)
    }

    // Aprovação não duplica o plano como mensagem — o plano já fica visível
    // no card "Plano de resolução — IA" do detalhe do ticket. Só atualizamos
    // o status e registramos no log de eventos.
    await prisma.$transaction([
      prisma.helpdeskTicket.update({
        where: { id: ticketId },
        data: {
          aiPlanoStatus: 'aprovado',
          aiPlanoAprovadoPor: userId,
          aiPlanoAprovadoEm: new Date(),
          status: 'EM_ANDAMENTO',
        },
      }),
      prisma.helpdeskEvento.create({
        data: {
          ticketId,
          autorId: userId,
          tipo: 'status_alterado',
          descricao: 'Plano da IA aprovado — aguardando execução pelo dev',
        },
      }),
    ])
    return { ok: true }
  }

  /**
   * Operador rejeitou o plano. Status volta pra NOVO, motivo vira nota interna.
   */
  async rejeitarPlano(ticketId: string, userId: string, motivo: string) {
    const ticket = await prisma.helpdeskTicket.findUnique({
      where: { id: ticketId },
      select: { id: true, aiPlanoStatus: true },
    })
    if (!ticket) throw new Error('Ticket não encontrado')
    if (ticket.aiPlanoStatus !== 'pendente') {
      throw new Error(`Plano já está em status "${ticket.aiPlanoStatus}"`)
    }

    const motivoLimpo = (motivo ?? '').trim()
    await prisma.$transaction([
      prisma.helpdeskTicket.update({
        where: { id: ticketId },
        data: {
          aiPlanoStatus: 'rejeitado',
          aiPlanoMotivoRejeicao: motivoLimpo || null,
          status: 'NOVO',
          responsavelId: null, // libera a atribuição da IA pra humano pegar
        },
      }),
      prisma.helpdeskEvento.create({
        data: {
          ticketId,
          autorId: userId,
          tipo: 'nota_interna',
          descricao: `Plano da IA rejeitado.${motivoLimpo ? ' Motivo: ' + motivoLimpo : ''}`,
        },
      }),
    ])
    return { ok: true }
  }

  // ============================================================
  // Execução do plano (#HLP0083)
  // ============================================================

  /** Diretórios que pulamos no walk fuzzy — economiza I/O e evita lixo. */
  private readonly WALK_IGNORE = new Set([
    'node_modules', '.git', '.next', 'dist', 'build', '.turbo',
    '.vercel', '.cache', 'coverage', 'tmp', '.pnpm', 'out',
  ])

  /**
   * Walk recursivo do repo procurando arquivos cujo basename casa com
   * `nome` (case-insensitive). Retorna paths RELATIVOS ao repoRoot.
   * Limita profundidade pra não explodir.
   */
  private async procurarArquivoPorNome(repoRoot: string, nome: string, maxDepth = 8): Promise<string[]> {
    const fs = await import('node:fs/promises')
    const path = await import('node:path')
    const alvo = nome.toLowerCase()
    const matches: string[] = []

    const walk = async (dir: string, depth: number): Promise<void> => {
      if (depth > maxDepth) return
      let entries: { name: string; isDirectory: () => boolean; isFile: () => boolean }[]
      try {
        entries = await fs.readdir(dir, { withFileTypes: true })
      } catch {
        return
      }
      for (const ent of entries) {
        if (this.WALK_IGNORE.has(ent.name) || ent.name.startsWith('.')) continue
        const full = path.join(dir, ent.name)
        if (ent.isDirectory()) {
          await walk(full, depth + 1)
        } else if (ent.isFile() && ent.name.toLowerCase() === alvo) {
          matches.push(path.relative(repoRoot, full).replace(/\\/g, '/'))
          // Para de buscar se já achou demais (evita walk completo)
          if (matches.length >= 20) return
        }
      }
    }

    await walk(repoRoot, 0)
    return matches
  }

  /**
   * Resolve uma lista de paths planejados pela IA contra o filesystem real.
   * Pra cada path: se existe direto, ótimo; se não, faz fuzzy por basename;
   * se acha 1 match, considera resolvido; se acha múltiplos, marca como
   * ambíguo (operador escolhe manualmente).
   */
  private async resolverPathsFuzzy(repoRoot: string, paths: string[]): Promise<Array<{
    planejado: string
    resolvido: string | null
    ambiguo: boolean
    sugestoes: string[]
  }>> {
    const fs = await import('node:fs/promises')
    const path = await import('node:path')

    const out: Array<{ planejado: string; resolvido: string | null; ambiguo: boolean; sugestoes: string[] }> = []
    for (const p of paths) {
      const normalizado = p.replace(/^\.\//, '').replace(/\\/g, '/')
      const full = path.resolve(repoRoot, normalizado)
      // Caminho direto existe?
      try {
        const stat = await fs.stat(full)
        if (stat.isFile()) {
          out.push({ planejado: p, resolvido: normalizado, ambiguo: false, sugestoes: [] })
          continue
        }
      } catch { /* não existe, tenta fuzzy */ }

      // Fuzzy por basename
      const basename = path.basename(normalizado)
      const sugestoes = await this.procurarArquivoPorNome(repoRoot, basename)

      if (sugestoes.length === 1) {
        out.push({ planejado: p, resolvido: sugestoes[0]!, ambiguo: false, sugestoes })
      } else if (sugestoes.length > 1) {
        // Tenta ranking: prefere match cuja path tenha mais segmentos em comum
        // com o path planejado (helps "perfil/page.tsx" vs "outras/page.tsx").
        const planSegs = new Set(normalizado.split('/').filter(s => s && !s.includes('*')))
        const ranked = sugestoes.map(s => ({
          path: s,
          score: s.split('/').filter(seg => planSegs.has(seg)).length,
        })).sort((a, b) => b.score - a.score)
        const best = ranked[0]!
        const isUniqueBest = ranked.length === 1 || ranked[1]!.score < best.score
        out.push({
          planejado: p,
          resolvido: isUniqueBest ? best.path : null,
          ambiguo: !isUniqueBest,
          sugestoes,
        })
      } else {
        out.push({ planejado: p, resolvido: null, ambiguo: false, sugestoes: [] })
      }
    }
    return out
  }

  /**
   * Caminho do repo no servidor pra leitura do filesystem (fuzzy search +
   * carregamento de arquivos pra contexto da IA). Prioridade:
   *   1) env AGENT_REPO_PATH (produção: montado read-only no container)
   *   2) cwd-baseado (dev local: cwd da api é apps/api, sobe 2 níveis)
   */
  private getRepoRoot(): string {
    const path = require('node:path') as typeof import('node:path')
    const envPath = process.env.AGENT_REPO_PATH
    if (envPath) return envPath
    const cwd = process.cwd()
    return cwd.endsWith('apps/api') || cwd.endsWith('apps\\api') ? path.resolve(cwd, '../..') : cwd
  }

  /**
   * Gera um prompt formatado pra colar no Claude Code CLI local.
   * Inclui contexto do ticket + plano + arquivos prováveis. O dev cola
   * o prompt e executa no próprio repo. NÃO consome crédito da API.
   */
  async gerarPromptParaCli(ticketId: string): Promise<string> {
    const ticket = await prisma.helpdeskTicket.findUnique({
      where: { id: ticketId },
      select: {
        id: true, numero: true, titulo: true, descricao: true,
        aiPlano: true, aiPlanoMeta: true,
      },
    })
    if (!ticket) throw new Error('Ticket não encontrado')
    if (!ticket.aiPlano) throw new Error('Ticket sem plano da IA')

    const numeroFmt = `#HLP${String(ticket.numero).padStart(4, '0')}`
    const meta = (ticket.aiPlanoMeta as { arquivosEnvolvidos?: string[]; riscos?: string; tempoEstimado?: string } | null) ?? {}
    const arquivos = Array.isArray(meta.arquivosEnvolvidos) ? meta.arquivosEnvolvidos : []
    const descricaoTexto = (ticket.descricao ?? '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()

    return [
      `# Ticket ${numeroFmt} — ${ticket.titulo}`,
      '',
      '## Descrição original do solicitante',
      descricaoTexto || '(sem descrição)',
      '',
      '## Plano gerado e aprovado pela triagem IA',
      ticket.aiPlano,
      '',
      arquivos.length > 0 ? '## Arquivos prováveis envolvidos\n' + arquivos.map(a => `- ${a}`).join('\n') : '',
      meta.riscos ? `\n## Riscos\n${meta.riscos}` : '',
      meta.tempoEstimado ? `\n## Tempo estimado pela IA\n${meta.tempoEstimado}` : '',
      '',
      '---',
      `Execute o plano acima. Ao terminar, faça commit com a mensagem prefixada \`feat(helpdesk):\` ou \`fix(...):\` mencionando \`${numeroFmt}\` no corpo. Depois, marque o ticket como CONCLUÍDO no helpdesk do OneClick.`,
    ].filter(Boolean).join('\n')
  }

  /**
   * Lê os arquivos prováveis do plano (com fuzzy resolution) direto do
   * filesystem do servidor pra estimar quantos tokens serão usados.
   * Não chama a API — só calcula tamanho × preço Sonnet.
   */
  async estimarCustoExecucao(ticketId: string): Promise<{
    arquivosLidos: number
    arquivosResolvidos: Array<{ planejado: string; resolvido: string }>
    arquivosAmbiguos: Array<{ planejado: string; sugestoes: string[] }>
    arquivosNaoEncontrados: string[]
    inputCharsEstimado: number
    inputTokensEstimado: number
    outputTokensEstimado: number
    custoMinUsd: number
    custoMaxUsd: number
  }> {
    const ticket = await prisma.helpdeskTicket.findUnique({
      where: { id: ticketId },
      select: { aiPlano: true, aiPlanoMeta: true, titulo: true, descricao: true },
    })
    if (!ticket?.aiPlano) throw new Error('Ticket sem plano da IA')

    const meta = (ticket.aiPlanoMeta as { arquivosEnvolvidos?: string[] } | null) ?? {}
    const arquivos = Array.isArray(meta.arquivosEnvolvidos) ? meta.arquivosEnvolvidos : []

    const fs = await import('node:fs/promises')
    const path = await import('node:path')
    const repoRoot = this.getRepoRoot()

    // Resolução fuzzy dos paths planejados pela IA
    const resolucao = await this.resolverPathsFuzzy(repoRoot, arquivos)

    let conteudoChars = 0
    let arquivosLidos = 0
    const arquivosResolvidos: Array<{ planejado: string; resolvido: string }> = []
    const arquivosAmbiguos: Array<{ planejado: string; sugestoes: string[] }> = []
    const naoEncontrados: string[] = []

    for (const r of resolucao) {
      if (r.ambiguo) {
        arquivosAmbiguos.push({ planejado: r.planejado, sugestoes: r.sugestoes.slice(0, 5) })
        continue
      }
      if (!r.resolvido) {
        naoEncontrados.push(r.planejado)
        continue
      }
      try {
        const full = path.resolve(repoRoot, r.resolvido)
        const stat = await fs.stat(full)
        if (stat.size > 200_000) {
          naoEncontrados.push(`${r.resolvido} (muito grande: ${Math.round(stat.size / 1024)}KB)`)
          continue
        }
        const content = await fs.readFile(full, 'utf8')
        conteudoChars += content.length
        arquivosLidos++
        arquivosResolvidos.push({ planejado: r.planejado, resolvido: r.resolvido })
      } catch {
        naoEncontrados.push(r.resolvido)
      }
    }

    // Heurística clássica: ~4 chars = 1 token (textos em geral)
    const planoChars = (ticket.aiPlano || '').length
    const tituloChars = (ticket.titulo || '').length
    const descricaoChars = ((ticket.descricao || '').replace(/<[^>]+>/g, '')).length
    const overheadPrompt = 2000 // system prompt + instruções
    const inputCharsEstimado = conteudoChars + planoChars + tituloChars + descricaoChars + overheadPrompt
    const inputTokensEstimado = Math.ceil(inputCharsEstimado / 4)
    const outputTokensEstimado = Math.ceil((conteudoChars * 1.5) / 4) + 500

    const custoMedio = (inputTokensEstimado / 1_000_000) * this.PRICE_INPUT_USD_PER_MTOK
                     + (outputTokensEstimado / 1_000_000) * this.PRICE_OUTPUT_USD_PER_MTOK
    return {
      arquivosLidos,
      arquivosResolvidos,
      arquivosAmbiguos,
      arquivosNaoEncontrados: naoEncontrados,
      inputCharsEstimado,
      inputTokensEstimado,
      outputTokensEstimado,
      custoMinUsd: Math.max(0.005, custoMedio * 0.6),
      custoMaxUsd: custoMedio * 1.4,
    }
  }

  /**
   * Executa o plano via Claude API: passa o plano + conteúdo dos arquivos
   * envolvidos, pede pro modelo retornar versões modificadas via tool_use.
   * Grava resultado em ticket.aiExecutionResult e o custo real em
   * ticket.aiExecutionCustoUsd. Não commita nada — operador decide depois
   * como aplicar (copiar do modal ou deixar pra próxima fase com PR auto).
   */
  async executarPlanoAutomatico(ticketId: string): Promise<{ ok: true; custoUsd: number; arquivosModificados: number }> {
    const client = this.getClient()
    if (!client) throw new Error('ANTHROPIC_API_KEY não configurada')

    const ticket = await prisma.helpdeskTicket.findUnique({
      where: { id: ticketId },
      select: {
        id: true, numero: true, titulo: true, descricao: true,
        aiPlano: true, aiPlanoMeta: true, aiPlanoStatus: true,
      },
    })
    if (!ticket) throw new Error('Ticket não encontrado')
    if (!ticket.aiPlano) throw new Error('Ticket sem plano da IA')
    if (ticket.aiPlanoStatus !== 'aprovado') {
      throw new Error(`Plano não está aprovado (status atual: ${ticket.aiPlanoStatus})`)
    }

    const meta = (ticket.aiPlanoMeta as { arquivosEnvolvidos?: string[]; riscos?: string; tempoEstimado?: string } | null) ?? {}
    const arquivos = Array.isArray(meta.arquivosEnvolvidos) ? meta.arquivosEnvolvidos : []

    // Lê conteúdo atual dos arquivos prováveis pra passar como contexto.
    // Aplica resolução fuzzy: se o path do plano não existe, busca por basename
    // no repo. Isso evita "0 arquivos carregados" quando a IA chuta nomes.
    const fs = await import('node:fs/promises')
    const path = await import('node:path')
    const repoRoot = this.getRepoRoot()
    const resolucao = await this.resolverPathsFuzzy(repoRoot, arquivos)

    const arquivosCarregados: Array<{ path: string; conteudo: string }> = []
    const arquivosNaoEncontrados: string[] = []
    const arquivosResolvidosLog: Array<{ planejado: string; resolvido: string }> = []
    const arquivosAmbiguos: Array<{ planejado: string; sugestoes: string[] }> = []

    for (const r of resolucao) {
      if (r.ambiguo) {
        arquivosAmbiguos.push({ planejado: r.planejado, sugestoes: r.sugestoes.slice(0, 5) })
        continue
      }
      if (!r.resolvido) {
        arquivosNaoEncontrados.push(r.planejado)
        continue
      }
      try {
        const full = path.resolve(repoRoot, r.resolvido)
        const stat = await fs.stat(full)
        if (stat.size > 200_000) {
          arquivosNaoEncontrados.push(`${r.resolvido} (>200KB)`)
          continue
        }
        const content = await fs.readFile(full, 'utf8')
        arquivosCarregados.push({ path: r.resolvido, conteudo: content })
        if (r.resolvido !== r.planejado) {
          arquivosResolvidosLog.push({ planejado: r.planejado, resolvido: r.resolvido })
        }
      } catch {
        arquivosNaoEncontrados.push(r.planejado)
      }
    }

    const numeroFmt = `#HLP${String(ticket.numero).padStart(4, '0')}`
    const descricaoTexto = (ticket.descricao ?? '').replace(/<[^>]+>/g, '').trim()

    const systemPrompt = `Você é um agente que executa planos de resolução de tickets em código TypeScript no monorepo OneClick (Next.js 15 + NestJS + tRPC + Prisma).

Receberá o plano aprovado pelo operador e o conteúdo atual dos arquivos prováveis envolvidos. Retorne via tool \`aplicar_plano\` os arquivos modificados.

REGRAS:
1. Modifique APENAS o que o plano descreve. Não refatore além do necessário.
2. Mantenha estilo, formatação, imports e convenções existentes no arquivo.
3. Se algum arquivo do plano não estiver no contexto (arquivos_disponiveis), você pode ainda assim referenciá-lo em arquivos_a_revisar — operador vai conferir manualmente.
4. Comentários em português, código em inglês.
5. Se não conseguir/souber executar com segurança, retorne arquivos_modificados=[] e explique em raciocinio.
6. NUNCA invente caminhos. Use só os paths que vieram em arquivos_disponiveis ou que aparecerem no plano.`

    // Bloco "resoluções": informa à IA que paths chutados foram remapeados
    const resolucoesBlock = arquivosResolvidosLog.length > 0
      ? `\n## Paths resolvidos automaticamente\nAlguns paths do plano original não existiam exatamente — o sistema buscou por basename e remapeou:\n${arquivosResolvidosLog.map(r => `- ${r.planejado} → **${r.resolvido}**`).join('\n')}`
      : ''
    const ambiguosBlock = arquivosAmbiguos.length > 0
      ? `\n## Paths ambíguos (múltiplos matches — operador decide)\n${arquivosAmbiguos.map(a => `- ${a.planejado}: candidatos = ${a.sugestoes.join(', ')}`).join('\n')}\n\nInclua esses em \`arquivos_a_revisar\`.`
      : ''

    const userContent = `# Ticket ${numeroFmt} — ${ticket.titulo}

## Descrição
${descricaoTexto || '(sem descrição)'}

## Plano aprovado
${ticket.aiPlano}
${resolucoesBlock}${ambiguosBlock}

## Arquivos disponíveis (conteúdo atual)
${arquivosCarregados.length === 0 ? '(nenhum arquivo carregado — gere apenas instruções textuais em raciocinio)' : ''}
${arquivosCarregados.map(a => `\n### ${a.path}\n\n\`\`\`\n${a.conteudo}\n\`\`\``).join('\n')}

${arquivosNaoEncontrados.length > 0 ? `\n## Arquivos do plano que não pude carregar (nem por fuzzy)\n${arquivosNaoEncontrados.map(a => `- ${a}`).join('\n')}\nInclua esses em \`arquivos_a_revisar\` se forem relevantes.` : ''}`

    const start = Date.now()
    const resp = await client.messages.create({
      model: this.MODEL,
      max_tokens: 8000,
      system: systemPrompt,
      tools: [{
        name: 'aplicar_plano',
        description: 'Aplica o plano de resolução nos arquivos. Retorna as versões modificadas.',
        input_schema: {
          type: 'object',
          properties: {
            arquivos_modificados: {
              type: 'array',
              description: 'Arquivos modificados com o conteúdo COMPLETO novo (não diff). Path relativo ao repo.',
              items: {
                type: 'object',
                properties: {
                  path: { type: 'string', description: 'Path relativo ao repo (ex.: apps/web/src/...)' },
                  conteudo: { type: 'string', description: 'Conteúdo completo novo do arquivo' },
                  motivo: { type: 'string', description: '1-2 frases sobre o que mudou e por quê' },
                },
                required: ['path', 'conteudo', 'motivo'],
              },
            },
            arquivos_a_revisar: {
              type: 'array',
              items: { type: 'string' },
              description: 'Paths que o plano menciona mas você não pôde alterar (não estava no contexto). Operador vai conferir manualmente.',
            },
            resumo: {
              type: 'string',
              description: 'Resumo curto do que foi feito (1 parágrafo)',
            },
            raciocinio: {
              type: 'string',
              description: 'Notas técnicas pro operador — decisões tomadas, alternativas consideradas, pontos de atenção',
            },
          },
          required: ['arquivos_modificados', 'resumo', 'raciocinio'],
        },
      }],
      tool_choice: { type: 'tool', name: 'aplicar_plano' },
      messages: [{ role: 'user', content: userContent }],
    })

    const toolUse = resp.content.find(c => c.type === 'tool_use')
    if (!toolUse || toolUse.type !== 'tool_use') throw new Error('Resposta sem tool_use')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result: any = toolUse.input
    const duracaoMs = Date.now() - start
    const tokensIn = resp.usage.input_tokens
    const tokensOut = resp.usage.output_tokens
    const custoUsd = (tokensIn / 1_000_000) * this.PRICE_INPUT_USD_PER_MTOK
                   + (tokensOut / 1_000_000) * this.PRICE_OUTPUT_USD_PER_MTOK

    // Grava resultado + custo no ticket
    await (prisma.helpdeskTicket.update as unknown as (a: unknown) => Promise<unknown>)({
      where: { id: ticketId },
      data: {
        aiExecutionResult: {
          arquivosModificados: result.arquivos_modificados ?? [],
          arquivosARevisar: result.arquivos_a_revisar ?? [],
          resumo: result.resumo ?? '',
          raciocinio: result.raciocinio ?? '',
          duracaoMs,
          tokensInput: tokensIn,
          tokensOutput: tokensOut,
        },
        aiExecutionCustoUsd: custoUsd,
        aiExecutionEm: new Date(),
      },
    })

    // Registra também em HelpdeskAiDecision pro histórico/custos
    await prisma.helpdeskAiDecision.create({
      data: {
        ticketId,
        modelo: this.MODEL,
        complexidade: 'execucao',
        decisao: result as object,
        tokensInput: tokensIn,
        tokensOutput: tokensOut,
        custoUsd,
        duracaoMs,
      },
    })

    return {
      ok: true,
      custoUsd,
      arquivosModificados: Array.isArray(result.arquivos_modificados) ? result.arquivos_modificados.length : 0,
    }
  }

  // ============================================================
  // Auditoria & estatísticas (#HLP0083)
  // ============================================================

  /**
   * Agrega o gasto/quantidade dos últimos N meses pra gráfico.
   * Retorna 1 linha por mês, do mais antigo pro mais recente.
   */
  async estatisticasMensais(meses = 6) {
    const desde = new Date()
    desde.setMonth(desde.getMonth() - meses + 1)
    desde.setDate(1)
    desde.setHours(0, 0, 0, 0)
    const rows = await prisma.$queryRawUnsafe<Array<{ mes: Date; total_usd: number; tickets: bigint; planos: bigint; complexos: bigint; erros: bigint }>>(
      `SELECT
         date_trunc('month', created_at) AS mes,
         COALESCE(SUM(custo_usd), 0)::float AS total_usd,
         COUNT(*)::bigint AS tickets,
         COUNT(*) FILTER (WHERE complexidade = 'plano')::bigint AS planos,
         COUNT(*) FILTER (WHERE complexidade = 'complexo')::bigint AS complexos,
         COUNT(*) FILTER (WHERE complexidade = 'erro')::bigint AS erros
       FROM helpdesk_ai_decisions
       WHERE created_at >= $1
       GROUP BY 1
       ORDER BY 1`,
      desde,
    )
    return rows.map(r => ({
      mes: r.mes.toISOString().slice(0, 7), // 'YYYY-MM'
      totalUsd: Number(r.total_usd),
      tickets: Number(r.tickets),
      planos: Number(r.planos),
      complexos: Number(r.complexos),
      erros: Number(r.erros),
    }))
  }

  /**
   * Histórico paginado das decisões. Inclui dados do ticket (numero, titulo,
   * status do plano) + a decisão completa (raciocínio, plano gerado, etc) pra
   * a UI poder expandir cada linha e mostrar "o que a IA fez nesse ticket".
   */
  async historicoDecisoes(input: {
    page?: number
    limit?: number
    complexidade?: string
    inicio?: Date
    fim?: Date
  }) {
    const page = Math.max(1, input.page ?? 1)
    const limit = Math.min(100, Math.max(1, input.limit ?? 20))
    const where: Record<string, unknown> = {}
    if (input.complexidade) where.complexidade = input.complexidade
    if (input.inicio || input.fim) {
      where.createdAt = {
        ...(input.inicio ? { gte: input.inicio } : {}),
        ...(input.fim ? { lte: input.fim } : {}),
      }
    }
    const [data, total] = await Promise.all([
      prisma.helpdeskAiDecision.findMany({
        where,
        include: {
          ticket: {
            select: {
              id: true, numero: true, titulo: true,
              aiPlanoStatus: true, aiPlanoMotivoRejeicao: true,
              aiPlanoAprovadoEm: true, aiScore: true, aiElegivel: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.helpdeskAiDecision.count({ where }),
    ])
    return {
      data,
      total,
      page,
      totalPages: Math.ceil(total / limit) || 1,
    }
  }
}
