import { Injectable, Inject } from '@nestjs/common'
import { prisma } from '@saas/db'
import { randomUUID } from 'crypto'
import { WhatsappCloudService } from './whatsapp-cloud.service'
import { WhatsappEventsService } from './whatsapp-events.service'

const EMP_DEFAULT = 'cmnn7xm6e00009gqgoii3ims2' // CENTRAL CONTÁBIL (tenant ativo)

@Injectable()
export class WhatsappService {
  constructor(
    @Inject(WhatsappCloudService) private readonly cloud: WhatsappCloudService,
    @Inject(WhatsappEventsService) private readonly events: WhatsappEventsService,
  ) {}

  private emp(empresaId?: string | null) { return empresaId || EMP_DEFAULT }

  /** Destinatários do SSE: responsável (se houver) ou todos os usuários ativos da empresa. */
  private async destinatarios(conversa: { responsavelId?: string | null; empresaId?: string | null }): Promise<string[]> {
    if (conversa.responsavelId) return [conversa.responsavelId]
    const users = (await prisma.$queryRawUnsafe(
      `SELECT id FROM users WHERE is_active = true AND ($1::text IS NULL OR empresa_id = $1)`,
      conversa.empresaId ?? null,
    )) as Array<{ id: string }>
    return users.map(u => u.id)
  }

  // ── Inbox ─────────────────────────────────────────────
  async listConversas(filtros: { status?: string; busca?: string }, empresaId?: string | null) {
    const emp = this.emp(empresaId)
    return prisma.$queryRawUnsafe(
      `SELECT c.id, c.status, c.na_fila AS "naFila", c.responsavel_id AS "responsavelId",
              c.setor_id AS "setorId", c.nao_lidas AS "naoLidas", c.ultima_mensagem_em AS "ultimaMensagemEm",
              c.bot_pausado AS "botPausado",
              ct.id AS "contatoId", ct.nome AS "contatoNome", ct.telefone AS "contatoTelefone",
              ct.foto_url AS "contatoFoto", ct.wa_id AS "waId", ct.cliente_id AS "clienteId",
              (SELECT m.conteudo FROM whatsapp_mensagens m WHERE m.conversa_id = c.id ORDER BY m.created_at DESC LIMIT 1) AS "ultimaPrevia"
         FROM whatsapp_conversas c
         JOIN whatsapp_contatos ct ON ct.id = c.contato_id
        WHERE c.empresa_id = $1
          AND ($2::text IS NULL OR c.status = $2::"WhatsappConversaStatus")
          AND ($3::text IS NULL OR ct.nome ILIKE '%'||$3||'%' OR ct.telefone ILIKE '%'||$3||'%')
        ORDER BY c.ultima_mensagem_em DESC NULLS LAST
        LIMIT 200`,
      emp, filtros.status ?? null, filtros.busca?.trim() || null,
    )
  }

  async getConversa(id: string) {
    const rows = (await prisma.$queryRawUnsafe(
      `SELECT c.*, ct.nome AS "contatoNome", ct.telefone AS "contatoTelefone", ct.wa_id AS "waId",
              ct.foto_url AS "contatoFoto", ct.cliente_id AS "clienteId", ct.tags AS "contatoTags"
         FROM whatsapp_conversas c JOIN whatsapp_contatos ct ON ct.id = c.contato_id
        WHERE c.id = $1`, id)) as any[]
    return rows[0] ?? null
  }

  async listMensagens(conversaId: string) {
    return prisma.$queryRawUnsafe(
      `SELECT id, direcao, autor_id AS "autorId", por_bot AS "porBot", tipo, conteudo,
              midia_url AS "midiaUrl", wa_message_id AS "waMessageId", status, interna,
              created_at AS "createdAt"
         FROM whatsapp_mensagens WHERE conversa_id = $1 ORDER BY created_at ASC`, conversaId)
  }

