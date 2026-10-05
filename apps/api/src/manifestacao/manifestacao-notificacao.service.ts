import { Injectable, Logger } from '@nestjs/common'
import { prisma } from '@saas/db'
import { NotificationService } from '../notification/notification.service'
import { EmailService } from '../common/email.service'

/**
 * Notificações dos eventos de uma manifestação (05/10/2026).
 *
 * Quem recebe é configuração (ManifestacaoNotificacaoConfig), mantida na tela
 * de configurações do módulo por quem tem a sub-permissão `configurar`. Sem
 * configuração para o evento, ninguém é avisado — o padrão é silêncio, não
 * avisar todo mundo.
 *
 * Falha de envio nunca derruba a ação que a disparou: registrar, dar retorno ou
 * finalizar valem mesmo que o e-mail não saia.
 */

export const EVENTOS_MANIFESTACAO = ['REGISTRADA', 'EDITADA', 'RETORNO', 'ANALISADA', 'FINALIZADA', 'MENSAGEM'] as const
export type EventoManifestacao = (typeof EVENTOS_MANIFESTACAO)[number]

const ROTULO_TIPO: Record<string, { nome: string; rota: string }> = {
  RECLAMACAO: { nome: 'Reclamação', rota: '/reclamacoes' },
  ELOGIO: { nome: 'Elogio', rota: '/elogios' },
  SUGESTAO: { nome: 'Sugestão', rota: '/sugestoes' },
}

const TITULO_EVENTO: Record<EventoManifestacao, string> = {
  REGISTRADA: 'registrada',
  EDITADA: 'editada',
  RETORNO: 'com retorno dado ao cliente',
  ANALISADA: 'com procedência analisada',
  FINALIZADA: 'finalizada',
  MENSAGEM: 'com nova mensagem',
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string))

@Injectable()
export class ManifestacaoNotificacaoService {
  private readonly logger = new Logger(ManifestacaoNotificacaoService.name)

  constructor(
    private readonly notifications: NotificationService,
    private readonly email: EmailService,
  ) {}

  /** Configuração de todos os eventos de um tipo (linhas ausentes vêm vazias). */
  async listar(empresaId: string, tipo: string) {
    const rows = await prisma.manifestacaoNotificacaoConfig.findMany({ where: { empresaId, tipo } })
    const porEvento = new Map(rows.map((r) => [r.evento, r]))
    return EVENTOS_MANIFESTACAO.map((evento) => {
      const r = porEvento.get(evento)
      return {
        evento,
        userIds: r?.userIds ?? [],
        avisarAutor: r?.avisarAutor ?? false,
        sino: r?.sino ?? true,
        email: r?.email ?? false,
      }
    })
  }

  async salvar(
    empresaId: string,
    tipo: string,
    itens: Array<{ evento: EventoManifestacao; userIds: string[]; avisarAutor: boolean; sino: boolean; email: boolean }>,
  ) {
    // Só usuários ativos da própria empresa entram — o id vem da tela.
    const todos = [...new Set(itens.flatMap((i) => i.userIds))]
    const validos = new Set((await prisma.user.findMany({
      where: { id: { in: todos }, empresaId, isActive: true }, select: { id: true },
    })).map((u) => u.id))

    await prisma.$transaction(itens.map((i) => {
      const dados = {
        userIds: [...new Set(i.userIds)].filter((id) => validos.has(id)),
        avisarAutor: i.avisarAutor, sino: i.sino, email: i.email,
      }
      return prisma.manifestacaoNotificacaoConfig.upsert({
        where: { empresaId_tipo_evento: { empresaId, tipo, evento: i.evento } },
        create: { empresaId, tipo, evento: i.evento, ...dados },
        update: dados,
      })
    }))
    return this.listar(empresaId, tipo)
  }

  /**
   * Dispara o aviso do evento. `quem` é quem fez a ação — não recebe o aviso do
   * que ele mesmo acabou de fazer.
   */
  async notificar(manifestacaoId: string, evento: EventoManifestacao, quem?: string | null, detalhe?: string) {
    try {
      const m = await prisma.manifestacao.findUnique({
        where: { id: manifestacaoId },
        select: {
          id: true, tipo: true, protocolo: true, titulo: true, empresaId: true, anonima: true, autorId: true,
          cliente: { select: { razaoSocial: true } },
        },
      })
      if (!m?.empresaId) return
      const tipo = String(m.tipo)
      const cfg = await prisma.manifestacaoNotificacaoConfig.findUnique({
        where: { empresaId_tipo_evento: { empresaId: m.empresaId, tipo, evento } },
      })
      if (!cfg || (!cfg.sino && !cfg.email)) return

      const ids = new Set(cfg.userIds)
      if (cfg.avisarAutor && !m.anonima && m.autorId) ids.add(m.autorId)
      if (quem) ids.delete(quem)
      if (ids.size === 0) return

      const destinos = await prisma.user.findMany({
        where: { id: { in: [...ids] }, isActive: true },
        select: { id: true, email: true },
      })
      if (!destinos.length) return

      const info = ROTULO_TIPO[tipo] ?? { nome: 'Manifestação', rota: '/' }
      const titulo = `${info.nome} ${m.protocolo} ${TITULO_EVENTO[evento]}`
      // Anônima: nada além do protocolo e do assunto — nem cliente, nem autor.
      const assunto = m.titulo?.trim() || null
      const cliente = !m.anonima ? m.cliente?.razaoSocial ?? null : null
      const mensagem = [assunto, cliente, detalhe].filter(Boolean).join(' · ') || null
      const link = `${info.rota}?abrir=${m.id}`

      if (cfg.sino) {
        await this.notifications.criarParaUsers(destinos.map((d) => d.id), {
          titulo, mensagem, link, origem: `manifestacao:${tipo.toLowerCase()}`, empresaId: m.empresaId,
          tipo: evento === 'REGISTRADA' ? 'warning' : 'info',
        })
      }
      if (cfg.email) {
        const emails = destinos.map((d) => d.email).filter((e): e is string => !!e)
        if (emails.length) {
          const base = (process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || '').replace(/\/$/, '')
          await this.email.sendMail({
            bcc: emails,
            subject: titulo,
            html: `<p style="font-family:sans-serif;font-size:14px">${esc(titulo)}.</p>`
              + (mensagem ? `<p style="font-family:sans-serif;font-size:13px;color:#555">${esc(mensagem)}</p>` : '')
              + (base ? `<p style="font-family:sans-serif;font-size:13px"><a href="${base}${link}">Abrir no OneClick</a></p>` : ''),
          })
        }
      }
    } catch (e) {
      this.logger.warn(`Aviso de ${evento} (${manifestacaoId}) não enviado: ${(e as Error).message}`)
    }
  }
}
