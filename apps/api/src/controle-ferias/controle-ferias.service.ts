import { Injectable } from '@nestjs/common'
import { prisma, getPrismaSkipTake, buildPaginatedResponse } from '@saas/db'
import type {
  CriarFeriasPeriodoInput, AtualizarFeriasPeriodoInput, CriarFeriasEventoInput,
  AtualizarFeriasEventoInput, ListarFeriasPeriodosInput,
} from '@saas/types'
import { diasDoEvento, saldoDoPeriodo, limiteConcessivo, farolVencimento, periodoAquisitivoSugerido } from './ferias-calc'

/**
 * Controle de Férias — port do `crp_ferias` do v1. Um registro por período
 * aquisitivo, com gozos, até três pagamentos e recibos. O SALDO é derivado
 * AQUI (dias + saldo anterior − gozados, contando fim − início + 1 por
 * evento) e entregue no payload — o front nunca refaz a conta.
 */

function dataDeISO(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`)
}

/** Sem acento e em minúsculas, para a busca não depender de digitação exata. */
function normalizar(v: unknown): string {
  return String(v ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR')
}

/** Data nos dois formatos que o usuário pode digitar: 25/08/2026 e 2026-08-25. */
function dataBusca(v: Date | null | undefined): string {
  if (!v) return ''
  const iso = new Date(v).toISOString().slice(0, 10)
  const [a, m, d] = iso.split('-')
  return `${d}/${m}/${a} ${iso}`
}

@Injectable()
export class ControleFeriasService {
  private async nomesPorId(ids: Array<string | null | undefined>): Promise<Map<string, string>> {
    const unicos = [...new Set(ids.filter((x): x is string => !!x))]
    if (!unicos.length) return new Map()
    const users = await prisma.user.findMany({ where: { id: { in: unicos } }, select: { id: true, name: true } })
    return new Map(users.map((u) => [u.id, u.name]))
  }

  /** Nome, situação e admissão do cadastro (colunas que o v1 mostrava). */
  private async usuariosPorId(ids: Array<string | null | undefined>) {
    const unicos = [...new Set(ids.filter((x): x is string => !!x))]
    if (!unicos.length) return new Map<string, { name: string; isActive: boolean; dataAdmissao: Date | null; image: string | null }>()
    const users = await prisma.user.findMany({ where: { id: { in: unicos } }, select: { id: true, name: true, isActive: true, dataAdmissao: true, image: true } })
    return new Map(users.map((u) => [u.id, { name: u.name, isActive: u.isActive, dataAdmissao: u.dataAdmissao, image: u.image }]))
  }

  /** Agrupador de períodos: o id do colaborador ou, no resíduo do v1, o nome. */
  private chaveColaborador(p: { colaboradorId?: string | null; colaboradorNomeResolvido?: string | null; colaboradorNome?: string | null }): string {
    if (p.colaboradorId) return `id:${p.colaboradorId}`
    return `nome:${String(p.colaboradorNomeResolvido ?? p.colaboradorNome ?? '').toLocaleLowerCase('pt-BR').trim()}`
  }

  /** Delega para `ferias-calc`: a conta do saldo mora lá, junto com o prazo legal. */
  private saldo(p: { dias: number; saldoAnterior: number; eventos: Array<{ dataInicio: Date; dataFim: Date }> }) {
    return saldoDoPeriodo(p)
  }

  async listar(input: ListarFeriasPeriodosInput, empresaId?: string | null) {
    const { page, limit, search, sortBy, sortDir } = input
    const { skip, take } = getPrismaSkipTake(page, limit)

    const filtros: Record<string, unknown>[] = []
    if (input.colaboradorId) filtros.push({ colaboradorId: input.colaboradorId })
    if (input.situacao === 'ABERTOS') filtros.push({ historico: false })
    if (input.situacao === 'HISTORICO') filtros.push({ historico: true })

    const where = { empresaId: empresaId ?? null, ...(filtros.length ? { AND: filtros } : {}) }

    // Volume pequeno (algumas centenas de períodos) e três colunas DERIVADAS
    // (nome do colaborador, gozados, saldo): busca tudo o que casa o filtro,
    // resolve, ordena e pagina em memória — assim qualquer coluna é ordenável.
    const data = await prisma.feriasPeriodo.findMany({
      where,
      include: { eventos: { select: { dataInicio: true, dataFim: true } }, _count: { select: { arquivos: true } } },
    })

    const usuarios = await this.usuariosPorId(data.map((d) => d.colaboradorId))
    const hoje = new Date()

    /**
     * Molde da linha de quem ainda não tem período: tudo zerado e nulo. Existe
     * para a linha ter a MESMA forma das outras — a tela ordena, busca e exporta
     * o conjunto inteiro, e um objeto com metade dos campos faltando quebraria
     * cada um desses lugares.
     */
    const vazio = {
      legacyId: null as number | null,
      numero: 0,
      colaboradorNome: null as string | null,
      descricao: null as string | null,
      saldoAnterior: 0,
      dias: 0,
      previsao: null as Date | null,
      pagamento1: null as Date | null,
      pagamento2: null as Date | null,
      pagamento3: null as Date | null,
      pago: false,
      historico: false,
      registradoPorId: null as string | null,
      registradoEm: hoje,
      criadoEm: hoje,
      atualizadoEm: hoje,
      eventos: undefined,
      gozados: 0,
      saldo: 0,
      gozoNoMes: 0,
      eventosTotal: 0,
      arquivosTotal: 0,
      periodosAnteriores: 0,
      _count: { arquivos: 0 },
    }
    const mesAtual = hoje.getUTCFullYear() * 100 + hoje.getUTCMonth()
    let rows = data.map((d) => {
      const { gozados, saldo } = this.saldo(d)
      const u = d.colaboradorId ? usuarios.get(d.colaboradorId) : undefined
      // Prazo legal do concessivo — mesma conta do relatório de vencimentos.
      const { limite, aproximado } = limiteConcessivo(d.periodoFinal, u?.dataAdmissao)
      const { farol, diasRestantes } = farolVencimento(limite, hoje)
      const gozoNoMes = d.eventos.reduce((acc, e) => {
        const ini = new Date(e.dataInicio)
        const fim = new Date(e.dataFim)
        const dentro = (dt: Date) => dt.getUTCFullYear() * 100 + dt.getUTCMonth() === mesAtual
        return acc + (dentro(ini) || dentro(fim) ? 1 : 0)
      }, 0)
      return {
        ...d,
        eventos: undefined,
        colaboradorNomeResolvido: u?.name ?? d.colaboradorNome,
        /** false = desligado no cadastro; null = nem existe mais (só resíduo). */
        colaboradorAtivo: d.colaboradorId ? (u?.isActive ?? false) : null,
        /** Data de admissão do cadastro — coluna "Dt Admissão" do v1. */
        colaboradorAdmissao: u?.dataAdmissao ?? null,
        /** Foto do cadastro — a bolinha na primeira coluna da lista. */
        colaboradorImagem: u?.image ?? null,
        gozados,
        saldo,
        /** Data-limite do período concessivo; `~` quando falta a admissão. */
        limite,
        limiteAproximado: aproximado,
        farol,
        diasRestantes,
        gozoNoMes,
        eventosTotal: d.eventos.length,
        arquivosTotal: d._count.arquivos,
      }
    })

    // Uma linha por colaborador: fica só o período MAIS RECENTE; os anteriores
    // viram histórico dentro do registro (decisão do Wagner, 25/08). Filtrar por
    // um colaborador específico desagrupa — é o drill-down natural.
    const agrupar = (lista: typeof rows) => {
      const maisRecente = new Map<string, (typeof lista)[number]>()
      const totalPorColab = new Map<string, number>()
      for (const r of lista) {
        const k = this.chaveColaborador(r)
        totalPorColab.set(k, (totalPorColab.get(k) ?? 0) + 1)
        const atual = maisRecente.get(k)
        const maisNovo = !atual
          || r.periodoInicial > atual.periodoInicial
          || (r.periodoInicial === atual.periodoInicial && r.periodoFinal > atual.periodoFinal)
        if (maisNovo) maisRecente.set(k, r)
      }
      return [...maisRecente.values()].map((r) => ({
        ...r,
        /** Quantos períodos anteriores existem para este colaborador. */
        periodosAnteriores: (totalPorColab.get(this.chaveColaborador(r)) ?? 1) - 1,
      }))
    }

    // Busca livre: vale para TODAS as colunas da tela, inclusive as derivadas
    // (nome resolvido do cadastro, dias disponíveis, situação) e as datas nos
    // dois formatos que o usuário pode digitar. Vários termos = todos precisam
    // bater (AND), cada um em qualquer coluna.
    const termos = normalizar(search).split(/\s+/).filter(Boolean)
    const casaBusca = (r: (typeof rows)[number]) => {
      if (!termos.length) return true
      const alvo = normalizar([
        r.numero,
        r.colaboradorNomeResolvido, r.colaboradorNome,
        dataBusca(r.colaboradorAdmissao),
        `${r.periodoInicial}/${r.periodoFinal}`, r.periodoInicial, r.periodoFinal,
        r.descricao || 'Período aquisitivo',
        r.dias + r.saldoAnterior, r.gozados, r.saldo,
        r.previsao ? dataBusca(r.previsao) : 'Incluir previsão',
        r.pagamento1 ? dataBusca(r.pagamento1) : 'A pagar',
        dataBusca(r.pagamento2), dataBusca(r.pagamento3),
        r.pago ? 'pago' : 'em aberto',
        r.historico ? 'histórico encerrado' : 'vigente em aberto',
        r.colaboradorAtivo === false ? 'desligado inativo' : 'ativo',
      ].join(' '))
      return termos.every((t) => alvo.includes(t))
    }

    // A lista segue o cadastro: por padrão, só colaboradores ativos. Contamos
    // quantos ficaram de fora — já agrupados e sujeitos à mesma busca, para o
    // aviso da tela bater com o que apareceria ao incluir os desligados.
    let ocultosPorInatividade = 0
    if ((input.colaboradores ?? 'ATIVOS') === 'ATIVOS' && !input.colaboradorId) {
      const desligados = rows.filter((r) => r.colaboradorAtivo !== true)
      rows = rows.filter((r) => r.colaboradorAtivo === true)
      ocultosPorInatividade = agrupar(desligados).filter(casaBusca).length
    }

    rows = input.colaboradorId
      ? rows.map((r) => ({ ...r, periodosAnteriores: 0 }))
      : agrupar(rows)

    /**
     * Quem está no controle e ainda não tem período lançado entra na lista
     * assim mesmo.
     *
     * Antes a tela era uma lista de PERÍODOS, então marcar "Incluir no controle
     * de férias" no cadastro não fazia a pessoa aparecer aqui — ela só existia
     * na aba de pendências dos relatórios. Quem marcava o campo e voltava para
     * cá concluía, razoavelmente, que o campo não funcionava. São 14 pessoas
     * nessa situação hoje, quatro delas com o primeiro aquisitivo já completo.
     *
     * A linha vem vazia de propósito (sem nº, sem dias, sem saldo): o que ela
     * afirma é "esta pessoa deveria ter um período e não tem". O período
     * SUGERIDO pela admissão é calculado mesmo assim, porque é dele que sai o
     * prazo concessivo — sem isso o farol não teria com o que ser calculado.
     */
    const historicoApenas = input.situacao === 'HISTORICO'
    if (!historicoApenas) {
      const jaListados = new Set(
        rows.map((r) => r.colaboradorId).filter((x): x is string => !!x),
      )
      // Quem já tem período é apurado sobre TODOS os períodos do tenant, não
      // sobre os que passaram no filtro da tela. Com "Em aberto" selecionado,
      // `data` não traz os arquivados — e quem só tem período no histórico
      // apareceria como se nunca tivesse tido nenhum.
      const comPeriodo = new Set(
        (await prisma.feriasPeriodo.findMany({
          where: { empresaId: empresaId ?? null, colaboradorId: { not: null } },
          select: { colaboradorId: true },
          distinct: ['colaboradorId'],
        })).map((d) => d.colaboradorId).filter((x): x is string => !!x),
      )
      const semPeriodo = await prisma.user.findMany({
        where: {
          // Mesmo recorte de tenant da consulta de períodos, e não o
          // `OR: [{empresaId}, {empresaId: null}]` do seletor: colaborador de
          // outra empresa (ou de nenhuma) não é pendência desta.
          empresaId: empresaId ?? null,
          incluirFerias: true,
          id: { notIn: [...comPeriodo] },
          ...(input.colaboradorId ? { id: input.colaboradorId } : {}),
          ...((input.colaboradores ?? 'ATIVOS') === 'ATIVOS' ? { isActive: true } : {}),
        },
        select: { id: true, name: true, isActive: true, dataAdmissao: true, image: true },
      })

      const pendentes = semPeriodo
        .filter((u) => !jaListados.has(u.id))
        .map((u) => {
          const sug = u.dataAdmissao
            ? periodoAquisitivoSugerido(u.dataAdmissao, hoje)
            : { periodoInicial: 0, periodoFinal: 0 }
          const { limite, aproximado } = limiteConcessivo(sug.periodoFinal, u.dataAdmissao)
          const { farol, diasRestantes } = farolVencimento(limite, hoje)
          return {
            ...vazio,
            id: `sem-periodo:${u.id}`,
            empresaId: empresaId ?? null,
            colaboradorId: u.id,
            colaboradorNomeResolvido: u.name,
            colaboradorAtivo: u.isActive,
            colaboradorAdmissao: u.dataAdmissao,
            colaboradorImagem: u.image,
            /** Anos que o período GANHARIA se fosse lançado agora. */
            periodoInicial: sug.periodoInicial,
            periodoFinal: sug.periodoFinal,
            limite,
            limiteAproximado: aproximado,
            farol,
            diasRestantes,
            /** A tela usa esta marca para esvaziar as colunas e trocar a ação. */
            semPeriodo: true,
          }
        })
      rows = [...rows, ...pendentes]
    }

    rows = rows.filter(casaBusca)

    // Recorte dos indicadores do topo: cada cartão mostra as linhas que o
    // formam. As contas são as mesmas do painel de relatórios (ferias-calc),
    // então o número do cartão e o total da tabela batem.
    if (input.indicador) {
      const vigente = (r: (typeof rows)[number]) => !r.historico
      rows = rows.filter((r) => {
        // Sem período não há saldo, vencimento nem pagamento — e "A pagar",
        // que é `vigente && !pago`, pegaria todos eles por tabela.
        if ('semPeriodo' in r && r.semPeriodo) return false
        switch (input.indicador) {
          case 'SALDO': return vigente(r) && r.saldo > 0
          case 'VENCIDOS': return vigente(r) && r.saldo > 0 && r.farol === 'VENCIDO'
          case 'VENCENDO': return vigente(r) && r.saldo > 0 && (r.farol === 'CRITICO' || r.farol === 'ATENCAO')
          case 'GOZO_MES': return r.gozoNoMes > 0
          case 'A_PAGAR': return vigente(r) && !r.pago
          default: return true
        }
      })
    }

    // Ordenação — padrão alfabético pelo colaborador; qualquer coluna serve.
    const dir = sortDir === 'desc' ? -1 : 1
    const campo = sortBy || 'colaborador'
    const texto = (v: unknown) => String(v ?? '').toLocaleLowerCase('pt-BR')
    const num = (v: unknown) => (typeof v === 'number' ? v : Number(v ?? 0))
    const data0 = (v: unknown) => (v ? new Date(v as Date).getTime() : 0)
    rows.sort((a, b) => {
      let c = 0
      switch (campo) {
        case 'colaborador': c = texto(a.colaboradorNomeResolvido).localeCompare(texto(b.colaboradorNomeResolvido), 'pt-BR'); break
        case 'periodo': c = (a.periodoInicial - b.periodoInicial) || (a.periodoFinal - b.periodoFinal); break
        case 'dias': c = num(a.dias + a.saldoAnterior) - num(b.dias + b.saldoAnterior); break
        case 'gozados': c = a.gozados - b.gozados; break
        case 'saldo': c = a.saldo - b.saldo; break
        case 'previsao': c = data0(a.previsao) - data0(b.previsao); break
        case 'numero': c = a.numero - b.numero; break
        case 'admissao': c = data0(a.colaboradorAdmissao) - data0(b.colaboradorAdmissao); break
        case 'pagamento': c = data0(a.pagamento1) - data0(b.pagamento1); break
        case 'descricao': c = texto(a.descricao).localeCompare(texto(b.descricao), 'pt-BR'); break
        case 'situacao': c = Number(a.historico) - Number(b.historico) || Number(a.pago) - Number(b.pago); break
        default: c = texto(a.colaboradorNomeResolvido).localeCompare(texto(b.colaboradorNomeResolvido), 'pt-BR')
      }
      // Empate: sempre pelo período mais recente, depois pelo nome
      if (c === 0) c = (b.periodoInicial - a.periodoInicial) || texto(a.colaboradorNomeResolvido).localeCompare(texto(b.colaboradorNomeResolvido), 'pt-BR')
      return c * dir
    })

    const total = rows.length
    return { ...buildPaginatedResponse(rows.slice(skip, skip + take), total, page, limit), ocultosPorInatividade }
  }

  async getById(id: string, empresaId?: string | null) {
    const p = await prisma.feriasPeriodo.findFirst({
      where: { id, empresaId: empresaId ?? null },
      include: {
        eventos: { orderBy: [{ dataInicio: 'asc' }] },
        arquivos: { orderBy: { criadoEm: 'desc' } },
      },
    })
    if (!p) throw new Error('Período não encontrado.')
    const nomes = await this.nomesPorId([p.colaboradorId, ...p.eventos.map((e) => e.registradoPorId)])
    const { gozados, saldo } = this.saldo(p)

    // Histórico do colaborador: os demais períodos (a lista mostra só o mais
    // recente, então é aqui que o usuário consulta os anteriores).
    const irmaos = await prisma.feriasPeriodo.findMany({
      where: {
        empresaId: empresaId ?? null,
        id: { not: p.id },
        ...(p.colaboradorId
          ? { colaboradorId: p.colaboradorId }
          : { colaboradorId: null, colaboradorNome: p.colaboradorNome }),
      },
      include: {
        // Os gozos e os anexos vêm junto: o histórico da tela expande a linha
        // e mostra o período por dentro, sem uma ida ao servidor por clique.
        eventos: { select: { id: true, dataInicio: true, dataFim: true, descricao: true }, orderBy: { dataInicio: 'asc' } },
        arquivos: { select: { id: true, nome: true, path: true, criadoEm: true }, orderBy: { criadoEm: 'desc' } },
        _count: { select: { arquivos: true } },
      },
      orderBy: [{ periodoInicial: 'desc' }, { periodoFinal: 'desc' }],
    })
    const historicoColaborador = irmaos.map((h) => {
      const { gozados: g, saldo: sd } = this.saldo(h)
      return {
        id: h.id,
        periodoInicial: h.periodoInicial,
        periodoFinal: h.periodoFinal,
        descricao: h.descricao,
        dias: h.dias,
        saldoAnterior: h.saldoAnterior,
        gozados: g,
        saldo: sd,
        previsao: h.previsao,
        pago: h.pago,
        historico: h.historico,
        eventosTotal: h.eventos.length,
        arquivosTotal: h._count.arquivos,
        gozos: h.eventos.map((e) => ({
          id: e.id,
          dataInicio: e.dataInicio,
          dataFim: e.dataFim,
          dias: diasDoEvento(e.dataInicio, e.dataFim),
          descricao: e.descricao,
        })),
        arquivos: h.arquivos,
      }
    })

    return {
      ...p,
      historicoColaborador,
      colaboradorNomeResolvido: p.colaboradorId ? nomes.get(p.colaboradorId) ?? p.colaboradorNome : p.colaboradorNome,
      gozados,
      saldo,
      eventos: p.eventos.map((e) => ({
        ...e,
        dias: diasDoEvento(e.dataInicio, e.dataFim),
        registradoPorNome: e.registradoPorId ? nomes.get(e.registradoPorId) ?? null : null,
      })),
    }
  }

  /**
   * O que o colaborador leva para o próximo período: os dias disponíveis do
   * período mais recente — o "saldo anterior" do v1. A tela usa isso para já
   * abrir o novo período com o saldo certo, em vez de o usuário conferir na
   * mão e digitar.
   */
  async saldoAnterior(colaboradorId: string, empresaId?: string | null) {
    const p = await prisma.feriasPeriodo.findFirst({
      where: { empresaId: empresaId ?? null, colaboradorId },
      orderBy: [{ periodoInicial: 'desc' }, { periodoFinal: 'desc' }],
      include: { eventos: { select: { dataInicio: true, dataFim: true } } },
    })
    if (!p) return { saldo: 0, periodoInicial: null, periodoFinal: null, periodoId: null }
    const { saldo } = this.saldo(p)
    return { saldo, periodoInicial: p.periodoInicial, periodoFinal: p.periodoFinal, periodoId: p.id }
  }

  async criar(input: CriarFeriasPeriodoInput, usuarioId: string, empresaId?: string | null) {
    return prisma.feriasPeriodo.create({
      data: {
        empresaId: empresaId ?? null,
        colaboradorId: input.colaboradorId,
        periodoInicial: input.periodoInicial,
        periodoFinal: input.periodoFinal,
        descricao: input.descricao?.trim() || null,
        saldoAnterior: input.saldoAnterior,
        dias: input.dias,
        previsao: input.previsao ? dataDeISO(input.previsao) : null,
        registradoPorId: usuarioId,
      },
      select: { id: true },
    })
  }

  async atualizar(input: AtualizarFeriasPeriodoInput, empresaId?: string | null) {
    const { id, ...c } = input
    const atual = await this.getById(id, empresaId)

    // Os anos podem chegar sozinhos (a tela manda os dois, mas nada impede uma
    // correção de um só). Compara com o que está gravado para 2026/2025 não
    // entrar pela porta dos fundos — o refine do schema de criação só enxerga
    // o payload.
    const ini = c.periodoInicial ?? atual.periodoInicial
    const fim = c.periodoFinal ?? atual.periodoFinal
    if (fim < ini) {
      throw new Error('O ano final do período não pode ser menor que o inicial.')
    }
    const d = (v: string | null | undefined) => (v === undefined ? undefined : v ? dataDeISO(v) : null)
    return prisma.feriasPeriodo.update({
      where: { id },
      data: {
        ...(c.periodoInicial !== undefined ? { periodoInicial: c.periodoInicial } : {}),
        ...(c.periodoFinal !== undefined ? { periodoFinal: c.periodoFinal } : {}),
        ...(c.descricao !== undefined ? { descricao: c.descricao?.trim() || null } : {}),
        ...(c.saldoAnterior !== undefined ? { saldoAnterior: c.saldoAnterior } : {}),
        ...(c.dias !== undefined ? { dias: c.dias } : {}),
        ...(c.previsao !== undefined ? { previsao: d(c.previsao) } : {}),
        ...(c.pagamento1 !== undefined ? { pagamento1: d(c.pagamento1) } : {}),
        ...(c.pagamento2 !== undefined ? { pagamento2: d(c.pagamento2) } : {}),
        ...(c.pagamento3 !== undefined ? { pagamento3: d(c.pagamento3) } : {}),
        // Informar a 1ª data de pagamento já marca como pago (e limpar desmarca),
        // como no v1 — a não ser que o próprio `pago` venha no payload.
        ...(c.pago !== undefined
          ? { pago: c.pago }
          : c.pagamento1 !== undefined
            ? { pago: !!c.pagamento1 }
            : {}),
        ...(c.historico !== undefined ? { historico: c.historico } : {}),
      },
      select: { id: true },
    })
  }

  async excluir(id: string, empresaId?: string | null) {
    await this.getById(id, empresaId)
    await prisma.feriasPeriodo.delete({ where: { id } })
    return { id }
  }

  // ── Gozos ──────────────────────────────────────────────────────

  async criarEvento(input: CriarFeriasEventoInput, usuarioId: string, empresaId?: string | null) {
    const p = await this.getById(input.periodoId, empresaId)
    return prisma.feriasEvento.create({
      data: {
        periodoId: p.id,
        ordem: p.eventos.length + 1,
        dataInicio: dataDeISO(input.dataInicio),
        dataFim: dataDeISO(input.dataFim),
        descricao: input.descricao?.trim() || null,
        registradoPorId: usuarioId,
      },
      select: { id: true },
    })
  }

  /**
   * Corrige um gozo já lançado. Antes só dava para excluir e relançar — o que
   * trocava o autor do registro e perdia a data de lançamento original.
   *
   * A ordem das datas é conferida contra o que está gravado, porque a tela
   * edita um campo por vez: mexer só no fim não pode deixá-lo antes do início.
   */
  async atualizarEvento(input: AtualizarFeriasEventoInput, empresaId?: string | null) {
    const atual = await prisma.feriasEvento.findUnique({
      where: { id: input.id },
      select: { id: true, dataInicio: true, dataFim: true, periodo: { select: { empresaId: true } } },
    })
    if (!atual) throw new Error('Gozo não encontrado.')
    if ((atual.periodo.empresaId ?? null) !== (empresaId ?? null)) throw new Error('Gozo não encontrado.')

    const inicio = input.dataInicio ? dataDeISO(input.dataInicio) : atual.dataInicio
    const fim = input.dataFim ? dataDeISO(input.dataFim) : atual.dataFim
    if (fim < inicio) throw new Error('O fim do gozo não pode vir antes do início.')

    return prisma.feriasEvento.update({
      where: { id: input.id },
      data: {
        ...(input.dataInicio !== undefined ? { dataInicio: inicio } : {}),
        ...(input.dataFim !== undefined ? { dataFim: fim } : {}),
        ...(input.descricao !== undefined ? { descricao: input.descricao?.trim() || null } : {}),
      },
      select: { id: true },
    })
  }

  async excluirEvento(id: string) {
    await prisma.feriasEvento.delete({ where: { id } })
    return { id }
  }

  // ── Arquivos (recibos/avisos) ──────────────────────────────────

  async criarArquivo(input: { periodoId: string; nome: string; path: string }, usuarioId: string, empresaId?: string | null) {
    await this.getById(input.periodoId, empresaId)
    return prisma.feriasArquivo.create({
      data: { periodoId: input.periodoId, nome: input.nome, path: input.path, autorId: usuarioId },
      select: { id: true },
    })
  }

  async excluirArquivo(id: string) {
    await prisma.feriasArquivo.delete({ where: { id } })
    return { id }
  }

  /**
   * Preenche a data de admissão do colaborador direto do painel de pendências.
   *
   * É campo do cadastro de usuários, mas quem cuida das férias é quem sente a
   * falta dele — sem admissão o prazo legal só sai aproximado. Por isso a
   * escrita mora aqui, limitada a este único campo e ao escopo da empresa.
   */
  async definirAdmissao(colaboradorId: string, dataISO: string | null, empresaId?: string | null) {
    const u = await prisma.user.findFirst({
      where: { id: colaboradorId, OR: [{ empresaId: empresaId ?? null }, { empresaId: null }] },
      select: { id: true },
    })
    if (!u) throw new Error('Colaborador não encontrado.')
    await prisma.user.update({
      where: { id: colaboradorId },
      data: { dataAdmissao: dataISO ? dataDeISO(dataISO) : null },
    })
    return { id: colaboradorId, dataAdmissao: dataISO }
  }

  /**
   * Liga/desliga o colaborador do controle de férias (`incluirFerias` do
   * cadastro, o mesmo checkbox do formulário de usuário). Sócio com
   * pró-labore, conta de sistema e prestador não têm período aquisitivo, e
   * ficavam cobrados eternamente na lista de pendências.
   */
  async definirInclusao(colaboradorId: string, incluir: boolean, empresaId?: string | null) {
    const u = await prisma.user.findFirst({
      where: { id: colaboradorId, OR: [{ empresaId: empresaId ?? null }, { empresaId: null }] },
      select: { id: true },
    })
    if (!u) throw new Error('Colaborador não encontrado.')
    await prisma.user.update({ where: { id: colaboradorId }, data: { incluirFerias: incluir } })
    return { id: colaboradorId, incluirFerias: incluir }
  }

  /**
   * Colaboradores para o seletor: só quem está ATIVO no cadastro (não faz
   * sentido abrir período novo para quem saiu). `incluirInativos` traz todos —
   * usado pelo filtro quando o usuário quer ver o histórico dos desligados.
   */
  async listarColaboradores(empresaId?: string | null, incluirInativos = false) {
    return prisma.user.findMany({
      where: {
        OR: [{ empresaId: empresaId ?? null }, { empresaId: null }],
        ...(incluirInativos ? {} : { isActive: true, incluirFerias: true }),
      },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, email: true, image: true, isActive: true },
    })
  }
}
