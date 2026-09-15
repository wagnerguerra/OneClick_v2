import { Injectable, Logger } from '@nestjs/common'
import { TRPCError } from '@trpc/server'
import { prisma } from '@saas/db'

import { EmailService } from '../common/email.service'
import { buildEmailLayout, shellAttachments } from '../common/email-layout'
import type { VinculoPortal } from './portal-escopo'

/**
 * "Escrever para a equipe" — o cliente manda e-mail ao responsável da área
 * direto do portal.
 *
 * O desenho que importa: o cliente escolhe a ÁREA, e o servidor resolve o
 * destinatário. O endereço nunca vem da tela — se viesse, o portal viraria um
 * disparador de e-mail com o remetente do escritório para qualquer caixa.
 *
 * Recortes:
 *  - só áreas do vínculo (as mesmas que o bloco "Sua equipe" mostra);
 *  - destinatário é o responsável ativo; sem ele, o substituto ativo; sem
 *    nenhum dos dois, recusa com uma frase que diz o que fazer;
 *  - tudo o que o cliente digita é ESCAPADO antes de entrar no HTML — o layout
 *    dos e-mails interpola sem escapar, e o texto é de fora;
 *  - `replyTo` é o e-mail do cliente: o contador responde e a resposta vai
 *    direto para quem escreveu, sem passar pelo portal;
 *  - limite de envios por pessoa numa janela curta. Não é antispam de verdade
 *    (vive em memória e zera com o deploy); é o freio de um clique repetido ou
 *    de um script ingênuo contra a caixa de um colega.
 */

export const ASSUNTO_MIN = 3
export const ASSUNTO_MAX = 150
export const MENSAGEM_MIN = 5
export const MENSAGEM_MAX = 5000

const LIMITE_POR_JANELA = 5
const JANELA_MS = 10 * 60_000

const ENTIDADES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }

export function escaparHtml(texto: string): string {
  return texto.replace(/[&<>"']/g, (c) => ENTIDADES[c] ?? c)
}

@Injectable()
export class PortalContatoService {
  private readonly logger = new Logger(PortalContatoService.name)
  private readonly envios = new Map<string, number[]>()

  constructor(private readonly emailService: EmailService) {}

  private conferirLimite(userId: string, agora: number) {
    const recentes = (this.envios.get(userId) ?? []).filter((t) => agora - t < JANELA_MS)
    if (recentes.length >= LIMITE_POR_JANELA) {
      throw new TRPCError({
        code: 'TOO_MANY_REQUESTS',
        message: 'Você enviou várias mensagens em pouco tempo. Aguarde alguns minutos e tente de novo.',
      })
    }
    recentes.push(agora)
    this.envios.set(userId, recentes)
  }

  async enviar(
    vinculo: VinculoPortal,
    userId: string,
    input: { areaId: string; assunto: string; mensagem: string },
  ): Promise<{ destinatario: string }> {
    // Quebra de linha no assunto vira espaço: o assunto vai para o cabeçalho
    // do e-mail, e é por ela que se tentaria injetar outro cabeçalho.
    const assunto = input.assunto.replace(/[\r\n]+/g, ' ').trim()
    const mensagem = input.mensagem.trim()
    if (assunto.length < ASSUNTO_MIN || mensagem.length < MENSAGEM_MIN) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'Preencha o assunto e a mensagem.' })
    }
    if (assunto.length > ASSUNTO_MAX || mensagem.length > MENSAGEM_MAX) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'O assunto ou a mensagem passou do tamanho permitido.' })
    }
    // Área fora do vínculo não existe para quem está aqui.
    if (!vinculo.areas.includes(input.areaId)) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Área não encontrada.' })
    }

    const pessoa = { select: { name: true, email: true, isActive: true } } as const
    const [linha, remetente, cliente] = await Promise.all([
      prisma.clienteAreaContratada.findFirst({
        where: { clienteId: vinculo.clienteId, areaId: input.areaId, contratado: true, dataEncerramento: null },
        select: { area: { select: { name: true } }, responsavel: pessoa, substituto: pessoa },
      }),
      prisma.user.findUnique({ where: { id: userId }, select: { name: true, email: true } }),
      prisma.cliente.findUnique({
        where: { id: vinculo.clienteId },
        select: { razaoSocial: true, empresa: { select: { nomeFantasia: true, razaoSocial: true } } },
      }),
    ])
    if (!linha) throw new TRPCError({ code: 'NOT_FOUND', message: 'Área não encontrada.' })
    if (!remetente) throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Sessão inválida.' })

    const destino = [linha.responsavel, linha.substituto].find((u) => u?.isActive && u.email) ?? null
    if (!destino) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'Esta área ainda não tem um responsável para receber mensagens. Fale com o escritório pelos canais de sempre.',
      })
    }

    // Conta só a tentativa que chegaria a enviar: um formulário recusado por
    // validação não pode gastar a cota de quem está corrigindo o texto.
    this.conferirLimite(userId, Date.now())

    const escritorio = cliente?.empresa?.nomeFantasia || cliente?.empresa?.razaoSocial || 'OneClick'
    const clienteNome = cliente?.razaoSocial ?? 'Cliente'
    const area = linha.area.name
    const celula = 'padding:10px 14px;font-size:13px;'

    const corpo = `
<p style="margin:0 0 14px;">${escaparHtml(remetente.name)} escreveu pelo Portal do Cliente, na área <b>${escaparHtml(area)}</b>.</p>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 16px;border:1px solid #e5e7eb;border-radius:10px;border-collapse:separate;">
  <tr><td style="${celula}color:#6b7280;width:96px;">Empresa</td><td style="${celula}color:#111827;font-weight:600;">${escaparHtml(clienteNome)}</td></tr>
  <tr><td style="${celula}color:#6b7280;border-top:1px solid #f3f4f6;">De</td><td style="${celula}color:#111827;border-top:1px solid #f3f4f6;">${escaparHtml(remetente.name)} &lt;${escaparHtml(remetente.email)}&gt;</td></tr>
  <tr><td style="${celula}color:#6b7280;border-top:1px solid #f3f4f6;">Assunto</td><td style="${celula}color:#111827;border-top:1px solid #f3f4f6;">${escaparHtml(assunto)}</td></tr>
</table>
<div style="padding:14px 16px;background:#f9fafb;border:1px solid #f3f4f6;border-radius:10px;font-size:14px;line-height:1.65;color:#1f2937;">${escaparHtml(mensagem).replace(/\n/g, '<br>')}</div>`

    const html = buildEmailLayout({
      empresaNome: escaparHtml(escritorio),
      logoUrl: null,
      preheader: escaparHtml(`${remetente.name}: ${assunto}`.slice(0, 140)),
      heroAccent: '#0ea5e9',
      heroTitle: 'Mensagem pelo portal',
      heroSubtitle: escaparHtml(`${clienteNome} · ${area}`),
      bodyHtml: corpo,
      iconName: 'message-square',
      footerExtra: escaparHtml(`Responda a este e-mail para falar direto com ${remetente.name}.`),
      rodapeAviso: 'Mensagem enviada pelo Portal do Cliente.',
    })

    const enviado = await this.emailService.sendMail({
      to: destino.email,
      subject: `[Portal] ${assunto} — ${clienteNome}`,
      html,
      replyTo: remetente.email,
      attachments: shellAttachments('message-square'),
    })
    if (!enviado) {
      this.logger.warn(`Falha ao enviar mensagem do portal (cliente ${vinculo.clienteId}, área ${input.areaId})`)
      throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Não foi possível enviar agora. Tente de novo em instantes.' })
    }
    return { destinatario: destino.name }
  }
}
