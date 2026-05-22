import { Injectable } from '@nestjs/common'
import { prisma } from '@saas/db'

/**
 * Service do painel "Minhas Obrigações" — lista as execuções de obrigações
 * cujo responsável (direto ou via área contratada) é o usuário logado.
 *
 * Premissa: uma ServicoExecucao é "do usuário" quando:
 *   1. responsavelId = userId (atribuição direta), OU
 *   2. servico.ehObrigacaoAcessoria = true AND ClienteAreaContratada
 *      (mesmo cliente, área = servico.categoria) tem responsavelId = userId
 *
 * Status considerados:
 *   - EM_ANDAMENTO (pendente / em execução / atrasada)
 *   - CONCLUIDO   (entregue)
 *   - CANCELADO   (cancelada)
 *   - PULADO      (dispensada)
 */
@Injectable()
export class MinhasObrigacoesService {
  /**
   * Lista execuções do usuário com filtros opcionais.
   */
  async listMinhas(
    userId: string,
    input: {
      status?: 'TODOS' | 'PENDENTES' | 'ATRASADAS' | 'CONCLUIDAS'
      area?: string
      clienteId?: string
      competenciaAno?: number
      competenciaMes?: number
      search?: string
    },
    empresaId?: string,
  ) {
    // Identifica áreas pelas quais o usuário é responsável (em quais clientes)
    const areasResponsavel = await prisma.clienteAreaContratada.findMany({
      where: { responsavelId: userId, contratado: true },
      select: { clienteId: true, areaId: true, area: { select: { name: true } } },
    })
    const responsabilidadesArea = new Map<string, Set<string>>() // clienteId → Set<areaNome>
    for (const r of areasResponsavel) {
      const set = responsabilidadesArea.get(r.clienteId) ?? new Set<string>()
      set.add(r.area.name.toLowerCase())
      responsabilidadesArea.set(r.clienteId, set)
    }

    // Carrega execuções candidatas (responsavelId direto OU obrigação acessória)
    const candidatas = await prisma.servicoExecucao.findMany({
      where: {
        ...(empresaId ? { empresaId } : {}),
        ...(input.clienteId ? { clienteId: input.clienteId } : {}),
        ...(input.competenciaAno && input.competenciaMes
          ? {
              acessoriasComp: {
                gte: new Date(input.competenciaAno, input.competenciaMes - 1, 1),
                lt: new Date(input.competenciaAno, input.competenciaMes, 1),
              },
            }
          : input.competenciaAno
          ? {
              acessoriasComp: {
                gte: new Date(input.competenciaAno, 0, 1),
                lt: new Date(input.competenciaAno + 1, 0, 1),
              },
            }
          : {}),
        OR: [
          { responsavelId: userId },
          {
            servico: { ehObrigacaoAcessoria: true },
            clienteId: { in: [...responsabilidadesArea.keys()] },
          },
        ],
      },
      include: {
        servico: { select: { id: true, nome: true, categoria: true, ehObrigacaoAcessoria: true, mininome: true } },
        cliente: { select: { id: true, razaoSocial: true, tributacao: true } },
      },
      orderBy: [{ prazoLimite: 'asc' }, { acessoriasPrazo: 'asc' }],
      take: 500,
    })

    // Resolver dados do responsável em lote (sem relação direta no schema)
    const respIds = Array.from(new Set(candidatas.map((e) => e.responsavelId).filter((v): v is string => !!v)))
    const responsaveis = respIds.length
      ? await prisma.user.findMany({
          where: { id: { in: respIds } },
          select: { id: true, name: true, image: true },
        })
      : []
    const mapaResponsaveis = new Map(responsaveis.map((u) => [u.id, u]))

    // Filtragem fina: pra obrigações acessórias, só inclui se a área do servico
    // bate com uma das áreas pelas quais o usuário responde naquele cliente.
    const filtradas = candidatas.filter((e) => {
      // Atribuição direta sempre inclui
      if (e.responsavelId === userId) return true
      // Obrigação acessória: confere se a área do serviço bate com uma das
      // áreas do usuário no cliente
      if (e.servico.ehObrigacaoAcessoria) {
        const cat = e.servico.categoria?.toLowerCase()
        if (!cat) return false
        const areas = responsabilidadesArea.get(e.clienteId)
        return areas ? areas.has(cat) : false
      }
      return false
    })

    const agora = new Date()
    const enriquecidas = filtradas.map((e) => {
      const prazo = e.prazoLimite ?? e.acessoriasPrazo ?? null
      const atrasada = !!(prazo && e.status === 'EM_ANDAMENTO' && prazo.getTime() < agora.getTime())
      const responsavel = e.responsavelId ? mapaResponsaveis.get(e.responsavelId) ?? null : null
      return { ...e, prazoEfetivo: prazo, atrasada, responsavel }
    })

    // Filtros pós-query (em memória) — texto + status
    return enriquecidas.filter((e) => {
      if (input.area && e.servico.categoria !== input.area) return false
      if (input.status === 'PENDENTES' && e.status !== 'EM_ANDAMENTO') return false
      if (input.status === 'ATRASADAS' && !e.atrasada) return false
      if (input.status === 'CONCLUIDAS' && e.status !== 'CONCLUIDO') return false
      if (input.search) {
        const q = input.search.toLowerCase()
        const nome = e.servico.nome.toLowerCase()
        const razao = e.cliente?.razaoSocial.toLowerCase() ?? ''
        if (!nome.includes(q) && !razao.includes(q)) return false
      }
      return true
    })
  }

