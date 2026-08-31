import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common'
import { CronJob } from 'cron'
import { prisma, Prisma } from '@saas/db'
import { schedulersAtivos } from '../common/scheduler-guard'

/**
 * Executa as inativações que foram AGENDADAS para uma data.
 *
 * O offboarding começa quando a rescisão chega, mas o cliente costuma sair só
 * no fim do mês — e até lá continua ativo, com obrigação a entregar. O comercial
 * marca a data no ato; este job cumpre no dia.
 *
 * E cobra o que ficou pendente. A saída do cliente é fato do mundo real: ela
 * acontece tenha ou não alguém preenchido a data de encerramento de cada área.
 * Então o job SEMPRE inativa, e avisa quem deixou a sua área sem encerramento —
 * segurar a inativação até o quadro fechar deixaria o cadastro mentindo sobre um
 * cliente que já foi embora.
 *
 * Molde do `dossie.scheduler.ts`: CronJob + configuração em `system_config`.
 */

const CONFIG = {
  enabled: 'INATIVACAO_PROGRAMADA_ENABLED',
  cron: 'INATIVACAO_PROGRAMADA_CRON',
  lastRun: 'INATIVACAO_PROGRAMADA_LAST_RUN',
  lastResult: 'INATIVACAO_PROGRAMADA_LAST_RESULT',
}

@Injectable()
export class InativacaoProgramadaScheduler implements OnModuleInit, OnModuleDestroy {
  private cronJob: CronJob | null = null
  private rodando = false

  async onModuleInit() {
    if (!schedulersAtivos()) return
    const bruto = (await this.lerConfig(CONFIG.enabled) || '').trim().toLowerCase()
    const ligado = bruto === '1' || bruto === 'true' || bruto === 'sim'
    if (!ligado) return
    const cron = await this.lerConfig(CONFIG.cron) || '0 5 * * *' // todo dia às 5h
    this.cronJob = new CronJob(cron, () => { void this.executar() }, null, true, 'America/Sao_Paulo')
  }

  onModuleDestroy() { this.cronJob?.stop() }

  private async lerConfig(chave: string): Promise<string | null> {
    const row = await prisma.systemConfig.findFirst({ where: { key: chave }, select: { value: true } })
      .catch(() => null)
    return row?.value ?? null
  }

  private async gravarConfig(chave: string, valor: string) {
    await prisma.systemConfig.upsert({
      where: { key: chave },
      create: { key: chave, value: valor },
      update: { value: valor },
    }).catch(() => { /* config é diagnóstico, não pode derrubar o job */ })
  }

  /**
   * `<=` e não `=`: se a máquina passou o dia fora do ar, quem venceu ontem
   * ainda é inativado hoje. Comparar por igualdade deixaria o agendamento
   * perdido para sempre.
   */
  async executar(): Promise<{ inativados: number; areasPendentes: number }> {
    if (this.rodando) return { inativados: 0, areasPendentes: 0 }
    this.rodando = true
    let inativados = 0
    let areasPendentes = 0

    try {
      const fim = new Date()
      fim.setHours(23, 59, 59, 999)

      const vencidos = await prisma.cliente.findMany({
        where: {
          inativacaoProgramadaPara: { lte: fim },
          status: 'ATIVO' as never,
        },
        select: {
          id: true, code: true, razaoSocial: true, version: true, empresaId: true,
          inativacaoProgramadaPara: true, inativacaoProgramadaMotivo: true,
        },
      })

      for (const c of vencidos) {
        // Áreas contratadas que ficaram sem data de encerramento. Levantado
        // ANTES de inativar: depois o cliente já saiu e o aviso perde a chance
        // de ser preventivo.
        const pendentes = await prisma.clienteAreaContratada.findMany({
          where: { clienteId: c.id, contratado: true, dataEncerramento: null },
          select: { areaId: true, responsavelId: true, area: { select: { name: true } } },
        }).catch(() => [])

        await prisma.$transaction(async (tx) => {
          const version = c.version + 1
          await tx.cliente.update({
            where: { id: c.id },
            data: {
              status: 'INATIVO' as never,
              dataSaida: c.inativacaoProgramadaPara,
              inativacaoProgramadaPara: null,
              inativacaoProgramadaMotivo: null,
              inativacaoProgramadaPor: null,
              inativacaoProgramadaEm: null,
              version,
            },
          })
          await tx.clienteEvent.create({
            data: {
              clienteId: c.id, userId: null, type: 'inactivated', version,
              changes: {
                motivo: c.inativacaoProgramadaMotivo,
                origem: 'inativação agendada',
                areasSemEncerramento: pendentes.map(p => p.area?.name ?? p.areaId),
              } as Prisma.InputJsonValue,
            },
          })
        })
        inativados++

        if (pendentes.length > 0) {
          areasPendentes += pendentes.length
          await this.avisarPendencias(c, pendentes)
        }
      }

      await this.gravarConfig(CONFIG.lastRun, new Date().toISOString())
      await this.gravarConfig(CONFIG.lastResult, `${inativados} inativado(s), ${areasPendentes} área(s) sem encerramento`)
      return { inativados, areasPendentes }
    } finally {
      this.rodando = false
    }
  }

  /**
   * Avisa quem deixou a área sem data de encerramento — o líder de cada uma, e
   * o responsável comercial do cliente, que é quem responde pelo offboarding.
   *
   * Notificação no sino, com link direto para a aba onde o campo mora: mandar a
   * pessoa "procurar em Serviços" é o mesmo que não avisar.
   */
  private async avisarPendencias(
    cliente: { id: string; code: number; razaoSocial: string; empresaId: string | null },
    pendentes: Array<{ areaId: string; responsavelId: string | null; area: { name: string } | null }>,
  ) {
    const nomes = pendentes.map(p => p.area?.name ?? 'área sem nome')
    const destinos = new Set<string>()
    for (const p of pendentes) if (p.responsavelId) destinos.add(p.responsavelId)

    for (const userId of destinos) {
      // Cada líder é avisado só das áreas que são dele.
      const minhas = pendentes.filter(p => p.responsavelId === userId).map(p => p.area?.name ?? 'área')
      await prisma.notification.create({
        data: {
          userId,
          titulo: `${cliente.razaoSocial} foi inativado sem data de encerramento`,
          mensagem: `A inativação agendada foi executada hoje e ${minhas.length === 1 ? 'a área' : 'as áreas'} `
            + `${minhas.join(', ')} ${minhas.length === 1 ? 'ficou' : 'ficaram'} sem data de encerramento do serviço. `
            + 'Registre a data na aba Serviços do cliente.',
          tipo: 'warning',
          link: `/clientes/${cliente.id}`,
          origem: 'clientes',
          empresaId: cliente.empresaId,
        },
      }).catch(() => { /* aviso não pode derrubar a inativação, que já aconteceu */ })
    }

    // Sem responsável na área não há a quem avisar individualmente; o registro
    // fica no evento do cliente, que a timeline mostra.
    if (destinos.size === 0) {
      await this.gravarConfig(
        CONFIG.lastResult,
        `#${cliente.code} inativado com ${nomes.length} área(s) sem encerramento e sem responsável para avisar`,
      )
    }
  }
}
