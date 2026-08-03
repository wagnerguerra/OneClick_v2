import { Injectable } from '@nestjs/common'
import { prisma } from '@saas/db'

/**
 * Liga o que vem do Acessórias ao nosso cadastro: colaborador → usuário e
 * departamento → área.
 *
 * Por que não basta comparar o nome: as bases escrevem as pessoas de formas
 * diferentes — "Millian de Souza" lá, "Millian Souza" aqui; "Gabriel Melo
 * Scardini" lá, "Gabriel Scardini" aqui. Comparação exata acerta pouco.
 *
 * Então o par é resolvido por PROXIMIDADE e **gravado**. Gravar é o ponto: uma
 * correção manual sobrevive à próxima sincronização, em vez de o palpite ser
 * refeito a cada consulta. O par gravado guarda o ID do nosso lado e, quando a
 * sincronização traz, o ID do lado do Acessórias — o nome fica só para exibir.
 */

const STOPWORDS = new Set(['de', 'da', 'do', 'das', 'dos', 'e'])

/** Sem acento, minúsculo, sem pontuação. */
function norm(v: string): string {
  return String(v ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim()
}

function tokens(v: string): string[] {
  return norm(v).split(' ').filter((t) => t && !STOPWORDS.has(t))
}

/**
 * Quão perto dois nomes estão. Devolve 0 quando não dá para afirmar nada.
 *
 * O primeiro nome precisa bater — é o que impede "Arthur Vieira" de casar com
 * "Arthur" nenhum. Dos demais, conta quantos coincidem: é o que separa
 * "Joao Victor de Souza" → "João Victor Carvalho" (dois tokens em comum) de
 * "João Vitor Castiglioni" (um só, porque "vitor" ≠ "victor").
 */
export function proximidade(a: string, b: string): number {
  const ta = tokens(a)
  const tb = tokens(b)
  if (ta.length === 0 || tb.length === 0) return 0
  if (ta[0] !== tb[0]) return 0
  const resto = new Set(tb.slice(1))
  let comuns = 1
  for (const t of ta.slice(1)) if (resto.has(t)) comuns++
  return comuns
}

/** O melhor candidato, ou null se houver empate ou nenhum. */
function melhorPar<T>(alvo: string, candidatos: T[], nomeDe: (c: T) => string): T | null {
  let melhor: T | null = null
  let melhorNota = 0
  let empatado = false
  for (const c of candidatos) {
    const nota = proximidade(alvo, nomeDe(c))
    if (nota === 0) continue
    if (nota > melhorNota) { melhor = c; melhorNota = nota; empatado = false }
    else if (nota === melhorNota) empatado = true
  }
  // Empate fica sem vínculo de propósito: chutar entre dois homônimos
  // atribuiria o trabalho de um colaborador a outro sem ninguém perceber.
  return empatado ? null : melhor
}

export interface ResultadoVinculos {
  colaboradores: { total: number; casados: number; semPar: number }
  departamentos: { total: number; casados: number; semPar: number }
}

@Injectable()
export class VinculosAcessoriasService {
  /**
   * Percorre os nomes que aparecem no espelho e grava o par de cada um.
   * Nunca mexe em linha marcada como MANUAL.
   */
  async sincronizar(empresaId: string | null): Promise<ResultadoVinculos> {
    const escopo = empresaId ? { empresaId } : {}

    const [linhas, usuarios, areas, jaGravados, dptosGravados] = await Promise.all([
      prisma.acessoriasEntrega.findMany({
        where: escopo,
        select: { respPrazo: true, respPrazoId: true, respEntrega: true, respEntregaId: true, dpto: true, dptoId: true },
        distinct: ['respPrazo', 'respEntrega', 'dpto'],
      }),
      // Inclui inativos de propósito: quem saiu continua aparecendo como
      // responsável no histórico do Acessórias, e só dá para ocultar a pessoa
      // se soubermos QUEM ela é. Filtrar aqui deixaria o ex-colaborador como
      // "sem vínculo", indistinguível de um nome que não casou.
      prisma.user.findMany({ select: { id: true, name: true, areaId: true, isActive: true } }),
      prisma.area.findMany({ select: { id: true, name: true } }),
      prisma.acessoriasColaborador.findMany({ where: escopo, select: { id: true, nome: true, origem: true } }),
      prisma.acessoriasDepartamento.findMany({ where: escopo, select: { id: true, nome: true, origem: true } }),
    ])

    // ── pessoas ──
    const nomesPessoas = new Map<string, string | null>() // nome → acessoriasId
    for (const l of linhas) {
      if (l.respPrazo) nomesPessoas.set(l.respPrazo, l.respPrazoId ?? nomesPessoas.get(l.respPrazo) ?? null)
      if (l.respEntrega) nomesPessoas.set(l.respEntrega, l.respEntregaId ?? nomesPessoas.get(l.respEntrega) ?? null)
    }
    const manualPessoas = new Set(jaGravados.filter((g) => g.origem === 'MANUAL').map((g) => norm(g.nome)))

    let casadosP = 0
    for (const [nome, acessoriasId] of nomesPessoas) {
      if (manualPessoas.has(norm(nome))) { casadosP++; continue }
      const u = melhorPar(nome, usuarios, (x) => x.name)
      if (u) casadosP++
      const existente = jaGravados.find((g) => norm(g.nome) === norm(nome))
      if (existente) {
        await prisma.acessoriasColaborador.update({
          where: { id: existente.id },
          data: { userId: u?.id ?? null, acessoriasId: acessoriasId ?? undefined, origem: 'AUTO' },
        })
      } else {
        await prisma.acessoriasColaborador.create({
          data: { empresaId, nome, acessoriasId, userId: u?.id ?? null, origem: 'AUTO' },
        })
      }
    }

    // ── departamentos ──
    const nomesDptos = new Map<string, string | null>()
    for (const l of linhas) if (l.dpto) nomesDptos.set(l.dpto, l.dptoId ?? nomesDptos.get(l.dpto) ?? null)
    const manualDptos = new Set(dptosGravados.filter((g) => g.origem === 'MANUAL').map((g) => norm(g.nome)))

    // Quando o nome do departamento não se parece com nenhuma área nossa, a
    // resposta está em QUEM trabalha nele: "PESSOAL" não lembra "Trabalhista",
    // mas todo mundo que entrega ali é da área Trabalhista. Vale a área da
    // maioria — é dedução a partir do dado real, não uma tradução chumbada no
    // código que envelhece.
    const areaDoUsuario = new Map(usuarios.map((u) => [u.id, u.areaId]))
    const votosPorDpto = new Map<string, Map<string, number>>()
    for (const l of linhas) {
      if (!l.dpto) continue
      const responsavel = l.respPrazo ?? l.respEntrega
      if (!responsavel) continue
      const u = melhorPar(responsavel, usuarios, (x) => x.name)
      const areaId = u?.isActive ? areaDoUsuario.get(u.id) : null
      if (!areaId) continue
      const urna = votosPorDpto.get(norm(l.dpto)) ?? new Map<string, number>()
      urna.set(areaId, (urna.get(areaId) ?? 0) + 1)
      votosPorDpto.set(norm(l.dpto), urna)
    }
    const areaMajoritaria = (dpto: string): string | null => {
      const urna = votosPorDpto.get(norm(dpto))
      if (!urna) return null
      let vencedora: string | null = null
      let max = 0
      for (const [areaId, votos] of urna) if (votos > max) { vencedora = areaId; max = votos }
      return vencedora
    }

    let casadosD = 0
    for (const [nome, acessoriasId] of nomesDptos) {
      if (manualDptos.has(norm(nome))) { casadosD++; continue }
      const porNome = melhorPar(nome, areas, (x) => x.name)
      const a = porNome ?? (() => {
        const id = areaMajoritaria(nome)
        return id ? { id } : null
      })()
      if (a) casadosD++
      const existente = dptosGravados.find((g) => norm(g.nome) === norm(nome))
      if (existente) {
        await prisma.acessoriasDepartamento.update({
          where: { id: existente.id },
          data: { areaId: a?.id ?? null, acessoriasId: acessoriasId ?? undefined, origem: 'AUTO' },
        })
      } else {
        await prisma.acessoriasDepartamento.create({
          data: { empresaId, nome, acessoriasId, areaId: a?.id ?? null, origem: 'AUTO' },
        })
      }
    }

    return {
      colaboradores: { total: nomesPessoas.size, casados: casadosP, semPar: nomesPessoas.size - casadosP },
      departamentos: { total: nomesDptos.size, casados: casadosD, semPar: nomesDptos.size - casadosD },
    }
  }

  /** Índices prontos para consulta — chave em minúsculo e sem acento. */
  async indices(empresaId: string | null) {
    const escopo = empresaId ? { empresaId } : {}
    const [colabs, dptos] = await Promise.all([
      prisma.acessoriasColaborador.findMany({
        where: escopo,
        select: { nome: true, userId: true, user: { select: { isActive: true } } },
      }),
      prisma.acessoriasDepartamento.findMany({ where: escopo, select: { nome: true, areaId: true } }),
    ])
    return {
      /** nome no Acessórias → id do nosso usuário */
      usuarioDe: new Map(colabs.filter((c) => c.userId).map((c) => [norm(c.nome), c.userId as string])),
      /** Só quem segue ativo no OneClick — o painel não mostra ex-colaborador. */
      usuariosAtivos: new Set(colabs.filter((c) => c.userId && c.user?.isActive).map((c) => c.userId as string)),
      /** id do nosso usuário → nomes usados no Acessórias (pode ser mais de um) */
      nomesDoUsuario: colabs.reduce((m, c) => {
        if (c.userId) m.set(c.userId, [...(m.get(c.userId) ?? []), c.nome])
        return m
      }, new Map<string, string[]>()),
      /** departamento no Acessórias → id da nossa área */
      areaDe: new Map(dptos.filter((d) => d.areaId).map((d) => [norm(d.nome), d.areaId as string])),
      /** id da nossa área → departamentos do Acessórias */
      dptosDaArea: dptos.reduce((m, d) => {
        if (d.areaId) m.set(d.areaId, [...(m.get(d.areaId) ?? []), d.nome])
        return m
      }, new Map<string, string[]>()),
    }
  }

  /** Listagem para a tela de conferência/correção. */
  async listar(empresaId: string | null) {
    const escopo = empresaId ? { empresaId } : {}
    const [colaboradores, departamentos] = await Promise.all([
      prisma.acessoriasColaborador.findMany({
        where: escopo, orderBy: { nome: 'asc' },
        select: {
          id: true, nome: true, acessoriasId: true, origem: true,
          user: { select: { id: true, name: true, area: { select: { name: true } } } },
        },
      }),
      prisma.acessoriasDepartamento.findMany({
        where: escopo, orderBy: { nome: 'asc' },
        select: { id: true, nome: true, acessoriasId: true, origem: true, area: { select: { id: true, name: true } } },
      }),
    ])
    return { colaboradores, departamentos }
  }

  /** Correção manual — a partir daqui a rotina automática não mexe mais nesta linha. */
  async vincularColaborador(id: string, userId: string | null) {
    return prisma.acessoriasColaborador.update({
      where: { id }, data: { userId, origem: 'MANUAL' },
      select: { id: true, nome: true, userId: true, origem: true },
    })
  }

  async vincularDepartamento(id: string, areaId: string | null) {
    return prisma.acessoriasDepartamento.update({
      where: { id }, data: { areaId, origem: 'MANUAL' },
      select: { id: true, nome: true, areaId: true, origem: true },
    })
  }
}
