import { Injectable } from '@nestjs/common'
import { prisma } from '@saas/db'
import { randomUUID } from 'crypto'
import Anthropic from '@anthropic-ai/sdk'
import type { SalvarFunilConfigInput, LeadChatMsg } from '@saas/types'
import { CnpjService } from '../cnpj/cnpj.service'
import { CrmService } from '../crm/crm.service'
import { AgendaService } from '../agenda/agenda.service'
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

  constructor(
    private readonly cnpjService: CnpjService,
    private readonly crmService: CrmService,
    private readonly agendaService: AgendaService,
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
  async getConfig(empresaId?: string | null) {
    const rows = await prisma.$queryRawUnsafe<any[]>(
      `SELECT id, slug, ativo, trilha_prompt AS "trilhaPrompt", rubrica, limiar_medio AS "limiarMedio", limiar_alto AS "limiarAlto",
              mensagem_boas_vindas AS "mensagemBoasVindas", aviso_lgpd AS "avisoLgpd", whatsapp_comercial AS "whatsappComercial",
              tipo_evento_reuniao_id AS "tipoEventoReuniaoId"
         FROM lead_funil_config WHERE empresa_id IS NOT DISTINCT FROM $1 ORDER BY created_at ASC LIMIT 1`,
      empresaId ?? null,
    )
    if (rows[0]) return rows[0]
    // default (não persiste até salvar)
    return {
      id: null, slug: 'atendimento', ativo: true,
      trilhaPrompt: 'Você é um atendente comercial. Descubra: se o lead tem CNPJ, o ramo/atividade, o serviço de interesse, o faturamento aproximado e a urgência. Conduza de forma natural e cordial.',
      rubrica: 'Tem CNPJ ativo: +30. Faturamento alto: +25. Urgência alta: +25. Serviço premium (contabilidade mensal/BPO): +20. Apenas curiosidade/sem contato: 0.',
      limiarMedio: 40, limiarAlto: 70,
      mensagemBoasVindas: 'Olá! 👋 Sou o assistente virtual. Vou te ajudar rapidinho e já encaminho você ao nosso time.',
      avisoLgpd: 'Ao continuar, você concorda que usaremos seus dados para entrar em contato sobre nossos serviços.',
      whatsappComercial: null, tipoEventoReuniaoId: null,
    }
  }

  async saveConfig(input: SalvarFunilConfigInput, empresaId?: string | null) {
    const existing = await prisma.$queryRawUnsafe<any[]>(
      `SELECT id FROM lead_funil_config WHERE empresa_id IS NOT DISTINCT FROM $1 LIMIT 1`, empresaId ?? null)
    if (existing[0]) {
      await prisma.$executeRawUnsafe(
        `UPDATE lead_funil_config SET slug=$2, ativo=$3, trilha_prompt=$4, rubrica=$5, limiar_medio=$6, limiar_alto=$7,
           mensagem_boas_vindas=$8, aviso_lgpd=$9, whatsapp_comercial=$10, tipo_evento_reuniao_id=$11, updated_at=CURRENT_TIMESTAMP WHERE id=$1`,
        existing[0].id, input.slug, input.ativo ?? true, input.trilhaPrompt, input.rubrica, input.limiarMedio, input.limiarAlto,
        input.mensagemBoasVindas ?? null, input.avisoLgpd ?? null, input.whatsappComercial ?? null, input.tipoEventoReuniaoId ?? null,
      )
      return { id: existing[0].id }
    }
    const id = randomUUID()
    await prisma.$executeRawUnsafe(
      `INSERT INTO lead_funil_config (id, empresa_id, slug, ativo, trilha_prompt, rubrica, limiar_medio, limiar_alto, mensagem_boas_vindas, aviso_lgpd, whatsapp_comercial, tipo_evento_reuniao_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      id, empresaId ?? null, input.slug, input.ativo ?? true, input.trilhaPrompt, input.rubrica, input.limiarMedio, input.limiarAlto,
      input.mensagemBoasVindas ?? null, input.avisoLgpd ?? null, input.whatsappComercial ?? null, input.tipoEventoReuniaoId ?? null,
    )
    return { id }
  }

  /** Config pública (pelo slug) — só o necessário pra renderizar a página. */
  async getConfigPublica(slug: string) {
    const rows = await prisma.$queryRawUnsafe<any[]>(
      `SELECT id, slug, ativo, empresa_id AS "empresaId", mensagem_boas_vindas AS "mensagemBoasVindas", aviso_lgpd AS "avisoLgpd", whatsapp_comercial AS "whatsappComercial"
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
      `INSERT INTO lead_sessao (id, token, slug, origem, ip, empresa_id) VALUES ($1,$2,$3,$4,$5,$6)`,
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

  private systemPrompt(cfg: any): string {
    return `Você é um atendente comercial virtual de um escritório de contabilidade brasileiro, atendendo um possível cliente (lead) que veio de uma campanha. Converse em português do Brasil, de forma natural, cordial e objetiva — NUNCA ofereça menus ou opções numeradas; faça a conversa fluir como um humano.

REGRAS:
- Siga a trilha de atendimento abaixo para descobrir o que precisa, sem parecer um questionário. Faça uma pergunta por vez.
- Sempre que descobrir ou atualizar dados do lead, chame a tool "qualificar_lead" com TODOS os dados que você já sabe + uma pontuação (score 0-100) conforme a rubrica. Marque "prontoParaRegistrar" como true assim que tiver pelo menos o NOME e um CONTATO (e-mail ou telefone).
- Não invente informações. Se o lead informar um CNPJ, peça confirmação e siga.
- Mantenha o foco no atendimento comercial; não responda assuntos fora desse escopo.
- Seja breve. Ao obter o essencial, encaminhe o lead cordialmente (o sistema cuida do próximo passo).

## Trilha de atendimento
${cfg.trilhaPrompt || '(não configurada)'}

## Rubrica de pontuação (pesos)
${cfg.rubrica || '(não configurada)'}`
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
      },
    },
  }

  /** Chat com streaming. Conversa fluida + extração via tool. */
  async chatStream(token: string, mensagens: LeadChatMsg[], onEvent: (e: StreamEvent) => void): Promise<void> {
    const client = this.getClient()
    if (!client) { onEvent({ type: 'error', message: 'Atendimento indisponível no momento.' }); return }
    const sessao = await this.sessaoPorToken(token)
    if (!sessao) { onEvent({ type: 'error', message: 'Sessão inválida.' }); return }
    const cfgRows = await prisma.$queryRawUnsafe<any[]>(
      `SELECT trilha_prompt AS "trilhaPrompt", rubrica, limiar_medio AS "limiarMedio", limiar_alto AS "limiarAlto" FROM lead_funil_config WHERE slug=$1 LIMIT 1`, sessao.slug)
    const cfg = cfgRows[0] ?? await this.getConfig(sessao.empresaId)

    let resposta = ''
    let toolInput: LeadDados & { score?: number; prontoParaRegistrar?: boolean } = {}
    try {
      const stream = client.messages.stream({
        model: this.MODEL,
        max_tokens: 1200,
        system: this.systemPrompt(cfg),
        tools: [this.TOOL],
        messages: mensagens.map(m => ({ role: m.role, content: m.content })),
      })
      stream.on('text', (delta) => { if (delta) { resposta += delta; onEvent({ type: 'text', text: delta }) } })
      const final = await stream.finalMessage()
      for (const block of final.content) {
        if (block.type === 'tool_use' && block.name === 'qualificar_lead') {
          toolInput = { ...toolInput, ...(block.input as object) }
        }
      }
    } catch (e) {
      onEvent({ type: 'error', message: (e as Error).message }); return
    }

    // Persiste o turno (última msg do usuário + resposta)
    const ultUser = [...mensagens].reverse().find(m => m.role === 'user')
    if (ultUser) await this.salvarMsg(sessao.id, 'user', ultUser.content)
    if (resposta.trim()) await this.salvarMsg(sessao.id, 'assistant', resposta)

    // Atualiza dados + score/temperatura
    const dadosAtual: LeadDados = { ...(sessao.dados ?? {}), ...toolInput }
    delete (dadosAtual as any).score; delete (dadosAtual as any).prontoParaRegistrar
    const score = typeof toolInput.score === 'number' ? Math.max(0, Math.min(100, toolInput.score)) : (sessao.score ?? null)
    const temperatura = score == null ? null : score >= (cfg.limiarAlto ?? 70) ? 'quente' : score >= (cfg.limiarMedio ?? 40) ? 'morno' : 'frio'
    await prisma.$executeRawUnsafe(
      `UPDATE lead_sessao SET dados=$2::jsonb, score=$3, temperatura=$4, updated_at=CURRENT_TIMESTAMP WHERE id=$1`,
      sessao.id, JSON.stringify(dadosAtual), score, temperatura,
    )

    // Registra no CRM assim que tiver nome + contato
    const temContato = !!dadosAtual.nome && (!!dadosAtual.email || !!dadosAtual.telefone)
    if (sessao.status !== 'registrado' && temContato) {
      await this.registrarNoCrm(sessao.id, dadosAtual, score, temperatura, sessao.empresaId).catch(() => {})
      onEvent({ type: 'fechamento', temperatura: temperatura ?? 'frio' })
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
  private async registrarNoCrm(sessaoId: string, dados: LeadDados, score: number | null, temperatura: string | null, empresaId?: string | null) {
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
    } as any, undefined, empresaId ?? undefined).catch(() => null)
    if (!op?.id) return
    await prisma.$executeRawUnsafe(`UPDATE oportunidades SET score=$2, temperatura=$3 WHERE id=$1`, op.id, score, temperatura).catch(() => {})
    await prisma.$executeRawUnsafe(`UPDATE lead_sessao SET status='registrado', oportunidade_id=$2, cliente_id=$3 WHERE id=$1`, sessaoId, op.id, (op as any).clienteId ?? null).catch(() => {})
  }

  // ── Admin / relatório ────────────────────────────────────────────────
  async listSessoes(empresaId?: string | null, limite = 100) {
    return prisma.$queryRawUnsafe<any[]>(
      `SELECT id, slug, origem, status, score, temperatura, dados, oportunidade_id AS "oportunidadeId", created_at AS "createdAt"
         FROM lead_sessao WHERE empresa_id IS NOT DISTINCT FROM $1 ORDER BY created_at DESC LIMIT ${Math.min(limite, 300)}`,
      empresaId ?? null,
    ).catch(() => [] as any[])
  }

  async reportFunil(dias: number | null, empresaId?: string | null) {
    const desde = dias ? new Date(Date.now() - dias * 86400000) : null
    const rows = await prisma.$queryRawUnsafe<any[]>(
      `SELECT status, temperatura, origem FROM lead_sessao
        WHERE empresa_id IS NOT DISTINCT FROM $1 ${desde ? 'AND created_at >= $2' : ''}`,
      ...(desde ? [empresaId ?? null, desde] : [empresaId ?? null]),
    ).catch(() => [] as any[])
    const total = rows.length
    const registrados = rows.filter(r => r.status === 'registrado').length
    const porTemp = { quente: 0, morno: 0, frio: 0 } as Record<string, number>
    const porOrigem: Record<string, number> = {}
    for (const r of rows) {
      if (r.temperatura) porTemp[r.temperatura] = (porTemp[r.temperatura] ?? 0) + 1
      const o = r.origem || '(direto)'; porOrigem[o] = (porOrigem[o] ?? 0) + 1
    }
    return {
      total, registrados,
      taxaConversao: total > 0 ? Math.round((registrados / total) * 100) : 0,
      porTemperatura: porTemp,
      porOrigem: Object.entries(porOrigem).map(([origem, count]) => ({ origem, count })).sort((a, b) => b.count - a.count),
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

  private async resolverComercial(empresaId?: string | null): Promise<string[]> {
    const users = await prisma.user.findMany({
      where: { isActive: true, area: { name: { equals: 'Comercial', mode: 'insensitive' } }, ...(empresaId ? { empresaId } : {}) },
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
    const cfgRows = await prisma.$queryRawUnsafe<any[]>(`SELECT tipo_evento_reuniao_id AS "tipoEventoReuniaoId" FROM lead_funil_config WHERE slug=$1 LIMIT 1`, s.slug)
    let tipoId: string | undefined = cfgRows[0]?.tipoEventoReuniaoId
    if (!tipoId) { const tipos = await this.agendaService.listTipos().catch(() => [] as any[]); tipoId = tipos[0]?.id }
    if (!tipoId) throw new Error('Nenhum tipo de evento configurado para a reunião.')
    const [h, m] = horaInicio.split(':').map(Number)
    const horaFim = `${String((h ?? 0) + 1).padStart(2, '0')}:${String(m ?? 0).padStart(2, '0')}`
    const criadorId = await this.ensureAiUser()
    const comercial = await this.resolverComercial(s.empresaId)
    try {
      await this.agendaService.create({
        titulo: `Reunião — ${dados.nome || dados.razaoSocial || 'Lead'}`,
        descricao: `Reunião solicitada por lead da campanha.\n${dados.resumo ?? ''}`,
        data, horaInicio, horaFim, tipoId,
        empresaId: s.empresaId ?? undefined,
        oportunidadeId: s.oportunidadeId ?? undefined,
        participanteIds: comercial,
        notificar: true,
      } as any, criadorId)
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
