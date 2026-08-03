import { Injectable } from '@nestjs/common'
import { prisma, Prisma } from '@saas/db'
import { VinculosAcessoriasService } from './vinculos.service'

/**
 * Painel de acompanhamento das entregas do Acessórias.
 *
 * Responde a pergunta que o escritório faz todo mês e hoje só descobre tarde:
 * **quais clientes ainda não abriram a guia, e o vencimento está chegando.**
 *
 * A fonte é `acessorias_entregas`, o espelho bruto sincronizado do Acessórias —
 * não `servico_execucoes`, que só existe para obrigação com mapeamento. O
 * imposto que ninguém mapeou é justamente o que some do radar.
 *
 * Sobre "lida": o Acessórias devolve `EntGuiaLida` como frase, e vazio quando a
 * entrega não tem guia para abrir. Vazio vira `null` (sem guia) e fica FORA da
 * conta de não lidas — senão o painel gritaria por obrigações que nunca geraram
 * documento.
 */

export interface FiltroPainel {
  /** Competência/prazo a partir de (YYYY-MM-DD). */
  de?: string
  ate?: string
  dpto?: string
  responsavel?: string
  clienteId?: string
  /** "YYYY-MM" — recorta pela competência e ignora de/ate. */
  competencia?: string
  /** 'nao_lidas' | 'a_vencer' | 'atrasadas' | 'todas' */
  foco?: 'nao_lidas' | 'a_vencer' | 'atrasadas' | 'todas'
  /** Janela de "a vencer", em dias. Padrão 7. */
  janelaDias?: number
}

export interface LinhaPainel {
  id: string
  /** Código da entrega no Acessórias — usado para montar o atalho para lá. */
  entId: string
  clienteId: string
  clienteCode: number
  clienteNome: string
  documento: string
  obrigacao: string
  competencia: Date | null
  /** Prazo TÉCNICO — o acordado com o cliente (EntDtPrazo). */
  prazo: Date | null
  diasParaPrazo: number | null
  /** Prazo LEGAL — o do órgão (EntDtAtraso). É a data que conta no painel. */
  vencimento: Date | null
  diasParaVencimento: number | null
  /** Quando o responsável de fato entregou — pode ser ANTES do prazo. */
  dtEntrega: Date | null
  /** EntDtFinalizacao — quando o responsável fechou a entrega no Acessórias. */
  dtFinalizacao: Date | null
  /** Momento da primeira abertura da guia pelo cliente (EntLastDH). */
  lidaEm: Date | null
  /** Quando esta linha foi espelhada do Acessórias pela última vez. */
  syncedAt: Date
  status: string | null
  lida: boolean | null
  guiaLida: string | null
  entregue: boolean
  /** Obrigação que o Acessórias marcou como não aplicável no período. */
  dispensada: boolean
  multa: boolean
  dpto: string | null
  /** Quem ENTREGOU. Só existe depois da entrega. */
  respEntrega: string | null
  /** Quem é o responsável designado pelo prazo. Sempre preenchido. */
  respPrazo: string | null
  /** O nome a exibir, com a origem — ver `responsavelDe`. */
  responsavel: string | null
  responsavelEntregou: boolean
}

/**
 * O Acessórias só preenche RespEntrega depois que alguém entrega — é "quem
 * entregou", não "quem deve entregar". Numa lista de atrasadas, portanto, ele
 * é vazio em todas as linhas, e é justamente ali que saber o responsável mais
 * importa. RespPrazo é o designado e vem sempre preenchido: serve de origem
 * enquanto a entrega não acontece.
 */
function responsavelDe(respEntrega: string | null, respPrazo: string | null) {
  if (respEntrega) return { responsavel: respEntrega, responsavelEntregou: true }
  return { responsavel: respPrazo, responsavelEntregou: false }
}

/** Status do Acessórias que significam "a guia já está com o cliente". */
const STATUS_ENTREGUE = ['ent. antecipada', 'ent. pztéc', 'ent. pztec', 'ent. atrasada', 'entregue']

/**
 * Entregue = o status diz que foi, OU existe data de entrega.
 *
 * A data manda porque a entrega antecipada é comum: o responsável fecha a
 * obrigação dias antes do prazo. Olhando só para o vencimento, essas linhas
 * apareciam como "venceu há Nd" mesmo já resolvidas.
 */
function ehEntregue(status: string | null, dtEntrega: Date | null): boolean {
  if (dtEntrega) return true
  const s = String(status ?? '').trim().toLowerCase()
  return STATUS_ENTREGUE.some((x) => s.startsWith(x))
}