  // ── Envio (agente) ────────────────────────────────────
  async enviarMensagem(conversaId: string, userId: string, input: { texto: string; interna?: boolean }) {
    const conv = await this.getConversa(conversaId)
    if (!conv) throw new Error('Conversa não encontrada')
    const id = randomUUID()
    let status = 'enviado'
    let waMessageId: string | null = null

    if (!input.interna) {
      const r = await this.cloud.enviarTexto(conv.waId, input.texto)
      if (!r.ok) { status = 'erro' } else { waMessageId = r.id ?? null }
      if (!r.ok) throw new Error(r.error || 'Falha ao enviar')
    }

    await prisma.$executeRawUnsafe(
      `INSERT INTO whatsapp_mensagens (id, conversa_id, direcao, autor_id, tipo, conteudo, wa_message_id, status, interna, created_at)
       VALUES ($1,$2,'OUT',$3,'texto',$4,$5,$6,$7, CURRENT_TIMESTAMP)`,
      id, conversaId, userId, input.texto, waMessageId, status, input.interna ?? false,
    )
    await prisma.$executeRawUnsafe(
      `UPDATE whatsapp_conversas SET ultima_mensagem_em = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = $1`, conversaId)

    const dest = await this.destinatarios(conv)
    this.events.emit({ type: 'mensagem-nova', conversaId, mensagem: { id, direcao: 'OUT', conteudo: input.texto, interna: input.interna ?? false, autorId: userId }, destinatarios: dest })
    return { id }
  }

  async assumir(conversaId: string, userId: string) {
    await prisma.$executeRawUnsafe(
      `UPDATE whatsapp_conversas SET responsavel_id = $2, na_fila = false, bot_pausado = true, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
      conversaId, userId)
    const conv = await this.getConversa(conversaId)
    this.events.emit({ type: 'atribuida', conversaId, responsavelId: userId, setorId: conv?.setor_id ?? null, destinatarios: await this.destinatarios({ responsavelId: null, empresaId: conv?.empresa_id }) })
    return { ok: true }
  }

  async transferir(conversaId: string, p: { setorId?: string | null; responsavelId?: string | null }) {
    await prisma.$executeRawUnsafe(
      `UPDATE whatsapp_conversas SET setor_id = $2, responsavel_id = $3, na_fila = ($3 IS NULL), updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
      conversaId, p.setorId ?? null, p.responsavelId ?? null)
    return { ok: true }
  }

