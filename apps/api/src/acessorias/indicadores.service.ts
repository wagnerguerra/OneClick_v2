import { Injectable } from '@nestjs/common'
import { prisma, Prisma } from '@saas/db'
import { VinculosAcessoriasService } from './vinculos.service'

/**
 * Painel de indicadores das obrigações — seis números por cartão.
 *
 * O que cada um vê depende do cargo, e essa decisão é do SERVIDOR: a tela só
 * desenha o que recebe. Filtrar no navegador deixaria o dado de todo mundo
 * trafegando para quem só pode ver o próprio.
 *
 *   colaborador          → as obrigações dele
 *   gestor/coordenador   → um cartão por colaborador da área dele
 *   gerente/diretor      → um cartão por área
 *   master               → um cartão por área, mais o total da empresa
 */

export type EscopoPainel = 'PROPRIO' | 'COLABORADORES' | 'AREAS' | 'GERAL'

export interface Indicadores {
  pendenteNoPrazo: number
  pendenteAtrasado: number
  pendenteComMulta: number
  entregueNoPrazo: number
  entregueComAtraso: number
  entregueComMulta: number
}

export interface CartaoIndicadores extends Indicadores {
  chave: string
  titulo: string
  /** Subtítulo: a área do colaborador, ou o departamento de origem. */
  subtitulo: string | null
  /** Nulo quando o nome do Acessórias não casou com nenhum usuário nosso. */
  userId: string | null
  imagem: string | null
}

const zerado = (): Indicadores => ({
  pendenteNoPrazo: 0, pendenteAtrasado: 0, pendenteComMulta: 0,
  entregueNoPrazo: 0, entregueComAtraso: 0, entregueComMulta: 0,
})

const STATUS_ENTREGUE = ['ent. antecipada', 'ent. pztéc', 'ent. pztec', 'ent. atrasada', 'entregue']

