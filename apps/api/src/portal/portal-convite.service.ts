import { Injectable } from '@nestjs/common'
import { TRPCError } from '@trpc/server'
import { prisma } from '@saas/db'
import { hashPassword } from 'better-auth/crypto'
import { createHash, randomBytes } from 'node:crypto'

import { EmailService } from '../common/email.service'
import type { ConviteValido } from './portal-tipos'

/**
 * Convite de primeiro acesso ao Portal do Cliente.
 *
 * O usuário externo nasce sem senha utilizável: quem define a senha é a própria
 * pessoa, por este link. É a diferença que separa o cadastro interno (onde uma
 * senha padrão conhecida é tolerável entre colegas) do acesso de fora.
 *
 * Não reaproveita o "esqueci minha senha" do Better Auth por duas razões
 * concretas: o texto é outro — quem nunca entrou não está "redefinindo" nada —
 * e o prazo é outro. Os 30 minutos do reset servem para quem pediu agora e está
 * olhando a caixa de entrada; um convite precisa sobreviver ao fim de semana.
 *
 * O token viaja no link e NÃO é guardado: fica só o SHA-256, como as senhas de
 * certificado. Vazamento do banco não devolve convite utilizável.
 */

/** Sete dias. Curto o bastante para não virar porta aberta, longo o bastante
 *  para o convite de sexta ser aceito na segunda. */
const VALIDADE_HORAS = 24 * 7

/** Mínimo do Better Auth (`minPasswordLength: 8`) — repetido aqui porque a
 *  senha é gravada por este serviço, sem passar pelo fluxo dele. */
const SENHA_MINIMA = 8

function hashDoToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export type { ConviteValido } from './portal-tipos'

@Injectable()
export class PortalConviteService {
  constructor(private readonly emailService: EmailService) {}

