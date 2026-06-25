import { Injectable } from '@nestjs/common'
import { prisma } from '@saas/db'

/**
 * Sincroniza responsáveis de ClienteAreaContratada a partir das deliveries
 * sincronizadas do Acessórias (ServicoExecucao.acessoriasRespPrazo + Dpto).
 *
 * Estratégia (camada 1 - agregado por área):
 *   1. Pra cada cliente com idAcessorias preenchido
 *   2. Lê ServicoExecucao do último ano com acessoriasRespPrazo e acessoriasDpto preenchidos
 *   3. Agrupa por departamento Acessórias → mapeia pra Area do OneClick (Fiscal/Trabalhista/Contábil)
 *   4. Pra cada (cliente, area), pega o responsável dominante (moda)
 *   5. Match com User do OneClick por nome canônico (acento/case insensitive)
 *   6. Atualiza ClienteAreaContratada.responsavelId; cria pendência se não match
 */

/** Mapeia DptoNome do Acessórias → nome da Area no OneClick. */
const DEPTO_PARA_AREA: Record<string, string> = {
  'fiscal':       'Fiscal',
  'trabalhista':  'Trabalhista',
  'pessoal':      'Trabalhista', // Pessoal/RH = Trabalhista no OneClick
  'rh':           'Trabalhista',
  'contábil':     'Contábil',
  'contabil':     'Contábil',
  'societário':   'Legalização',
  'societario':   'Legalização',
  'legalização':  'Legalização',
  'legalizacao':  'Legalização',
}

function norm(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
}

function mapDeptoParaArea(dpto: string | null): string | null {
  if (!dpto) return null
  return DEPTO_PARA_AREA[norm(dpto)] ?? null
}

@Injectable()
export class SincronizarResponsaveisService {
  /**
   * Roda em lote pra todos os clientes com idAcessorias. Idempotente — sobrescreve
   * responsavelId quando encontra um dominante diferente. NÃO toca em
   * ClienteAreaContratada inexistente (precisa estar criado em /clientes).
   */
  async executar(opts?: { mesesHistorico?: number; empresaId?: string }) {
    const meses = opts?.mesesHistorico ?? 12
    const inicioJanela = new Date()
    inicioJanela.setMonth(inicioJanela.getMonth() - meses)

    // Carrega Users ativos (da empresa do tenant, quando informado) pra match por nome canônico
    const users = await prisma.user.findMany({
      where: { isActive: true, ...(opts?.empresaId ? { empresaId: opts.empresaId } : {}) },
      select: { id: true, name: true, email: true },
    })
    const userMap = new Map<string, { id: string; name: string }>()
    for (const u of users) {
      if (u.name) userMap.set(norm(u.name), { id: u.id, name: u.name })
    }

    // Carrega Areas pra resolver areaId
    const areas = await prisma.area.findMany({ select: { id: true, name: true } })
    const areaMap = new Map<string, string>()
    for (const a of areas) areaMap.set(norm(a.name), a.id)

    // Carrega clientes com idAcessorias
    const clientes = await prisma.cliente.findMany({
      where: {
        idAcessorias: { not: null },
        ...(opts?.empresaId ? { empresaId: opts.empresaId } : {}),
      },
      select: { id: true, razaoSocial: true },
    })

    type Pendencia = {
      clienteId: string
      clienteNome: string
      area: string
      respDominante: string
      ocorrencias: number
      motivo: string
    }
    const stats = {
      clientesProcessados: 0,
      clientesSemDados: 0,
      areasAtualizadas: 0,
      areasSemMatch: 0,
      areasNaoContratadas: 0,
    }
    const pendencias: Pendencia[] = []

    for (const cli of clientes) {
      // Busca execuções do último ano com responsável e departamento preenchidos
      const execs = await prisma.servicoExecucao.findMany({
        where: {
          clienteId: cli.id,
          acessoriasPrazo: { gte: inicioJanela },
          acessoriasRespPrazo: { not: null },
          acessoriasDpto: { not: null },
        },
        select: { acessoriasRespPrazo: true, acessoriasDpto: true },
      })

      if (execs.length === 0) {
        stats.clientesSemDados++
        continue
      }
      stats.clientesProcessados++

      // Agrupa por (área-do-OneClick → contador de responsáveis)
      const porArea = new Map<string, Map<string, number>>()
      for (const e of execs) {
        const areaNome = mapDeptoParaArea(e.acessoriasDpto)
        if (!areaNome) continue
        const resp = (e.acessoriasRespPrazo ?? '').trim()
        if (!resp) continue
        if (!porArea.has(areaNome)) porArea.set(areaNome, new Map())
        const inner = porArea.get(areaNome)!
        inner.set(resp, (inner.get(resp) ?? 0) + 1)
      }

      // Pra cada área, identifica dominante e atualiza ClienteAreaContratada
      for (const [areaNome, contagens] of porArea) {
        const top = [...contagens.entries()].sort((a, b) => b[1] - a[1])[0]
        if (!top) continue
        const [respDominante, ocorrencias] = top

        const areaId = areaMap.get(norm(areaNome))
        if (!areaId) continue

        // Confere se o ClienteAreaContratada existe
        const cac = await prisma.clienteAreaContratada.findUnique({
          where: { clienteId_areaId: { clienteId: cli.id, areaId } },
          select: { id: true, responsavelId: true },
        })
        if (!cac) {
          stats.areasNaoContratadas++
          pendencias.push({
            clienteId: cli.id,
            clienteNome: cli.razaoSocial,
            area: areaNome,
            respDominante,
            ocorrencias,
            motivo: 'Cliente não tem essa área contratada — adicione manualmente em /clientes.',
          })
          continue
        }

        // Match com User
        const userMatch = userMap.get(norm(respDominante))
        if (!userMatch) {
          stats.areasSemMatch++
          pendencias.push({
            clienteId: cli.id,
            clienteNome: cli.razaoSocial,
            area: areaNome,
            respDominante,
            ocorrencias,
            motivo: 'Nome do responsável no Acessórias não corresponde a nenhum usuário do OneClick.',
          })
          continue
        }

        // Atualiza se mudou
        if (cac.responsavelId !== userMatch.id) {
          await prisma.clienteAreaContratada.update({
            where: { id: cac.id },
            data: { responsavelId: userMatch.id },
          })
        }
        stats.areasAtualizadas++
      }
    }

    return { stats, pendencias }
  }
}
