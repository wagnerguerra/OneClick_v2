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
  prazo: Date | null
  diasParaPrazo: number | null
  status: string | null
  lida: boolean | null
  guiaLida: string | null
  entregue: boolean
  multa: boolean
  dpto: string | null
  respEntrega: string | null
}

/** Status do Acessórias que significam "a guia já está com o cliente". */
const STATUS_ENTREGUE = ['ent. antecipada', 'ent. pztéc', 'ent. pztec', 'ent. atrasada', 'entregue']

function ehEntregue(status: string | null): boolean {
  const s = String(status ?? '').trim().toLowerCase()
  return STATUS_ENTREGUE.some((x) => s.startsWith(x))
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
      status: r.status,
      lida: r.lida,
      guiaLida: r.guiaLida,
      entregue: ehEntregue(r.status),
      multa: r.multa,
      dpto: r.dpto,
      respEntrega: r.respEntrega,
    }))

    // O alvo do painel: guia já entregue, cliente ainda não abriu, prazo ainda
    // não venceu. É o único momento em que dá para agir antes do estrago.
    const naoLidasAVencer = linhas.filter(
      (l) => l.entregue && l.lida === false && l.diasParaPrazo !== null && l.diasParaPrazo >= 0,
    )

    const resumo = {
      total: linhas.length,
      entregues: linhas.filter((l) => l.entregue).length,
      comGuia: linhas.filter((l) => l.lida !== null).length,
      lidas: linhas.filter((l) => l.lida === true).length,
      naoLidas: linhas.filter((l) => l.lida === false).length,
      naoLidasAVencer: naoLidasAVencer.length,
      /** Não lidas com vencimento dentro da janela — o que precisa de telefonema hoje. */
      naoLidasCriticas: naoLidasAVencer.filter((l) => (l.diasParaPrazo ?? 99) <= janela).length,
      atrasadas: linhas.filter((l) => !l.entregue && (l.diasParaPrazo ?? 1) < 0).length,
      comMulta: linhas.filter((l) => l.multa).length,
    }

    const filtradas = (() => {
      switch (filtro.foco) {
        case 'nao_lidas':
          return linhas.filter((l) => l.entregue && l.lida === false)
        case 'a_vencer':
          return naoLidasAVencer.filter((l) => (l.diasParaPrazo ?? 99) <= janela)
        case 'atrasadas':
          return linhas.filter((l) => !l.entregue && (l.diasParaPrazo ?? 1) < 0)
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
        if (l.diasParaPrazo !== null && l.diasParaPrazo >= 0 && l.diasParaPrazo <= janelaDias) {
          atual.naoLidasCriticas++
        }
        if (l.prazo && (!atual.proximoPrazo || l.prazo < atual.proximoPrazo)) atual.proximoPrazo = l.prazo
      }
      if (!l.entregue && (l.diasParaPrazo ?? 1) < 0) atual.atrasadas++
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
    return {
      departamentos: dptos.map((d) => d.dpto).filter(Boolean) as string[],
      responsaveis: resps.map((r) => r.respEntrega).filter(Boolean) as string[],
    }
  }
}
