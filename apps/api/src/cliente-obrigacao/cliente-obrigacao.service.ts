import { Injectable, Inject, forwardRef } from '@nestjs/common'
import { prisma } from '@saas/db'
import { RecorrenciaScheduler } from '../notificacao/recorrencia.scheduler'

/**
 * Vínculo Cliente ↔ Obrigação: lista por cliente, aplicação de grupo, calendário
 * e disparo diário da agenda. Antes era `grupo-obrigacao` e também fazia o CRUD dos
 * templates GrupoObrigacao — esse sistema foi unificado no ServicoGrupo (Frente 3),
 * então o módulo passou a cuidar só do que é do cliente.
 */
@Injectable()
export class ClienteObrigacaoService {
  constructor(
    @Inject(forwardRef(() => RecorrenciaScheduler))
    private readonly recorrenciaScheduler: RecorrenciaScheduler,
  ) {}

  // ── Cliente ↔ Obrigação ────────────────────────────────────

  async listObrigacoesDoCliente(clienteId: string) {
    const rows = await prisma.clienteObrigacao.findMany({
      where: { clienteId },
      include: {
        servico: {
          select: {
            id: true, nome: true, area: { select: { name: true } },
            recorrencia: {
              select: {
                frequencia: true, ancoragem: true, valorAncoragem: true,
                competenciaOffset: true, ajusteVencimento: true,
              },
            },
          },
        },
      },
      orderBy: [{ ativo: 'desc' }, { servico: { nome: 'asc' } }],
    })
    // `servico.categoria` = NOME da área (derivado da relação area{name}).
    return rows.map(o => ({ ...o, servico: { ...o.servico, categoria: o.servico.area?.name ?? null } }))
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
   * Aplica um grupo de obrigações (ServicoGrupo tipo=OBRIGACOES) em um cliente —
   * cria ClienteObrigacao em lote para todos os serviços do grupo.
   *
   * Comportamento:
   *  - `manterExistentes=true` (default) — cria só as obrigações que faltam. O que
   *    o cliente já tem fica intacto (ativo ou inativo — não reativa).
   *  - `manterExistentes=false` (substituir) — limpa TODAS as obrigações atuais
   *    do cliente (inclusive as manuais) e aplica o grupo do zero. Como o vínculo
   *    de origem por-template foi removido na unificação dos grupos, o "substituir"
   *    passou a ser um wipe total — o front avisa disso antes de confirmar.
   */
  async aplicarGrupo(input: { clienteId: string; grupoId: string; manterExistentes: boolean }, empresaId?: string) {
    const grupo = await prisma.servicoGrupo.findUnique({
      where: { id: input.grupoId },
      include: { itens: { select: { servicoId: true } } },
    })
    if (!grupo) throw new Error('Grupo de obrigações não encontrado.')
    if (grupo.tipo !== 'OBRIGACOES') throw new Error('Só grupos do tipo "Obrigações acessórias" podem ser aplicados no cliente.')
    if (grupo.itens.length === 0) throw new Error('Grupo vazio — adicione obrigações antes de aplicar.')

    return prisma.$transaction(async (tx) => {
      let removidas = 0
      if (!input.manterExistentes) {
        const del = await tx.clienteObrigacao.deleteMany({
          where: { clienteId: input.clienteId },
        })
        removidas = del.count
      }

      let criadas = 0
      for (const item of grupo.itens) {
        const existing = await tx.clienteObrigacao.findUnique({
          where: { clienteId_servicoId: { clienteId: input.clienteId, servicoId: item.servicoId } },
        })
        if (existing) continue // já existe: mantém como está (não reativa inativos)
        await tx.clienteObrigacao.create({
          data: {
            clienteId: input.clienteId,
            servicoId: item.servicoId,
            empresaId: empresaId ?? null,
          },
        })
        criadas++
      }
      return {
        grupoNome: grupo.nome,
        totalItensTemplate: grupo.itens.length,
        criadas,
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
  // ── Recomendação automática de grupo (REMOVIDA na unificação dos grupos) ──
  //
  // Existia aqui um `recomendarParaCliente(clienteId)` que pontuava os templates
  // GrupoObrigacao contra o cliente (tributação + prefixo de CNAE) e devolvia a
  // melhor sugestão pro banner "Sugestão: <template> — X% match" na tela do cliente.
  //
  // Foi removido porque os templates viraram ServicoGrupo(tipo=OBRIGACOES), que é
  // um agrupamento genérico e NÃO carrega `tributacao`/`cnaesAplicaveis`. Aplicar
  // grupo passou a ser 100% manual (o usuário escolhe o grupo).
  //
  // Se um dia quisermos ressuscitar a recomendação para os grupos: portar
  // `tributacao TaxRegime?` + `cnaesAplicaveis String[]` (e talvez segmentoSlug/area)
  // para ServicoGrupo, preencher esses campos nos grupos OBRIGACOES, e reintroduzir
  // o scoring aqui lendo servicoGrupo em vez de grupoObrigacao. O banner no front
  // (obrigacoes-cliente-section.tsx) tem um comentário-espelho apontando pra cá.

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
            id: true, nome: true, area: { select: { name: true } },
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
          categoria: v.servico.area?.name ?? null,
          frequencia: r.frequencia,
          data: d.toISOString(),
        })
      }
    }

    return eventos
  }

  /**
   * Vencimentos de obrigações de TODOS os clientes que caem num DIA específico.
   * Computa a partir da recorrência (mesma lógica do calendário do cliente),
   * mas cross-client e filtrado pro dia. Usado no e-mail diário da agenda.
   */
  async getVencimentosDoDia(target: Date): Promise<Array<{ clienteNome: string; obrigacaoNome: string; categoria: string | null }>> {
    const ymd = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
    const alvo = ymd(target)

    const vinculos = await prisma.clienteObrigacao.findMany({
      where: { ativo: true },
      include: {
        servico: { select: { nome: true, area: { select: { name: true } }, recorrencia: true } },
        cliente: { select: { razaoSocial: true } },
      },
    })

    const extrasNaoUteis = await this.recorrenciaScheduler.carregarDiasNaoUteis([target.getFullYear(), target.getFullYear() - 1])
    // Cursor 2 meses antes (proximasExecucoes filtra > cursor); 6 ocorrências
    // bastam pra alcançar o dia-alvo em qualquer frequência (mensal..anual).
    const cursor = new Date(target.getFullYear(), target.getMonth() - 2, 1, 0, 0, 0, 0)

    const out: Array<{ clienteNome: string; obrigacaoNome: string; categoria: string | null }> = []
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
          ajusteVencimento: v.ajusteVencimentoOverride ?? r.ajusteVencimento,
        },
        cursor,
        6,
        extrasNaoUteis,
      )
      if (datas.some((d) => ymd(d) === alvo)) {
        out.push({ clienteNome: v.cliente.razaoSocial, obrigacaoNome: v.servico.nome, categoria: v.servico.area?.name ?? null })
      }
    }
    out.sort((a, b) => (a.categoria ?? '').localeCompare(b.categoria ?? '') || a.clienteNome.localeCompare(b.clienteNome))
    return out
  }
}