/** "Dispensada" = não era devida no período. Não é entrega, mas também não é atraso. */
function ehDispensada(status: string | null): boolean {
  return String(status ?? '').trim().toLowerCase().startsWith('dispensad')
}

/**
 * Os mesmos predicados acima, em forma de filtro do banco.
 *
 * Precisam existir dos dois lados: em JS para marcar a linha que vai para a
 * tela, e em SQL para contar sem trazer tudo para a memória. Derivam da MESMA
 * constante STATUS_ENTREGUE justamente para não divergirem com o tempo.
 */
const W_ENTREGUE: Prisma.AcessoriasEntregaWhereInput = {
  OR: [
    { dtEntrega: { not: null } },
    ...STATUS_ENTREGUE.map((x) => ({ status: { startsWith: x, mode: 'insensitive' as const } })),
  ],
}
const W_DISPENSADA: Prisma.AcessoriasEntregaWhereInput = {
  status: { startsWith: 'dispensad', mode: 'insensitive' },
}

/**
 * Comparação contra o vencimento (dtAtraso, com fallback no prazo). O banco não
 * tem a coluna calculada, então o COALESCE vira um OR entre os dois casos.
 */
function wVencimento(op: 'lt' | 'gte' | 'lte', d: Date): Prisma.AcessoriasEntregaWhereInput {
  return {
    OR: [
      { dtAtraso: { [op]: d } },
      { dtAtraso: null, prazo: { [op]: d } },
    ],
  }
}

/** Junta filtros em AND — vários `OR` no mesmo nível se sobrescreveriam. */
function e(...partes: Array<Prisma.AcessoriasEntregaWhereInput | null>): Prisma.AcessoriasEntregaWhereInput {
  return { AND: partes.filter(Boolean) as Prisma.AcessoriasEntregaWhereInput[] }
}

/** Início e fim do mês de uma competência "YYYY-MM". */
function mesDaCompetencia(v: string) {
  const [ano, mes] = v.split('-').map(Number)
  return {
    gte: new Date(Date.UTC(ano ?? 1970, (mes ?? 1) - 1, 1)),
    lte: new Date(Date.UTC(ano ?? 1970, mes ?? 1, 0)),
  }
}

function inicioDoDia(): Date {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
}

function emDias(base: Date, dias: number): Date {
  const d = new Date(base)
  d.setDate(d.getDate() + dias)
  return d
}

/** Teto de linhas devolvidas para a tela. Os contadores NÃO dependem dele. */
const LIMITE_LINHAS = 2000

function diasAte(d: Date | null): number | null {
  if (!d) return null
  const hoje = new Date()
  hoje.setHours(0, 0, 0, 0)
  const alvo = new Date(d)
  alvo.setHours(0, 0, 0, 0)
  return Math.round((alvo.getTime() - hoje.getTime()) / 86400000)
}

/** Quem consulta — o recorte por cargo é decidido aqui, não na tela. */
export interface CtxPainel {
  userId: string
  isMaster: boolean
  isEmpresaMaster: boolean
  empresaId?: string
}

@Injectable()
export class PainelEntregasService {
  constructor(private readonly vinculos: VinculosAcessoriasService) {}

  /**
   * O recorte de quem olha: gerente, diretoria e master veem a carteira toda;
   * do gestor para baixo, só a própria área.
   */
  private async recorte(ctx: CtxPainel): Promise<Prisma.AcessoriasEntregaWhereInput | null> {
    const { escopo, user } = await this.vinculos.escopoDoUsuario(ctx.userId, ctx.isMaster, ctx.isEmpresaMaster)
    return this.vinculos.restricaoPorArea(escopo, user, ctx.empresaId ?? null)
  }

  /** Filtros da tela — comuns às duas visões. */
  private baseWhere(filtro: FiltroPainel, isMaster: boolean, empresaId?: string): Prisma.AcessoriasEntregaWhereInput {
    return {
      ...(!isMaster && empresaId ? { empresaId } : {}),
      ...(filtro.clienteId ? { clienteId: filtro.clienteId } : {}),
      ...(filtro.dpto ? { dpto: filtro.dpto } : {}),
      // Casa nos dois papéis: quem entregou OU quem responde pelo prazo. Só
      // por respEntrega, filtrar um colaborador escondia tudo que ele ainda
      // não entregou — o oposto do que se quer ao cobrar.
      ...(filtro.responsavel
        ? { OR: [{ respEntrega: filtro.responsavel }, { respPrazo: filtro.responsavel }] }
        : {}),
      // Competência manda sobre o período: quem escolheu o mês de referência
      // quer o fechamento inteiro, independentemente de quando vence.
      ...(filtro.competencia ? { competencia: mesDaCompetencia(filtro.competencia) } : {}),
      // Recorte de período pelo VENCIMENTO, e não pelo prazo interno — é a data
      // que o resto do painel usa. Vai em AND porque cada limite já é um OR
      // (dtAtraso, com fallback no prazo).
      ...(!filtro.competencia && (filtro.de || filtro.ate)
        ? {
            AND: [
              ...(filtro.de ? [wVencimento('gte', new Date(`${filtro.de}T00:00:00`))] : []),
              ...(filtro.ate ? [wVencimento('lte', new Date(`${filtro.ate}T00:00:00`))] : []),
            ],
          }
        : {}),
    }
  }

