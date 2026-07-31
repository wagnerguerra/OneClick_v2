import { Injectable } from '@nestjs/common'
import { prisma, Prisma } from '@saas/db'

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
  /** Prazo INTERNO do escritório para entregar (EntDtPrazo). */
  prazo: Date | null
  diasParaPrazo: number | null
  /** Vencimento da guia para o cliente (EntDtAtraso) — a data que conta. */
  vencimento: Date | null
  diasParaVencimento: number | null
  /** Quando o responsável de fato entregou — pode ser ANTES do prazo. */
  dtEntrega: Date | null
  /** Momento da primeira abertura da guia pelo cliente (EntLastDH). */
  lidaEm: Date | null
  status: string | null
  lida: boolean | null
  guiaLida: string | null
  entregue: boolean
  /** Obrigação que o Acessórias marcou como não aplicável no período. */
  dispensada: boolean
  multa: boolean
  dpto: string | null
  respEntrega: string | null
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

function diasAte(d: Date | null): number | null {
  if (!d) return null
  const hoje = new Date()
  hoje.setHours(0, 0, 0, 0)
  const alvo = new Date(d)
  alvo.setHours(0, 0, 0, 0)
  return Math.round((alvo.getTime() - hoje.getTime()) / 86400000)
}

@Injectable()
export class PainelEntregasService {
  async listar(filtro: FiltroPainel, isMaster: boolean, empresaId?: string) {
    const janela = filtro.janelaDias ?? 7

    const where: Prisma.AcessoriasEntregaWhereInput = {
      ...(!isMaster && empresaId ? { empresaId } : {}),
      ...(filtro.clienteId ? { clienteId: filtro.clienteId } : {}),
      ...(filtro.dpto ? { dpto: filtro.dpto } : {}),
      ...(filtro.responsavel ? { respEntrega: filtro.responsavel } : {}),
      ...(filtro.de || filtro.ate
        ? {
            prazo: {
              ...(filtro.de ? { gte: new Date(`${filtro.de}T00:00:00`) } : {}),
              ...(filtro.ate ? { lte: new Date(`${filtro.ate}T00:00:00`) } : {}),
            },
          }
        : {}),
    }

    const rows = await prisma.acessoriasEntrega.findMany({
      where,
      orderBy: [{ prazo: 'asc' }, { nome: 'asc' }],
      take: 3000,
      include: { cliente: { select: { id: true, code: true, razaoSocial: true, documento: true } } },
    })

    const linhas: LinhaPainel[] = rows.map((r) => ({
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
      // O Acessórias guarda duas datas: EntDtPrazo é o prazo interno do
      // escritório e EntDtAtraso é o vencimento da guia para o cliente (o log
      // deles diz "Guia de pagto p/ o dia ..."). O painel pergunta quem ainda
      // não abriu ANTES DE VENCER, então a régua é o vencimento. Fallback no
      // prazo para a obrigação que não tenha vencimento próprio.
      vencimento: r.dtAtraso ?? r.prazo,
      diasParaVencimento: diasAte(r.dtAtraso ?? r.prazo),
      dtEntrega: r.dtEntrega,
      lidaEm: r.lastDH,
      status: r.status,
      lida: r.lida,
      guiaLida: r.guiaLida,
      entregue: ehEntregue(r.status, r.dtEntrega),
      dispensada: ehDispensada(r.status),
      multa: r.multa,
      dpto: r.dpto,
      respEntrega: r.respEntrega,
    }))

    // O alvo do painel: guia já entregue, cliente ainda não abriu, prazo ainda
    // não venceu. É o único momento em que dá para agir antes do estrago.
    const naoLidasAVencer = linhas.filter(
      (l) => l.entregue && l.lida === false && l.diasParaVencimento !== null && l.diasParaVencimento >= 0,
    )

    const resumo = {
      total: linhas.length,
      entregues: linhas.filter((l) => l.entregue).length,
      comGuia: linhas.filter((l) => l.lida !== null).length,
      lidas: linhas.filter((l) => l.lida === true).length,
      naoLidas: linhas.filter((l) => l.lida === false).length,
      naoLidasAVencer: naoLidasAVencer.length,
      /** Não lidas com vencimento dentro da janela — o que precisa de telefonema hoje. */
      naoLidasCriticas: naoLidasAVencer.filter((l) => (l.diasParaVencimento ?? 99) <= janela).length,
      // Nem entregue nem dispensada, com prazo vencido. Dispensada ficava aqui
      // dentro e inflava o número com obrigação que sequer era devida.
      atrasadas: linhas.filter((l) => !l.entregue && !l.dispensada && (l.diasParaVencimento ?? 1) < 0).length,
      comMulta: linhas.filter((l) => l.multa).length,
    }

    const filtradas = (() => {
      switch (filtro.foco) {
        case 'nao_lidas':
          return linhas.filter((l) => l.entregue && l.lida === false)
        case 'a_vencer':
          return naoLidasAVencer.filter((l) => (l.diasParaVencimento ?? 99) <= janela)
        case 'atrasadas':
          return linhas.filter((l) => !l.entregue && !l.dispensada && (l.diasParaVencimento ?? 1) < 0)
        default:
          return linhas
      }
    })()

    return {
      linhas: filtradas,
      resumo,
      janelaDias: janela,
      // Template do atalho para o Acessórias, configurado em /configuracoes.
      // Vazio = a tela simplesmente não mostra o botão, em vez de abrir um link
      // quebrado.
      urlEntregaTemplate: process.env.ACESSORIAS_APP_ENTREGA_URL?.trim() || null,
    }
  }

