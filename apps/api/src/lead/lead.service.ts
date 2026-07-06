import { Injectable } from '@nestjs/common'
import { prisma } from '@saas/db'
import { randomUUID } from 'crypto'
import Anthropic from '@anthropic-ai/sdk'
import type { SalvarFunilConfigInput, LeadChatMsg } from '@saas/types'
import { CnpjService } from '../cnpj/cnpj.service'
import { CrmService } from '../crm/crm.service'
import { AgendaService } from '../agenda/agenda.service'
import { AgendaLembreteService } from '../agenda/agenda-lembrete.service'
import { NotificationService } from '../notification/notification.service'

type StreamEvent = { type: string; [k: string]: unknown }
type LeadDados = Record<string, unknown> & {
  nome?: string; email?: string; telefone?: string; cnpj?: string; razaoSocial?: string
  servicoInteresse?: string; faturamentoFaixa?: string; urgencia?: string; resumo?: string
}

/**
 * Funil de captação de leads por IA. Chat público (sem login) que conduz uma
 * trilha configurável (objetivos + rubrica), pontua o lead e o registra no CRM.
 * Reusa o padrão de streaming do assistente de orçamento + tool-calling do
 * helpdesk pra extrair dados estruturados durante a conversa.
 */
@Injectable()
export class LeadService {
  private readonly MODEL = 'claude-sonnet-4-6'
  private client: Anthropic | null = null

  // Conteúdo padrão calibrado para escritório de contabilidade (o master pode
  // sobrescrever tudo em /crm/funil; usado como fallback quando o campo está vazio).
  static readonly TRILHA_PADRAO =
    'Você atende um possível cliente de um escritório de contabilidade. Conduza de forma natural e cordial, uma pergunta por vez, descobrindo nesta ordem (sem parecer interrogatório):\n' +
    '1. O que ele precisa hoje: abrir empresa, trocar de contador, contabilidade mensal, folha de pagamento/eSocial, regularização ou impostos atrasados, IRPF, BPO financeiro, etc.\n' +
    '2. Se já tem CNPJ — se sim, o ramo/atividade e, se souber, o regime (Simples, Presumido ou Real).\n' +
    '3. O faturamento mensal aproximado.\n' +
    '4. O nível de urgência (precisa agora, nas próximas semanas, ou só pesquisando).\n' +
    '5. O nome e um contato (e-mail ou WhatsApp).'

  static readonly RUBRICA_PADRAO =
    'Pontue de 0 a 100 somando:\n' +
    '- Possui CNPJ ativo (empresa já constituída): +25\n' +
    '- Faturamento mensal — acima de R$ 100 mil: +25 | de R$ 30 mil a R$ 100 mil: +15 | até R$ 30 mil: +5\n' +
    '- Serviço recorrente (contabilidade mensal, folha/eSocial, BPO): +20 | serviço pontual (abertura, IRPF, certidão): +10\n' +
    '- Urgência — imediata / troca de contador agora: +20 | próximas semanas: +10 | só pesquisando: 0\n' +
    '- Insatisfação com o contador atual ou problema fiscal a resolver: +10\n' +
    'Curiosidade sem CNPJ e sem intenção de contratar: mantenha baixo (0–20).'

  // Política de encerramento padrão (o master pode sobrescrever em /crm/funil).
  static readonly REGRAS_FINALIZACAO_PADRAO =
    'Só finalize depois de concluir a qualificação (serviço, CNPJ, faturamento e urgência) e de ter nome + contato. Ao finalizar, marque "encerrar": true e ajuste o tom pela pontuação:\n' +
    '- Quente (alta): demonstre entusiasmo, diga que é um ótimo momento para uma análise contábil/tributária e convide para agendar uma reunião com um consultor.\n' +
    '- Morno (média): agradeça, diga que um especialista vai entrar em contato em breve e ofereça adiantar a conversa pelo WhatsApp.\n' +
    '- Frio (baixa): agradeça cordialmente o contato, coloque o escritório à disposição e encerre.'

  constructor(
    private readonly cnpjService: CnpjService,
    private readonly crmService: CrmService,
    private readonly agendaService: AgendaService,
    private readonly agendaLembreteService: AgendaLembreteService,
    private readonly notificationService: NotificationService,
  ) {}