  async listar(filtro: FiltroPainel, ctx: CtxPainel) {
    const { isMaster } = ctx
    const empresaId = ctx.empresaId
    const janela = filtro.janelaDias ?? 7
    const recorte = await this.recorte(ctx)
    const where = e(this.baseWhere(filtro, isMaster, empresaId), recorte)

    const hoje = inicioDoDia()
    const limiteJanela = emDias(hoje, janela)

    // Guia entregue que o cliente ainda não abriu. É o coração do painel, e o
    // rótulo do cartão diz exatamente isso — por isso exige `entregue`.
    const wNaoLidas = e(where, W_ENTREGUE, { lida: false })
    const wAVencer = e(wNaoLidas, wVencimento('gte', hoje))
    const wCriticas = e(wAVencer, wVencimento('lte', limiteJanela))
    const wAtrasadas = e(where, { NOT: W_ENTREGUE }, { NOT: W_DISPENSADA }, wVencimento('lt', hoje))

    // Contagem no banco, e não sobre a fatia carregada: com o teto aplicado
    // antes, o resumo descrevia as N linhas mais antigas em vez da carteira.
    // Era isso que zerava "não abertas e vencendo" ao abrir a tela — as linhas
    // que estavam por vencer ficavam fora do corte.
    const [total, entregues, comGuia, lidas, naoLidas, naoLidasAVencer, naoLidasCriticas, atrasadas, comMulta] =
      await Promise.all([
        prisma.acessoriasEntrega.count({ where }),
        prisma.acessoriasEntrega.count({ where: e(where, W_ENTREGUE) }),
        prisma.acessoriasEntrega.count({ where: e(where, { lida: { not: null } }) }),
        prisma.acessoriasEntrega.count({ where: e(where, { lida: true }) }),
        prisma.acessoriasEntrega.count({ where: wNaoLidas }),
        prisma.acessoriasEntrega.count({ where: wAVencer }),
        prisma.acessoriasEntrega.count({ where: wCriticas }),
        prisma.acessoriasEntrega.count({ where: wAtrasadas }),
        prisma.acessoriasEntrega.count({ where: e(where, { multa: true }) }),
      ])

    const resumo = {
      total, entregues, comGuia, lidas, naoLidas, naoLidasAVencer,
      /** Não lidas com vencimento dentro da janela — o que precisa de telefonema hoje. */
      naoLidasCriticas,
      /** Nem entregue nem dispensada, com o vencimento já passado. */
      atrasadas,
      comMulta,
    }

    // O foco entra na consulta, não depois dela: filtrar em memória sobre uma
    // fatia truncada devolvia lista vazia justamente no foco mais usado.
    const wFoco =
      filtro.foco === 'nao_lidas' ? wNaoLidas
      : filtro.foco === 'a_vencer' ? wCriticas
      : filtro.foco === 'atrasadas' ? wAtrasadas
      : where

    const rows = await prisma.acessoriasEntrega.findMany({
      where: wFoco,
      orderBy: [{ prazo: 'asc' }, { nome: 'asc' }],
      take: LIMITE_LINHAS,
      include: { cliente: { select: { id: true, code: true, razaoSocial: true, documento: true } } },
    })

    const filtradas: LinhaPainel[] = rows.map((r) => ({
      id: r.id,
      entId: r.entId,
      clienteId: r.clienteId,
      clienteCode: r.cliente.code,
      clienteNome: r.cliente.razaoSocial,
      documento: r.cliente.documento,
      obrigacao: r.nome,
      competencia: r.competencia,
      prazo: r.prazo,
      diasParaPrazo: diasAte(r.prazo),
      // O Acessórias trabalha com DOIS prazos: EntDtPrazo é o TÉCNICO, acordado
      // com o cliente, e EntDtAtraso é o LEGAL, junto ao órgão. Conferido contra
      // prazos conhecidos: FGTS, DAS e DCTFWeb caem no dia 20, e a folha do 5º
      // dia útil cai no 5º dia útil — sempre em EntDtAtraso. A régua do painel é
      // o legal, com fallback no técnico quando o legal não vem.
      vencimento: r.dtAtraso ?? r.prazo,
      diasParaVencimento: diasAte(r.dtAtraso ?? r.prazo),
      dtEntrega: r.dtEntrega,
      dtFinalizacao: r.dtFinalizacao,
      lidaEm: r.lastDH,
      syncedAt: r.syncedAt,
      status: r.status,
      lida: r.lida,
      guiaLida: r.guiaLida,
      entregue: ehEntregue(r.status, r.dtEntrega),
      dispensada: ehDispensada(r.status),
      multa: r.multa,
      dpto: r.dpto,
      respEntrega: r.respEntrega,
      respPrazo: r.respPrazo,
      ...responsavelDe(r.respEntrega, r.respPrazo),
    }))

    return {
      linhas: filtradas,
      resumo,
      janelaDias: janela,
      // A tela avisa quando bateu no teto. Truncar em silêncio faz uma lista
      // parcial parecer completa.
      truncado: filtradas.length >= LIMITE_LINHAS,
      limiteLinhas: LIMITE_LINHAS,
      // Template do atalho para o Acessórias, configurado em /configuracoes.
      // Vazio = a tela simplesmente não mostra o botão, em vez de abrir um link
      // quebrado.
      urlEntregaTemplate: process.env.ACESSORIAS_APP_ENTREGA_URL?.trim() || null,
    }
  }

