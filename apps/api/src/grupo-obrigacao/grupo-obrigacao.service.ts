import { Injectable, Inject, forwardRef } from '@nestjs/common'
import { prisma } from '@saas/db'
import type {
  CreateGrupoObrigacaoInput,
  ListGruposObrigacaoInput,
} from '@saas/types'
import { RecorrenciaScheduler } from '../notificacao/recorrencia.scheduler'

@Injectable()
export class GrupoObrigacaoService {
  constructor(
    @Inject(forwardRef(() => RecorrenciaScheduler))
    private readonly recorrenciaScheduler: RecorrenciaScheduler,
  ) {}

  // ── Grupos (templates) ────────────────────────────────────

  async listGrupos(input: ListGruposObrigacaoInput, empresaId?: string) {
    const where: any = {
      OR: [{ empresaId: null }, ...(empresaId ? [{ empresaId }] : [])],
    }
    if (input?.tributacao) where.tributacao = input.tributacao
    if (input?.ativo !== undefined) where.ativo = input.ativo
    if (input?.search) {
      where.AND = [{
        OR: [
          { nome: { contains: input.search, mode: 'insensitive' } },
          { descricao: { contains: input.search, mode: 'insensitive' } },
        ],
      }]
    }
    return prisma.grupoObrigacao.findMany({
      where,
      include: {
        itens: {
          orderBy: { ordem: 'asc' },
          include: { servico: { select: { id: true, nome: true, categoria: true } } },
        },
        _count: { select: { clienteObrigacoes: true } },
      },
      orderBy: [{ tributacao: 'asc' }, { nome: 'asc' }],
    })
  }

  async getGrupo(id: string) {
    return prisma.grupoObrigacao.findUnique({
      where: { id },
      include: {
        itens: {
          orderBy: { ordem: 'asc' },
          include: { servico: { select: { id: true, nome: true, categoria: true } } },
        },
      },
    })
  }

  async createGrupo(input: CreateGrupoObrigacaoInput, empresaId?: string) {
    return prisma.$transaction(async (tx) => {
      const grupo = await tx.grupoObrigacao.create({
        data: {
          nome: input.nome,
          slug: input.slug,
          descricao: input.descricao ?? null,
          tributacao: input.tributacao ?? null,
          segmentoSlug: input.segmentoSlug ?? null,
          area: input.area ?? null,
          cor: input.cor ?? '#10b981',
          ativo: input.ativo,
          cnaesAplicaveis: input.cnaesAplicaveis,
          empresaId: empresaId ?? null,
        },
      })
      if (input.servicoIds.length > 0) {
        await tx.grupoObrigacaoItem.createMany({
          data: input.servicoIds.map((servicoId, i) => ({
            grupoId: grupo.id,
            servicoId,
            ordem: i,
          })),
        })
      }
      return grupo
    })
  }

  async updateGrupo(id: string, data: Partial<CreateGrupoObrigacaoInput>) {
    return prisma.$transaction(async (tx) => {
      const updateData: any = {}
      if (data.nome !== undefined) updateData.nome = data.nome
      if (data.slug !== undefined) updateData.slug = data.slug
      if (data.descricao !== undefined) updateData.descricao = data.descricao
      if (data.tributacao !== undefined) updateData.tributacao = data.tributacao
      if (data.segmentoSlug !== undefined) updateData.segmentoSlug = data.segmentoSlug
      if (data.area !== undefined) updateData.area = data.area
      if (data.cor !== undefined) updateData.cor = data.cor
      if (data.ativo !== undefined) updateData.ativo = data.ativo
      if (data.cnaesAplicaveis !== undefined) updateData.cnaesAplicaveis = data.cnaesAplicaveis
      const grupo = await tx.grupoObrigacao.update({ where: { id }, data: updateData })

      if (data.servicoIds !== undefined) {
        // Reseta todos os vínculos — mais simples que diff
        await tx.grupoObrigacaoItem.deleteMany({ where: { grupoId: id } })
        if (data.servicoIds.length > 0) {
          await tx.grupoObrigacaoItem.createMany({
            data: data.servicoIds.map((sid, i) => ({ grupoId: id, servicoId: sid, ordem: i })),
          })
        }
      }
      return grupo
    })
  }

  async deleteGrupo(id: string) {
    return prisma.grupoObrigacao.delete({ where: { id } })
  }

  async bulkDeleteGrupos(ids: string[]) {
    return prisma.grupoObrigacao.deleteMany({ where: { id: { in: ids } } })
  }

  // ── Cliente ↔ Obrigação ────────────────────────────────────

  async listObrigacoesDoCliente(clienteId: string) {
    return prisma.clienteObrigacao.findMany({
      where: { clienteId },
      include: {
        servico: {
          select: {
            id: true, nome: true, categoria: true,
            recorrencia: {
              select: {
                frequencia: true, ancoragem: true, valorAncoragem: true,
                competenciaOffset: true, ajusteVencimento: true,
              },
            },
          },
        },
        template: { select: { id: true, nome: true, cor: true } },
      },
      orderBy: [{ ativo: 'desc' }, { servico: { nome: 'asc' } }],
    })
  }