  /**
   * Marca uma execução como entregue — registra entreguePor, entregueEm,
   * observação opcional e URL do anexo. Também cria um evento no log da execução.
   * Falha se o usuário não é responsável ou se a execução já está concluída.
   */
  async entregar(
    userId: string,
    input: { execucaoId: string; observacao?: string | null; anexoUrl?: string | null },
  ) {
    const exec = await prisma.servicoExecucao.findUnique({
      where: { id: input.execucaoId },
      select: {
        id: true, status: true, clienteId: true, responsavelId: true,
        servico: { select: { categoria: true, ehObrigacaoAcessoria: true } },
      },
    })
    if (!exec) throw new Error('Execução não encontrada.')
    if (exec.status === 'CONCLUIDO') throw new Error('Esta obrigação já foi entregue.')

    // Validação de autorização (mesma lógica de listMinhas)
    let autorizado = exec.responsavelId === userId
    if (!autorizado && exec.servico.ehObrigacaoAcessoria && exec.servico.categoria) {
      const cac = await prisma.clienteAreaContratada.findFirst({
        where: {
          clienteId: exec.clienteId,
          responsavelId: userId,
          contratado: true,
          area: { name: { equals: exec.servico.categoria, mode: 'insensitive' } },
        },
        select: { id: true },
      })
      autorizado = !!cac
    }
    if (!autorizado) throw new Error('Você não é responsável por esta obrigação.')

    const agora = new Date()
    const atualizado = await prisma.servicoExecucao.update({
      where: { id: input.execucaoId },
      data: {
        status: 'CONCLUIDO',
        concluidoEm: agora,
        entreguePor: userId,
        entregueEm: agora,
        entregaObservacao: input.observacao?.trim() || null,
        entregaAnexoUrl: input.anexoUrl?.trim() || null,
      },
    })

    // Log do evento
    const partesDescr: string[] = ['Obrigação marcada como entregue']
    if (input.observacao) partesDescr.push(`Observação: ${input.observacao}`)
    if (input.anexoUrl) partesDescr.push(`Anexo: ${input.anexoUrl}`)
    await prisma.servicoExecucaoEvento.create({
      data: {
        execucaoId: input.execucaoId,
        userId,
        tipo: 'concluido',
        descricao: partesDescr.join(' — '),
      },
    })

    return atualizado
  }

  /**
   * Lista o log de eventos de uma execução. Verifica autorização antes.
   */
  async getLog(userId: string, execucaoId: string) {
    const exec = await prisma.servicoExecucao.findUnique({
      where: { id: execucaoId },
      select: {
        clienteId: true, responsavelId: true,
        servico: { select: { categoria: true, ehObrigacaoAcessoria: true } },
      },
    })
    if (!exec) throw new Error('Execução não encontrada.')

    // Autorização: responsavelId direto OU área contratada
    let autorizado = exec.responsavelId === userId
    if (!autorizado && exec.servico.ehObrigacaoAcessoria && exec.servico.categoria) {
      const cac = await prisma.clienteAreaContratada.findFirst({
        where: {
          clienteId: exec.clienteId,
          responsavelId: userId,
          contratado: true,
          area: { name: { equals: exec.servico.categoria, mode: 'insensitive' } },
        },
        select: { id: true },
      })
      autorizado = !!cac
    }
    if (!autorizado) throw new Error('Sem permissão pra ver o log desta obrigação.')

    const eventos = await prisma.servicoExecucaoEvento.findMany({
      where: { execucaoId },
      orderBy: { createdAt: 'desc' },
      take: 100,
    })

    // Resolve autores em lote (não há relação direta — userId opcional)
    const userIds = Array.from(new Set(eventos.map((e) => e.userId).filter((id): id is string => !!id)))
    const autores = userIds.length
      ? await prisma.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, name: true, image: true },
        })
      : []
    const mapaAutores = new Map(autores.map((u) => [u.id, u]))

    return eventos.map((e) => ({
      ...e,
      autor: e.userId ? mapaAutores.get(e.userId) ?? null : null,
    }))
  }

  /**
   * Stats para o header do painel: contadores agregados.
   */
  async getStats(userId: string, empresaId?: string) {
    const todas = await this.listMinhas(userId, { status: 'TODOS' }, empresaId)
    return {
      total: todas.length,
      pendentes: todas.filter((e) => e.status === 'EM_ANDAMENTO' && !e.atrasada).length,
      atrasadas: todas.filter((e) => e.atrasada).length,
      concluidas: todas.filter((e) => e.status === 'CONCLUIDO').length,
    }
  }
}