function norm(v: string | null): string {
  return String(v ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim()
}

interface LinhaCrua {
  status: string | null
  prazo: Date | null
  dtAtraso: Date | null
  dtEntrega: Date | null
  multa: boolean
  respPrazo: string | null
  respEntrega: string | null
  dpto: string | null
  nome: string
  clienteId: string
}

@Injectable()
export class IndicadoresAcessoriasService {
  constructor(private readonly vinculos: VinculosAcessoriasService) {}

  /**
   * Classifica uma entrega nos seis baldes e soma no acumulador.
   *
   * Sobre `multa`: o campo EntMulta do Acessórias NÃO diz "gerou multa" — diz
   * que a obrigação é sujeita a multa caso falhe. É atributo da obrigação, não
   * do que aconteceu. Conferido na carteira: das 18 entregas ANTECIPADAS de um
   * mês, 10 vinham com multa='S'; até obrigação dispensada, que sequer era
   * devida, vinha marcada — enquanto a única realmente atrasada vinha com 'N'.
   *
   * Contar toda entrega marcada produzia um número sem sentido ("entregou 4
   * com multa" tendo entregado tudo com antecedência) e um cartão que se
   * contradizia: zero pendências em atraso e sete "com multa".
   *
   * Então os dois baldes de multa passam a exigir o ATRASO junto: só há
   * exposição real quando a obrigação sujeita a multa de fato passou do prazo.
   */
  private acumular(acc: Indicadores, l: LinhaCrua, hoje: Date) {
    const s = norm(l.status)
    if (s.startsWith('dispensad')) return // não era devida: não conta em lugar nenhum

    const entregue = l.dtEntrega !== null || STATUS_ENTREGUE.some((x) => s.startsWith(norm(x)))
    if (entregue) {
      // Quem classifica é o Acessórias, que tem TRÊS categorias de entrega e só
      // uma delas é atraso:
      //
      //   Ent. antecipada  entregue antes do prazo interno       → em dia
      //   Ent. PzTéc       depois do prazo interno, mas dentro
      //                    do vencimento ("prazo técnico")       → em dia
      //   Ent. atrasada    depois do vencimento                  → atraso
      //
      // A regra anterior desempatava por `entrega > prazo interno` e derrubava
      // toda a faixa do prazo técnico no balde de atraso — 9 de 12 na amostra
      // conferida. O desempate por data só entra quando o status não classifica,
      // e aí compara com o VENCIMENTO, que é o limite real.
      const venc = l.dtAtraso ?? l.prazo
      const atrasada = s.startsWith('ent. atrasada') || s.startsWith('ent atrasada')
        || (!s.startsWith('ent') && !!l.dtEntrega && !!venc && l.dtEntrega > venc)
      if (atrasada) {
        acc.entregueComAtraso++
        if (l.multa) acc.entregueComMulta++
      } else {
        acc.entregueNoPrazo++
      }
      return
    }

    const venc = l.dtAtraso ?? l.prazo
    if (venc && venc < hoje) {
      acc.pendenteAtrasado++
      if (l.multa) acc.pendenteComMulta++
    } else {
      acc.pendenteNoPrazo++
    }
  }

  /** Início e fim do mês de uma competência "YYYY-MM". */
  private mesDaCompetencia(v: string) {
    const [ano, mes] = v.split('-').map(Number)
    return {
      gte: new Date(Date.UTC(ano ?? 1970, (mes ?? 1) - 1, 1)),
      lte: new Date(Date.UTC(ano ?? 1970, mes ?? 1, 0)),
    }
  }

  async painel(
    filtro: { de?: string; ate?: string; dpto?: string; competencia?: string },
    ctx: { userId: string; isMaster: boolean; isEmpresaMaster: boolean; empresaId?: string },
  ) {
    const empresaId = ctx.empresaId ?? null
    const { escopo, user } = await this.vinculos.escopoDoUsuario(ctx.userId, ctx.isMaster, ctx.isEmpresaMaster)

    // Reconfere os vínculos a cada consulta. Rodar só quando a tabela estava
    // vazia deixava par errado gravado para sempre: foi assim que uma correção
    // na regra de semelhança não chegou a chegar às linhas já existentes. A
    // conferência só escreve quando algo muda, então no dia a dia não custa
    // nada — e o usuário comum, que é quem mais usa esta tela, não tem acesso
    // à aba de integração para dispará-la à mão.
    await this.vinculos.sincronizar(empresaId)
    const idx = await this.vinculos.indices(empresaId)

    const hoje = new Date()
    hoje.setHours(0, 0, 0, 0)

    const escopoEmpresa: Prisma.AcessoriasEntregaWhereInput =
      !ctx.isMaster && empresaId ? { empresaId } : {}

    // Competência e período são excludentes: quem escolheu a competência quer o
    // fechamento daquele mês inteiro, independentemente de quando vence.
    const where: Prisma.AcessoriasEntregaWhereInput = {
      ...escopoEmpresa,
      ...(filtro.dpto ? { dpto: filtro.dpto } : {}),
      ...(filtro.competencia
        ? { competencia: this.mesDaCompetencia(filtro.competencia) }
        : filtro.de || filtro.ate
          ? {
              AND: [
                ...(filtro.de ? [{ OR: [
                  { dtAtraso: { gte: new Date(`${filtro.de}T00:00:00`) } },
                  { dtAtraso: null, prazo: { gte: new Date(`${filtro.de}T00:00:00`) } },
                ] }] : []),
                ...(filtro.ate ? [{ OR: [
                  { dtAtraso: { lte: new Date(`${filtro.ate}T00:00:00`) } },
                  { dtAtraso: null, prazo: { lte: new Date(`${filtro.ate}T00:00:00`) } },
                ] }] : []),
              ],
            }
          : {}),
    }

    // Até onde o espelho vai. A sincronização recorta a API pelo prazo TÉCNICO
    // e o painel filtra pelo LEGAL, então "sincronizei julho" não significa
    // "tenho tudo que vence em julho": obrigação com prazo técnico em 31/07 e
    // legal em 14/08 entra, e a de agosto inteira não. Sem este aviso, período
    // fora da cobertura vira painel meio vazio lido como se fosse a realidade.
    const limites = await prisma.acessoriasEntrega.aggregate({
      where: escopoEmpresa,
      _max: { dtAtraso: true, prazo: true },
      _min: { dtAtraso: true, prazo: true },
    })
    const maiorData = [limites._max.dtAtraso, limites._max.prazo].filter(Boolean).sort().pop() ?? null
    const menorData = [limites._min.dtAtraso, limites._min.prazo].filter(Boolean).sort().shift() ?? null
    const cobertura = { de: menorData, ate: maiorData }

    // ── recorte por permissão, aplicado na consulta ──
    // O responsável do Acessórias é texto; traduzimos o usuário (ou a área)
    // para os nomes/departamentos correspondentes antes de filtrar.
    if (escopo === 'PROPRIO') {
      const meus = idx.nomesDoUsuario.get(ctx.userId) ?? []
      if (meus.length === 0) return { escopo, cartoes: [], pendentes: [], semVinculo: true, areaNome: user?.area?.name ?? null, cobertura }
      Object.assign(where, {
        AND: [...(Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : []),
          { OR: [{ respPrazo: { in: meus } }, { respEntrega: { in: meus } }] }],
      })
    } else if (escopo === 'COLABORADORES') {
      const dptos = user?.areaId ? idx.dptosDaArea.get(user.areaId) ?? [] : []
      if (dptos.length === 0) return { escopo, cartoes: [], pendentes: [], semVinculo: true, areaNome: user?.area?.name ?? null, cobertura }
      Object.assign(where, {
        AND: [...(Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : []),
          { dpto: { in: dptos } }],
      })
    }

    const linhas = await prisma.acessoriasEntrega.findMany({
      where,
      select: {
        status: true, prazo: true, dtAtraso: true, dtEntrega: true, multa: true,
        respPrazo: true, respEntrega: true, dpto: true, nome: true, clienteId: true,
      },
    })

    // ── lista simples para quem só vê as próprias ──
    if (escopo === 'PROPRIO') {
      const acc = zerado()
      for (const l of linhas) this.acumular(acc, l as LinhaCrua, hoje)
      const emAberto = await this.pendentesDetalhadas(where)
      return {
        escopo,
        cartoes: [{
          chave: ctx.userId, titulo: user?.name ?? 'Minhas obrigações',
          subtitulo: user?.area?.name ?? null, userId: ctx.userId, imagem: null, ...acc,
        }] as CartaoIndicadores[],
        pendentes: emAberto,
        semVinculo: false,
        areaNome: user?.area?.name ?? null,
        cobertura,
      }
    }

    // ── agrupamento ──
    const porChave = new Map<string, { titulo: string; sub: string | null; acc: Indicadores }>()
    const agrupaPorPessoa = escopo === 'COLABORADORES'

    for (const l of linhas) {
      // O responsável designado manda: "quem entregou" só existe depois da
      // entrega, e deixaria toda pendência sem dono.
      const chaveBruta = agrupaPorPessoa
        ? (l.respPrazo ?? l.respEntrega ?? 'Sem responsável')
        : (l.dpto ?? 'Sem área')
      const k = norm(chaveBruta) || 'sem'
      const atual = porChave.get(k) ?? {
        titulo: chaveBruta,
        sub: agrupaPorPessoa ? (l.dpto ?? null) : null,
        acc: zerado(),
      }
      this.acumular(atual.acc, l as LinhaCrua, hoje)
      porChave.set(k, atual)
    }

    let cartoes: CartaoIndicadores[] = [...porChave.entries()].map(([k, v]) => ({
      chave: k,
      titulo: v.titulo,
      subtitulo: v.sub,
      userId: agrupaPorPessoa ? idx.usuarioDe.get(k) ?? null : null,
      imagem: null,
      ...v.acc,
    }))

    // Quem saiu do escritório continua como responsável no histórico do
    // Acessórias. O painel é de acompanhamento de equipe, então só mostra quem
    // ainda está aqui — mas informa quantos ficaram de fora, para o número não
    // encolher sem explicação.
    let ocultosInativos = 0
    if (agrupaPorPessoa) {
      const antes = cartoes.length
      cartoes = cartoes.filter((c) => c.userId !== null && idx.usuariosAtivos.has(c.userId))
      ocultosInativos = antes - cartoes.length
    }

    // Quem tem mais pendência em atraso aparece primeiro — é onde se age.
    cartoes.sort((a, b) =>
      b.pendenteAtrasado - a.pendenteAtrasado
      || b.pendenteComMulta - a.pendenteComMulta
      || a.titulo.localeCompare(b.titulo, 'pt-BR'),
    )

    // Foto de perfil, para o cartão de pessoa.
    if (agrupaPorPessoa) {
      const ids = cartoes.map((c) => c.userId).filter((v): v is string => !!v)
      if (ids.length) {
        const us = await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, image: true } })
        const fotos = new Map(us.map((u) => [u.id, u.image]))
        for (const c of cartoes) if (c.userId) c.imagem = fotos.get(c.userId) ?? null
      }
    }

    const total = zerado()
    for (const c of cartoes) {
      total.pendenteNoPrazo += c.pendenteNoPrazo
      total.pendenteAtrasado += c.pendenteAtrasado
      total.pendenteComMulta += c.pendenteComMulta
      total.entregueNoPrazo += c.entregueNoPrazo
      total.entregueComAtraso += c.entregueComAtraso
      total.entregueComMulta += c.entregueComMulta
    }

    return {
      escopo,
      cartoes,
      total,
      pendentes: [],
      semVinculo: false,
      areaNome: user?.area?.name ?? null,
      ocultosInativos,
      cobertura,
    }
  }

  /**
   * As obrigações por trás de um número do cartão.
   *
   * Reusa o MESMO recorte de permissão e a MESMA classificação do painel: se a
   * lista fosse montada por outro caminho, ela poderia discordar do número que
   * o usuário acabou de clicar.
   */
  async detalhe(
    input: { de?: string; ate?: string; competencia?: string; grupo: string; tipo: 'pessoa' | 'area'; medida: keyof Indicadores },
    ctx: { userId: string; isMaster: boolean; isEmpresaMaster: boolean; empresaId?: string },
  ) {
    const empresaId = ctx.empresaId ?? null
    const { escopo, user } = await this.vinculos.escopoDoUsuario(ctx.userId, ctx.isMaster, ctx.isEmpresaMaster)
    const idx = await this.vinculos.indices(empresaId)

    const hoje = new Date()
    hoje.setHours(0, 0, 0, 0)

    const filtros: Prisma.AcessoriasEntregaWhereInput[] = [
      ...(!ctx.isMaster && empresaId ? [{ empresaId }] : []),
      ...(input.competencia ? [{ competencia: this.mesDaCompetencia(input.competencia) }] : []),
      ...(input.competencia ? [] : input.de ? [{ OR: [
        { dtAtraso: { gte: new Date(`${input.de}T00:00:00`) } },
        { dtAtraso: null, prazo: { gte: new Date(`${input.de}T00:00:00`) } },
      ] }] : []),
      ...(input.competencia ? [] : input.ate ? [{ OR: [
        { dtAtraso: { lte: new Date(`${input.ate}T00:00:00`) } },
        { dtAtraso: null, prazo: { lte: new Date(`${input.ate}T00:00:00`) } },
      ] }] : []),
    ]

    // O grupo pedido precisa caber no que este usuário pode ver — senão o
    // detalhe viraria uma porta lateral para o dado de quem ele não enxerga.
    if (escopo === 'PROPRIO') {
      const meus = idx.nomesDoUsuario.get(ctx.userId) ?? []
      filtros.push({ OR: [{ respPrazo: { in: meus } }, { respEntrega: { in: meus } }] })
    } else if (escopo === 'COLABORADORES') {
      const dptos = user?.areaId ? idx.dptosDaArea.get(user.areaId) ?? [] : []
      filtros.push({ dpto: { in: dptos } })
    }

    if (input.tipo === 'pessoa') {
      filtros.push({ OR: [{ respPrazo: input.grupo }, { respEntrega: input.grupo }] })
    } else {
      filtros.push({ dpto: input.grupo })
    }

    const rows = await prisma.acessoriasEntrega.findMany({
      where: { AND: filtros },
      orderBy: [{ dtAtraso: 'asc' }, { prazo: 'asc' }],
      select: {
        id: true, nome: true, competencia: true, prazo: true, dtAtraso: true, dtEntrega: true,
        status: true, multa: true, dpto: true, respPrazo: true, respEntrega: true, clienteId: true,
        cliente: { select: { id: true, code: true, razaoSocial: true } },
      },
    })

    // Fica com as linhas que caem na medida pedida — mesma classificação de
    // `acumular`, aplicada a uma entrega de cada vez.
    const linhas = rows.filter((r) => {
      const acc = zerado()
      this.acumular(acc, r as unknown as LinhaCrua, hoje)
      return acc[input.medida] > 0
    })

    return linhas.map((r) => ({
      id: r.id,
      obrigacao: r.nome,
      competencia: r.competencia,
      prazo: r.prazo,
      vencimento: r.dtAtraso ?? r.prazo,
      dtEntrega: r.dtEntrega,
      status: r.status,
      multa: r.multa,
      dpto: r.dpto,
      responsavel: r.respEntrega ?? r.respPrazo,
      clienteId: r.cliente.id,
      clienteCode: r.cliente.code,
      clienteNome: r.cliente.razaoSocial,
    }))
  }

  /** As obrigações ainda em aberto, para a lista do colaborador. */
  private async pendentesDetalhadas(where: Prisma.AcessoriasEntregaWhereInput) {
    const hoje = new Date()
    hoje.setHours(0, 0, 0, 0)
    const rows = await prisma.acessoriasEntrega.findMany({
      where: {
        AND: [
          where,
          { dtEntrega: null },
          { NOT: { status: { startsWith: 'dispensad', mode: 'insensitive' } } },
          { NOT: { OR: STATUS_ENTREGUE.map((x) => ({ status: { startsWith: x, mode: 'insensitive' as const } })) } },
        ],
      },
      orderBy: [{ dtAtraso: 'asc' }, { prazo: 'asc' }],
      take: 500,
      select: {
        id: true, nome: true, competencia: true, prazo: true, dtAtraso: true, multa: true, dpto: true,
        cliente: { select: { id: true, code: true, razaoSocial: true } },
      },
    })
    return rows.map((r) => {
      const venc = r.dtAtraso ?? r.prazo
      return {
        id: r.id,
        obrigacao: r.nome,
        competencia: r.competencia,
        vencimento: venc,
        atrasada: !!venc && venc < hoje,
        multa: r.multa,
        dpto: r.dpto,
        clienteId: r.cliente.id,
        clienteCode: r.cliente.code,
        clienteNome: r.cliente.razaoSocial,
      }
    })
  }
}
