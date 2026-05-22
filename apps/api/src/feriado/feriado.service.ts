import { Injectable } from '@nestjs/common'
import { prisma } from '@saas/db'
import type { CreateFeriadoInput, ListFeriadosInput } from '@saas/types'

@Injectable()
export class FeriadoService {
  /**
   * Lista feriados aplicando filtros. Por padrão devolve todos os globais
   * (empresaId=null) — quando `empresaId` é passado, devolve também os
   * cadastrados especificamente pela empresa.
   *
   * Quando `ano` é informado:
   *  - recorrentes (recorrente=true) entram independentemente do ano do registro
   *  - não-recorrentes (recorrente=false) só entram se o ano da `data` bater
   */
  async list(input: ListFeriadosInput, empresaId?: string) {
    const where: any = {
      OR: [{ empresaId: null }, ...(empresaId ? [{ empresaId }] : [])],
    }
    if (input?.tipo) where.tipo = input.tipo
    if (input?.uf) where.uf = input.uf
    if (input?.cidade) where.cidade = { equals: input.cidade, mode: 'insensitive' }
    if (input?.search) {
      where.AND = [
        {
          OR: [
            { nome: { contains: input.search, mode: 'insensitive' } },
            { observacao: { contains: input.search, mode: 'insensitive' } },
            { cidade: { contains: input.search, mode: 'insensitive' } },
          ],
        },
      ]
    }
    if (input?.ano) {
      where.AND = [
        ...(where.AND ?? []),
        {
          OR: [
            { recorrente: true },
            {
              recorrente: false,
              data: {
                gte: new Date(input.ano, 0, 1),
                lt: new Date(input.ano + 1, 0, 1),
              },
            },
          ],
        },
      ]
    }
    return prisma.feriado.findMany({
      where,
      orderBy: [{ data: 'asc' }, { nome: 'asc' }],
    })
  }

  async create(input: CreateFeriadoInput, empresaId?: string) {
    const [ano, mes, dia] = input.data.split('-').map(Number)
    // Constrói Date UTC para evitar shift de timezone no Postgres @db.Date
    const data = new Date(Date.UTC(ano!, mes! - 1, dia!))
    return prisma.feriado.create({
      data: {
        nome: input.nome,
        tipo: input.tipo,
        data,
        recorrente: input.recorrente,
        uf: input.uf?.toUpperCase() ?? null,
        cidade: input.cidade ?? null,
        observacao: input.observacao ?? null,
        empresaId: empresaId ?? null,
      },
    })
  }

  async update(id: string, input: Partial<CreateFeriadoInput>) {
    const data: any = {}
    if (input.nome !== undefined) data.nome = input.nome
    if (input.tipo !== undefined) data.tipo = input.tipo
    if (input.recorrente !== undefined) data.recorrente = input.recorrente
    if (input.uf !== undefined) data.uf = input.uf?.toUpperCase() ?? null
    if (input.cidade !== undefined) data.cidade = input.cidade ?? null
    if (input.observacao !== undefined) data.observacao = input.observacao ?? null
    if (input.data !== undefined) {
      const [ano, mes, dia] = input.data.split('-').map(Number)
      data.data = new Date(Date.UTC(ano!, mes! - 1, dia!))
    }
    return prisma.feriado.update({ where: { id }, data })
  }

  async delete(id: string) {
    return prisma.feriado.delete({ where: { id } })
  }

  async bulkDelete(ids: string[]) {
    return prisma.feriado.deleteMany({ where: { id: { in: ids } } })
  }

  /**
   * Stats por tipo + total — pro cabeçalho da pill. Considera ano corrente.
   */
  async getStats(empresaId?: string) {
    const todos = await prisma.feriado.findMany({
      where: { OR: [{ empresaId: null }, ...(empresaId ? [{ empresaId }] : [])] },
      select: { tipo: true },
    })
    const stats = {
      total: todos.length,
      porTipo: { NACIONAL: 0, ESTADUAL: 0, MUNICIPAL: 0, PONTO_FACULTATIVO: 0 } as Record<string, number>,
    }
    for (const f of todos) {
      stats.porTipo[f.tipo] = (stats.porTipo[f.tipo] ?? 0) + 1
    }
    return stats
  }

  /**
   * Helper exposto pra outros serviços (futuras integrações com scheduler):
   * retorna os feriados que casam com uma data concreta — considerando
   * recorrentes (qualquer ano) e específicos do ano daquela data.
   */
  async getFeriadosDoDia(
    date: Date,
    opts?: { uf?: string; cidade?: string; empresaId?: string },
  ) {
    const dia = date.getUTCDate()
    const mes = date.getUTCMonth() + 1
    const ano = date.getUTCFullYear()
    const where: any = {
      OR: [{ empresaId: null }, ...(opts?.empresaId ? [{ empresaId: opts.empresaId }] : [])],
    }
    if (opts?.uf) where.OR = [...where.OR, { uf: opts.uf.toUpperCase() }]
    // Filtro de data: recorrentes batendo dia/mês OU específicos batendo dia/mês/ano
    // Postgres @db.Date — usa EXTRACT pra match. Como Prisma não suporta diretamente,
    // listamos do mês e filtramos em memória (volume baixo, ~50 feriados/ano).
    const candidatos = await prisma.feriado.findMany({ where })
    return candidatos.filter((f) => {
      const d = new Date(f.data)
      const matchDiaMes = d.getUTCDate() === dia && d.getUTCMonth() + 1 === mes
      if (!matchDiaMes) return false
      if (f.recorrente) return true
      return d.getUTCFullYear() === ano
    })
  }
}