  /**
   * Agrupamento por cliente — a visão de quem vai ligar para cobrar.
   *
   * Contava em cima do retorno de `listar`, que é limitado ao que cabe na tela:
   * cliente fora do corte simplesmente não existia aqui. Agora agrega no banco.
   */
  async porCliente(filtro: FiltroPainel, ctx: CtxPainel) {
    const { isMaster } = ctx
    const empresaId = ctx.empresaId
    const janelaDias = filtro.janelaDias ?? 7
    const recorte = await this.recorte(ctx)
    const where = e(this.baseWhere(filtro, isMaster, empresaId), recorte)
    const hoje = inicioDoDia()

    const wNaoLidas = e(where, W_ENTREGUE, { lida: false })
    const wAtrasadas = e(where, { NOT: W_ENTREGUE }, { NOT: W_DISPENSADA }, wVencimento('lt', hoje))

    const [naoLidasRows, atrasadasPorCliente, totalPorCliente] = await Promise.all([
      // As não lidas vêm como linhas porque a tela mostra os nomes das
      // obrigações e o próximo vencimento — não só a contagem.
      prisma.acessoriasEntrega.findMany({
        where: wNaoLidas,
        select: {
          clienteId: true, nome: true, prazo: true, dtAtraso: true,
          cliente: { select: { code: true, razaoSocial: true, documento: true } },
        },
      }),
      prisma.acessoriasEntrega.groupBy({ by: ['clienteId'], where: wAtrasadas, _count: { _all: true } }),
      prisma.acessoriasEntrega.groupBy({ by: ['clienteId'], where, _count: { _all: true } }),
    ])

    type Agregado = {
      clienteId: string; clienteCode: number; clienteNome: string; documento: string
      total: number; naoLidas: number; naoLidasCriticas: number; atrasadas: number
      proximoPrazo: Date | null; obrigacoesNaoLidas: string[]
    }
    const mapa = new Map<string, Agregado>()
    const novo = (id: string): Agregado => ({
      clienteId: id, clienteCode: 0, clienteNome: '', documento: '',
      total: 0, naoLidas: 0, naoLidasCriticas: 0, atrasadas: 0,
      proximoPrazo: null, obrigacoesNaoLidas: [],
    })

    for (const r of naoLidasRows) {
      const a = mapa.get(r.clienteId) ?? novo(r.clienteId)
      a.clienteCode = r.cliente.code
      a.clienteNome = r.cliente.razaoSocial
      a.documento = r.cliente.documento
      a.naoLidas++
      a.obrigacoesNaoLidas.push(r.nome)
      const venc = r.dtAtraso ?? r.prazo
      const dias = diasAte(venc)
      if (dias !== null && dias >= 0 && dias <= janelaDias) a.naoLidasCriticas++
      if (venc && (!a.proximoPrazo || venc < a.proximoPrazo)) a.proximoPrazo = venc
      mapa.set(r.clienteId, a)
    }

    for (const g of atrasadasPorCliente) {
      const a = mapa.get(g.clienteId) ?? novo(g.clienteId)
      a.atrasadas = g._count._all
      mapa.set(g.clienteId, a)
    }
    for (const g of totalPorCliente) {
      const a = mapa.get(g.clienteId)
      if (a) a.total = g._count._all
    }

    // Quem entrou só pela contagem de atrasadas ainda não tem nome preenchido.
    const semNome = [...mapa.values()].filter((a) => !a.clienteNome).map((a) => a.clienteId)
    if (semNome.length) {
      const cs = await prisma.cliente.findMany({
        where: { id: { in: semNome } },
        select: { id: true, code: true, razaoSocial: true, documento: true },
      })
      for (const c of cs) {
        const a = mapa.get(c.id)
        if (a) { a.clienteCode = c.code; a.clienteNome = c.razaoSocial; a.documento = c.documento }
      }
    }

    // Só interessa quem tem algo pendente; ordena pelo que aperta primeiro.
    const clientes = [...mapa.values()]
      .filter((c) => c.naoLidas > 0 || c.atrasadas > 0)
      .sort((a, b) =>
        b.naoLidasCriticas - a.naoLidasCriticas
        || b.atrasadas - a.atrasadas
        || b.naoLidas - a.naoLidas,
      )

    return { clientes, janelaDias }
  }

