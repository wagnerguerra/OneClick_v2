import { Injectable } from '@nestjs/common'
import { prisma } from '@saas/db'
import type { AgendaConfig, AgendaConflitoModo } from '@saas/db'

/**
 * Configuração singleton da agenda (1 linha apenas) — regras de tratamento de
 * conflitos de horário (participante e sala).
 *
 * Os modos:
 *   - DESLIGADO: não verifica
 *   - AVISAR:    mostra dialog mas deixa salvar
 *   - BLOQUEAR:  impede salvar
 *
 * O `get` cria a linha com defaults na primeira chamada (bootstrap lazy).
 */
@Injectable()
export class AgendaConfigService {
  /** Defaults seguros: AVISAR pros dois (não bloqueia ninguém de saída, mas avisa). */
  private readonly defaults = {
    conflitoParticipante: 'AVISAR' as AgendaConflitoModo,
    conflitoSala: 'AVISAR' as AgendaConflitoModo,
  }

  /** Lê (ou cria com defaults se não existir). Idempotente. */
  async get(): Promise<AgendaConfig> {
    const existing = await prisma.agendaConfig.findFirst()
    if (existing) return existing
    return prisma.agendaConfig.create({ data: this.defaults })
  }

  /** Atualiza a config singleton. Cria com defaults+patch se ainda não existe. */
  async update(data: { conflitoParticipante?: AgendaConflitoModo; conflitoSala?: AgendaConflitoModo }): Promise<AgendaConfig> {
    const existing = await prisma.agendaConfig.findFirst()
    if (existing) {
      return prisma.agendaConfig.update({ where: { id: existing.id }, data })
    }
    return prisma.agendaConfig.create({ data: { ...this.defaults, ...data } })
  }
}