  async setStatus(conversaId: string, status: string) {
    await prisma.$executeRawUnsafe(
      `UPDATE whatsapp_conversas SET status = $2::"WhatsappConversaStatus", updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
      conversaId, status)
    return { ok: true }
  }

  async marcarLida(conversaId: string) {
    await prisma.$executeRawUnsafe(`UPDATE whatsapp_conversas SET nao_lidas = 0 WHERE id = $1`, conversaId)
    // marca lido na Meta a última mensagem recebida
    const rows = (await prisma.$queryRawUnsafe(
      `SELECT wa_message_id FROM whatsapp_mensagens WHERE conversa_id = $1 AND direcao = 'IN' AND wa_message_id IS NOT NULL ORDER BY created_at DESC LIMIT 1`, conversaId)) as any[]
    if (rows[0]?.wa_message_id) this.cloud.marcarLido(rows[0].wa_message_id).catch(() => {})
    return { ok: true }
  }

  async vincularCliente(conversaId: string, clienteId: string | null) {
    const conv = await this.getConversa(conversaId)
    if (!conv) throw new Error('Conversa não encontrada')
    await prisma.$executeRawUnsafe(`UPDATE whatsapp_contatos SET cliente_id = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $1`, conv.contato_id, clienteId)
    return { ok: true }
  }

  // ── Inbound (webhook) ─────────────────────────────────
  private async acharOuCriarContato(empresaId: string, waId: string, nome?: string) {
    const rows = (await prisma.$queryRawUnsafe(
      `SELECT id FROM whatsapp_contatos WHERE empresa_id = $1 AND wa_id = $2 LIMIT 1`, empresaId, waId)) as any[]
    if (rows[0]) return rows[0].id as string
    const id = randomUUID()
    await prisma.$executeRawUnsafe(
      `INSERT INTO whatsapp_contatos (id, wa_id, telefone, nome, empresa_id, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       ON CONFLICT (empresa_id, wa_id) DO NOTHING`,
      id, waId, '+' + waId, nome ?? null, empresaId)
    const again = (await prisma.$queryRawUnsafe(`SELECT id FROM whatsapp_contatos WHERE empresa_id=$1 AND wa_id=$2 LIMIT 1`, empresaId, waId)) as any[]
    return again[0].id as string
  }

  private async acharOuCriarConversa(empresaId: string, contatoId: string, numeroId: string | null) {
    const rows = (await prisma.$queryRawUnsafe(
      `SELECT id, responsavel_id AS "responsavelId", empresa_id AS "empresaId" FROM whatsapp_conversas
        WHERE contato_id = $1 AND status <> 'FECHADA' ORDER BY created_at DESC LIMIT 1`, contatoId)) as any[]
    if (rows[0]) return rows[0]
    const id = randomUUID()
    await prisma.$executeRawUnsafe(
      `INSERT INTO whatsapp_conversas (id, contato_id, numero_id, status, na_fila, empresa_id, created_at, updated_at)
       VALUES ($1,$2,$3,'ABERTA',true,$4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      id, contatoId, numeroId, empresaId)
    return { id, responsavelId: null, empresaId }
  }

  /** Processa o payload do webhook da Meta (mensagens recebidas + status). */
  async processInbound(body: any) {
    try {
      const entry = body?.entry?.[0]
      const change = entry?.changes?.[0]
      const value = change?.value
      if (!value) return
      const phoneNumberId = value?.metadata?.phone_number_id as string | undefined

      // resolve empresa pelo número (fallback default)
      let empresaId = EMP_DEFAULT
      if (phoneNumberId) {
        const num = (await prisma.$queryRawUnsafe(`SELECT empresa_id AS "empresaId", id FROM whatsapp_numeros WHERE phone_number_id = $1 LIMIT 1`, phoneNumberId)) as any[]
        if (num[0]?.empresaId) empresaId = num[0].empresaId
      }

      // mensagens recebidas
      for (const msg of value?.messages ?? []) {
        const waId = msg.from as string
        const nomeContato = value?.contacts?.[0]?.profile?.name as string | undefined
        const contatoId = await this.acharOuCriarContato(empresaId, waId, nomeContato)
        const conv = await this.acharOuCriarConversa(empresaId, contatoId, null)

        let tipo = 'texto'; let conteudo: string | null = null; let midiaUrl: string | null = null
        if (msg.type === 'text') conteudo = msg.text?.body ?? ''
        else if (['image', 'audio', 'video', 'document', 'sticker'].includes(msg.type)) {
          tipo = msg.type === 'sticker' ? 'imagem' : ({ image: 'imagem', audio: 'audio', video: 'video', document: 'documento' } as any)[msg.type]
          const mediaId = msg[msg.type]?.id
          if (mediaId) midiaUrl = await this.cloud.getMidiaUrl(mediaId)
          conteudo = msg[msg.type]?.caption ?? null
        } else conteudo = `[${msg.type}]`

        const mid = randomUUID()
        await prisma.$executeRawUnsafe(
          `INSERT INTO whatsapp_mensagens (id, conversa_id, direcao, tipo, conteudo, midia_url, wa_message_id, status, created_at)
           VALUES ($1,$2,'IN',$3,$4,$5,$6,'recebido', CURRENT_TIMESTAMP)`,
          mid, conv.id, tipo, conteudo, midiaUrl, msg.id)
        await prisma.$executeRawUnsafe(
          `UPDATE whatsapp_conversas SET ultima_mensagem_em = CURRENT_TIMESTAMP, nao_lidas = nao_lidas + 1,
             janela_24h_expira_em = CURRENT_TIMESTAMP + interval '24 hours', updated_at = CURRENT_TIMESTAMP WHERE id = $1`, conv.id)

        const dest = await this.destinatarios({ responsavelId: conv.responsavelId, empresaId })
        this.events.emit({ type: 'mensagem-nova', conversaId: conv.id, mensagem: { id: mid, direcao: 'IN', tipo, conteudo, midiaUrl }, destinatarios: dest })
      }

      // atualizações de status (entregue/lido)
      for (const st of value?.statuses ?? []) {
        await prisma.$executeRawUnsafe(
          `UPDATE whatsapp_mensagens SET status = $2 WHERE wa_message_id = $1`,
          st.id, ({ sent: 'enviado', delivered: 'entregue', read: 'lido', failed: 'erro' } as any)[st.status] ?? st.status)
      }
    } catch (e) {
      console.error('[WhatsApp] processInbound erro:', (e as Error).message)
    }
  }
}