  /**
   * Valores distintos para preencher os filtros da tela.
   *
   * Cada campo é montado ignorando a si mesmo e respeitando os demais: escolher
   * a área PESSOAL deixa em "Responsável" só quem tem entrega em PESSOAL. Sem
   * isso, a lista oferecia combinações que só devolvem tela vazia.
   */
  async opcoes(
    ctx: CtxPainel,
    filtro: { dpto?: string; responsavel?: string; clienteId?: string } = {},
  ) {
    const { isMaster } = ctx
    const empresaId = ctx.empresaId
    // As opções seguem o mesmo recorte da lista: oferecer área ou responsável
    // que o usuário não pode ver só produziria tela vazia — e vazaria os nomes.
    const recorte = await this.recorte(ctx)
    const escopo: Prisma.AcessoriasEntregaWhereInput = e(
      !isMaster && empresaId ? { empresaId } : {},
      recorte,
    )
    const porDpto = filtro.dpto ? { dpto: filtro.dpto } : {}
    const porCliente = filtro.clienteId ? { clienteId: filtro.clienteId } : {}
    const porResp = filtro.responsavel
      ? { OR: [{ respEntrega: filtro.responsavel }, { respPrazo: filtro.responsavel }] }
      : {}

    const [dptos, resps, respsPrazo, comEntrega] = await Promise.all([
      // Departamento não se filtra por departamento — sobraria só o escolhido.
      prisma.acessoriasEntrega.findMany({
        where: e(escopo, porCliente, porResp, { dpto: { not: null } }),
        select: { dpto: true }, distinct: ['dpto'], orderBy: { dpto: 'asc' }, take: 50,
      }),
      prisma.acessoriasEntrega.findMany({
        where: e(escopo, porDpto, porCliente, { respEntrega: { not: null } }),
        select: { respEntrega: true }, distinct: ['respEntrega'], orderBy: { respEntrega: 'asc' }, take: 200,
      }),
      prisma.acessoriasEntrega.findMany({
        where: e(escopo, porDpto, porCliente, { respPrazo: { not: null } }),
        select: { respPrazo: true }, distinct: ['respPrazo'], orderBy: { respPrazo: 'asc' }, take: 200,
      }),
      // Só os clientes que têm entrega no recorte atual — filtrar por quem não
      // aparece no painel não serviria para nada.
      prisma.acessoriasEntrega.findMany({
        where: e(escopo, porDpto, porResp),
        select: { clienteId: true }, distinct: ['clienteId'], take: 3000,
      }),
    ])

    const clientes = await prisma.cliente.findMany({
      where: { id: { in: comEntrega.map((c) => c.clienteId) } },
      select: { id: true, code: true, razaoSocial: true, documento: true },
      orderBy: { razaoSocial: 'asc' },
    })

    return {
      departamentos: dptos.map((x) => x.dpto).filter(Boolean) as string[],
      // União dos dois papéis: quem só tem obrigação em aberto não aparecia na
      // lista de responsáveis, e era impossível filtrar por ele.
      responsaveis: [...new Set([
        ...resps.map((r) => r.respEntrega),
        ...respsPrazo.map((r) => r.respPrazo),
      ].filter(Boolean) as string[])].sort((x, y) => x.localeCompare(y, 'pt-BR')),
      clientes,
    }
  }
}