  async addObrigacaoCliente(input: { clienteId: string; servicoId: string; observacao?: string | null }, empresaId?: string) {
    return prisma.clienteObrigacao.upsert({
      where: { clienteId_servicoId: { clienteId: input.clienteId, servicoId: input.servicoId } },
      create: {
        clienteId: input.clienteId,
        servicoId: input.servicoId,
        observacao: input.observacao ?? null,
        empresaId: empresaId ?? null,
      },
      update: {
        ativo: true,
        observacao: input.observacao ?? undefined,
      },
    })
  }

  async updateObrigacaoCliente(id: string, data: { ativo?: boolean; observacao?: string | null; ajusteVencimentoOverride?: 'MANTER' | 'ANTECIPAR' | 'POSTERGAR' | null }) {
    const updateData: any = {}
    if (data.ativo !== undefined) updateData.ativo = data.ativo
    if (data.observacao !== undefined) updateData.observacao = data.observacao
    if (data.ajusteVencimentoOverride !== undefined) updateData.ajusteVencimentoOverride = data.ajusteVencimentoOverride
    return prisma.clienteObrigacao.update({ where: { id }, data: updateData })
  }

  async removeObrigacaoCliente(id: string) {
    return prisma.clienteObrigacao.delete({ where: { id } })
  }

  async bulkRemoveObrigacaoCliente(ids: string[]) {
    return prisma.clienteObrigacao.deleteMany({ where: { id: { in: ids } } })
  }

  /**
   * Aplica um template (GrupoObrigacao) em um cliente — cria ClienteObrigacao
   * em lote para todos os serviços do template.
   *
   * Comportamento:
   *  - `manterExistentes=true` (default) — upsert: cria os faltantes, mantém
   *    os já cadastrados (mesmo se não vieram deste template originalmente).
   *  - `manterExistentes=false` — primeiro remove vínculos `vindoDeTemplateId=grupoId`
   *    (limpa estado anterior do mesmo template) e depois aplica de novo.
   *    NÃO toca em vínculos manuais (vindoDeTemplateId=null) nem em vínculos
   *    de outros templates.
   */
  async aplicarTemplate(input: { clienteId: string; grupoId: string; manterExistentes: boolean }, empresaId?: string) {
    const grupo = await prisma.grupoObrigacao.findUnique({
      where: { id: input.grupoId },
      include: { itens: { select: { servicoId: true } } },
    })
    if (!grupo) throw new Error('Template de obrigações não encontrado.')
    if (grupo.itens.length === 0) throw new Error('Template vazio — adicione obrigações antes de aplicar.')

    return prisma.$transaction(async (tx) => {
      let removidas = 0
      if (!input.manterExistentes) {
        const del = await tx.clienteObrigacao.deleteMany({
          where: { clienteId: input.clienteId, vindoDeTemplateId: input.grupoId },
        })
        removidas = del.count
      }

      let criadas = 0
      let reativadas = 0
      for (const item of grupo.itens) {
        const existing = await tx.clienteObrigacao.findUnique({
          where: { clienteId_servicoId: { clienteId: input.clienteId, servicoId: item.servicoId } },
        })
        if (existing) {
          if (!existing.ativo) {
            await tx.clienteObrigacao.update({
              where: { id: existing.id },
              data: { ativo: true, vindoDeTemplateId: existing.vindoDeTemplateId ?? input.grupoId },
            })
            reativadas++
          }
          // Já ativo: mantém como está (não sobrescreve template de origem)
        } else {
          await tx.clienteObrigacao.create({
            data: {
              clienteId: input.clienteId,
              servicoId: item.servicoId,
              vindoDeTemplateId: input.grupoId,
              empresaId: empresaId ?? null,
            },
          })
          criadas++
        }
      }
      return {
        grupoNome: grupo.nome,
        totalItensTemplate: grupo.itens.length,
        criadas,
        reativadas,
        removidas,
      }
    })
  }