  private getClient(): Anthropic | null {
    if (this.client) return this.client
    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) return null
    this.client = new Anthropic({ apiKey })
    return this.client
  }

  // ── Config ─────────────────────────────────────────────────────────
  private static readonly CONFIG_COLS =
    `id, slug, nome, ativo, trilha_prompt AS "trilhaPrompt", rubrica, limiar_medio AS "limiarMedio", limiar_alto AS "limiarAlto",
     mensagem_boas_vindas AS "mensagemBoasVindas", aviso_lgpd AS "avisoLgpd", whatsapp_comercial AS "whatsappComercial",
     tipo_evento_reuniao_id AS "tipoEventoReuniaoId", cor_primaria AS "corPrimaria", regras_finalizacao AS "regrasFinalizacao",
     roteador, descricao_roteamento AS "descricaoRoteamento"`

  /** Config de uma campanha. Por `slug` quando informado; senão a 1ª da empresa (compat). */
  async getConfig(empresaId?: string | null, slug?: string | null) {
    const rows = slug
      ? await prisma.$queryRawUnsafe<any[]>(
          `SELECT ${LeadService.CONFIG_COLS} FROM lead_funil_config WHERE slug=$1 LIMIT 1`, slug)
      : await prisma.$queryRawUnsafe<any[]>(
          `SELECT ${LeadService.CONFIG_COLS} FROM lead_funil_config WHERE empresa_id IS NOT DISTINCT FROM $1 ORDER BY created_at ASC LIMIT 1`,
          empresaId ?? null,
        )
    if (rows[0]) return { ...rows[0], nome: rows[0].nome || 'Atendimento', corPrimaria: rows[0].corPrimaria || '#10b981', regrasFinalizacao: rows[0].regrasFinalizacao || LeadService.REGRAS_FINALIZACAO_PADRAO }
    // default (não persiste até salvar)
    return {
      id: null, slug: 'atendimento', nome: 'Atendimento', ativo: true,
      trilhaPrompt: LeadService.TRILHA_PADRAO,
      rubrica: LeadService.RUBRICA_PADRAO,
      limiarMedio: 40, limiarAlto: 70,
      mensagemBoasVindas: 'Olá! 👋 Sou o assistente virtual. Vou te ajudar rapidinho e já encaminho você ao nosso time.',
      avisoLgpd: 'Ao continuar, você concorda que usaremos seus dados para entrar em contato sobre nossos serviços.',
      whatsappComercial: null, tipoEventoReuniaoId: null, corPrimaria: '#10b981',
      regrasFinalizacao: LeadService.REGRAS_FINALIZACAO_PADRAO,
      roteador: false, descricaoRoteamento: null,
    }
  }

  /** Trilhas ativas (não-roteadoras) da empresa — alimentam o prompt do roteador. */
  private async listTrilhasParaRoteador(empresaId?: string | null): Promise<Array<{ slug: string; nome: string; descricaoRoteamento: string | null }>> {
    return prisma.$queryRawUnsafe<Array<{ slug: string; nome: string; descricaoRoteamento: string | null }>>(
      `SELECT slug, COALESCE(nome, slug) AS nome, descricao_roteamento AS "descricaoRoteamento"
         FROM lead_funil_config
        WHERE ativo=true AND roteador=false AND empresa_id IS NOT DISTINCT FROM $1
        ORDER BY nome ASC`, empresaId ?? null,
    ).catch(() => [])
  }

  /** Lista todas as campanhas (funis) da empresa, com contagem de sessões/registrados. */
  async listConfigs(empresaId?: string | null) {
    const rows = await prisma.$queryRawUnsafe<any[]>(
      `SELECT ${LeadService.CONFIG_COLS}, created_at AS "createdAt" FROM lead_funil_config
        WHERE empresa_id IS NOT DISTINCT FROM $1 ORDER BY created_at ASC`,
      empresaId ?? null,
    ).catch(() => [] as any[])
    if (rows.length === 0) {
      // Nenhuma campanha ainda: devolve a default (não persistida) pra UI ter algo pra editar/salvar.
      return [await this.getConfig(empresaId)]
    }
    // Métricas por slug (sessões e registrados)
    const stats = await prisma.$queryRawUnsafe<any[]>(
      `SELECT slug, COUNT(*)::int AS total, COUNT(*) FILTER (WHERE status='registrado')::int AS registrados
         FROM lead_sessao WHERE empresa_id IS NOT DISTINCT FROM $1 GROUP BY slug`,
      empresaId ?? null,
    ).catch(() => [] as any[])
    const bySlug = new Map(stats.map(s => [s.slug, s]))
    return rows.map(r => ({
      ...r,
      nome: r.nome || 'Atendimento',
      corPrimaria: r.corPrimaria || '#10b981',
      regrasFinalizacao: r.regrasFinalizacao || LeadService.REGRAS_FINALIZACAO_PADRAO,
      _total: bySlug.get(r.slug)?.total ?? 0,
      _registrados: bySlug.get(r.slug)?.registrados ?? 0,
    }))
  }

  async saveConfig(input: SalvarFunilConfigInput, empresaId?: string | null) {
    // Identidade da campanha: por id (permite renomear o slug) ou, na ausência, pelo slug.
    const existing = input.id
      ? await prisma.$queryRawUnsafe<any[]>(`SELECT id FROM lead_funil_config WHERE id=$1 AND empresa_id IS NOT DISTINCT FROM $2 LIMIT 1`, input.id, empresaId ?? null)
      : await prisma.$queryRawUnsafe<any[]>(`SELECT id FROM lead_funil_config WHERE slug=$1 LIMIT 1`, input.slug)
    // Guard: slug não pode colidir com OUTRA campanha (slug é único global).
    const clash = await prisma.$queryRawUnsafe<any[]>(`SELECT id FROM lead_funil_config WHERE slug=$1 LIMIT 1`, input.slug)
    if (clash[0] && (!existing[0] || clash[0].id !== existing[0].id)) {
      throw new Error(`Já existe uma campanha com o slug "${input.slug}". Escolha outro.`)
    }
    if (existing[0]) {
      await prisma.$executeRawUnsafe(
        `UPDATE lead_funil_config SET slug=$2, nome=$3, ativo=$4, trilha_prompt=$5, rubrica=$6, limiar_medio=$7, limiar_alto=$8,
           mensagem_boas_vindas=$9, aviso_lgpd=$10, whatsapp_comercial=$11, tipo_evento_reuniao_id=$12, cor_primaria=$13, regras_finalizacao=$14,
           roteador=$15, descricao_roteamento=$16, updated_at=CURRENT_TIMESTAMP WHERE id=$1`,
        existing[0].id, input.slug, input.nome ?? null, input.ativo ?? true, input.trilhaPrompt, input.rubrica, input.limiarMedio, input.limiarAlto,
        input.mensagemBoasVindas ?? null, input.avisoLgpd ?? null, input.whatsappComercial ?? null, input.tipoEventoReuniaoId ?? null, input.corPrimaria ?? null, input.regrasFinalizacao ?? null,
        input.roteador ?? false, input.descricaoRoteamento ?? null,
      )
      return { id: existing[0].id }
    }
    const id = randomUUID()
    await prisma.$executeRawUnsafe(
      `INSERT INTO lead_funil_config (id, empresa_id, slug, nome, ativo, trilha_prompt, rubrica, limiar_medio, limiar_alto, mensagem_boas_vindas, aviso_lgpd, whatsapp_comercial, tipo_evento_reuniao_id, cor_primaria, regras_finalizacao, roteador, descricao_roteamento, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      id, empresaId ?? null, input.slug, input.nome ?? null, input.ativo ?? true, input.trilhaPrompt, input.rubrica, input.limiarMedio, input.limiarAlto,
      input.mensagemBoasVindas ?? null, input.avisoLgpd ?? null, input.whatsappComercial ?? null, input.tipoEventoReuniaoId ?? null, input.corPrimaria ?? null, input.regrasFinalizacao ?? null,
      input.roteador ?? false, input.descricaoRoteamento ?? null,
    )
    return { id }
  }

  /** Exclui uma campanha. Bloqueia se já houver leads registrados por ela (preserva histórico). */
  async deleteConfig(id: string, empresaId?: string | null) {
    const rows = await prisma.$queryRawUnsafe<any[]>(
      `SELECT slug FROM lead_funil_config WHERE id=$1 AND empresa_id IS NOT DISTINCT FROM $2 LIMIT 1`, id, empresaId ?? null)
    const slug = rows[0]?.slug
    if (!slug) throw new Error('Campanha não encontrada.')
    const used = await prisma.$queryRawUnsafe<any[]>(
      `SELECT COUNT(*)::int AS n FROM lead_sessao WHERE slug=$1 AND status='registrado'`, slug)
    if ((used[0]?.n ?? 0) > 0) {
      throw new Error('Esta campanha já gerou leads no CRM. Desative-a em vez de excluir, para preservar o histórico.')
    }
    await prisma.$executeRawUnsafe(`DELETE FROM lead_funil_config WHERE id=$1 AND empresa_id IS NOT DISTINCT FROM $2`, id, empresaId ?? null)
    return { ok: true }
  }

  /** Config pública (pelo slug) — só o necessário pra renderizar a página. */
  async getConfigPublica(slug: string) {
    const rows = await prisma.$queryRawUnsafe<any[]>(
      `SELECT id, slug, ativo, empresa_id AS "empresaId", mensagem_boas_vindas AS "mensagemBoasVindas", aviso_lgpd AS "avisoLgpd", whatsapp_comercial AS "whatsappComercial", cor_primaria AS "corPrimaria"
         FROM lead_funil_config WHERE slug=$1 AND ativo=true LIMIT 1`, slug)
    const cfg = rows[0]
    if (!cfg) return null
    const empresa = cfg.empresaId
      ? await prisma.empresa.findUnique({ where: { id: cfg.empresaId }, select: { razaoSocial: true, nomeFantasia: true, logoUrl: true } }).catch(() => null)
      : null
    return {
      slug: cfg.slug,
      mensagemBoasVindas: cfg.mensagemBoasVindas,
      avisoLgpd: cfg.avisoLgpd,
      empresaNome: empresa?.nomeFantasia || empresa?.razaoSocial || 'Atendimento',
      logoUrl: empresa?.logoUrl ?? null,
      whatsappComercial: cfg.whatsappComercial ?? null,
      corPrimaria: cfg.corPrimaria || '#10b981',
      turnstileSiteKey: process.env.TURNSTILE_SITE_KEY ?? null,
    }
  }

  // ── Turnstile (proteção do chat público) ───────────────────────────
  private async verifyTurnstile(token?: string | null, ip?: string): Promise<boolean> {
    const secret = process.env.TURNSTILE_SECRET
    if (!secret) return true // sem secret configurado → degrada (só rate-limit protege)
    if (!token) return false
    try {
      const body = new URLSearchParams({ secret, response: token })
      if (ip) body.set('remoteip', ip)
      const r = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body })
      const j = await r.json() as { success?: boolean }
      return !!j.success
    } catch { return false }
  }

  // ── Sessão pública ──────────────────────────────────────────────────
  async iniciarSessao(params: { slug: string; origem?: string | null; ip?: string; turnstileToken?: string | null }) {
    const cfgRows = await prisma.$queryRawUnsafe<any[]>(
      `SELECT id, empresa_id AS "empresaId" FROM lead_funil_config WHERE slug=$1 AND ativo=true LIMIT 1`, params.slug)
    const cfg = cfgRows[0]
    if (!cfg) throw new Error('Funil não encontrado ou inativo.')
    const ok = await this.verifyTurnstile(params.turnstileToken, params.ip)
    if (!ok) throw new Error('Falha na verificação anti-robô. Recarregue a página.')
    const id = randomUUID()
    const token = randomUUID().replace(/-/g, '')
    await prisma.$executeRawUnsafe(
      `INSERT INTO lead_sessao (id, token, slug, origem, ip, empresa_id, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,$6, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      id, token, params.slug, params.origem ?? null, params.ip ?? null, cfg.empresaId ?? null,
    )
    return { token }
  }

  private async sessaoPorToken(token: string) {
    const rows = await prisma.$queryRawUnsafe<any[]>(
      `SELECT id, slug, status, score, temperatura, dados, oportunidade_id AS "oportunidadeId", empresa_id AS "empresaId"
         FROM lead_sessao WHERE token=$1`, token)
    return rows[0] ?? null
  }

  // Regra comum de fora-de-escopo — pessoas que não são lead comercial.
  private static readonly FORA_ESCOPO_REGRA =
    'Se perceber que a pessoa NÃO é um lead comercial — está procurando emprego/enviando currículo, é um cliente atual com dúvida/suporte, ou é spam/assunto sem relação — chame a tool "rotear_trilha" com a "intencao" correta (curriculo | suporte | spam | outro) e trate cordialmente SEM coletar dados comerciais nem chamar "qualificar_lead":\n' +
    '- curriculo: informe com gentileza que vagas/currículos são tratados pelo RH e oriente o canal certo; não registre como lead.\n' +
    '- suporte: oriente o canal de suporte/atendimento ao cliente.\n' +
    '- spam/outro: agradeça e encerre com cordialidade.'

  private systemPrompt(cfg: any, jaRegistrado = false, trilhas: Array<{ slug: string; nome: string; descricaoRoteamento: string | null }> = []): string {
    // ── Modo ROTEADOR (config-hub "Recepção") ──
    if (cfg.roteador) {
      const lista = trilhas.length
        ? trilhas.map(t => `- ${t.nome} (slug: ${t.slug})${t.descricaoRoteamento ? `: ${t.descricaoRoteamento}` : ''}`).join('\n')
        : '(nenhuma trilha configurada — trate como atendimento comercial geral)'
      return `Você é a recepção do atendimento virtual de um escritório de contabilidade brasileiro. Converse em português do Brasil, natural e cordial, UMA pergunta por vez — nunca ofereça menus numerados.

Seu papel: em 1 a 3 mensagens, entender o que a pessoa quer e ENCAMINHAR para a trilha certa (chamando a tool "rotear_trilha"). Não anuncie o encaminhamento — apenas conduza; a conversa continua naturalmente na trilha escolhida.

## Trilhas disponíveis
${lista}

REGRAS:
- Faça perguntas curtas pra identificar a intenção. Assim que reconhecer a trilha certa, chame "rotear_trilha" com { "trilhaSlug": "<slug da trilha>", "intencao": "lead_comercial" }. Não invente trilha fora da lista; na dúvida entre duas, faça mais uma pergunta ou escolha a mais próxima.
- ${LeadService.FORA_ESCOPO_REGRA}
- Não invente informações. Seja breve e acolhedor.`
    }

    // ── Modo TRILHA (atendimento comercial normal) ──
    return `Você é um atendente comercial virtual de um escritório de contabilidade brasileiro, atendendo um possível cliente (lead) que veio de uma campanha. Converse em português do Brasil, de forma natural, cordial e objetiva — NUNCA ofereça menus ou opções numeradas; faça a conversa fluir como um humano.

REGRAS:
- Siga a trilha de atendimento abaixo para descobrir o que precisa, sem parecer um questionário. Faça uma pergunta por vez.
- Sempre que descobrir ou atualizar dados do lead, chame a tool "qualificar_lead" com TODOS os dados que você já sabe + uma pontuação (score 0-100) conforme a rubrica. Marque "prontoParaRegistrar" como true assim que tiver pelo menos o NOME e um CONTATO (e-mail ou telefone).
- Não invente informações. Se o lead informar um CNPJ, peça confirmação e siga.
- Mantenha o foco no atendimento comercial; não responda assuntos fora desse escopo.
- ${LeadService.FORA_ESCOPO_REGRA}
- Conduza a conversa pela trilha INTEIRA antes de encerrar: descubra o serviço de interesse, o faturamento aproximado e a urgência (e o CNPJ/ramo, se houver). Uma pergunta por vez. NÃO encerre a conversa só porque já tem o nome e o contato — continue qualificando.
- O registro é AUTOMÁTICO e INSTANTÂNEO (acontece nos bastidores quando você chama a tool com nome + contato). NUNCA diga que está "registrando", "só um segundo" ou "aguarde", e não peça paciência.
- Só quando você CONCLUIR a qualificação e já tiver orientado o lead: finalize de forma definitiva e calorosa e marque "encerrar": true na tool. Enquanto a conversa continuar, mantenha "encerrar": false (ou omita).
${jaRegistrado ? `- Este lead já foi registrado e o time comercial já foi avisado; não diga que vai registrar nem se desculpe por demora.` : ''}

## Trilha de atendimento
${cfg.trilhaPrompt || LeadService.TRILHA_PADRAO}

## Rubrica de pontuação (pesos)
${cfg.rubrica || LeadService.RUBRICA_PADRAO}

## Regras de finalização
${cfg.regrasFinalizacao || LeadService.REGRAS_FINALIZACAO_PADRAO}`
  }

  private readonly TOOL = {
    name: 'qualificar_lead',
    description: 'Registra/atualiza os dados estruturados do lead e a pontuação conforme a rubrica.',
    input_schema: {
      type: 'object' as const,
      properties: {
        nome: { type: 'string' }, email: { type: 'string' }, telefone: { type: 'string' },
        cnpj: { type: 'string' }, razaoSocial: { type: 'string' },
        servicoInteresse: { type: 'string' }, faturamentoFaixa: { type: 'string' }, urgencia: { type: 'string' },
        resumo: { type: 'string', description: 'Resumo curto do lead pro comercial' },
        score: { type: 'integer', description: '0 a 100 conforme a rubrica' },
        prontoParaRegistrar: { type: 'boolean' },
        encerrar: { type: 'boolean', description: 'true SOMENTE quando a qualificação foi concluída e o lead já foi orientado/encaminhado — dispara o fechamento' },
      },
    },
  }

  // Roteamento (recepção) + classificação de intenção (fora de escopo).
  private readonly TOOL_ROTEAR = {
    name: 'rotear_trilha',
    description: 'Encaminha a conversa para a trilha de atendimento certa, OU classifica a pessoa como fora do escopo comercial (currículo/suporte/spam).',
    input_schema: {
      type: 'object' as const,
      properties: {
        trilhaSlug: { type: 'string', description: 'slug EXATO da trilha escolhida (quando é lead comercial que se encaixa numa das trilhas listadas)' },
        intencao: {
          type: 'string',
          enum: ['lead_comercial', 'curriculo', 'suporte', 'spam', 'outro'],
          description: 'lead_comercial = seguir na trilha; os demais = fora do escopo comercial (não registrar como lead)',
        },
      },
      required: ['intencao'],
    },
  }

  /** Chat com streaming. Conversa fluida + extração via tool. */
  async chatStream(token: string, mensagens: LeadChatMsg[], onEvent: (e: StreamEvent) => void): Promise<void> {
    const client = this.getClient()
    if (!client) { onEvent({ type: 'error', message: 'Atendimento indisponível no momento.' }); return }
    const sessao = await this.sessaoPorToken(token)
    if (!sessao) { onEvent({ type: 'error', message: 'Sessão inválida.' }); return }
    // Config completa (com flag roteador). Pode TROCAR no meio do turno se a IA rotear.
    let cfg = await this.getConfig(sessao.empresaId, sessao.slug)
    let slugAtual: string = sessao.slug || cfg.slug || 'atendimento'
    let trilhas = cfg.roteador ? await this.listTrilhasParaRoteador(sessao.empresaId) : []
    const trilhasSlugs = new Set(trilhas.map(t => t.slug))

    let resposta = ''
    let toolInput: LeadDados & { score?: number; prontoParaRegistrar?: boolean; encerrar?: boolean } = {}
    let foraEscopo = false
    let intencao: string | null = null
    try {
      // Loop de tool-use: devolvemos tool_result e deixamos o modelo CONTINUAR.
      const convo: any[] = mensagens.map(m => ({ role: m.role, content: m.content }))
      let rodadas = 0
      while (rodadas++ < 5) {
        // Roteador só oferece rotear_trilha; trilha normal oferece as duas (permite
        // re-rotear/marcar fora de escopo no meio da conversa).
        const tools = cfg.roteador ? [this.TOOL_ROTEAR] : [this.TOOL, this.TOOL_ROTEAR]
        const stream = client.messages.stream({
          model: this.MODEL,
          max_tokens: 1200,
          system: this.systemPrompt(cfg, sessao.status === 'registrado', trilhas),
          tools,
          messages: convo,
        })
        stream.on('text', (delta) => { if (delta) { resposta += delta; onEvent({ type: 'text', text: delta }) } })
        const final = await stream.finalMessage()
        const toolUses = final.content.filter((b: any) => b.type === 'tool_use') as any[]
        const results: any[] = []
        for (const tu of toolUses) {
          if (tu.name === 'qualificar_lead') {
            toolInput = { ...toolInput, ...(tu.input as object) }
            results.push({ type: 'tool_result', tool_use_id: tu.id, content: 'Dados recebidos e registrados com sucesso.' })
          } else if (tu.name === 'rotear_trilha') {
            const inp = (tu.input ?? {}) as { trilhaSlug?: string; intencao?: string }
            if (inp.intencao && inp.intencao !== 'lead_comercial') {
              foraEscopo = true; intencao = inp.intencao
              results.push({ type: 'tool_result', tool_use_id: tu.id, content: 'Classificado como fora do escopo comercial — oriente a pessoa conforme a intenção e NÃO colete dados comerciais.' })
            } else if (inp.trilhaSlug && trilhasSlugs.has(inp.trilhaSlug)) {
              slugAtual = inp.trilhaSlug
              cfg = await this.getConfig(sessao.empresaId, slugAtual)
              trilhas = []
              results.push({ type: 'tool_result', tool_use_id: tu.id, content: `Encaminhado para a trilha "${slugAtual}". Continue o atendimento nessa trilha, naturalmente, sem anunciar o encaminhamento.` })
            } else {
              results.push({ type: 'tool_result', tool_use_id: tu.id, content: 'Trilha não reconhecida — faça mais uma pergunta pra identificar a trilha certa.' })
            }
          }
        }
        if (final.stop_reason !== 'tool_use' || !toolUses.length) break
        if (resposta && !/\s$/.test(resposta)) { resposta += '\n\n'; onEvent({ type: 'text', text: '\n\n' }) }
        convo.push({ role: 'assistant', content: final.content })
        convo.push({ role: 'user', content: results })
      }
    } catch (e) {
      onEvent({ type: 'error', message: (e as Error).message }); return
    }

    // Persiste o turno (última msg do usuário + resposta)
    const ultUser = [...mensagens].reverse().find(m => m.role === 'user')
    if (ultUser) await this.salvarMsg(sessao.id, 'user', ultUser.content)
    if (resposta.trim()) await this.salvarMsg(sessao.id, 'assistant', resposta)

    // Atualiza dados + score/temperatura + slug (pode ter mudado no roteamento).
    const dadosAtual: LeadDados = { ...(sessao.dados ?? {}), ...toolInput }
    delete (dadosAtual as any).score; delete (dadosAtual as any).prontoParaRegistrar; delete (dadosAtual as any).encerrar
    if (foraEscopo) (dadosAtual as any).intencao = intencao
    const score = foraEscopo ? null : (typeof toolInput.score === 'number' ? Math.max(0, Math.min(100, toolInput.score)) : (sessao.score ?? null))
    const temperatura = score == null ? null : score >= (cfg.limiarAlto ?? 70) ? 'quente' : score >= (cfg.limiarMedio ?? 40) ? 'morno' : 'frio'
    const statusFinal = sessao.status === 'registrado' ? 'registrado' : (foraEscopo ? 'fora_escopo' : (sessao.status ?? 'em_andamento'))
    await prisma.$executeRawUnsafe(
      `UPDATE lead_sessao SET dados=$2::jsonb, score=$3, temperatura=$4, slug=$5, status=$6, updated_at=CURRENT_TIMESTAMP WHERE id=$1`,
      sessao.id, JSON.stringify(dadosAtual), score, temperatura, slugAtual, statusFinal,
    )

    // Registro SILENCIOSO só se for lead comercial (não fora de escopo) com nome + contato.
    const temContato = !!dadosAtual.nome && (!!dadosAtual.email || !!dadosAtual.telefone)
    if (!foraEscopo && sessao.status !== 'registrado' && temContato) {
      await this.registrarNoCrm(sessao.id, dadosAtual, score, temperatura, sessao.empresaId, slugAtual).catch(() => {})
    }
    // Fechamento (CTA de encerramento) só quando a IA sinaliza que concluiu a qualificação.
    if (toolInput.encerrar) {
      onEvent({ type: 'fechamento', temperatura: temperatura ?? sessao.temperatura ?? 'frio' })
    }
    onEvent({ type: 'done', score, temperatura })
  }

  private async salvarMsg(sessaoId: string, role: string, conteudo: string) {
    await prisma.$executeRawUnsafe(
      `INSERT INTO lead_sessao_mensagem (id, sessao_id, role, conteudo) VALUES ($1,$2,$3,$4)`,
      randomUUID(), sessaoId, role, conteudo,
    ).catch(() => {})
  }

  /** Cria a Oportunidade no CRM (dedupe + notifica comercial via crmService). */
  private async registrarNoCrm(sessaoId: string, dados: LeadDados, score: number | null, temperatura: string | null, empresaId?: string | null, campanhaSlug?: string | null) {
    // Enriquecimento por CNPJ (CNAE/razão) — best-effort
    let cnaeCodigo: string | null = null, cnaeDescricao: string | null = null, razaoSocial = dados.razaoSocial ?? null
    const cnpjDigits = (dados.cnpj ?? '').replace(/\D/g, '')
    if (cnpjDigits.length === 14) {
      const info = await this.cnpjService.consultarCnpj(cnpjDigits).catch(() => null)
      if (info) {
        cnaeCodigo = info.cnaePrincipalCodigo ?? null
        cnaeDescricao = info.atividadePrincipal ?? null
        razaoSocial = razaoSocial || info.razaoSocial || null
      }
    }
    const etapas = await this.crmService.listEtapas(empresaId ?? undefined).catch(() => [] as any[])
    const etapaId = etapas[0]?.id
    if (!etapaId) return
    const titulo = razaoSocial || dados.nome || 'Lead (campanha)'
    const op = await this.crmService.create({
      titulo,
      descricao: dados.resumo ? `Lead da campanha (IA).\n\n${dados.resumo}` : 'Lead capturado pelo atendimento por IA.',
      etapaId,
      origem: 'lead-ia',
      cpfCnpj: cnpjDigits || null,
      razaoSocial,
      cnaeCodigo,
      cnaeDescricao,
      contatoNome: dados.nome ?? null,
      contatoEmail: dados.email ?? null,
      contatoTelefone: dados.telefone ?? null,
      campanhaSlug: campanhaSlug ?? null,
    } as any, undefined, empresaId ?? undefined).catch((e: Error) => {
      console.error('[Lead] FALHA ao registrar oportunidade no CRM:', e.message)
      return null
    })
    if (!op?.id) {
      // [QA #22] Nunca perder lead em silêncio: se a criação falhou, avisa o
      // comercial (fallback: masters) pra registrar manualmente.
      const comercial = await this.resolverComercial(empresaId)
      const alvo = comercial.length
        ? comercial
        : (await prisma.user.findMany({ where: { isMaster: true, isActive: true }, select: { id: true } }).catch(() => [] as Array<{ id: string }>)).map(u => u.id)
      if (alvo.length) {
        await this.notificationService.criarParaUsers(alvo, {
          titulo: 'Falha ao registrar lead no CRM',
          mensagem: `Lead "${dados.nome ?? razaoSocial ?? 'sem nome'}" qualificado pelo chat NÃO foi registrado no funil — registre manualmente (contato: ${[dados.email, dados.telefone].filter(Boolean).join(' · ') || '—'}).`,
          tipo: 'error', origem: 'lead-ia', empresaId,
        }).catch(() => {})
      }
      return
    }
    await prisma.$executeRawUnsafe(`UPDATE oportunidades SET score=$2, temperatura=$3 WHERE id=$1`, op.id, score, temperatura).catch(() => {})
    await prisma.$executeRawUnsafe(`UPDATE lead_sessao SET status='registrado', oportunidade_id=$2, cliente_id=$3, updated_at=CURRENT_TIMESTAMP WHERE id=$1`, sessaoId, op.id, (op as any).clienteId ?? null).catch(() => {})
  }

  // ── Admin / relatório ────────────────────────────────────────────────
  async listSessoes(empresaId?: string | null, limite = 100) {
    return prisma.$queryRawUnsafe<any[]>(
      `SELECT id, slug, origem, status, score, temperatura, dados, oportunidade_id AS "oportunidadeId", created_at AS "createdAt"
         FROM lead_sessao WHERE empresa_id IS NOT DISTINCT FROM $1 ORDER BY created_at DESC LIMIT ${Math.min(limite, 300)}`,
      empresaId ?? null,
    ).catch(() => [] as any[])
  }

  /** Conversa completa de um lead vinculado a uma oportunidade (consulta no card do CRM). */
  async conversaPorOportunidade(oportunidadeId: string, empresaId?: string | null) {
    const sessoes = await prisma.$queryRawUnsafe<any[]>(
      `SELECT id, slug, origem, status, score, temperatura, dados, created_at AS "createdAt"
         FROM lead_sessao
        WHERE oportunidade_id=$1 AND empresa_id IS NOT DISTINCT FROM $2
        ORDER BY created_at DESC LIMIT 1`,
      oportunidadeId, empresaId ?? null,
    ).catch(() => [] as any[])
    const sessao = sessoes[0]
    if (!sessao) return null
    const mensagens = await prisma.$queryRawUnsafe<any[]>(
      `SELECT role, conteudo, created_at AS "createdAt" FROM lead_sessao_mensagem WHERE sessao_id=$1 ORDER BY created_at ASC`,
      sessao.id,
    ).catch(() => [] as any[])
    return { sessao, mensagens }
  }

  async reportFunil(dias: number | null, empresaId?: string | null) {
    const desde = dias ? new Date(Date.now() - dias * 86400000) : null
    const rows = await prisma.$queryRawUnsafe<any[]>(
      `SELECT status, temperatura, origem, slug FROM lead_sessao
        WHERE empresa_id IS NOT DISTINCT FROM $1 ${desde ? 'AND created_at >= $2' : ''}`,
      ...(desde ? [empresaId ?? null, desde] : [empresaId ?? null]),
    ).catch(() => [] as any[])
    const total = rows.length
    const registrados = rows.filter(r => r.status === 'registrado').length
    const porTemp = { quente: 0, morno: 0, frio: 0 } as Record<string, number>
    const porOrigem: Record<string, number> = {}
    // Agregação por campanha (slug do funil)
    type CampAgg = { slug: string; total: number; registrados: number; quente: number; morno: number; frio: number }
    const campMap = new Map<string, CampAgg>()
    for (const r of rows) {
      if (r.temperatura) porTemp[r.temperatura] = (porTemp[r.temperatura] ?? 0) + 1
      const o = r.origem || '(direto)'; porOrigem[o] = (porOrigem[o] ?? 0) + 1
      const slug = r.slug || '(sem campanha)'
      const c = campMap.get(slug) ?? { slug, total: 0, registrados: 0, quente: 0, morno: 0, frio: 0 }
      c.total++
      if (r.status === 'registrado') c.registrados++
      if (r.temperatura === 'quente') c.quente++
      else if (r.temperatura === 'morno') c.morno++
      else if (r.temperatura === 'frio') c.frio++
      campMap.set(slug, c)
    }
    // Nome amigável por slug
    const nomes = await prisma.$queryRawUnsafe<any[]>(
      `SELECT slug, nome FROM lead_funil_config WHERE empresa_id IS NOT DISTINCT FROM $1`, empresaId ?? null,
    ).catch(() => [] as any[])
    const nomeBySlug = new Map(nomes.map(n => [n.slug, n.nome]))
    const porCampanha = [...campMap.values()].map(c => ({
      slug: c.slug,
      nome: nomeBySlug.get(c.slug) || (c.slug === '(sem campanha)' ? 'Sem campanha' : c.slug),
      total: c.total,
      registrados: c.registrados,
      taxaConversao: c.total > 0 ? Math.round((c.registrados / c.total) * 100) : 0,
      porTemperatura: { quente: c.quente, morno: c.morno, frio: c.frio },
    })).sort((a, b) => b.total - a.total)
    return {
      total, registrados,
      taxaConversao: total > 0 ? Math.round((registrados / total) * 100) : 0,
      porTemperatura: porTemp,
      porOrigem: Object.entries(porOrigem).map(([origem, count]) => ({ origem, count })).sort((a, b) => b.count - a.count),
      porCampanha,
    }
  }

  // ── Agendamento do lead quente ──────────────────────────────────────
  private async ensureAiUser(): Promise<string> {
    const email = 'ia-assistente@central-rnc.com.br'
    const ex = await prisma.user.findUnique({ where: { email }, select: { id: true } })
    if (ex) return ex.id
    const c = await prisma.user.create({
      data: { email, name: 'IA Assistente', emailVerified: true, isAi: true, isActive: true, role: 'COLABORADOR_INTERNO' },
      select: { id: true },
    })
    return c.id
  }

  /** Get-or-create do tipo de evento dedicado às reuniões agendadas pelo chat. */
  /**
   * Resolve o tipo "Reunião com Lead" — NUNCA cria tipo novo (o sistema não deve gerar
   * tipos de evento automaticamente). Ordem: "Reunião com Lead" por nome → qualquer tipo
   * ativo que bloqueia agenda (fallback). O tipo "Reunião com Lead" é semeado nos defaults
   * globais (add_agenda_tipo_sala_empresa.sql) e pode ser trocado em /crm/funil.
   */
  private async resolverTipoReuniaoLead(): Promise<string | null> {
    const ex = await prisma.agendaTipo.findFirst({
      where: { nome: { equals: 'Reunião com Lead', mode: 'insensitive' }, isActive: true },
      select: { id: true },
    }).catch(() => null)
    if (ex) return ex.id
    const fb = await prisma.agendaTipo.findFirst({
      where: { isActive: true, bloqueiaAgenda: true },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    }).catch(() => null)
    return fb?.id ?? null
  }

  private async resolverComercial(empresaId?: string | null): Promise<string[]> {
    const users = await prisma.user.findMany({
      // [QA #27] isAi:false defensivo — hoje o usuário IA não tem área, mas se
      // alguém o colocar na "Comercial", não deve receber sino/e-mail de lead.
      where: { isActive: true, isAi: false, area: { name: { equals: 'Comercial', mode: 'insensitive' } }, ...(empresaId ? { empresaId } : {}) },
      select: { id: true },
    }).catch(() => [] as { id: string }[])
    return users.map(u => u.id)
  }

  /** Horários sugeridos (próximos dias úteis × faixas). MVP sem filtro de agenda. */
  async sugestoesHorario(): Promise<Array<{ data: string; horaInicio: string; label: string }>> {
    const horas = ['09:00', '11:00', '14:00', '16:00']
    const out: Array<{ data: string; horaInicio: string; label: string }> = []
    const d = new Date(); d.setHours(0, 0, 0, 0)
    let dias = 0
    while (out.length < 8 && dias < 14) {
      d.setDate(d.getDate() + 1); dias++
      const dow = d.getDay()
      if (dow === 0 || dow === 6) continue
      const dataIso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      const dataBr = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`
      for (const h of horas) { if (out.length < 8) out.push({ data: dataIso, horaInicio: h, label: `${dataBr} · ${h}` }) }
    }
    return out
  }

  async agendarReuniao(token: string, data: string, horaInicio: string) {
    const s = await this.sessaoPorToken(token)
    if (!s) throw new Error('Sessão inválida.')
    const dados: LeadDados = s.dados ?? {}
    // Tipo dedicado "Reunião com Lead" (config pode sobrescrever em /crm/funil).
    const cfgRows = await prisma.$queryRawUnsafe<any[]>(`SELECT tipo_evento_reuniao_id AS "tipoEventoReuniaoId" FROM lead_funil_config WHERE slug=$1 LIMIT 1`, s.slug)
    const tipoId = cfgRows[0]?.tipoEventoReuniaoId || await this.resolverTipoReuniaoLead()
    if (!tipoId) throw new Error('Nenhum tipo de evento disponível para agendar. Cadastre "Reunião com Lead" na Agenda Corporativa.')
    const [h, m] = horaInicio.split(':').map(Number)
    const horaFim = `${String((h ?? 0) + 1).padStart(2, '0')}:${String(m ?? 0).padStart(2, '0')}`
    const criadorId = await this.ensureAiUser()
    const comercial = await this.resolverComercial(s.empresaId)
    const leadNome = dados.nome || dados.razaoSocial || 'Lead'
    const contatoLead = [dados.nome, dados.email, dados.telefone].filter(Boolean).join(' · ') || null

    // [QA #24] Sem ninguém na área Comercial, a reunião nasceria sem participantes
    // e ninguém saberia — avisa os masters (a reunião ainda é criada).
    if (comercial.length === 0) {
      console.warn('[Lead] Nenhum usuário na área Comercial — reunião de lead será criada sem participantes')
      const masters = (await prisma.user.findMany({ where: { isMaster: true, isActive: true }, select: { id: true } }).catch(() => [] as Array<{ id: string }>)).map(u => u.id)
      if (masters.length) {
        await this.notificationService.criarParaUsers(masters, {
          titulo: 'Reunião de lead sem participantes',
          mensagem: `${leadNome} agendou ${data} ${horaInicio}, mas não há usuários na área "Comercial" para participar — verifique o organograma.`,
          tipo: 'warning', origem: 'lead-ia', empresaId: s.empresaId,
        }).catch(() => {})
      }
    }

    // [QA #25] Vincula a oportunidade só se o card ainda existir e estiver ativo
    // (pode ter sido excluído entre a qualificação e o agendamento).
    let oportunidadeId = s.oportunidadeId ?? undefined
    if (oportunidadeId) {
      const op = await prisma.oportunidade.findFirst({ where: { id: oportunidadeId, isActive: true }, select: { id: true } }).catch(() => null)
      if (!op) oportunidadeId = undefined
    }

    try {
      const ev = await this.agendaService.create({
        titulo: `Reunião com lead — ${leadNome}`,
        descricao: `Reunião solicitada por lead da campanha.\nContato: ${contatoLead ?? '—'}\n${dados.resumo ?? ''}`.trim(),
        data, horaInicio, horaFim, tipoId,
        empresaId: s.empresaId ?? undefined,
        oportunidadeId,
        participanteIds: comercial,        // usuários do comercial
        participantesAvulsos: [leadNome],  // o próprio lead (contato externo)
        contato: contatoLead,
        notificar: true,
      } as any, criadorId)
      // Lembrete por e-mail pra equipe comercial na véspera às 08:00.
      // minutosAntes = (horário do evento) - (08:00 do dia anterior) = 960 + h*60 + m.
      const eventoId = Array.isArray(ev) ? ev[0]?.id : (ev as any)?.id
      if (eventoId) {
        const minutosAntes = 960 + (h ?? 0) * 60 + (m ?? 0)
        if (minutosAntes > 0 && minutosAntes <= 43200) {
          await this.agendaLembreteService.save(eventoId, [{ canal: 'EMAIL' as any, minutosAntes }]).catch(() => {})
        }
      }
    } catch {
      if (comercial.length) await this.notificationService.criarParaUsers(comercial, {
        titulo: 'Lead quente quer agendar reunião',
        mensagem: `${dados.nome ?? 'Lead'} sugeriu ${data} ${horaInicio}`,
        tipo: 'warning', link: s.oportunidadeId ? `/crm/oportunidades/${s.oportunidadeId}` : '/crm', origem: 'lead-ia', empresaId: s.empresaId,
      }).catch(() => {})
      throw new Error('Não consegui agendar automaticamente — nosso time entrará em contato para confirmar.')
    }
    return { ok: true }
  }
}
