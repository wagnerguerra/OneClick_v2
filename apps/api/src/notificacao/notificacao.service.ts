import { Injectable, Logger } from '@nestjs/common'
import { prisma } from '@saas/db'
import { EmailService } from '../common/email.service'

/**
 * Engine de notificações por evento. Para cada execução + evento, busca regras
 * ativas no template do serviço, resolve destinatários, renderiza template e
 * envia via EmailService. Idempotência garantida pelo unique
 * (regraId, execucaoId, evento) em ServicoNotificacaoLog — disparos
 * repetidos do mesmo evento na mesma execução não enviam de novo.
 */
@Injectable()
export class NotificacaoService {
  private readonly logger = new Logger(NotificacaoService.name)

  constructor(private readonly emailService: EmailService) {}

  /**
   * Ponto único de entrada. Não falha — captura exceções e loga, pra
   * não derrubar o fluxo principal (concluir/criar execução etc).
   */
  async disparar(execucaoId: string, evento: NotificacaoEventoStr): Promise<void> {
    try {
      await this.dispararInterno(execucaoId, evento)
    } catch (e) {
      this.logger.warn(`[Notificacao] Falha ao processar evento=${evento} execId=${execucaoId}: ${(e as Error).message}`)
    }
  }

  private async dispararInterno(execucaoId: string, evento: NotificacaoEventoStr) {
    // Snapshot rico de tudo que vamos precisar pra renderizar variáveis +
    // resolver destinatários. Uma única query.
    const exec = await prisma.servicoExecucao.findUnique({
      where: { id: execucaoId },
      include: {
        servico: {
          select: {
            id: true, nome: true,
            notificacoes: {
              where: { ativa: true, evento: evento as any },
            },
          },
        },
        cliente: {
          select: {
            id: true, razaoSocial: true, documento: true, nomeFantasia: true, email: true,
          },
        },
        processo: {
          select: { id: true, nome: true, responsavelId: true },
        },
        watchers: { select: { userId: true } },
      },
    })
    if (!exec) return
    const regras = (exec.servico as any).notificacoes as Array<{
      id: string
      destinatariosTipo: string
      destinatariosCustom: string[]
      assunto: string
      corpoHtml: string
      canal: string
    }>
    if (regras.length === 0) return

    // Resolve responsável (User não tem relation com responsavelId)
    let responsavel: { id: string; name: string; email: string } | null = null
    if (exec.responsavelId) {
      const u = await prisma.user.findUnique({
        where: { id: exec.responsavelId },
        select: { id: true, name: true, email: true },
      })
      if (u && u.email) responsavel = { id: u.id, name: u.name ?? '', email: u.email }
    }

    // Resolve gestor (Processo.responsavelId)
    let gestor: { id: string; name: string; email: string } | null = null
    if (exec.processo?.responsavelId) {
      const u = await prisma.user.findUnique({
        where: { id: exec.processo.responsavelId },
        select: { id: true, name: true, email: true },
      })
      if (u && u.email) gestor = { id: u.id, name: u.name ?? '', email: u.email }
    }

    // Watchers emails
    let watcherEmails: string[] = []
    if (exec.watchers.length > 0) {
      const watcherUsers = await prisma.user.findMany({
        where: { id: { in: exec.watchers.map(w => w.userId) } },
        select: { email: true },
      })
      watcherEmails = watcherUsers.map(u => u.email).filter((e): e is string => !!e)
    }

    // Pra cada regra: idempotência (checa log antes), resolve destinatário, envia
    for (const regra of regras) {
      // Idempotência: se já existe log de envio bem sucedido pra (regra, exec, evento), pula
      const jaEnviado = await prisma.servicoNotificacaoLog.findUnique({
        where: { regraId_execucaoId_evento: { regraId: regra.id, execucaoId, evento: evento as any } },
      })
      if (jaEnviado && jaEnviado.status === 'ENVIADO') continue

      // Resolve destinatários conforme tipo
      let to: string[] = []
      switch (regra.destinatariosTipo) {
        case 'RESPONSAVEL': if (responsavel?.email) to = [responsavel.email]; break
        case 'GESTOR':      if (gestor?.email)      to = [gestor.email];      break
        case 'CLIENTE':     if (exec.cliente.email) to = [exec.cliente.email]; break
        case 'WATCHERS':    to = watcherEmails;                                break
        case 'CUSTOM':      to = regra.destinatariosCustom;                    break
      }
      // Filtra duplicatas/vazios
      to = Array.from(new Set(to.filter(Boolean)))
      if (to.length === 0) {
        // Sem destinatário válido — não cria log (volta a tentar quando dados mudarem)
        this.logger.debug(`[Notificacao] Regra ${regra.id} sem destinatário válido — pula`)
        continue
      }

      // Render variáveis
      const ctx = this.buildContext(exec, responsavel)
      const assuntoFinal = this.renderTemplate(regra.assunto, ctx)
      const corpoFinal = this.renderTemplate(regra.corpoHtml, ctx)

      // Envia
      let okEnvio = false
      let erro: string | null = null
      try {
        okEnvio = await this.emailService.sendMail({
          to,
          subject: assuntoFinal,
          html: corpoFinal,
        })
      } catch (e) {
        erro = (e as Error).message
      }

      // Grava log (upsert pra cobrir retries — se já existia FALHA, atualiza)
      await prisma.servicoNotificacaoLog.upsert({
        where: { regraId_execucaoId_evento: { regraId: regra.id, execucaoId, evento: evento as any } },
        create: {
          regraId: regra.id, execucaoId, evento: evento as any,
          destinatarios: to,
          status: okEnvio ? 'ENVIADO' : 'FALHA',
          erro: okEnvio ? null : (erro ?? 'envio retornou false'),
        },
        update: {
          destinatarios: to,
          status: okEnvio ? 'ENVIADO' : 'FALHA',
          erro: okEnvio ? null : (erro ?? 'envio retornou false'),
          sentAt: new Date(),
        },
      })
    }
  }