  /**
   * Cria o convite e envia o e-mail.
   *
   * Invalida os convites anteriores do mesmo vínculo: reenviar precisa
   * queimar o link antigo, senão um convite reenviado por suspeita de
   * vazamento deixaria o link vazado funcionando.
   */
  async enviar(clienteUsuarioId: string, ctx: { userId?: string }): Promise<{ enviado: boolean }> {
    const vinculo = await prisma.clienteUsuario.findUnique({
      where: { id: clienteUsuarioId },
      select: {
        id: true,
        ativo: true,
        user: { select: { id: true, name: true, email: true } },
        cliente: { select: { razaoSocial: true } },
      },
    })
    if (!vinculo) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Vínculo não encontrado.' })
    }
    if (!vinculo.ativo) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'Este acesso está desativado. Reative antes de enviar o convite.',
      })
    }

    const token = randomBytes(32).toString('base64url')
    const expiraEm = new Date(Date.now() + VALIDADE_HORAS * 60 * 60 * 1000)

    await prisma.$transaction(async (tx) => {
      // Queima os pendentes deste vínculo.
      await tx.portalConvite.updateMany({
        where: { clienteUsuarioId, usadoEm: null },
        data: { expiraEm: new Date(0) },
      })
      await tx.portalConvite.create({
        data: {
          clienteUsuarioId,
          tokenHash: hashDoToken(token),
          expiraEm,
          criadoPorId: ctx.userId ?? null,
        },
      })
    })

    const base = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
    const link = `${base}/convite/${token}`

    const enviado = await this.emailService.sendMail({
      to: vinculo.user.email,
      subject: `Seu acesso ao portal — ${vinculo.cliente.razaoSocial}`,
      html: this.montarEmail({
        nome: vinculo.user.name,
        cliente: vinculo.cliente.razaoSocial,
        link,
        validadeHoras: VALIDADE_HORAS,
      }),
    })

    if (!enviado) {
      // O convite fica no banco: o link continua válido e dá para reenviar.
      // Falhar aqui não deve desfazer o cadastro que acabou de ser feito.
      console.error(`[Portal/Convite] Falha ao enviar e-mail para ${vinculo.user.email}`)
    }
    return { enviado }
  }

  /**
   * Valida o token e devolve o mínimo para a tela se apresentar.
   *
   * Devolve o e-mail porque a pessoa precisa conferir para qual conta está
   * definindo a senha — mas nada além disso: esta rota é pública, e quem tem o
   * link pode não ser o destinatário.
   */
  async validar(token: string): Promise<ConviteValido> {
    const convite = await this.buscarValido(token)
    const conta = await prisma.account.findFirst({
      where: { userId: convite.clienteUsuario.user.id, providerId: 'credential' },
      select: { id: true },
    })
    return {
      nome: convite.clienteUsuario.user.name,
      email: convite.clienteUsuario.user.email,
      cliente: convite.clienteUsuario.cliente.razaoSocial,
      primeiroAcesso: !convite.clienteUsuario.user.emailVerified || !conta,
    }
  }

  /**
   * Define a senha e queima o convite.
   *
   * Marca `emailVerified` porque chegar aqui prova que a pessoa recebeu o
   * e-mail — é a mesma prova que o fluxo de verificação buscaria, obtida no
   * caminho que ela já ia percorrer.
   */
  async definirSenha(token: string, senha: string): Promise<{ email: string }> {
    if (senha.length < SENHA_MINIMA) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: `A senha precisa ter ao menos ${SENHA_MINIMA} caracteres.`,
      })
    }

    const convite = await this.buscarValido(token)
    const userId = convite.clienteUsuario.user.id
    const hash = await hashPassword(senha)

    await prisma.$transaction(async (tx) => {
      const conta = await tx.account.findFirst({
        where: { userId, providerId: 'credential' },
        select: { id: true },
      })
      if (conta) {
        await tx.account.update({ where: { id: conta.id }, data: { password: hash } })
      } else {
        await tx.account.create({
          data: { userId, accountId: userId, providerId: 'credential', password: hash },
        })
      }
      await tx.user.update({ where: { id: userId }, data: { emailVerified: true } })
      await tx.portalConvite.update({
        where: { id: convite.id },
        data: { usadoEm: new Date() },
      })
      // Sessões antigas caem. Se o convite foi reenviado por suspeita de acesso
      // indevido, deixar a sessão anterior viva anularia o motivo do reenvio.
      await tx.session.deleteMany({ where: { userId } })
    })

    return { email: convite.clienteUsuario.user.email }
  }

  // ── Internos ─────────────────────────────────────────────────────────────

  /**
   * Busca o convite pelo hash, exigindo que esteja vivo.
   *
   * Mensagem única para expirado, já usado e inexistente: são o mesmo fato para
   * quem está na tela ("este link não vale mais, peça outro"), e distingui-los
   * confirmaria a um curioso que determinado token existiu.
   */
  private async buscarValido(token: string) {
    const convite = token
      ? await prisma.portalConvite.findUnique({
          where: { tokenHash: hashDoToken(token) },
          select: {
            id: true,
            expiraEm: true,
            usadoEm: true,
            clienteUsuario: {
              select: {
                id: true,
                ativo: true,
                user: { select: { id: true, name: true, email: true, emailVerified: true } },
                cliente: { select: { razaoSocial: true, status: true } },
              },
            },
          },
        })
      : null

    const invalido = !convite
      || convite.usadoEm !== null
      || convite.expiraEm.getTime() < Date.now()
      || !convite.clienteUsuario.ativo
      || convite.clienteUsuario.cliente.status !== 'ATIVO'

    if (invalido) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: 'Este convite não é mais válido. Peça um novo ao seu escritório contábil.',
      })
    }
    return convite
  }

  private montarEmail(p: { nome: string; cliente: string; link: string; validadeHoras: number }): string {
    const dias = Math.round(p.validadeHoras / 24)
    return `
<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:520px;margin:0 auto;color:#12202b">
  <h2 style="font-size:18px;font-weight:600;margin:0 0 4px">Seu acesso ao portal está pronto</h2>
  <p style="font-size:14px;line-height:1.6;color:#4a5f70;margin:0 0 18px">
    Olá, ${p.nome}. Você foi cadastrado para acessar os dados de
    <strong>${p.cliente}</strong> no portal do seu escritório contábil.
  </p>
  <p style="margin:0 0 18px">
    <a href="${p.link}"
       style="display:inline-block;background:#0d6e80;color:#fff;text-decoration:none;padding:11px 20px;border-radius:4px;font-size:14px;font-weight:600">
      Definir minha senha
    </a>
  </p>
  <p style="font-size:12.5px;line-height:1.6;color:#7d8fa0;margin:0 0 6px">
    O link vale por ${dias} dias e só pode ser usado uma vez. Depois de definir a
    senha, você entra pelo endereço de sempre com o seu e-mail.
  </p>
  <p style="font-size:12.5px;line-height:1.6;color:#7d8fa0;margin:0">
    Se você não esperava este convite, ignore este e-mail — sem a senha, nada é acessado.
  </p>
</div>`.trim()
  }
}
