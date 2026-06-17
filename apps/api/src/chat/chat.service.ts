import { Injectable, Inject, forwardRef } from '@nestjs/common'
import { prisma } from '@saas/db'
import { ChatEventsService } from './chat-events.service'
import { PushService } from '../push/push.service'

@Injectable()
export class ChatService {
  constructor(
    @Inject(forwardRef(() => ChatEventsService))
    private readonly events: ChatEventsService,
    @Inject(PushService) private readonly pushService: PushService,
  ) {}

  // ============================================================
  // Listagem
  // ============================================================

  /**
   * Lista todas conversas que o user participa, com contador de não lidas
   * e última mensagem. Ordena por última atividade (mais recente primeiro).
   */
  async listMinhasConversas(userId: string) {
    const conversas = await prisma.chatConversa.findMany({
      where: {
        participantes: {
          // Filtra conversas onde EU sou participante E não escondi pra mim
          some: { usuarioId: userId, hiddenAt: null },
        },
      },
      include: {
        participantes: {
          include: { usuario: { select: { id: true, name: true, email: true, image: true } } },
        },
        mensagens: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { id: true, conteudo: true, autorId: true, createdAt: true },
        },
      },
      orderBy: [
        { ultimaMensagemEm: { sort: 'desc', nulls: 'last' } },
        { createdAt: 'desc' },
      ],
    })

    // Computa unread count em paralelo pra cada conversa
    const resultado = await Promise.all(conversas.map(async (c) => {
      const meuPart = c.participantes.find(p => p.usuarioId === userId)
      const outros = c.participantes.filter(p => p.usuarioId !== userId)
      const nomeExibido = c.isGrupo
        ? (c.nome || `Grupo (${c.participantes.length})`)
        : (outros[0]?.usuario.name || 'Conversa')

      const meuLastReadAt = meuPart?.lastReadAt ?? null
      const unreadCount = await prisma.chatMensagem.count({
        where: {
          conversaId: c.id,
          autorId: { not: userId },
          ...(meuLastReadAt ? { createdAt: { gt: meuLastReadAt } } : {}),
        },
      })

      return {
        id: c.id,
        nome: nomeExibido,
        isGrupo: c.isGrupo,
        ultimaMensagem: c.mensagens[0] ?? null,
        ultimaMensagemEm: c.ultimaMensagemEm,
        participantes: c.participantes.map(p => ({
          id: p.usuario.id,
          name: p.usuario.name,
          email: p.usuario.email,
          image: p.usuario.image,
          lastReadAt: p.lastReadAt,
        })),
        unreadCount,
      }
    }))