  /**
   * Recomenda o melhor template pra um cliente baseado em (tributação + CNAE).
   *
   * Score:
   *   - +50 pontos se template.tributacao === cliente.tributacao
   *   - +30 pontos se algum prefixo em template.cnaesAplicaveis casa com cliente.cnaePrincipal
   *   - +10 pontos se template.tributacao é null (genérico, vale pra qualquer regime)
   *   - +5 pontos se template.cnaesAplicaveis vazio (genérico, vale pra qualquer atividade)
   *
   * Retorna o template com maior score (mínimo 30), null se nada bater bem.
   */
  async recomendarParaCliente(clienteId: string) {
    const cliente = await prisma.cliente.findUnique({
      where: { id: clienteId },
      select: { tributacao: true, cnaePrincipal: true },
    })
    if (!cliente) return null

    const grupos = await prisma.grupoObrigacao.findMany({
      where: { ativo: true },
      include: {
        itens: { include: { servico: { select: { nome: true, categoria: true } } } },
      },
    })

    type Resultado = { grupo: typeof grupos[number]; score: number; razoes: string[] }
    const cnaePrefix = (cliente.cnaePrincipal ?? '').replace(/\D/g, '')
    const scoreds: Resultado[] = []

    for (const g of grupos) {
      let score = 0
      const razoes: string[] = []

      if (g.tributacao && cliente.tributacao && g.tributacao === cliente.tributacao) {
        score += 50
        razoes.push(`Tributação ${g.tributacao}`)
      } else if (!g.tributacao) {
        score += 10
        razoes.push('Genérico para qualquer regime')
      }

      if (cnaePrefix && g.cnaesAplicaveis.length > 0) {
        const matched = g.cnaesAplicaveis.find((p) => cnaePrefix.startsWith(p))
        if (matched) {
          score += 30
          razoes.push(`CNAE compatível (${matched})`)
        }
      } else if (g.cnaesAplicaveis.length === 0) {
        score += 5
      }

      if (score > 0) scoreds.push({ grupo: g, score, razoes })
    }

    scoreds.sort((a, b) => b.score - a.score)
    const topo = scoreds[0]
    if (!topo || topo.score < 30) return null

    // Inclui top 3 com menor score pra UI mostrar alternativas
    return {
      recomendado: { grupo: topo.grupo, score: topo.score, razoes: topo.razoes },
      alternativas: scoreds.slice(1, 4).map((s) => ({ grupo: s.grupo, score: s.score, razoes: s.razoes })),
      cliente,
    }
  }

  /**
   * Calendário do ano só com as obrigações ATIVAS deste cliente. Expande as
   * próximas execuções considerando ajuste de FDS/feriado (extrasNaoUteis).
   *
   * Retorno: lista chata `{ obrigacaoId, nome, categoria, frequencia, data }`.
   * Frontend agrupa por dia ao renderizar.
   */
  async getCalendarioDoCliente(clienteId: string, ano: number) {
    const vinculos = await prisma.clienteObrigacao.findMany({
      where: { clienteId, ativo: true },
      include: {
        servico: {
          select: {
            id: true, nome: true, categoria: true,
            recorrencia: true,
          },
        },
      },
    })

    const inicio = new Date(ano, 0, 1, 0, 0, 0, 0)
    const fimExclusivo = new Date(ano + 1, 0, 1, 0, 0, 0, 0)
    // Cursor um dia antes do ano corrente — pra que regras anuais com data
    // no início do ano sejam capturadas (proximasExecucoes filtra > cursor).
    const cursor = new Date(ano - 1, 11, 31, 0, 0, 0, 0)

    // Feriados nacionais + estaduais/municipais do ano (e do anterior, pra
    // cobrir bordas de janeiro).
    const extrasNaoUteis = await this.recorrenciaScheduler.carregarDiasNaoUteis([ano - 1, ano])

    type Evento = { obrigacaoId: string; nome: string; categoria: string | null; frequencia: string; data: string }
    const eventos: Evento[] = []

    for (const v of vinculos) {
      const r = v.servico.recorrencia
      if (!r || !r.ativa) continue
      const datas = this.recorrenciaScheduler.proximasExecucoes(
        {
          frequencia: r.frequencia,
          ancoragem: r.ancoragem,
          valorAncoragem: r.valorAncoragem,
          competenciaOffset: r.competenciaOffset,
          modoPersonalizado: r.modoPersonalizado,
          diasDoMes: r.diasDoMes,
          mesesDoAno: r.mesesDoAno,
          // Override no ClienteObrigacao tem prioridade sobre o ajuste do template
          ajusteVencimento: v.ajusteVencimentoOverride ?? r.ajusteVencimento,
        },
        cursor,
        60,
        extrasNaoUteis,
      )
      for (const d of datas) {
        if (d.getTime() < inicio.getTime()) continue
        if (d.getTime() >= fimExclusivo.getTime()) break
        eventos.push({
          obrigacaoId: v.servico.id,
          nome: v.servico.nome,
          categoria: v.servico.categoria,
          frequencia: r.frequencia,
          data: d.toISOString(),
        })
      }
    }

    return eventos
  }

  /** Stats pro header da página: total grupos, ativos, por regime. */
  async getStats() {
    const todos = await prisma.grupoObrigacao.findMany({
      select: { tributacao: true, ativo: true },
    })
    const stats = {
      total: todos.length,
      ativos: todos.filter((g) => g.ativo).length,
      porTributacao: { SIMPLES_NACIONAL: 0, LUCRO_PRESUMIDO: 0, LUCRO_REAL: 0, MEI: 0, IMUNE: 0, ISENTA: 0 } as Record<string, number>,
    }
    for (const g of todos) {
      if (g.tributacao) stats.porTributacao[g.tributacao] = (stats.porTributacao[g.tributacao] ?? 0) + 1
    }
    return stats
  }
}