  /**
   * Envia e-mail de teste com dados fake — sem gravar log, sem checar regras
   * persistidas. Útil pra UI "Enviar teste" antes de salvar.
   */
  async testarEnvio(opts: { para: string; assunto: string; corpoHtml: string }): Promise<boolean> {
    const ctx = contextoTesteFake()
    const assuntoFinal = renderizarTemplate(opts.assunto, ctx)
    const corpoFinal = renderizarTemplate(opts.corpoHtml, ctx)
    return this.emailService.sendMail({
      to: opts.para,
      subject: `[TESTE] ${assuntoFinal}`,
      html: `<p style="background:#fef3c7;padding:8px;border-radius:4px;font-size:11px;color:#92400e;">Este é um e-mail de teste com dados fictícios.</p>${corpoFinal}`,
    })
  }

  /**
   * Substitui {{path.key}} no template por valores do contexto.
   * Suporte simples a 1 nível de profundidade — sem helpers ou condicionais.
   */
  private renderTemplate(tpl: string, ctx: Record<string, Record<string, string>>): string {
    return tpl.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, path: string) => {
      const [root, key] = path.split('.')
      if (!root || !key) return ''
      const val = ctx[root]?.[key]
      return val == null ? '' : String(val)
    })
  }

  private buildContext(
    exec: any,
    responsavel: { name: string; email: string } | null,
  ): Record<string, Record<string, string>> {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.API_URL?.replace(/:\d+$/, '') || 'http://localhost:3000'
    const fmtData = (d: Date | null | undefined) => d ? new Date(d).toLocaleDateString('pt-BR') : '—'
    const fmtHora = (d: Date | null | undefined) => d ? new Date(d).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '—'
    return {
      servico:    { nome: exec.servico.nome ?? '' },
      cliente:    {
        razaoSocial:  exec.cliente?.razaoSocial ?? '',
        documento:    exec.cliente?.documento ?? '',
        nomeFantasia: exec.cliente?.nomeFantasia ?? '',
      },
      responsavel: {
        name:  responsavel?.name ?? '—',
        email: responsavel?.email ?? '',
      },
      prazo: {
        data: fmtData(exec.prazoLimite),
        hora: fmtHora(exec.prazoLimite),
      },
      processo: {
        nome: exec.processo?.nome ?? '',
      },
      link: {
        execucao: `${baseUrl}/meus-servicos/${exec.id}`,
      },
    }
  }
}

// Tipo dos eventos suportados — espelha enum do Prisma
export type NotificacaoEventoStr =
  | 'INICIADA' | 'CONCLUIDA' | 'ATRASADA' | 'PRAZO_PROXIMO'
  | 'PAUSADA' | 'CANCELADA' | 'AGUARDANDO_RESPOSTA'

// ============================================================
// Exporta o renderer + builder de contexto pra uso público
// (rota "testar regra" no router precisa renderizar sem persistir log).
// ============================================================
export function renderizarTemplate(tpl: string, ctx: Record<string, Record<string, string>>): string {
  return tpl.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, path: string) => {
    const [root, key] = path.split('.')
    if (!root || !key) return ''
    const val = ctx[root]?.[key]
    return val == null ? '' : String(val)
  })
}

export function contextoTesteFake(): Record<string, Record<string, string>> {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  const prazoFuturo = new Date(Date.now() + 24 * 60 * 60 * 1000)
  return {
    servico:    { nome: 'Folha de Pagamento Mensal' },
    cliente:    {
      razaoSocial:  'Acme Ltda',
      documento:    '12.345.678/0001-90',
      nomeFantasia: 'Acme',
    },
    responsavel: {
      name:  'João Silva',
      email: 'joao@acme.com',
    },
    prazo: {
      data: prazoFuturo.toLocaleDateString('pt-BR'),
      hora: prazoFuturo.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
    },
    processo: {
      nome: 'Processo de exemplo',
    },
    link: {
      execucao: `${baseUrl}/meus-servicos/exemplo`,
    },
  }
}
