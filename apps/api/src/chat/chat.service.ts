import { Injectable, Inject, forwardRef } from '@nestjs/common'
import { prisma } from '@saas/db'
import { ChatEventsService } from './chat-events.service'

@Injectable()
export class ChatService {
  constructor(
    @Inject(forwardRef(() => ChatEventsService))
    private readonly events: ChatEventsService,
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
      where: { participantes: { some: { usuarioId: userId } } },
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
      if (count === 2) return this.getConversa(existente.id, meuUserId)
    }

    const novaConversa = await prisma.chatConversa.create({
      data: {
        isGrupo: false,
        criadorId: meuUserId,
        participantes: {
          create: [
            { usuarioId: meuUserId, papel: 'membro' },
            { usuarioId: outroUserId, papel: 'membro' },
          ],
        },
      },
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

  /** Lista mensagens com paginação (cursor antes/depois). Default últimas 50. */
  async listMensagens(conversaId: string, meuUserId: string, opts?: { cursor?: string; take?: number }) {
    await this.assertAcesso(conversaId, meuUserId)
    const take = Math.min(opts?.take ?? 50, 100)
    const mensagens = await prisma.chatMensagem.findMany({
      where: { conversaId },
      orderBy: { createdAt: 'desc' },
      take,
      ...(opts?.cursor ? { cursor: { id: opts.cursor }, skip: 1 } : {}),
      include: {
        anexos: true,
      },
    })
    // Retorna em ordem cronológica (mais antigo → mais novo) pra UI
    return mensagens.reverse()
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

    // Notifica outros participantes
    const parts = await prisma.chatParticipante.findMany({
      where: { conversaId },
      select: { usuarioId: true },
    })
    const destinatarios = parts.map(p => p.usuarioId).filter(id => id !== autorId)
    this.events.emit('mensagem-nova', {
      conversaId,
      mensagem: msg,
      destinatarios,
    })
    return msg
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
    // Avisa outros participantes pra atualizar a mensagem
    const parts = await prisma.chatParticipante.findMany({
      where: { conversaId: msg.conversaId },
      select: { usuarioId: true },
    })
    const destinatarios = parts.map(p => p.usuarioId).filter(id => id !== autorId)
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
    // Avisa autores das mensagens (no MVP basta avisar todos os outros)
    const parts = await prisma.chatParticipante.findMany({
      where: { conversaId },
      select: { usuarioId: true },
    })
    const destinatarios = parts.map(p => p.usuarioId).filter(id => id !== meuUserId)
    this.events.emit('lido', { conversaId, usuarioId: meuUserId, lidoEm: agora, destinatarios })
    return { ok: true, lidoEm: agora }
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