    return resultado
  }

  // ============================================================
  // Criação de conversa
  // ============================================================

  /**
   * Cria (ou retorna existente) uma DM entre o user logado e outroUserId.
   * Lookup: conversa não-grupo com EXATAMENTE 2 participantes (eu + outro).
   */
  async getOuCriarDM(meuUserId: string, outroUserId: string) {
    if (meuUserId === outroUserId) {
      throw new Error('Não é possível abrir conversa consigo mesmo')
    }

    const outro = await prisma.user.findUnique({
      where: { id: outroUserId },
      select: { id: true, isActive: true },
    })
    if (!outro?.isActive) {
      throw new Error('Usuario indisponivel para iniciar conversa')
    }

    // Busca DM existente entre os 2
    const existente = await prisma.chatConversa.findFirst({
      where: {
        isGrupo: false,
        AND: [
          { participantes: { some: { usuarioId: meuUserId } } },
          { participantes: { some: { usuarioId: outroUserId } } },
        ],
      },
    })
    if (existente) {
      // Confirma que tem só 2 participantes (race condition defensivo)
      const count = await prisma.chatParticipante.count({ where: { conversaId: existente.id } })
      if (count === 2) {
        // Se a conversa foi "excluida para mim", abrir a DM pela lista de
        // pessoas deve reexibi-la. Sem isso, listConversas() filtra hiddenAt
        // e o frontend nao consegue selecionar a conversa retornada.
        await prisma.chatParticipante.updateMany({
          where: { conversaId: existente.id, usuarioId: meuUserId },
          data: { hiddenAt: null },
        })
        return this.getConversa(existente.id, meuUserId)
      }
    }

    const novaConversa = await prisma.$transaction(async (tx) => tx.chatConversa.create({
      data: {
        isGrupo: false,
        criadorId: meuUserId,
        participantes: {
          create: [
            { usuarioId: meuUserId, papel: 'membro', lastReadAt: new Date() },
            { usuarioId: outroUserId, papel: 'membro' },
          ],
        },
      },
    }))
    this.events.emit('conversa-criada', {
      conversaId: novaConversa.id,
      destinatarios: [meuUserId, outroUserId],
    })
    return this.getConversa(novaConversa.id, meuUserId)
  }

  /** Cria um grupo com nome + lista de membros (criador entra como admin). */
  async criarGrupo(meuUserId: string, nome: string, outrosIds: string[]) {
    const nomeLimpo = nome.trim()
    if (!nomeLimpo) throw new Error('Nome do grupo é obrigatório')
    const membros = Array.from(new Set([meuUserId, ...outrosIds.filter(id => id && id !== meuUserId)]))
    if (membros.length < 2) throw new Error('Adicione ao menos 1 outro participante')

    const conversa = await prisma.chatConversa.create({
      data: {
        nome: nomeLimpo,
        isGrupo: true,
        criadorId: meuUserId,
        participantes: {
          create: membros.map(uid => ({
            usuarioId: uid,
            papel: uid === meuUserId ? 'admin' : 'membro',
          })),
        },
      },
    })

    this.events.emit('conversa-criada', { conversaId: conversa.id, destinatarios: membros })
    return this.getConversa(conversa.id, meuUserId)
  }

  // ============================================================
  // Mensagens
  // ============================================================

  /** Detalhe de uma conversa (verifica acesso). */
  async getConversa(conversaId: string, meuUserId: string) {
    const c = await prisma.chatConversa.findUniqueOrThrow({
      where: { id: conversaId },
      include: {
        participantes: {
          include: { usuario: { select: { id: true, name: true, email: true, image: true } } },
        },
      },
    })
    const sou = c.participantes.find(p => p.usuarioId === meuUserId)
    if (!sou) throw new Error('Sem acesso a essa conversa')

    const outros = c.participantes.filter(p => p.usuarioId !== meuUserId)
    const nomeExibido = c.isGrupo ? (c.nome || `Grupo (${c.participantes.length})`) : (outros[0]?.usuario.name || 'Conversa')

    return {
      id: c.id,
      nome: nomeExibido,
      isGrupo: c.isGrupo,
      criadorId: c.criadorId,
      ultimaMensagemEm: c.ultimaMensagemEm,
      participantes: c.participantes.map(p => ({
        id: p.usuario.id,
        name: p.usuario.name,
        email: p.usuario.email,
        image: p.usuario.image,
        lastReadAt: p.lastReadAt,
      })),
    }
  }

  /**
   * Lista mensagens com paginação cursor-based (scroll up infinito).
   * - Sem cursor: retorna as N mais recentes
   * - Com cursor: retorna as N anteriores ao cursor (mensagens mais antigas)
   * Sempre retorna em ordem cronológica (mais antigo → mais novo) pra UI.
   */
  async listMensagens(conversaId: string, meuUserId: string, opts?: { cursor?: string; take?: number }) {
    await this.assertAcesso(conversaId, meuUserId)
    const take = Math.min(opts?.take ?? 50, 100)
    const mensagens = await this.fetchMensagensWithReactions(conversaId, take, opts?.cursor)
    // hasMore: pediu N, devolveu N → provavelmente tem mais antes
    const hasMore = mensagens.length === take
    return { mensagens, hasMore }
  }

  private async fetchMensagensWithReactions(conversaId: string, take: number, cursor?: string) {
    const raw = await prisma.chatMensagem.findMany({
      where: { conversaId },
      orderBy: { createdAt: 'desc' },
      take,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      include: {
        anexos: true,
        reactions: { select: { id: true, usuarioId: true, emoji: true } },
      },
    })
    return raw.reverse()
  }

  /** Envia mensagem. Emite SSE pra todos participantes (exceto autor). */
  async enviarMensagem(conversaId: string, autorId: string, conteudo: string) {
    await this.assertAcesso(conversaId, autorId)
    const texto = conteudo.trim()
    if (!texto) throw new Error('Mensagem vazia')

    const msg = await prisma.chatMensagem.create({
      data: { conversaId, autorId, conteudo: texto },
      include: { anexos: true },
    })
    // Atualiza ultimaMensagemEm da conversa
    await prisma.chatConversa.update({
      where: { id: conversaId },
      data: { ultimaMensagemEm: msg.createdAt },
    })

    // Quem tinha escondido a conversa pra si reaparece automaticamente —
    // padrão WhatsApp: deletar conversa não é "block", só esconde até a próxima
    // mensagem chegar.
    await prisma.chatParticipante.updateMany({
      where: { conversaId, hiddenAt: { not: null } },
      data: { hiddenAt: null },
    })

    // Notifica todos os participantes (INCLUSIVE o autor) — necessário pra
    // multi-device sync: se o user manda do desktop, a aba web dele recebe
    // o evento e atualiza em tempo real. O frontend filtra toast/notificação
    // pra própria mensagem via msg.autorId === meuId.
    const parts = await prisma.chatParticipante.findMany({
      where: { conversaId },
      select: { usuarioId: true },
    })
    const destinatarios = parts.map(p => p.usuarioId)
    this.events.emit('mensagem-nova', {
      conversaId,
      mensagem: msg,
      destinatarios,
    })

    // Push pro mobile dos participantes (exceto o autor). Fire-and-forget —
    // não atrasa a resposta do envio; PushService nunca lança.
    const outros = destinatarios.filter(id => id !== autorId)
    if (outros.length) void this.notificarPush(conversaId, autorId, texto, outros)

    return msg
  }

  /** Envia push de nova mensagem aos destinatários (best-effort). */
  private async notificarPush(conversaId: string, autorId: string, texto: string, destinatarios: string[]) {
    try {
      const [autor, conversa] = await Promise.all([
        prisma.user.findUnique({ where: { id: autorId }, select: { name: true } }),
        prisma.chatConversa.findUnique({ where: { id: conversaId }, select: { isGrupo: true, nome: true } }),
      ])
      const autorNome = autor?.name ?? 'Nova mensagem'
      const titulo = conversa?.isGrupo ? `${conversa.nome || 'Grupo'} · ${autorNome}` : autorNome
      const corpo = texto.length > 120 ? `${texto.slice(0, 117)}...` : texto
      await Promise.all(destinatarios.map(uid => this.pushService.sendToUser(uid, {
        title: titulo,
        body: corpo,
        data: { tipo: 'chat', conversaId },
      })))
    } catch {
      /* best-effort */
    }
  }

  /** Adiciona anexo a uma mensagem existente. */
  async addAnexo(mensagemId: string, autorId: string, anexo: { fileName: string; fileUrl: string; mimeType?: string | null; tamanho?: number }) {
    const msg = await prisma.chatMensagem.findUniqueOrThrow({
      where: { id: mensagemId },
      select: { conversaId: true, autorId: true },
    })
    if (msg.autorId !== autorId) throw new Error('Só o autor pode anexar')
    const a = await prisma.chatAnexo.create({
      data: {
        mensagemId,
        fileName: anexo.fileName,
        fileUrl: anexo.fileUrl,
        mimeType: anexo.mimeType ?? null,
        tamanho: anexo.tamanho ?? 0,
      },
    })
    // Inclui o autor pra multi-device sync
    const parts = await prisma.chatParticipante.findMany({
      where: { conversaId: msg.conversaId },
      select: { usuarioId: true },
    })
    const destinatarios = parts.map(p => p.usuarioId)
    void autorId
    this.events.emit('anexo-adicionado', { conversaId: msg.conversaId, mensagemId, anexo: a, destinatarios })
    return a
  }

  /** Marca tudo dessa conversa como lido pra esse user. */
  async marcarComoLido(conversaId: string, meuUserId: string) {
    await this.assertAcesso(conversaId, meuUserId)
    const agora = new Date()
    await prisma.chatParticipante.updateMany({
      where: { conversaId, usuarioId: meuUserId },
      data: { lastReadAt: agora },
    })
    // Inclui o próprio user pra multi-device sync (zerar badge em outras devices)
    const parts = await prisma.chatParticipante.findMany({
      where: { conversaId },
      select: { usuarioId: true },
    })
    const destinatarios = parts.map(p => p.usuarioId)
    this.events.emit('lido', { conversaId, usuarioId: meuUserId, lidoEm: agora, destinatarios })
    return { ok: true, lidoEm: agora }
  }

  // ============================================================
  // Status manual (override do auto-tracking)
  // ============================================================

  /**
   * Define o status do chat manualmente. Valores: 'online' | 'ausente' | 'dnd' |
   * 'invisible' | null (auto). Emite SSE pra TODOS users — outros precisam
   * recalcular a presença na lista de pessoas.
   */
  async setStatus(userId: string, status: 'online' | 'ausente' | 'dnd' | 'invisible' | null) {
    await prisma.user.update({
      where: { id: userId },
      data: { chatStatus: status },
    })
    // Broadcast: destinatarios = todos os outros usuarios ativos (não filtra por DM/grupo)
    const others = await prisma.user.findMany({
      where: { isActive: true, id: { not: userId } },
      select: { id: true },
    })
    this.events.emit('status-mudou', {
      usuarioId: userId,
      status,
      destinatarios: others.map(o => o.id),
    } as never)
    return { ok: true, status }
  }

  // ============================================================
  // Editar / Deletar
  // ============================================================

  async editarMensagem(mensagemId: string, autorId: string, conteudo: string) {
    const texto = conteudo.trim()
    if (!texto) throw new Error('Mensagem vazia')
    const msg = await prisma.chatMensagem.findUniqueOrThrow({
      where: { id: mensagemId },
      select: { autorId: true, conversaId: true, deletedAt: true },
    })
    if (msg.autorId !== autorId) throw new Error('Só o autor pode editar')
    if (msg.deletedAt) throw new Error('Mensagem já apagada')
    const atualizada = await prisma.chatMensagem.update({
      where: { id: mensagemId },
      data: { conteudo: texto, editedAt: new Date() },
      include: { anexos: true, reactions: { select: { id: true, usuarioId: true, emoji: true } } },
    })
    // Inclui o autor pra multi-device sync
    const parts = await prisma.chatParticipante.findMany({
      where: { conversaId: msg.conversaId },
      select: { usuarioId: true },
    })
    const destinatarios = parts.map(p => p.usuarioId)
    void autorId
    this.events.emit('mensagem-editada', {
      conversaId: msg.conversaId,
      mensagem: atualizada,
      destinatarios,
    } as never)
    return atualizada
  }

  async deletarMensagem(mensagemId: string, autorId: string) {
    const msg = await prisma.chatMensagem.findUniqueOrThrow({
      where: { id: mensagemId },
      select: { autorId: true, conversaId: true, deletedAt: true },
    })
    if (msg.autorId !== autorId) throw new Error('Só o autor pode apagar')
    if (msg.deletedAt) return { ok: true }
    await prisma.chatMensagem.update({
      where: { id: mensagemId },
      data: { deletedAt: new Date() },
    })
    // Inclui o autor pra multi-device sync
    const parts = await prisma.chatParticipante.findMany({
      where: { conversaId: msg.conversaId },
      select: { usuarioId: true },
    })
    const destinatarios = parts.map(p => p.usuarioId)
    void autorId
    this.events.emit('mensagem-deletada', {
      conversaId: msg.conversaId,
      mensagemId,
      destinatarios,
    } as never)
    return { ok: true }
  }

  // ============================================================
  // Reactions
  // ============================================================

  /** Toggle: se já reagiu com esse emoji, remove. Senão, adiciona. */
  async toggleReaction(mensagemId: string, userId: string, emoji: string) {
    const msg = await prisma.chatMensagem.findUniqueOrThrow({
      where: { id: mensagemId },
      select: { conversaId: true },
    })
    await this.assertAcesso(msg.conversaId, userId)
    const existente = await prisma.chatReaction.findUnique({
      where: { mensagemId_usuarioId_emoji: { mensagemId, usuarioId: userId, emoji } },
    })
    if (existente) {
      await prisma.chatReaction.delete({ where: { id: existente.id } })
    } else {
      await prisma.chatReaction.create({ data: { mensagemId, usuarioId: userId, emoji } })
    }
    // Notifica todos da conversa (incluindo autor, pra atualizar a UI dele)
    const parts = await prisma.chatParticipante.findMany({
      where: { conversaId: msg.conversaId },
      select: { usuarioId: true },
    })
    this.events.emit('reaction-mudou', {
      conversaId: msg.conversaId,
      mensagemId,
      destinatarios: parts.map(p => p.usuarioId),
    } as never)
    return { ok: true, removida: !!existente }
  }

  // ============================================================
  // ChatConfig (singleton)
  // ============================================================

  /** Lê config global do chat. Cria com defaults se ainda não existe. */
  async getConfig() {
    const existing = await prisma.chatConfig.findFirst()
    if (existing) return existing
    return prisma.chatConfig.create({ data: {} })
  }

  /**
   * Atualiza config — só master pode chamar (validado no router).
   * Aceita updates parciais; valores fora de range são normalizados.
   */
  async updateConfig(data: { ausenteAposMin?: number }) {
    const patch: { ausenteAposMin?: number } = {}
    if (typeof data.ausenteAposMin === 'number') {
      patch.ausenteAposMin = Math.max(1, Math.min(120, Math.round(data.ausenteAposMin)))
    }
    const existing = await prisma.chatConfig.findFirst()
    if (existing) {
      return prisma.chatConfig.update({ where: { id: existing.id }, data: patch })
    }
    return prisma.chatConfig.create({ data: patch })
  }

  // ============================================================
  // Esconder conversa pra si
  // ============================================================

  /** "Excluir conversa pra mim" — soft hide. Nova mensagem zera hiddenAt. */
  async hideConversa(conversaId: string, userId: string) {
    await this.assertAcesso(conversaId, userId)
    await prisma.chatParticipante.updateMany({
      where: { conversaId, usuarioId: userId },
      data: { hiddenAt: new Date() },
    })
    return { ok: true }
  }

  // ============================================================
  // Logoff / fechar aba → marca offline imediato
  // ============================================================

  /**
   * Chamado via navigator.sendBeacon (REST POST) quando o user fecha a aba
   * ou faz logout. Zera lastActivityAt na User pra `presencaEfetiva` cair
   * em 'offline' na hora pros outros clientes. Não toca em chatStatus
   * manual (se o user marcou 'dnd' manualmente, mantém quando voltar).
   */
  async goOffline(userId: string) {
    await prisma.user.update({
      where: { id: userId },
      data: { lastActivityAt: null },
    })
    const others = await prisma.user.findMany({
      where: { isActive: true, id: { not: userId } },
      select: { id: true },
    })
    this.events.emit('status-mudou', {
      usuarioId: userId,
      status: 'offline',
      destinatarios: others.map(o => o.id),
    } as never)
    return { ok: true }
  }

  /**
   * Anuncia que o user ENTROU/voltou (login, reload, reconectar). Marca atividade
   * agora e emite `status-mudou` pros outros refazerem a lista — sem isso, ao
   * recarregar a página o `goOffline` (pagehide) avisa os outros que você saiu,
   * mas nada avisa que você voltou, e você só reaparece no poll de 30s deles.
   * Respeita `invisible`: getOnline() continua escondendo quem está invisível.
   */
  async announceOnline(userId: string) {
    await prisma.user.update({
      where: { id: userId },
      data: { lastActivityAt: new Date() },
    }).catch(() => { /* user pode ter sido removido */ })
    const others = await prisma.user.findMany({
      where: { isActive: true, id: { not: userId } },
      select: { id: true },
    })
    this.events.emit('status-mudou', {
      usuarioId: userId,
      status: 'online',
      destinatarios: others.map(o => o.id),
    } as never)
    return { ok: true }
  }

  // ============================================================
  // Helpers
  // ============================================================

  private async assertAcesso(conversaId: string, userId: string) {
    const p = await prisma.chatParticipante.findUnique({
      where: { conversaId_usuarioId: { conversaId, usuarioId: userId } },
      select: { id: true },
    })
    if (!p) throw new Error('Sem acesso a essa conversa')
  }
}