  /** Agrupamento por cliente — a visão de quem vai ligar para cobrar. */
  async porCliente(filtro: FiltroPainel, isMaster: boolean, empresaId?: string) {
    const { linhas, janelaDias } = await this.listar(
      { ...filtro, foco: 'todas' }, isMaster, empresaId,
    )

    const mapa = new Map<string, {
      clienteId: string; clienteCode: number; clienteNome: string; documento: string
      total: number; naoLidas: number; naoLidasCriticas: number; atrasadas: number
      proximoPrazo: Date | null; obrigacoesNaoLidas: string[]
    }>()

    for (const l of linhas) {
      const atual = mapa.get(l.clienteId) ?? {
        clienteId: l.clienteId, clienteCode: l.clienteCode, clienteNome: l.clienteNome,
        documento: l.documento, total: 0, naoLidas: 0, naoLidasCriticas: 0, atrasadas: 0,
        proximoPrazo: null as Date | null, obrigacoesNaoLidas: [] as string[],
      }
      atual.total++
      const naoLida = l.entregue && l.lida === false
      if (naoLida) {
        atual.naoLidas++
        atual.obrigacoesNaoLidas.push(l.obrigacao)
        if (l.diasParaVencimento !== null && l.diasParaVencimento >= 0 && l.diasParaVencimento <= janelaDias) {
          atual.naoLidasCriticas++
        }
        if (l.vencimento && (!atual.proximoPrazo || l.vencimento < atual.proximoPrazo)) atual.proximoPrazo = l.vencimento
      }
      if (!l.entregue && !l.dispensada && (l.diasParaVencimento ?? 1) < 0) atual.atrasadas++
      mapa.set(l.clienteId, atual)
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

  /** Valores distintos para preencher os filtros da tela. */
  async opcoes(isMaster: boolean, empresaId?: string) {
    const where = !isMaster && empresaId ? { empresaId } : {}
    const [dptos, resps] = await Promise.all([
      prisma.acessoriasEntrega.findMany({
        where: { ...where, dpto: { not: null } },
        select: { dpto: true }, distinct: ['dpto'], orderBy: { dpto: 'asc' }, take: 50,
      }),
      prisma.acessoriasEntrega.findMany({
        where: { ...where, respEntrega: { not: null } },
        select: { respEntrega: true }, distinct: ['respEntrega'], orderBy: { respEntrega: 'asc' }, take: 100,
      }),
    ])
    // Só os clientes que têm entrega espelhada — filtrar por quem não aparece
    // no painel não serviria para nada.
    const comEntrega = await prisma.acessoriasEntrega.findMany({
      where, select: { clienteId: true }, distinct: ['clienteId'], take: 2000,
    })
    const clientes = await prisma.cliente.findMany({
      where: { id: { in: comEntrega.map((c) => c.clienteId) } },
      select: { id: true, code: true, razaoSocial: true, documento: true },
      orderBy: { razaoSocial: 'asc' },
    })

    return {
      departamentos: dptos.map((d) => d.dpto).filter(Boolean) as string[],
      responsaveis: resps.map((r) => r.respEntrega).filter(Boolean) as string[],
      clientes,
    }
  }
}
