import { Injectable, Inject, forwardRef } from '@nestjs/common'
import { prisma } from '@saas/db'
import type { CreateServicoInput, UpdateServicoInput, CreateServicoEtapaInput, CreateServicoPassoInput, CreateExecucaoInput, CreateEncadeamentoInput, Condicao, CreateMaterialInput, UpdateMaterialInput, CreateGrupoInput, UpdateGrupoInput, IniciarGrupoInput, SetServicoGruposInput } from '@saas/types'
import { OrcamentoService } from '../orcamento/orcamento.service'
import { ProcessoService } from '../processo/processo.service'
import { avaliarCondicao } from '../processo/avaliador-condicao'
import { NotificationService } from '../notification/notification.service'
import { NotificacaoService } from '../notificacao/notificacao.service'
import { ServicoExecucaoEventsService } from './servico-execucao-events.service'
import { EmailService } from '../common/email.service'

@Injectable()
export class ServicoService {
  constructor(
    @Inject(forwardRef(() => OrcamentoService))
    private readonly orcamentoService: OrcamentoService,
    private readonly processoService: ProcessoService,
    private readonly notificationService: NotificationService,
    @Inject(forwardRef(() => NotificacaoService))
    private readonly notificacaoService: NotificacaoService,
    private readonly execEvents: ServicoExecucaoEventsService,
    private readonly emailService: EmailService,
  ) {}

  // ── Visibilidade de execucao ──────────────────────────────
  // /meus-servicos nao pode depender da permissao de leitura do modulo "servicos"
  // (que eh a permissao de gerenciar templates). Os endpoints que operam sobre
  // execucoes especificas validam acesso aqui em runtime: o user pode ver/mexer
  // se eh master/diretor/coordenador, tem permissao admin do modulo, OU se cae
  // numa das regras pessoais (responsavel direto, responsavel da area, lider, orcamento).

  async canAccessExecucao(userId: string, execucaoId: string): Promise<boolean> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { isMaster: true, isEmpresaMaster: true, role: true, empresaId: true, areaId: true },
    })
    if (!user) return false
    // Privileged: master e cargos seniores veem tudo
    if (user.isMaster || user.isEmpresaMaster) return true
    if (user.role === 'DIRETOR' || user.role === 'COORDENADOR') return true

    // Admin do modulo "servicos" tambem ve tudo (pra continuar funcionando em /servicos)
    const adminPerm = await prisma.userPermission.findFirst({
      where: { userId, moduleSlug: 'servicos', canRead: true },
      select: { id: true },
    })
    if (adminPerm) return true

    const exec = await prisma.servicoExecucao.findUnique({
      where: { id: execucaoId },
      select: {
        responsavelId: true, clienteId: true, orcamentoId: true,
        servico: {
          select: {
            categoria: true,
            atribuicaoColaboradores: true,
            atribuicaoAreas: true,
            atribuicaoUsaOrcamento: true,
            atribuicaoUsaClienteArea: true,
          },
        },
      },
    })
    if (!exec) return false

    // 1. Responsavel direto
    if (exec.responsavelId === userId) return true

    // 2. Responsavel pelo orcamento que originou
    if (exec.orcamentoId) {
      const orc = await prisma.orcamento.findUnique({
        where: { id: exec.orcamentoId },
        select: { responsavelId: true },
      })
      if (orc?.responsavelId === userId) return true
    }

    // Pra regras 3 e 4 precisa da area do responsavel da execucao
    let respAreaId: string | null = null
    if (exec.responsavelId) {
      const resp = await prisma.user.findUnique({
        where: { id: exec.responsavelId },
        select: { areaId: true },
      })
      respAreaId = resp?.areaId ?? null
    }

    if (respAreaId) {
      // 3. Lider da area do responsavel
      const area = await prisma.area.findUnique({
        where: { id: respAreaId },
        select: { leaderId: true },
      })
      if (area?.leaderId === userId) return true

      // 4. Responsavel pelo cliente na area (par cliente+area)
      const car = await prisma.clienteAreaContratada.findFirst({
        where: { clienteId: exec.clienteId, areaId: respAreaId, responsavelId: userId },
        select: { id: true },
      })
      if (car) return true
    }

    // ── Regras claim-first (atribuição multi-valor do template) ──
    // Só fazem sentido quando a execução está sem responsavelId (caso típico
    // do claim-first do setor — Legalização, etc). Espelham as cláusulas
    // adicionadas em listMeusServicos.
    if (!exec.responsavelId && exec.servico) {
      // 5. User listado como colaborador candidato
      if (exec.servico.atribuicaoColaboradores.includes(userId)) return true

      // 6. User pertence a uma área listada (claim-first do setor)
      if (user.areaId && exec.servico.atribuicaoAreas.includes(user.areaId)) return true

      // 7. Flag atribuicaoUsaOrcamento — user é responsável do orçamento
      if (exec.servico.atribuicaoUsaOrcamento && exec.orcamentoId) {
        const orc = await prisma.orcamento.findUnique({
          where: { id: exec.orcamentoId },
          select: { responsavelId: true },
        })
        if (orc?.responsavelId === userId) return true
      }

      // 8. Flag atribuicaoUsaClienteArea — user é responsável do cliente na
      //    área do serviço (ClienteAreaContratada bate por categoria)
      if (exec.servico.atribuicaoUsaClienteArea && exec.servico.categoria) {
        const vinculo = await prisma.clienteAreaContratada.findFirst({
          where: {
            clienteId: exec.clienteId,
            responsavelId: userId,
            area: { name: { equals: exec.servico.categoria, mode: 'insensitive' } },
          },
          select: { id: true },
        })
        if (vinculo) return true
      }
    }

    return false
  }

  /** Atalho para validar acesso pelo execPassoId (resolve execucaoId antes). */
  async canAccessExecucaoPasso(userId: string, execPassoId: string): Promise<boolean> {
    const passo = await prisma.servicoExecucaoPasso.findUnique({
      where: { id: execPassoId },
      select: { execucaoId: true },
    })
    if (!passo) return false
    return this.canAccessExecucao(userId, passo.execucaoId)
  }

  /** Helper que valida e lança erro padrão. Usado nos routers. */
  async assertCanAccessExecucao(userId: string, execucaoId: string) {
    if (!(await this.canAccessExecucao(userId, execucaoId))) {
      throw new Error('Você não tem acesso a esta execução de serviço.')
    }
  }

  async assertCanAccessExecucaoPasso(userId: string, execPassoId: string) {
    if (!(await this.canAccessExecucaoPasso(userId, execPassoId))) {
      throw new Error('Você não tem acesso a este passo da execução.')
    }
  }

  // ── Atribuição/troca de responsável de execução ───────────
  // Quem pode atribuir:
  //  - master / empresa-master
  //  - role: DIRETOR, COORDENADOR, GESTOR
  //  - profile: SUPERVISOR, GERENTE, ADMIN
  //  - líder de área (Area.leaderId === userId), restrito à(s) sua(s) área(s)
  //
  // O escopo de candidatos (lista de pessoas atribuíveis) segue a mesma lógica:
  // privilegiados veem todos os usuários ativos da empresa; líderes só veem os
  // membros das áreas que lideram.

  private async resolveAssignContext(userId: string) {
    const caller = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true, role: true, profile: true,
        isMaster: true, isEmpresaMaster: true, empresaId: true,
        ledAreas: { select: { id: true } },
      },
    })
    if (!caller) {
      return { caller: null, isPriv: false, ledAreaIds: [] as string[] }
    }
    const isPriv = caller.isMaster || caller.isEmpresaMaster
      || caller.role === 'DIRETOR' || caller.role === 'COORDENADOR' || caller.role === 'GESTOR'
      || caller.profile === 'SUPERVISOR' || caller.profile === 'GERENTE' || caller.profile === 'ADMIN'
    return { caller, isPriv, ledAreaIds: caller.ledAreas.map(a => a.id) }
  }

  /**
   * Lista usuários que o caller pode atribuir como responsável de execuções.
   * Retorna `canAssign: false` se o user não tem permissão (frontend esconde UI).
   *
   * Quando `opts.execId` é informado, tenta filtrar por área da execução:
   *  - usa Servico.categoria (string livre, ex: "Fiscal", "Contábil") para
   *    encontrar uma Area com `name` igual (case-insensitive). Se achar, restringe
   *    candidatos a usuários daquela área.
   *  - se não houver Area correspondente, retorna o escopo completo do caller
   *    (fallback permissivo — não bloqueia atribuição quando não há mapeamento).
   *  - retorna também `areaFiltro` no payload pra UI exibir contexto.
   */
  async listResponsaveisAtribuiveis(
    callerId: string,
    opts?: { execId?: string },
  ): Promise<{
    canAssign: boolean
    candidates: Array<{ id: string; name: string; image: string | null; areaName: string | null }>
    areaFiltro: { id: string; name: string } | null
  }> {
    const ctx = await this.resolveAssignContext(callerId)
    if (!ctx.caller) return { canAssign: false, candidates: [], areaFiltro: null }
    const { caller, isPriv, ledAreaIds } = ctx
    const isLeader = ledAreaIds.length > 0
    if (!isPriv && !isLeader) return { canAssign: false, candidates: [], areaFiltro: null }

    // Resolve área da execução, se solicitado
    let areaFiltro: { id: string; name: string } | null = null
    if (opts?.execId) {
      const exec = await prisma.servicoExecucao.findUnique({
        where: { id: opts.execId },
        select: {
          empresaId: true,
          servico: { select: { categoria: true } },
        },
      })
      const categoria = exec?.servico?.categoria?.trim()
      if (categoria) {
        const area = await prisma.area.findFirst({
          where: {
            isActive: true,
            name: { equals: categoria, mode: 'insensitive' },
            ...(exec?.empresaId ? { OR: [{ empresaId: exec.empresaId }, { empresaId: null }] } : {}),
          },
          select: { id: true, name: true },
        })
        if (area) areaFiltro = area
      }
    }

    const where: any = { isActive: true }
    if (caller.empresaId) {
      where.OR = [{ empresaId: caller.empresaId }, { empresaId: null }]
    }
    const andClauses: any[] = []
    // Líder não-privilegiado: restringe às áreas que lidera
    if (!isPriv && isLeader) andClauses.push({ areaId: { in: ledAreaIds } })
    // Filtro por área da execução (intersecção: líder precisa também liderar a área do serviço)
    if (areaFiltro) andClauses.push({ areaId: areaFiltro.id })
    if (andClauses.length > 0) where.AND = andClauses

    const users = await prisma.user.findMany({
      where,
      select: {
        id: true, name: true, image: true,
        area: { select: { name: true } },
      },
      orderBy: { name: 'asc' },
    })

    return {
      canAssign: true,
      candidates: users.map(u => ({
        id: u.id, name: u.name, image: u.image,
        areaName: u.area?.name ?? null,
      })),
      areaFiltro,
    }
  }

  /** Lança erro se o caller não pode atribuir/alterar responsável da execução. */
  async assertCanAssignResponsavel(callerId: string, execId: string) {
    const ctx = await this.resolveAssignContext(callerId)
    if (!ctx.caller) throw new Error('Usuário não encontrado.')
    if (ctx.isPriv) return
    if (ctx.ledAreaIds.length === 0) {
      throw new Error('Você não tem permissão para atribuir responsáveis.')
    }
    // Líder: só pode mexer se a execução está sob sua área
    // (sem responsável ainda, ou responsável atual é da sua área)
    const exec = await prisma.servicoExecucao.findUnique({
      where: { id: execId },
      select: { responsavelId: true },
    })
    if (!exec) throw new Error('Execução não encontrada.')
    if (!exec.responsavelId) return // sem responsável → líder pode atribuir
    const resp = await prisma.user.findUnique({
      where: { id: exec.responsavelId },
      select: { areaId: true },
    })
    if (!resp?.areaId || !ctx.ledAreaIds.includes(resp.areaId)) {
      throw new Error('Esta execução está fora das áreas que você lidera.')
    }
  }

  /** Atribui ou troca o responsável de uma execução. Registra evento e notifica. */
  async setResponsavelExecucao(execId: string, novoResponsavelId: string | null, callerId: string) {
    await this.assertCanAssignResponsavel(callerId, execId)

    // Valida que o novo responsável está dentro do escopo do caller
    if (novoResponsavelId) {
      const { canAssign, candidates } = await this.listResponsaveisAtribuiveis(callerId)
      if (!canAssign || !candidates.some(c => c.id === novoResponsavelId)) {
        throw new Error('Usuário fora do seu escopo de atribuição.')
      }
    }

    const exec = await prisma.servicoExecucao.findUnique({
      where: { id: execId },
      select: {
        id: true, responsavelId: true, empresaId: true, processoId: true,
        servico: { select: { nome: true } },
      },
    })
    if (!exec) throw new Error('Execução não encontrada.')
    if (exec.responsavelId === novoResponsavelId) return { ok: true, unchanged: true }

    const [novoUser, antigoUser, callerUser] = await Promise.all([
      novoResponsavelId
        ? prisma.user.findUnique({ where: { id: novoResponsavelId }, select: { name: true } })
        : Promise.resolve(null),
      exec.responsavelId
        ? prisma.user.findUnique({ where: { id: exec.responsavelId }, select: { name: true } })
        : Promise.resolve(null),
      prisma.user.findUnique({ where: { id: callerId }, select: { name: true } }),
    ])

    await prisma.servicoExecucao.update({
      where: { id: execId },
      data: { responsavelId: novoResponsavelId },
    })

    const descricaoEvento = novoResponsavelId
      ? (antigoUser
          ? `Responsável alterado de ${antigoUser.name} para ${novoUser?.name ?? '—'}`
          : `Responsável atribuído a ${novoUser?.name ?? '—'}`)
      : `Responsável removido${antigoUser ? ` (era ${antigoUser.name})` : ''}`

    await this.addEvento(execId, callerId, 'responsavel_alterado', descricaoEvento)

    // Notifica o novo responsável — link sempre via /meus-servicos pra
    // funcionar mesmo com usuário sem permissão de leitura no módulo
    // "servicos" (ex: colaborador interno que só executa atribuições).
    // O ?exec= abre o checklist direto na página.
    if (novoResponsavelId && novoResponsavelId !== callerId) {
      try {
        await this.notificationService.criar({
          userId: novoResponsavelId,
          titulo: `Você foi atribuído: ${exec.servico.nome}`,
          mensagem: `${callerUser?.name ?? 'Um gestor'} atribuiu esta execução a você.`,
          tipo: 'info',
          link: `/meus-servicos?exec=${execId}`,
          origem: 'servicos',
          empresaId: exec.empresaId,
        })
      } catch (e) {
        console.warn('[Servico] Falha ao notificar novo responsável:', (e as Error).message)
      }
    }

    return { ok: true, unchanged: false }
  }

  // ── Configuracao do modulo "Meus Servicos" ────────────────
  // Persistida em SystemConfig (key-value global). Master pode editar.

  private static readonly CFG_KEY_DIAS = 'meus_servicos.concluidos_dias_exibicao'
  private static readonly CFG_DIAS_DEFAULT = 7

  async getMeusServicosConfig() {
    const cfg = await prisma.systemConfig.findUnique({
      where: { key: ServicoService.CFG_KEY_DIAS },
    })
    const dias = cfg?.value ? parseInt(cfg.value, 10) : ServicoService.CFG_DIAS_DEFAULT
    return {
      concluidosDiasExibicao: Number.isFinite(dias) && dias > 0 ? dias : ServicoService.CFG_DIAS_DEFAULT,
    }
  }

  async updateMeusServicosConfig(input: { concluidosDiasExibicao: number }) {
    const dias = Math.max(1, Math.min(365, Math.floor(input.concluidosDiasExibicao)))
    await prisma.systemConfig.upsert({
      where: { key: ServicoService.CFG_KEY_DIAS },
      update: { value: String(dias), label: 'Dias de exibição de execuções concluídas no Meus Serviços', group: 'meus-servicos' },
      create: {
        key: ServicoService.CFG_KEY_DIAS,
        value: String(dias),
        label: 'Dias de exibição de execuções concluídas no Meus Serviços',
        group: 'meus-servicos',
      },
    })
    return { concluidosDiasExibicao: dias }
  }

  // ── Arquivamento de execucao ──────────────────────────────
  // So execucoes CONCLUIDO ou CANCELADO podem ser arquivadas. Arquivadas
  // saem da listagem do /meus-servicos por padrao mas continuam consultaveis.

  async arquivarExecucao(id: string, userId?: string) {
    const exec = await prisma.servicoExecucao.findUnique({
      where: { id },
      select: { status: true, arquivado: true } as any,
    }) as any
    if (!exec) throw new Error('Execução não encontrada')
    if (exec.arquivado) throw new Error('Execução já está arquivada')
    if (exec.status !== 'CONCLUIDO' && exec.status !== 'CANCELADO') {
      throw new Error('Só execuções concluídas ou canceladas podem ser arquivadas')
    }
    return prisma.servicoExecucao.update({
      where: { id },
      data: {
        arquivado: true,
        arquivadoEm: new Date(),
        arquivadoPor: userId || null,
      } as any,
    })
  }

  async desarquivarExecucao(id: string) {
    return prisma.servicoExecucao.update({
      where: { id },
      data: {
        arquivado: false,
        arquivadoEm: null,
        arquivadoPor: null,
      } as any,
    })
  }

  // ── Templates de Servico ──────────────────────────────────

  async listServicos(
    empresaId?: string,
    categoria?: 'MENSAL' | 'EXTRA' | 'FLUXO',
    tipo?: 'comerciais' | 'internos' | 'todos',
  ) {
    // Sem `categoria` → só top-level (MENSAL+EXTRA). Itens de fluxo ficam ocultos
    // por padrão (eles aparecem como nós dentro do Fluxo do serviço-pai). Pra
    // ver os FLUXO direto, passe categoria='FLUXO'.
    // `tipo` default = 'comerciais' (ehServicoInterno=false). 'internos' = só internos.
    const tipoFilter = tipo ?? 'comerciais'
    const where: any = {
      ativo: true,
      ...(empresaId ? { empresaId } : {}),
      ...(categoria
        ? { categoriaServico: categoria }
        : { categoriaServico: { in: ['MENSAL', 'EXTRA'] } }),
      ...(tipoFilter === 'comerciais'
        ? { ehServicoInterno: false }
        : tipoFilter === 'internos'
          ? { ehServicoInterno: true }
          : {}),
    }
    return prisma.servico.findMany({
      where,
      include: {
        etapas: { orderBy: { ordem: 'asc' }, include: { passos: { orderBy: { ordem: 'asc' } } } },
        // Quando carrega FLUXO, traz infos do pai pra UI conseguir agrupar.
        servicoPai: { select: { id: true, nome: true } },
        // Grupos a que o serviço pertence (M→N) — usado pra mostrar coluna
        // "Grupo" na listagem.
        grupos: {
          where: { grupo: { ativo: true } },
          include: { grupo: { select: { id: true, nome: true, cor: true } } },
          orderBy: { grupo: { nome: 'asc' } },
        },
        // _count.encadeamentosOrigem  > 0 → serviço tem sucessores (raiz/intermediário de cadeia)
        // _count.encadeamentosDestino > 0 → serviço é sucessor de algum (faz parte de cadeia)
        // _count.itensDeFluxo > 0 → serviço top-level com fluxo interno
        _count: {
          select: {
            execucoes: true,
            encadeamentosOrigem: true,
            encadeamentosDestino: true,
            itensDeFluxo: true,
          },
        },
      },
      orderBy: { nome: 'asc' },
    })
  }

  async getServico(id: string) {
    return prisma.servico.findUnique({
      where: { id },
      include: {
        etapas: {
          orderBy: { ordem: 'asc' },
          include: {
            passos: {
              orderBy: { ordem: 'asc' },
              include: {
                materiais: { orderBy: { ordem: 'asc' } },
                // Conta templates de e-mail / lembretes / campos do cliente ativos
                // pra alimentar os mini-chips indicadores na linha do passo (UI).
                _count: {
                  select: {
                    emailTemplates: { where: { ativo: true } },
                    lembretes:      { where: { ativo: true } },
                    camposCliente:  { where: { ativo: true } },
                  },
                },
              },
            },
            materiais: { orderBy: { ordem: 'asc' } },
          },
        },
        // Grupos a que o serviço pertence (M→N) — usado pelo seletor da aba Visão Geral
        grupos: {
          where: { grupo: { ativo: true } },
          include: { grupo: { select: { id: true, nome: true, cor: true } } },
          orderBy: { grupo: { nome: 'asc' } },
        },
      },
    })
  }

  /**
   * Retorna o fluxo completo (DAG) a partir de um serviço-raiz:
   *  - SUCESSOR: serviços alcançáveis via encadeamento de origem (BFS forward)
   *  - ANCESTRAL: serviços que apontam (direta ou indiretamente) para a raiz
   *    (BFS reverso) — exibidos "apagados" no frontend, dando contexto da cadeia
   *  - RAIZ: o próprio serviço atual
   * Cada nó vem com prévia das etapas/passos para o popover do bloco.
   */
  async getFluxo(rootId: string) {
    type Position = 'ANCESTRAL' | 'RAIZ' | 'SUCESSOR' | 'ORFAO'
    // Captura `this` pra usar dentro das funções aninhadas (pushNode é function declaration).
    const thisRef = this
    // Guarda o rootId original — o frontend usa esse pra chamar saveFluxoLayout,
    // então o LOAD precisa usar o mesmo pra bater. Se a gente redirecionar pra
    // itemRaiz, o BFS muda mas a chave de layout fica a do top-level.
    const originalRootId = rootId

    // Se o serviço é top-level (MENSAL/EXTRA) e tem itens de fluxo, redireciona
    // pro item-raiz desse fluxo (o item que não é destino de nenhum encadeamento
    // dentro do conjunto de filhos).
    const root = await prisma.servico.findUnique({
      where: { id: rootId },
      select: {
        id: true,
        categoriaServico: true,
        itensDeFluxo: { select: { id: true } },
      },
    })
    if (root && (root.categoriaServico === 'MENSAL' || root.categoriaServico === 'EXTRA') && root.itensDeFluxo.length > 0) {
      const itemIds = root.itensDeFluxo.map(i => i.id)
      const destinos = await prisma.servicoEncadeamento.findMany({
        where: { servicoOrigemId: { in: itemIds }, servicoDestinoId: { in: itemIds } },
        select: { servicoDestinoId: true },
      })
      const destinoSet = new Set(destinos.map(d => d.servicoDestinoId))
      const itemRaiz = itemIds.find(id => !destinoSet.has(id))
      if (itemRaiz) {
        // Roda BFS a partir do item-raiz (não do top-level)
        rootId = itemRaiz
      }
    }

    const visitedNodes = new Set<string>()
    const visitedEdges = new Set<string>()
    const nodes: Array<{
      id: string; nome: string; categoria: string | null; prioridade: string;
      slaHoras: number | null; slaMinutos: number | null;
      ativo: boolean; recorrenteMensal: boolean;
      tipo: string; // ATIVIDADE | DECISAO | INICIO | FIM | PERGUNTA
      perguntaTexto: string | null;
      perguntaOpcoes: string[] | null;
      perguntaMulti: boolean;
      /** Rótulos das arestas que chegam neste bloco vindas de blocos PERGUNTA.
       *  Renderizados como header amber no bloco — sinaliza que esse caminho
       *  só dispara quando o gestor escolhe a(s) opção(ões) correspondente(s). */
      perguntaRotulos: string[] | null;
      /** Categoria do serviço (MENSAL/EXTRA/FLUXO). Usado pelo frontend pra
       *  decidir se renderiza as obrigações Acessórias no bloco. */
      categoriaServico: string;
      /** Nomes das obrigações Acessórias mapeadas (ativas) que disparam este serviço. */
      acessoriasObrigacoes: string[];
      /** Estratégia de atribuição de responsável — editável no popover do bloco PERGUNTA. */
      atribuicaoResponsavel: string;
      /** User fixo quando atribuicaoResponsavel = MANUAL_FIXO. */
      responsavelFixoId: string | null;
      position: Position;
      etapas: Array<{ id: string; nome: string; ordem: number; passos: Array<{ id: string; nome: string; ordem: number; obrigatorio: boolean }> }>;
    }> = []
    const edges: Array<{
      id: string; servicoOrigemId: string; servicoDestinoId: string;
      ordem: number; obrigatorio: boolean; iniciaAuto: boolean;
      condicao: unknown; observacao: string | null; rotulo: string | null
    }> = []

    async function pushNode(id: string, position: Position) {
      if (visitedNodes.has(id)) return
      visitedNodes.add(id)
      const svc = await prisma.servico.findUnique({
        where: { id },
        select: {
          id: true, nome: true, categoria: true,
          prioridadePadrao: true, slaHoras: true, ativo: true, recorrenteMensal: true,
          tipo: true, categoriaServico: true,
          perguntaTexto: true, perguntaOpcoes: true, perguntaMulti: true,
          // Atribuição de responsável (pra editor poder configurar "quem responde" em PERGUNTA)
          atribuicaoResponsavel: true, responsavelFixoId: true,
          // Obrigações Acessórias mapeadas ativas (M:N inverso) — distinct por nome
          acessoriasMaps: {
            where: { ativo: true, servicoId: { not: null } },
            select: { nome: true },
          },
          etapas: {
            orderBy: { ordem: 'asc' },
            select: {
              id: true, nome: true, ordem: true,
              passos: {
                orderBy: { ordem: 'asc' },
                select: {
                  id: true, nome: true, ordem: true, obrigatorio: true,
                  // Inclui SLA + dependência pra computar caminho crítico
                  slaMinutos: true, slaHoras: true, dependeDoPassoId: true,
                },
              },
            },
          },
        },
      })
      if (!svc) return
      // Total em minutos do serviço:
      //  • Por etapa: critical-path nos passos (paralelos contam só pelo mais longo)
      //  • Entre etapas: soma (etapas ainda são sequenciais)
      const self = thisRef
      const totalMinutos = svc.etapas.reduce((acc, et) => {
        return acc + self.criticalPathMinutos(et.passos)
      }, 0)
      nodes.push({
        id: svc.id,
        nome: svc.nome,
        categoria: svc.categoria,
        prioridade: svc.prioridadePadrao as string,
        slaHoras: svc.slaHoras,
        slaMinutos: totalMinutos > 0 ? totalMinutos : null,
        ativo: svc.ativo,
        recorrenteMensal: svc.recorrenteMensal,
        tipo: svc.tipo as string,
        perguntaTexto: svc.perguntaTexto ?? null,
        perguntaOpcoes: (svc.perguntaOpcoes as string[] | null) ?? null,
        perguntaMulti: svc.perguntaMulti ?? false,
        perguntaRotulos: null, // preenchido depois do BFS
        atribuicaoResponsavel: svc.atribuicaoResponsavel as string,
        responsavelFixoId: svc.responsavelFixoId,
        categoriaServico: svc.categoriaServico as string,
        acessoriasObrigacoes: Array.from(new Set(svc.acessoriasMaps.map(m => m.nome))).sort(),
        position,
        // Remove campos de SLA do payload dos passos — só a soma total importa pro card
        etapas: svc.etapas.map(et => ({
          id: et.id, nome: et.nome, ordem: et.ordem,
          passos: et.passos.map(p => ({ id: p.id, nome: p.nome, ordem: p.ordem, obrigatorio: p.obrigatorio })),
        })),
      })
    }

    function pushEdge(enc: {
      id: string; servicoOrigemId: string; servicoDestinoId: string;
      ordem: number; obrigatorio: boolean; iniciaAuto: boolean;
      condicao: unknown; observacao: string | null
    }) {
      if (visitedEdges.has(enc.id)) return
      visitedEdges.add(enc.id)
      edges.push({
        id: enc.id,
        servicoOrigemId: enc.servicoOrigemId,
        servicoDestinoId: enc.servicoDestinoId,
        ordem: enc.ordem,
        obrigatorio: enc.obrigatorio,
        iniciaAuto: enc.iniciaAuto,
        condicao: enc.condicao,
        observacao: enc.observacao,
        rotulo: (enc as unknown as { rotulo?: string | null }).rotulo ?? null,
      })
    }

    // ── BFS forward (sucessores) começando pela raiz ──
    await pushNode(rootId, 'RAIZ')
    const fwd = [rootId]
    while (fwd.length > 0) {
      const cur = fwd.shift()!
      const encs = await prisma.servicoEncadeamento.findMany({
        where: { servicoOrigemId: cur },
        orderBy: { ordem: 'asc' },
      })
      for (const enc of encs) {
        pushEdge(enc)
        if (!visitedNodes.has(enc.servicoDestinoId)) {
          await pushNode(enc.servicoDestinoId, 'SUCESSOR')
          fwd.push(enc.servicoDestinoId)
        }
      }
    }

    // ── BFS backward (ancestrais) — visita predecessores até o início.
    // Tracking separado (`bwdSeen`) pra continuar a travessia mesmo quando
    // o node já existe (foi descoberto forward) — assim os ANCESTRAIS dos
    // sucessores também aparecem.
    const bwdSeen = new Set<string>([rootId])
    const bwd = [rootId]
    while (bwd.length > 0) {
      const cur = bwd.shift()!
      const encs = await prisma.servicoEncadeamento.findMany({
        where: { servicoDestinoId: cur },
      })
      for (const enc of encs) {
        pushEdge(enc)
        if (!visitedNodes.has(enc.servicoOrigemId)) {
          await pushNode(enc.servicoOrigemId, 'ANCESTRAL')
        }
        if (!bwdSeen.has(enc.servicoOrigemId)) {
          bwdSeen.add(enc.servicoOrigemId)
          bwd.push(enc.servicoOrigemId)
        }
      }
    }

    // ── Rótulos vindos de blocos PERGUNTA ─────────────────────
    // Pra cada nó, coleta o rotulo das arestas cujo source é um bloco PERGUNTA.
    // Renderizado como header no bloco sucessor (Frontend), mostrando qual
    // opção da pergunta leva a esse caminho.
    const perguntaNodeIds = new Set(nodes.filter(n => n.tipo === 'PERGUNTA').map(n => n.id))
    if (perguntaNodeIds.size > 0) {
      const rotulosPorDestino = new Map<string, string[]>()
      for (const e of edges) {
        if (!perguntaNodeIds.has(e.servicoOrigemId)) continue
        const r = e.rotulo?.trim()
        if (!r) continue
        const arr = rotulosPorDestino.get(e.servicoDestinoId) ?? []
        if (!arr.includes(r)) arr.push(r)
        rotulosPorDestino.set(e.servicoDestinoId, arr)
      }
      for (const n of nodes) {
        const r = rotulosPorDestino.get(n.id)
        if (r && r.length > 0) n.perguntaRotulos = r
      }
    }

    // ── Itens de fluxo ORFAOS ─────────────────────────────────
    // Quando o usuário remove a única aresta que conectava um bloco ao DAG, ele
    // some do BFS (forward+backward). Pra permitir que ele continue visível e
    // possa ser reconectado, listamos os itens-de-fluxo do top-level que NÃO
    // foram visitados e os adicionamos com position='ORFAO'. UI renderiza com
    // estilo destacado (borda tracejada) indicando que precisa de reconexão.
    if (root && root.itensDeFluxo.length > 0) {
      const orfaos = root.itensDeFluxo.filter(i => !visitedNodes.has(i.id))
      for (const o of orfaos) {
        await pushNode(o.id, 'ORFAO')
      }
    }

    // Carrega layout persistido — usa originalRootId pra bater com o save side
    // (frontend sempre passa o id do servico atual, sem conhecer o redirect)
    const layouts = await prisma.servicoFluxoLayout.findMany({
      where: { raizId: originalRootId, nodeId: { in: nodes.map(n => n.id) } },
      select: { nodeId: true, x: true, y: true },
    })
    const layoutMap = new Map(layouts.map(l => [l.nodeId, { x: l.x, y: l.y }]))

    // ── Execuções ativas por nó ──────────────────────────────
    // Agrega todas as ServicoExecucao não-arquivadas com status ativo
    // (EM_ANDAMENTO/AGUARDANDO_INICIO/AGUARDANDO_RESPOSTA) pra cada bloco do
    // fluxo, classificando por situação (em dia/vencendo/atrasada/pausada/
    // aguardando). Frontend renderiza pill no rodapé do bloco com a contagem
    // e cor do "pior caso", e popover lista responsável + cliente de cada uma.
    const nodeIds = nodes.map(n => n.id)
    const execAtivas = nodeIds.length === 0 ? [] : await prisma.servicoExecucao.findMany({
      where: {
        servicoId: { in: nodeIds },
        status: { in: ['EM_ANDAMENTO', 'AGUARDANDO_INICIO', 'AGUARDANDO_RESPOSTA'] },
        arquivado: false,
      },
      select: {
        id: true, servicoId: true, status: true, prazoLimite: true,
        pausado: true, responsavelId: true, clienteId: true, iniciadoEm: true,
      },
      orderBy: [{ prazoLimite: 'asc' }, { iniciadoEm: 'asc' }],
    })
    const userIds = Array.from(new Set(execAtivas.map(e => e.responsavelId).filter(Boolean) as string[]))
    const clienteIds = Array.from(new Set(execAtivas.map(e => e.clienteId)))
    const [usersResp, clientesResp] = await Promise.all([
      userIds.length === 0 ? Promise.resolve([] as Array<{ id: string; name: string | null; image: string | null }>)
        : prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true, image: true } }),
      clienteIds.length === 0 ? Promise.resolve([] as Array<{ id: string; razaoSocial: string; nomeFantasia: string | null }>)
        : prisma.cliente.findMany({ where: { id: { in: clienteIds } }, select: { id: true, razaoSocial: true, nomeFantasia: true } }),
    ])
    const userById = new Map(usersResp.map(u => [u.id, u]))
    const clienteById = new Map(clientesResp.map(c => [c.id, c]))

    type Situacao = 'em_dia' | 'vencendo' | 'atrasada' | 'aguardando_resposta' | 'aguardando_inicio' | 'pausada'
    type Resumo = {
      total: number; emDia: number; vencendo: number; atrasada: number;
      aguardandoResposta: number; aguardandoInicio: number; pausada: number;
      itens: Array<{
        id: string; status: string; situacao: Situacao;
        prazoLimite: Date | null; iniciadoEm: Date; pausado: boolean;
        responsavel: { id: string; name: string | null; image: string | null } | null;
        cliente: { id: string; nome: string } | null;
      }>;
    }
    const agoraMs = Date.now()
    const VENCENDO_MS = 48 * 60 * 60 * 1000 // 48h
    const ITENS_LIMITE = 20
    const resumoPorNo = new Map<string, Resumo>()
    for (const e of execAtivas) {
      let r = resumoPorNo.get(e.servicoId)
      if (!r) {
        r = { total: 0, emDia: 0, vencendo: 0, atrasada: 0, aguardandoResposta: 0, aguardandoInicio: 0, pausada: 0, itens: [] }
        resumoPorNo.set(e.servicoId, r)
      }
      r.total++
      let situacao: Situacao
      if (e.pausado) { r.pausada++; situacao = 'pausada' }
      else if (e.status === 'AGUARDANDO_RESPOSTA') { r.aguardandoResposta++; situacao = 'aguardando_resposta' }
      else if (e.status === 'AGUARDANDO_INICIO') { r.aguardandoInicio++; situacao = 'aguardando_inicio' }
      else if (e.prazoLimite && e.prazoLimite.getTime() < agoraMs) { r.atrasada++; situacao = 'atrasada' }
      else if (e.prazoLimite && e.prazoLimite.getTime() < agoraMs + VENCENDO_MS) { r.vencendo++; situacao = 'vencendo' }
      else { r.emDia++; situacao = 'em_dia' }
      if (r.itens.length < ITENS_LIMITE) {
        const u = e.responsavelId ? userById.get(e.responsavelId) ?? null : null
        const c = clienteById.get(e.clienteId) ?? null
        r.itens.push({
          id: e.id,
          status: e.status,
          situacao,
          prazoLimite: e.prazoLimite,
          iniciadoEm: e.iniciadoEm,
          pausado: e.pausado,
          responsavel: u ? { id: u.id, name: u.name, image: u.image } : null,
          cliente: c ? { id: c.id, nome: c.nomeFantasia || c.razaoSocial } : null,
        })
      }
    }

    const nodesWithLayout = nodes.map(n => ({
      ...n,
      position_xy: layoutMap.get(n.id) ?? null,
      execucoesAtivas: resumoPorNo.get(n.id) ?? null,
    }))
    return { rootId: originalRootId, nodes: nodesWithLayout, edges }
  }

  // ── Layout do fluxograma (posições salvas por raiz) ───────────────

  async saveFluxoLayout(rootId: string, positions: Array<{ nodeId: string; x: number; y: number }>) {
    if (positions.length === 0) return { ok: true, atualizados: 0 }
    // Upsert em paralelo — cada (raizId, nodeId) é único
    await Promise.all(positions.map(p => prisma.servicoFluxoLayout.upsert({
      where: { raizId_nodeId: { raizId: rootId, nodeId: p.nodeId } },
      create: { raizId: rootId, nodeId: p.nodeId, x: p.x, y: p.y },
      update: { x: p.x, y: p.y },
    })))
    return { ok: true, atualizados: positions.length }
  }

  async resetFluxoLayout(rootId: string) {
    await prisma.servicoFluxoLayout.deleteMany({ where: { raizId: rootId } })
    return { ok: true }
  }

  async createServico(input: CreateServicoInput, empresaId?: string) {
    // slaHoras inicial = null; será derivado conforme os passos forem criados.
    // categoriaServico default = EXTRA (top-level pontual). MENSAL pra recorrente;
    // FLUXO pra itens internos (precisa de servicoPaiId).
    const categoria = (input.categoriaServico as any)
      ?? (input.recorrenteMensal ? 'MENSAL' : 'EXTRA')
    const isPergunta = (input.tipo as any) === 'PERGUNTA'
    return prisma.servico.create({
      data: {
        nome: input.nome,
        descricao: input.descricao || null,
        slaHoras: null,
        categoria: input.categoria || null,
        prioridadePadrao: (input.prioridadePadrao as any) ?? 'MEDIA',
        tipo: (input.tipo as any) ?? 'ATIVIDADE',
        categoriaServico: categoria,
        servicoPaiId: input.servicoPaiId ?? null,
        textoPadrao: input.textoPadrao ?? null,
        valorPadrao: input.valorPadrao ?? null,
        disponivelOrcamento: input.disponivelOrcamento ?? true,
        ehServicoInterno: input.ehServicoInterno ?? false,
        ehObrigacaoAcessoria: input.ehObrigacaoAcessoria ?? false,
        recorrenteMensal: input.recorrenteMensal ?? (categoria === 'MENSAL'),
        // PERGUNTA: pré-preenche opções padrão se nenhuma foi enviada.
        perguntaTexto:  input.perguntaTexto ?? null,
        perguntaOpcoes: input.perguntaOpcoes && input.perguntaOpcoes.length > 0
          ? (input.perguntaOpcoes as any)
          : isPergunta ? (['Contábil', 'Trabalhista', 'Fiscal'] as any) : undefined,
        perguntaMulti:  input.perguntaMulti ?? false,
        // Default da atribuição: depende da categoriaServico (MENSAL→CLIENTE_AREA,
        // EXTRA→ORCAMENTO, FLUXO→HERDA_PREDECESSOR). Override via input.
        atribuicaoResponsavel: (input.atribuicaoResponsavel as any)
          ?? (categoria === 'MENSAL' ? 'CLIENTE_AREA'
            : categoria === 'FLUXO'  ? 'HERDA_PREDECESSOR'
            : 'ORCAMENTO'),
        responsavelFixoId: input.responsavelFixoId ?? null,
        // ── Configurações avançadas (espelha campos do Acessórias) ──
        mininome: input.mininome ?? null,
        tempoPrevistoMinutos: input.tempoPrevistoMinutos ?? null,
        lembrarDiasAntes: input.lembrarDiasAntes ?? 0,
        tipoDiasAntes: (input.tipoDiasAntes as any) ?? 'CORRIDOS',
        sabadoEhUtil: input.sabadoEhUtil ?? false,
        exigirRobo: input.exigirRobo ?? false,
        passivelDeMulta: input.passivelDeMulta ?? true,
        alertaGuiaNaoLida: input.alertaGuiaNaoLida ?? true,
        comentarioPadrao: input.comentarioPadrao ?? null,
        empresaId: empresaId || null,
      },
    })
  }

  async updateServico(id: string, input: UpdateServicoInput) {
    // slaHoras é derivado dos passos — descartamos qualquer valor entrante para
    // proteger a integridade do somatório (recomputeSlaServico cuida da escrita).
    const { slaHoras: _slaHoras, ...rest } = input as UpdateServicoInput & { slaHoras?: unknown }
    void _slaHoras
    return prisma.servico.update({ where: { id }, data: rest as any })
  }

  async deleteServico(id: string) {
    return prisma.servico.update({ where: { id }, data: { ativo: false } })
  }

  // ── Vencimentos por mês (Fase B Acessórias) ──────────────────

  /** Lista os overrides por mês de um serviço — devolve sempre 12 entradas
   *  (mes 1-12, valor 0 se não houver registro). */
  async getVencimentosMensais(servicoId: string): Promise<Array<{ mes: number; valor: number }>> {
    const rows = await prisma.servicoVencimentoMensal.findMany({
      where: { servicoId },
      select: { mes: true, valor: true },
    })
    const mapa = new Map(rows.map((r) => [r.mes, r.valor]))
    const out: Array<{ mes: number; valor: number }> = []
    for (let m = 1; m <= 12; m++) out.push({ mes: m, valor: mapa.get(m) ?? 0 })
    return out
  }

  /** Upsert em lote dos overrides por mês. `vencimentos` é um Record onde
   *  a chave é o mês (string '1'..'12') e o valor é o encoding. Meses não
   *  presentes no payload são removidos (zerados). */
  async setVencimentosMensais(servicoId: string, vencimentos: Record<string, number>) {
    return prisma.$transaction(async (tx) => {
      // Apaga overrides antigos (clean slate)
      await tx.servicoVencimentoMensal.deleteMany({ where: { servicoId } })
      // Cria os novos (só os com valor != 0)
      const entries = Object.entries(vencimentos)
        .map(([k, v]) => ({ mes: Number(k), valor: Number(v) }))
        .filter((e) => e.mes >= 1 && e.mes <= 12 && e.valor !== 0)
      if (entries.length > 0) {
        await tx.servicoVencimentoMensal.createMany({
          data: entries.map((e) => ({ servicoId, mes: e.mes, valor: e.valor })),
        })
      }
      return { servicoId, total: entries.length }
    })
  }

  /** Soft-delete em lote — desativa multiplos servicos numa unica query. */
  async bulkDeleteServicos(ids: string[]) {
    if (ids.length === 0) return { count: 0 }
    return prisma.servico.updateMany({ where: { id: { in: ids } }, data: { ativo: false } })
  }

  // ── Etapas ────────────────────────────────────────────────

  async addEtapa(input: CreateServicoEtapaInput) {
    const etapa = await prisma.servicoEtapa.create({
      data: { servicoId: input.servicoId, nome: input.nome, ordem: input.ordem, slaHoras: 0 },
    })
    await this.recomputeSlaServico(input.servicoId)
    return etapa
  }

  async updateEtapa(id: string, data: { nome?: string; ordem?: number }) {
    // slaHoras é sempre derivado dos passos — descartamos qualquer valor entrante.
    const { nome, ordem } = data
    return prisma.servicoEtapa.update({ where: { id }, data: { nome, ordem } })
  }

  async deleteEtapa(id: string) {
    const etapa = await prisma.servicoEtapa.findUnique({ where: { id }, select: { servicoId: true } })
    const result = await prisma.servicoEtapa.delete({ where: { id } })
    if (etapa) await this.recomputeSlaServico(etapa.servicoId)
    return result
  }

  // ── Passos ────────────────────────────────────────────────

  async addPasso(input: CreateServicoPassoInput) {
    const passo = await prisma.servicoPasso.create({ data: input as any })
    await this.recomputeSlaEtapaECascata(input.etapaId)
    return passo
  }

  async updatePasso(id: string, data: Partial<CreateServicoPassoInput>) {
    const passo = await prisma.servicoPasso.update({ where: { id }, data: data as any })
    await this.recomputeSlaEtapaECascata(passo.etapaId)
    return passo
  }

  async deletePasso(id: string) {
    const passo = await prisma.servicoPasso.findUnique({ where: { id }, select: { etapaId: true } })
    const result = await prisma.servicoPasso.delete({ where: { id } })
    if (passo) await this.recomputeSlaEtapaECascata(passo.etapaId)
    return result
  }

  // ── E-mail templates por passo ────────────────────────────
  // CRUD pra cadastrar modelos de e-mail que disparam ao concluir o passo.
  // Tags suportadas (resolvidas no momento do disparo):
  //   {{cliente.razaoSocial}}, {{cliente.nomeFantasia}}, {{cliente.documento}}
  //   {{responsavel.name}}, {{responsavel.email}}
  //   {{servico.nome}}, {{etapa.nome}}, {{passo.nome}}

  async listPassoEmailTemplates(passoId: string) {
    return prisma.servicoPassoEmailTemplate.findMany({
      where: { passoId },
      orderBy: [{ ordem: 'asc' }, { createdAt: 'asc' }],
      include: { anexos: { orderBy: { createdAt: 'asc' } } },
    })
  }

  // ── Anexos do template de e-mail ──────────────────────────

  async addEmailTemplateAnexo(data: {
    templateId: string
    fileName: string
    storageKey: string
    fileSize?: number | null
    mimeType?: string | null
  }) {
    return prisma.servicoPassoEmailTemplateAnexo.create({
      data: {
        templateId: data.templateId,
        fileName: data.fileName,
        storageKey: data.storageKey,
        fileSize: data.fileSize ?? null,
        mimeType: data.mimeType ?? null,
      },
    })
  }

  async deleteEmailTemplateAnexo(id: string) {
    return prisma.servicoPassoEmailTemplateAnexo.delete({ where: { id } })
  }

  async createPassoEmailTemplate(data: {
    passoId: string
    nome: string
    assunto: string
    corpo: string
    destinatarios?: string[]
    exigirConfirmacao?: boolean
    ordem?: number
    ativo?: boolean
  }, empresaId?: string) {
    return prisma.servicoPassoEmailTemplate.create({
      data: {
        passoId: data.passoId,
        nome: data.nome,
        assunto: data.assunto,
        corpo: data.corpo,
        destinatarios: data.destinatarios ?? [],
        exigirConfirmacao: data.exigirConfirmacao ?? false,
        ordem: data.ordem ?? 0,
        ativo: data.ativo ?? true,
        empresaId: empresaId ?? null,
      },
    })
  }

  async updatePassoEmailTemplate(id: string, data: {
    nome?: string
    assunto?: string
    corpo?: string
    destinatarios?: string[]
    exigirConfirmacao?: boolean
    ordem?: number
    ativo?: boolean
  }) {
    return prisma.servicoPassoEmailTemplate.update({ where: { id }, data })
  }

  async deletePassoEmailTemplate(id: string) {
    return prisma.servicoPassoEmailTemplate.delete({ where: { id } })
  }

  /**
   * Envia o template como E-MAIL DE TESTE — usa dados fake nos placeholders
   * ({{cliente.razaoSocial}} etc) pra o usuário visualizar como vai ficar. Não
   * depende de execução; pode ser chamado direto do editor do template.
   * Inclui anexos do template (lê do disco igual `enviarEmailsDoPasso`).
   */
  async enviarEmailTesteTemplate(templateId: string, destinatarios: string[]) {
    const dests = destinatarios.map(d => d.trim()).filter(d => d && /@/.test(d))
    if (dests.length === 0) throw new Error('Informe pelo menos 1 e-mail válido.')

    const template = await prisma.servicoPassoEmailTemplate.findUnique({
      where: { id: templateId },
      include: { anexos: { orderBy: { createdAt: 'asc' } } },
    })
    if (!template) throw new Error('Template não encontrado.')

    // Contexto fake — valores ilustrativos pra preview, com tags resolvidas.
    const hoje = new Date()
    const ctxFake = {
      cliente: {
        razaoSocial:        'Cliente Exemplo Ltda.',
        nomeFantasia:       'Cliente Exemplo',
        documento:          '12345678000190',
        email:              'contato@cliente-exemplo.com.br',
        telefone:           '(11) 91234-5678',
        inscricaoEstadual:  '123.456.789.012',
        inscricaoMunicipal: '987654321',
        regime:             'COMPETENCIA',
        tributacao:         'SIMPLES',
        dataEntrada:        hoje,
        nire:               '35.300.000.000',
        cep:                '01310-100',
        logradouro:         'Av. Paulista',
        numero:             '1000',
        complemento:        'Sala 1',
        bairro:             'Bela Vista',
        cidade:             'São Paulo',
        uf:                 'SP',
        areasContratadas:   'Contábil, Fiscal, Trabalhista',
      },
      responsavel: {
        name:  'Responsável Exemplo',
        email: 'responsavel@empresa.com.br',
      },
      empresa: {
        razaoSocial:  'Sua Empresa Contábil Ltda.',
        nomeFantasia: 'Sua Empresa',
        documento:    '98765432000110',
        email:        'contato@suaempresa.com.br',
        telefone:     '(11) 3000-0000',
      },
      servico: { nome: 'Serviço Exemplo' },
      etapa:   { nome: 'Etapa Exemplo' },
      passo:   { nome: 'Passo Exemplo' },
    }
    const assunto = `[TESTE] ${this.resolveTagsTexto(template.assunto, ctxFake)}`
    // Banner topo do corpo avisando que é teste — facilita identificar no inbox.
    const aviso = '<div style="padding:8px 12px;margin-bottom:12px;border:1px solid #fbbf24;background:#fef3c7;color:#92400e;border-radius:6px;font-family:system-ui,sans-serif;font-size:13px;">⚠️ Este é um <strong>e-mail de teste</strong>. Os dados (cliente, responsável, etc.) são fictícios — apenas pra você visualizar o template.</div>'
    const corpo = aviso + this.resolveTagsTexto(template.corpo, ctxFake)

    // Anexos do disco — mesma lógica do enviarEmailsDoPasso.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const fs = require('fs') as typeof import('fs')
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const path = require('path') as typeof import('path')
    const uploadsDir = path.join(process.cwd(), 'uploads')
    const attachments: Array<{ filename: string; content: Buffer; cid?: string }> = []
    for (const a of (template.anexos ?? [])) {
      const filePath = path.join(uploadsDir, a.storageKey)
      if (!fs.existsSync(filePath)) continue
      attachments.push({ filename: a.fileName, content: fs.readFileSync(filePath) })
    }

    // Converte imagens do corpo em CID inline.
    const { htmlProcessado, inlineAttachments } = this.inlineImagensDoHtml(corpo)
    for (const inlA of inlineAttachments) attachments.push(inlA)
    // Aplica estilos inline pra consistência visual no destino.
    const htmlFinal = this.aplicarEstilosInlineEmail(htmlProcessado)

    await this.emailService.sendMail({
      to: dests,
      subject: assunto,
      html: htmlFinal,
      attachments: attachments.length > 0 ? attachments : undefined,
    })
    return { enviado: true, destinatarios: dests, anexos: attachments.length }
  }

  // ── Lembretes do passo (agenda corporativa) ────────────────

  async listPassoLembretes(passoId: string) {
    return prisma.servicoPassoLembrete.findMany({
      where: { passoId },
      orderBy: [{ ordem: 'asc' }, { createdAt: 'asc' }],
    })
  }

  async createPassoLembrete(data: {
    passoId: string
    nome: string
    titulo: string
    descricao?: string | null
    offsetValor: number
    offsetUnidade: 'DIAS' | 'MESES' | 'ANOS'
    tipoAgendaId?: string | null
    participantes?: string[]
    participantesAreas?: string[]
    ordem?: number
    ativo?: boolean
  }, empresaId?: string) {
    return prisma.servicoPassoLembrete.create({
      data: {
        passoId: data.passoId,
        nome: data.nome,
        titulo: data.titulo,
        descricao: data.descricao ?? null,
        offsetValor: data.offsetValor,
        offsetUnidade: data.offsetUnidade as any,
        tipoAgendaId: data.tipoAgendaId ?? null,
        participantes: data.participantes ?? [],
        participantesAreas: data.participantesAreas ?? [],
        ordem: data.ordem ?? 0,
        ativo: data.ativo ?? true,
        empresaId: empresaId ?? null,
      },
    })
  }

  async updatePassoLembrete(id: string, data: {
    nome?: string
    titulo?: string
    descricao?: string | null
    offsetValor?: number
    offsetUnidade?: 'DIAS' | 'MESES' | 'ANOS'
    tipoAgendaId?: string | null
    participantes?: string[]
    participantesAreas?: string[]
    ordem?: number
    ativo?: boolean
  }) {
    return prisma.servicoPassoLembrete.update({ where: { id }, data: data as any })
  }

  async deletePassoLembrete(id: string) {
    return prisma.servicoPassoLembrete.delete({ where: { id } })
  }

  // ── Campos do cliente vinculados ao passo ─────────────────

  async listPassoCamposCliente(passoId: string) {
    return prisma.servicoPassoCampoCliente.findMany({
      where: { passoId },
      orderBy: [{ ordem: 'asc' }, { createdAt: 'asc' }],
    })
  }

  async createPassoCampoCliente(data: {
    passoId: string
    campoChave: string
    labelOverride?: string | null
    obrigatorio?: boolean
    exigeEdicao?: boolean
    ordem?: number
    ativo?: boolean
  }, empresaId?: string) {
    return prisma.servicoPassoCampoCliente.create({
      data: {
        passoId: data.passoId,
        campoChave: data.campoChave,
        labelOverride: data.labelOverride ?? null,
        obrigatorio: data.obrigatorio ?? false,
        exigeEdicao: data.exigeEdicao ?? false,
        ordem: data.ordem ?? 0,
        ativo: data.ativo ?? true,
        empresaId: empresaId ?? null,
      },
    })
  }

  async updatePassoCampoCliente(id: string, data: {
    campoChave?: string
    labelOverride?: string | null
    obrigatorio?: boolean
    exigeEdicao?: boolean
    ordem?: number
    ativo?: boolean
  }) {
    return prisma.servicoPassoCampoCliente.update({ where: { id }, data })
  }

  async deletePassoCampoCliente(id: string) {
    return prisma.servicoPassoCampoCliente.delete({ where: { id } })
  }

  /**
   * Pré-visualização dos campos vinculados a um passo da EXECUÇÃO — retorna a
   * lista de vínculos ativos + o valor atual do Cliente em cada campo. Usado
   * pelo modal de captura no checklist pra pré-preencher os inputs.
   *
   * Tipos virtuais (e.g. AREAS_CONTRATADAS) trazem `opcoesDinamicas` carregadas
   * de outras tabelas. `valorAtual` é normalizado em formato consumível pelo
   * frontend (array de IDs pro caso de areas, etc).
   */
  async previewCamposClienteDoPasso(execPassoId: string) {
    const execPasso = await prisma.servicoExecucaoPasso.findUnique({
      where: { id: execPassoId },
      select: { passoId: true, execucao: { select: { clienteId: true } } },
    })
    if (!execPasso) return { campos: [], cliente: null }
    const vinculos = await prisma.servicoPassoCampoCliente.findMany({
      where: { passoId: execPasso.passoId, ativo: true },
      orderBy: { ordem: 'asc' },
    })
    if (vinculos.length === 0) return { campos: [], cliente: { id: execPasso.execucao.clienteId } }
    const cliente = await prisma.cliente.findUnique({
      where: { id: execPasso.execucao.clienteId },
    })
    const clienteId = execPasso.execucao.clienteId

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { findCampoClienteDef } = require('@saas/types') as typeof import('@saas/types')

    // Detecta campos virtuais e carrega dados auxiliares.
    const temAreas = vinculos.some(v => findCampoClienteDef(v.campoChave)?.tipo === 'AREAS_CONTRATADAS')
    const temParams = vinculos.some(v => findCampoClienteDef(v.campoChave)?.tipo === 'PARAMETROS_CONTRATO')
    const temPartic = vinculos.some(v => findCampoClienteDef(v.campoChave)?.tipo === 'PARTICULARIDADES_AREAS')

    let areasDisponiveis: Array<{ value: string; label: string }> = []
    let areasContratadasIds: string[] = []
    if (temAreas) {
      const [areas, contratadas] = await Promise.all([
        prisma.area.findMany({
          where: { availableForHiring: true, isActive: true },
          orderBy: { name: 'asc' },
          select: { id: true, name: true },
        }),
        prisma.clienteAreaContratada.findMany({
          where: { clienteId, contratado: true },
          select: { areaId: true },
        }),
      ])
      areasDisponiveis = areas.map(a => ({ value: a.id, label: a.name }))
      areasContratadasIds = contratadas.map(c => c.areaId)
    }

    let paramsContratoAtuais: Record<string, number> | null = null
    if (temParams) {
      // Busca o ClienteContratoParam atual — pode não existir ainda (vai vir
      // como zeros pra o frontend preencher do zero).
      const params = await prisma.clienteContratoParam.findFirst({
        where: { clienteId },
        orderBy: { updatedAt: 'desc' },
      })
      paramsContratoAtuais = params
        ? {
            honorario:    Number(params.honorario)    ?? 0,
            faturamento:  Number(params.faturamento)  ?? 0,
            lancamentos:  params.lancamentos          ?? 0,
            nfEntrada:    params.nfEntrada            ?? 0,
            nfSaida:      params.nfSaida              ?? 0,
            nfPrestado:   params.nfPrestado           ?? 0,
            nfTomado:     params.nfTomado             ?? 0,
            funcionarios: params.funcionarios         ?? 0,
          }
        : { honorario: 0, faturamento: 0, lancamentos: 0, nfEntrada: 0, nfSaida: 0, nfPrestado: 0, nfTomado: 0, funcionarios: 0 }
    }

    // PARTICULARIDADES_AREAS — carrega áreas contratado=true do cliente + textos atuais
    let particularidadesAtuais: Array<{ clienteAreaContratadaId: string; areaNome: string; texto: string }> = []
    if (temPartic) {
      const areasContratadasFull = await prisma.clienteAreaContratada.findMany({
        where: { clienteId, contratado: true },
        include: { area: { select: { name: true } } },
        orderBy: { area: { name: 'asc' } },
      })
      if (areasContratadasFull.length > 0) {
        type PartRow = { cliente_area_contratada_id: string; texto: string }
        const rows = await prisma.$queryRawUnsafe<PartRow[]>(
          `SELECT cliente_area_contratada_id, texto FROM cliente_particularidades WHERE cliente_area_contratada_id = ANY($1::text[])`,
          areasContratadasFull.map(a => a.id),
        )
        const textoPorId = new Map(rows.map(r => [r.cliente_area_contratada_id, r.texto]))
        particularidadesAtuais = areasContratadasFull.map(a => ({
          clienteAreaContratadaId: a.id,
          areaNome: a.area.name,
          texto: textoPorId.get(a.id) ?? '',
        }))
      }
    }

    const campos = vinculos.map(v => {
      const def = findCampoClienteDef(v.campoChave)
      const isAreas = def?.tipo === 'AREAS_CONTRATADAS'
      const isParams = def?.tipo === 'PARAMETROS_CONTRATO'
      const isPartic = def?.tipo === 'PARTICULARIDADES_AREAS'
      return {
        id: v.id,
        campoChave: v.campoChave,
        labelOverride: v.labelOverride,
        obrigatorio: v.obrigatorio,
        exigeEdicao: v.exigeEdicao,
        // Pra campos virtuais, valorAtual é shape específico.
        // Pros diretos, vem direto da coluna do Cliente.
        valorAtual: isAreas
          ? areasContratadasIds
          : isParams
            ? paramsContratoAtuais
            : isPartic
              ? particularidadesAtuais
              : (cliente ? (cliente as unknown as Record<string, unknown>)[v.campoChave] ?? null : null),
        // Opções dinâmicas — só pra AREAS_CONTRATADAS. PARAMETROS_CONTRATO e
        // PARTICULARIDADES_AREAS recebem dados via valorAtual.
        opcoesDinamicas: isAreas ? areasDisponiveis : undefined,
      }
    })
    return { campos, cliente: cliente ? { id: cliente.id } : null }
  }

  /**
   * Persiste os valores capturados dos campos do cliente vinculados ao passo.
   * Valida (1) que cada chave está na whitelist (segurança contra injection
   * via API direta), (2) obrigatórios não-vazios. Atualiza o Cliente em UMA
   * transação. Chamado pelo togglePasso quando o operador concluiu o passo
   * via modal de captura.
   */
  async atualizarCamposClienteDoPasso(
    execPassoId: string,
    valores: Record<string, unknown>,
    userId?: string,
    /** Chaves dos campos (exigeEdicao=true) que o operador marcou como revisados
     *  no modal. Quando o valor enviado for igual ao valor atual e o campo NÃO
     *  estiver nessa lista, o togglePasso é bloqueado. */
    camposRevisados?: string[],
  ): Promise<{ atualizado: boolean }> {
    // Importa a whitelist dos types (mesmo arquivo usado pelo frontend) — garante
    // que só campos do catálogo podem ser tocados.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { CAMPOS_CLIENTE_KEYS, findCampoClienteDef } = require('@saas/types') as typeof import('@saas/types')

    const execPasso = await prisma.servicoExecucaoPasso.findUnique({
      where: { id: execPassoId },
      select: { passoId: true, execucao: { select: { clienteId: true } } },
    })
    if (!execPasso) throw new Error('Passo da execução não encontrado')

    const vinculos = await prisma.servicoPassoCampoCliente.findMany({
      where: { passoId: execPasso.passoId, ativo: true },
    })
    if (vinculos.length === 0) return { atualizado: false }

    const clienteId = execPasso.execucao.clienteId
    const updates: Record<string, unknown> = {}
    const revisadosSet = new Set(camposRevisados ?? [])

    // Pra validar exigeEdicao em campos NÃO virtuais (diretos do Cliente),
    // precisamos do snapshot atual do cliente — comparar valor enviado x atual.
    let clienteSnapshot: Record<string, unknown> | null = null
    const temExigeEdicao = vinculos.some(v => v.exigeEdicao)
    if (temExigeEdicao) {
      const c = await prisma.cliente.findUnique({ where: { id: clienteId } })
      clienteSnapshot = c ? (c as unknown as Record<string, unknown>) : null
    }

    // ── Operações virtuais ────────────────────────────────────────────
    // AREAS_CONTRATADAS — array de areaIds marcadas (upsert sync no universo)
    const opsAreasContratadas: { areaIds: string[] } | null = (() => {
      const v = vinculos.find(x => findCampoClienteDef(x.campoChave)?.tipo === 'AREAS_CONTRATADAS')
      if (!v) return null
      const raw = valores[v.campoChave]
      const isEmpty = raw == null || (Array.isArray(raw) && raw.length === 0)
      if (v.obrigatorio && isEmpty) {
        const def = findCampoClienteDef(v.campoChave)
        const label = v.labelOverride ?? def?.label ?? v.campoChave
        throw new Error(`Campo obrigatório "${label}" não foi preenchido.`)
      }
      const arr = Array.isArray(raw) ? raw.filter((x): x is string => typeof x === 'string') : []
      return { areaIds: arr }
    })()

    // PARTICULARIDADES_AREAS — array de { clienteAreaContratadaId, texto }.
    // Cada entrada vira upsert em cliente_particularidades (raw SQL).
    const opsParticularidades: Array<{ caId: string; texto: string }> | null = (() => {
      const v = vinculos.find(x => findCampoClienteDef(x.campoChave)?.tipo === 'PARTICULARIDADES_AREAS')
      if (!v) return null
      const raw = valores[v.campoChave]
      const arr = Array.isArray(raw) ? raw : []
      const entradas = arr
        .filter((x): x is { clienteAreaContratadaId: string; texto: string } =>
          !!x && typeof x === 'object'
          && typeof (x as any).clienteAreaContratadaId === 'string'
          && typeof (x as any).texto === 'string',
        )
        .map(x => ({ caId: x.clienteAreaContratadaId, texto: x.texto }))
      if (v.obrigatorio && entradas.every(e => e.texto.trim() === '')) {
        const def = findCampoClienteDef(v.campoChave)
        const label = v.labelOverride ?? def?.label ?? v.campoChave
        throw new Error(`Campo obrigatório "${label}" precisa de ao menos 1 particularidade preenchida.`)
      }
      return entradas
    })()

    // PARAMETROS_CONTRATO — objeto com os 8 campos numéricos (upsert em ClienteContratoParam)
    const opsParamsContrato: Record<string, number> | null = (() => {
      const v = vinculos.find(x => findCampoClienteDef(x.campoChave)?.tipo === 'PARAMETROS_CONTRATO')
      if (!v) return null
      const raw = valores[v.campoChave]
      const obj = (raw && typeof raw === 'object' && !Array.isArray(raw)) ? raw as Record<string, unknown> : {}
      // Coerção pra número (default 0). Cada chave é um campo do ClienteContratoParam.
      const num = (k: string) => {
        const x = obj[k]
        if (x == null || x === '') return 0
        const n = typeof x === 'number' ? x : parseFloat(String(x).replace(',', '.'))
        return isNaN(n) ? 0 : n
      }
      const result: Record<string, number> = {
        honorario:    num('honorario'),
        faturamento:  num('faturamento'),
        lancamentos:  Math.round(num('lancamentos')),
        nfEntrada:    Math.round(num('nfEntrada')),
        nfSaida:      Math.round(num('nfSaida')),
        nfPrestado:   Math.round(num('nfPrestado')),
        nfTomado:     Math.round(num('nfTomado')),
        funcionarios: Math.round(num('funcionarios')),
      }
      // Sem flag de obrigatório bloqueando aqui — todos têm default 0; se o
      // gestor quiser exigir preenchimento real, use a UI pra adicionar.
      if (v.obrigatorio) {
        const algumValor = Object.values(result).some(x => x > 0)
        if (!algumValor) {
          const def = findCampoClienteDef(v.campoChave)
          const label = v.labelOverride ?? def?.label ?? v.campoChave
          throw new Error(`Campo obrigatório "${label}" precisa de ao menos 1 valor preenchido.`)
        }
      }
      return result
    })()

    // Validação de obrigatórios + whitelist pros campos não-virtuais (diretos do Cliente)
    for (const v of vinculos) {
      if (!CAMPOS_CLIENTE_KEYS.has(v.campoChave)) continue
      const def = findCampoClienteDef(v.campoChave)
      if (def?.tipo === 'AREAS_CONTRATADAS' || def?.tipo === 'PARAMETROS_CONTRATO' || def?.tipo === 'PARTICULARIDADES_AREAS') continue

      const raw = valores[v.campoChave]
      const isEmpty = raw == null || (typeof raw === 'string' && raw.trim() === '')
      if (v.obrigatorio && isEmpty) {
        const label = v.labelOverride ?? def?.label ?? v.campoChave
        throw new Error(`Campo obrigatório "${label}" não foi preenchido.`)
      }
      if (isEmpty) continue
      if (def?.tipo === 'DATE') {
        const d = typeof raw === 'string' ? new Date(raw) : raw
        if (d instanceof Date && !isNaN(d.getTime())) updates[v.campoChave] = d
      } else if (def?.tipo === 'NUMBER') {
        const n = typeof raw === 'number' ? raw : parseFloat(String(raw))
        if (!isNaN(n)) updates[v.campoChave] = n
      } else if (def?.tipo === 'BOOL') {
        updates[v.campoChave] = raw === true || raw === 'true'
      } else {
        updates[v.campoChave] = typeof raw === 'string' ? raw : String(raw)
      }
      // exigeEdicao: bloqueia se valor enviado for IGUAL ao atual e operador
      // não marcou "Revisado" no modal. Comparação stringificada cobre Date,
      // string, number e enum — suficiente pra a validação.
      if (v.exigeEdicao && clienteSnapshot && !revisadosSet.has(v.campoChave)) {
        const atual = clienteSnapshot[v.campoChave]
        const enviado = updates[v.campoChave]
        const igual = atual instanceof Date && enviado instanceof Date
          ? atual.getTime() === enviado.getTime()
          : String(atual ?? '') === String(enviado ?? '')
        if (igual) {
          const label = v.labelOverride ?? def?.label ?? v.campoChave
          throw new Error(`Campo "${label}" exige revisão — altere o valor ou marque "Revisado".`)
        }
      }
    }

    const temUpdateCliente = Object.keys(updates).length > 0
    if (!temUpdateCliente && !opsAreasContratadas && !opsParamsContrato && !opsParticularidades) return { atualizado: false }

    // Tudo em uma transação — direto-no-Cliente + upsert das áreas + upsert dos parâmetros.
    await prisma.$transaction(async (tx) => {
      if (temUpdateCliente) {
        await tx.cliente.update({ where: { id: clienteId }, data: updates as any })
      }
      if (opsAreasContratadas) {
        const marcadas = new Set(opsAreasContratadas.areaIds)
        const universo = await tx.area.findMany({
          where: { availableForHiring: true, isActive: true },
          select: { id: true },
        })
        for (const a of universo) {
          const contratado = marcadas.has(a.id)
          await tx.clienteAreaContratada.upsert({
            where: { clienteId_areaId: { clienteId, areaId: a.id } },
            create: { clienteId, areaId: a.id, contratado },
            update: { contratado },
          })
        }
      }
      if (opsParamsContrato) {
        // ClienteContratoParam: chave única [clienteId, empresaId]. Procura o
        // existente do cliente; se houver, update; senão, cria. (empresaId é
        // herdado do registro existente ou fica null se não houver.)
        const existing = await tx.clienteContratoParam.findFirst({ where: { clienteId } })
        if (existing) {
          await tx.clienteContratoParam.update({
            where: { id: existing.id },
            data: opsParamsContrato as any,
          })
        } else {
          await tx.clienteContratoParam.create({
            data: { clienteId, ...opsParamsContrato } as any,
          })
        }
      }
      if (opsParticularidades && opsParticularidades.length > 0) {
        // cliente_particularidades: tabela raw (sem model Prisma). Upsert por
        // cliente_area_contratada_id. Só persiste entradas vinculadas a áreas
        // que pertencem ao cliente da execução (segurança).
        const validIds = new Set(
          (await tx.clienteAreaContratada.findMany({
            where: { clienteId, id: { in: opsParticularidades.map(e => e.caId) } },
            select: { id: true },
          })).map(x => x.id),
        )
        for (const e of opsParticularidades) {
          if (!validIds.has(e.caId)) continue
          await tx.$executeRawUnsafe(
            `INSERT INTO cliente_particularidades (id, cliente_area_contratada_id, texto, updated_by_user_id, created_at, updated_at)
             VALUES (gen_random_uuid()::text, $1, $2, $3, NOW(), NOW())
             ON CONFLICT (cliente_area_contratada_id) DO UPDATE SET
               texto = $2, updated_by_user_id = $3, updated_at = NOW()`,
            e.caId, e.texto, userId ?? null,
          )
        }
      }
    })
    return { atualizado: true }
  }

  /**
   * Calcula a data de disparo do lembrete somando o offset à data-base (now).
   * UTC-safe pra evitar drift de timezone — só a parte de data é persistida.
   */
  private calcularDataLembrete(base: Date, valor: number, unidade: 'DIAS' | 'MESES' | 'ANOS'): Date {
    const d = new Date(base.getTime())
    if (unidade === 'DIAS')  d.setUTCDate(d.getUTCDate()  + valor)
    if (unidade === 'MESES') d.setUTCMonth(d.getUTCMonth() + valor)
    if (unidade === 'ANOS')  d.setUTCFullYear(d.getUTCFullYear() + valor)
    return d
  }

  /**
   * Dispara os lembretes ativos do passo: cria um AgendaEvento por lembrete
   * com data = hoje + offset, participantes resolvidos a partir da config
   * (usuários listados + ativos das áreas), e título/descrição com tags
   * substituídas pelas mesmas variáveis dos e-mails. Silencioso: falhas
   * individuais não interrompem o togglePasso.
   */
  async dispararLembretesDoPasso(execPassoId: string, criadorUserId: string) {
    const execPasso = await prisma.servicoExecucaoPasso.findUnique({
      where: { id: execPassoId },
      include: {
        execucao: {
          include: {
            cliente: {
              select: {
                razaoSocial: true, nomeFantasia: true, documento: true,
                email: true, telefone: true,
                inscricaoEstadual: true, inscricaoMunicipal: true,
                regime: true, tributacao: true, dataEntrada: true,
                nire: true, cep: true,
                logradouro: true, numero: true, complemento: true,
                bairro: true, cidade: true, uf: true,
                empresaId: true,
              },
            },
            servico: { select: { nome: true } },
          },
        },
      },
    })
    if (!execPasso) return { criados: 0 }

    // O passo da execução referencia o template via passoId.
    const passoTemplateId = execPasso.passoId
    if (!passoTemplateId) return { criados: 0 }

    const lembretes = await prisma.servicoPassoLembrete.findMany({
      where: { passoId: passoTemplateId, ativo: true },
      orderBy: { ordem: 'asc' },
    })
    if (lembretes.length === 0) return { criados: 0 }

    // ServicoExecucao não tem relation pra responsavel — busca direto pelo id.
    const respId = (execPasso.execucao as any).responsavelId as string | null | undefined
    const responsavel = respId
      ? await prisma.user.findUnique({ where: { id: respId }, select: { name: true, email: true } })
      : null

    // Carrega empresa via cliente.empresaId pra `empresa.*` no resolve.
    const empresaIdCli = execPasso.execucao.cliente?.empresaId ?? null
    const empresa = empresaIdCli
      ? await prisma.empresa.findUnique({
          where: { id: empresaIdCli },
          select: { razaoSocial: true, nomeFantasia: true, cnpj: true, email: true, telefone: true },
        })
      : null
    // Áreas contratadas do cliente — string consolidada usada por {{cliente.areasContratadas}}.
    const areasContratadasArr = await prisma.clienteAreaContratada.findMany({
      where: { clienteId: execPasso.execucao.clienteId, contratado: true },
      include: { area: { select: { name: true } } },
      orderBy: { area: { name: 'asc' } },
    })
    const areasContratadasStr = areasContratadasArr.map(a => a.area.name).join(', ')

    const clienteNorm = execPasso.execucao.cliente ? {
      ...execPasso.execucao.cliente,
      regime: execPasso.execucao.cliente.regime ? String(execPasso.execucao.cliente.regime) : null,
      tributacao: execPasso.execucao.cliente.tributacao ? String(execPasso.execucao.cliente.tributacao) : null,
      areasContratadas: areasContratadasStr,
    } : null
    const empresaNorm = empresa ? { ...empresa, documento: empresa.cnpj } : null
    const ctx = {
      cliente: clienteNorm,
      responsavel, empresa: empresaNorm,
      servico: execPasso.execucao.servico,
      etapa: null,
      passo: { nome: execPasso.passoNome },
    }
    const empresaId = (execPasso.execucao as any).empresaId as string | null | undefined ?? null

    // Tipo de agenda default por empresa (primeiro ativo) — usado quando o
    // template não escolhe um específico.
    const tipoDefault = await prisma.agendaTipo.findFirst({
      where: { isActive: true },
      orderBy: { createdAt: 'asc' },
    })

    let criados = 0
    const agora = new Date()
    for (const l of lembretes) {
      try {
        const dataEvento = this.calcularDataLembrete(agora, l.offsetValor, l.offsetUnidade as any)
        const titulo = this.resolveTagsTexto(l.titulo, ctx)
        const descricao = l.descricao ? this.resolveTagsTexto(l.descricao, ctx) : null

        // Resolve participantes: união dos listados + ativos das áreas.
        const participantesIds = new Set<string>(l.participantes ?? [])
        if (l.participantesAreas && l.participantesAreas.length > 0) {
          const usersDasAreas = await prisma.user.findMany({
            where: { isActive: true, areaId: { in: l.participantesAreas } },
            select: { id: true },
          })
          for (const u of usersDasAreas) participantesIds.add(u.id)
        }

        const tipoId = l.tipoAgendaId ?? tipoDefault?.id
        if (!tipoId) {
          console.warn('[PassoLembrete] Sem AgendaTipo disponível — lembrete ignorado:', l.id)
          continue
        }

        await prisma.agendaEvento.create({
          data: {
            titulo,
            descricao,
            data: dataEvento,
            diaInteiro: true,
            isTarefa: true,
            tipoId,
            criadorId: criadorUserId,
            empresaId,
            participantes: participantesIds.size > 0
              ? { create: Array.from(participantesIds).map(uid => ({ usuarioId: uid })) }
              : undefined,
          },
        })
        criados++
      } catch (e) {
        console.warn('[PassoLembrete] Falha ao criar evento:', (e as Error).message)
      }
    }
    return { criados }
  }

  /** Formata documento (CPF 11 ou CNPJ 14) com máscara padrão. Outros tamanhos
   *  retornam o valor cru. Pra `{{cliente.documento}}`. */
  private formatarDocumento(doc: string | null | undefined): string {
    if (!doc) return ''
    const d = doc.replace(/\D/g, '')
    if (d.length === 11) return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')
    if (d.length === 14) return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5')
    return doc
  }

  /** Formata Date pra DD/MM/YYYY (pt-BR). Null → ''. */
  private formatarData(d: Date | null | undefined): string {
    if (!d) return ''
    const dd = String(d.getDate()).padStart(2, '0')
    const mm = String(d.getMonth() + 1).padStart(2, '0')
    return `${dd}/${mm}/${d.getFullYear()}`
  }

  /** Formata Date por extenso pt-BR ("15 de maio de 2026"). Null → ''. */
  private formatarDataExtenso(d: Date | null | undefined): string {
    if (!d) return ''
    const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']
    return `${d.getDate()} de ${MESES[d.getMonth()] ?? ''} de ${d.getFullYear()}`
  }

  /**
   * Aplica estilos inline em tags do HTML antes do envio. Clientes de e-mail
   * (Gmail, Outlook, Apple Mail) ignoram CSS de classes — só `style="..."`
   * funciona consistentemente. Sem isso, h1/h2/h3 ficam com tamanho aleatório,
   * listas perdem marcadores, blockquote/hr desaparecem, etc.
   *
   * Cobre as tags geradas pelo RichEditor (TipTap): h1/h2/h3, ul/ol/li,
   * blockquote, hr, p. Substitui o atributo `class` por `style` correspondente.
   */
  private aplicarEstilosInlineEmail(html: string): string {
    // Tag → style padrão (em px/keywords seguros pra e-mail)
    const styles: Record<string, string> = {
      h1:         'font-size:24px;font-weight:700;line-height:1.3;margin:18px 0 10px 0;',
      h2:         'font-size:20px;font-weight:600;line-height:1.3;margin:16px 0 8px 0;',
      h3:         'font-size:16px;font-weight:600;line-height:1.3;margin:14px 0 6px 0;',
      ul:         'list-style:disc;padding-left:28px;margin:8px 0;',
      ol:         'list-style:decimal;padding-left:28px;margin:8px 0;',
      li:         'margin:4px 0;',
      blockquote: 'border-left:3px solid #cbd5e1;padding-left:12px;margin:10px 0;color:#475569;font-style:italic;',
      hr:         'border:0;border-top:1px solid #e2e8f0;margin:14px 0;',
      p:          'margin:8px 0;line-height:1.5;',
    }

    let out = html
    // Aplica style em CADA tag — preserva atributos existentes (incluindo style
    // inline, ex: text-align do TextAlign extension). Quando já tem style, faz merge.
    for (const [tag, css] of Object.entries(styles)) {
      // Regex captura: <tag(atributos)>
      const re = new RegExp(`<${tag}(\\s[^>]*)?>`, 'gi')
      out = out.replace(re, (_match, attrs) => {
        const a = (attrs || '') as string
        // Se já tem style="...", mergeia (style do usuário ganha precedência).
        if (/\sstyle=/i.test(a)) {
          return `<${tag}${a.replace(/(\sstyle=["'])/i, `$1${css}`)}>`
        }
        return `<${tag} style="${css}"${a}>`
      })
    }
    return out
  }

  /**
   * Converte imagens do corpo HTML em anexos inline (CID) — necessário pra que
   * o cliente de e-mail renderize as imagens sem depender de URL externa.
   *
   * Detecta `<img src="...">` cujo src aponta pra `/api/upload/<filename>` (do
   * próprio backend, com ou sem host absoluto) ou `data:image/...` (base64).
   * Pra cada um:
   *   1. Lê o arquivo do disco (ou decode base64)
   *   2. Gera CID único
   *   3. Adiciona como inline attachment
   *   4. Substitui src no HTML por `cid:<id>`
   *
   * Imagens externas (https://outro-site.com) ficam intocadas — assume que o
   * destinatário consegue acessá-las (caso de banners, GIFs de logos públicos, etc).
   */
  private inlineImagensDoHtml(html: string): {
    htmlProcessado: string
    inlineAttachments: Array<{ filename: string; content: Buffer; cid: string }>
  } {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const fs = require('fs') as typeof import('fs')
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const path = require('path') as typeof import('path')
    const uploadsDir = path.join(process.cwd(), 'uploads')

    const inlineAttachments: Array<{ filename: string; content: Buffer; cid: string }> = []
    let cidSeq = 0

    // Substitui em duas passadas: 1) imagens de /api/upload (host+path ou só path)
    const reUpload = /<img\s+([^>]*?)src=["']([^"']*?\/api\/upload\/([^"'?]+)[^"']*)["']([^>]*)>/gi
    let htmlProcessado = html.replace(reUpload, (_match, antes, _src, filename, depois) => {
      const filePath = path.join(uploadsDir, filename)
      if (!fs.existsSync(filePath)) {
        // Arquivo sumiu — devolve a img original (vai quebrar no email, mas é o
        // estado natural sem CID; melhor não silenciar o problema).
        return _match
      }
      cidSeq += 1
      const cid = `img-${Date.now()}-${cidSeq}`
      inlineAttachments.push({ filename, content: fs.readFileSync(filePath), cid })
      return `<img ${antes}src="cid:${cid}"${depois}>`
    })

    // 2) imagens base64 (data:image/...;base64,...)
    const reBase64 = /<img\s+([^>]*?)src=["']data:(image\/[a-z+]+);base64,([^"']+)["']([^>]*)>/gi
    htmlProcessado = htmlProcessado.replace(reBase64, (_match, antes, mime, b64, depois) => {
      cidSeq += 1
      const cid = `img-${Date.now()}-${cidSeq}`
      const ext = mime.split('/')[1]?.replace('+xml', '') || 'png'
      const filename = `imagem-${cidSeq}.${ext}`
      inlineAttachments.push({ filename, content: Buffer.from(b64, 'base64'), cid })
      return `<img ${antes}src="cid:${cid}"${depois}>`
    })

    return { htmlProcessado, inlineAttachments }
  }

  /**
   * Resolve tags `{{...}}` em um texto usando o contexto da execução.
   * Tag desconhecida é deixada literal (não falha).
   *
   * Variáveis suportadas (sincronizar com SUPPORTED_TAGS no frontend):
   *   cliente.*   — razaoSocial, nomeFantasia, documento, email, telefone,
   *                 inscricaoEstadual, inscricaoMunicipal, regime, tributacao,
   *                 dataEntrada, nire, cep, endereco, cidade, uf
   *   responsavel.* — name, firstName, email
   *   empresa.*   — razaoSocial, nomeFantasia, documento, email, telefone
   *   servico.nome, etapa.nome, passo.nome
   *   data.*      — hoje, dia, mes, mesNum, ano, diaSemana
   */
  private resolveTagsTexto(texto: string, ctx: {
    cliente?: {
      razaoSocial?: string | null; nomeFantasia?: string | null; documento?: string | null
      email?: string | null; telefone?: string | null
      inscricaoEstadual?: string | null; inscricaoMunicipal?: string | null
      regime?: string | null; tributacao?: string | null
      dataEntrada?: Date | null
      nire?: string | null; cep?: string | null
      logradouro?: string | null; numero?: string | null; complemento?: string | null
      bairro?: string | null; cidade?: string | null; uf?: string | null
      areasContratadas?: string | null
    } | null
    responsavel?: { name?: string | null; email?: string | null } | null
    empresa?: {
      razaoSocial?: string | null; nomeFantasia?: string | null; documento?: string | null
      email?: string | null; telefone?: string | null
    } | null
    servico?: { nome?: string | null } | null
    etapa?: { nome?: string | null } | null
    passo?: { nome?: string | null } | null
  }): string {
    const c = ctx.cliente
    const e = ctx.empresa
    // Endereço consolidado: "Rua X, 123 — Bairro, Cidade/UF, CEP 00000-000"
    const enderecoPartes: string[] = []
    if (c?.logradouro) enderecoPartes.push(c.logradouro + (c.numero ? `, ${c.numero}` : ''))
    if (c?.complemento) enderecoPartes.push(c.complemento)
    if (c?.bairro) enderecoPartes.push(c.bairro)
    if (c?.cidade || c?.uf) enderecoPartes.push([c?.cidade, c?.uf].filter(Boolean).join('/'))
    if (c?.cep) enderecoPartes.push(`CEP ${c.cep}`)
    const enderecoConsolidado = enderecoPartes.join(' — ')

    const firstName = (ctx.responsavel?.name ?? '').trim().split(/\s+/)[0] ?? ''

    const hoje = new Date()
    const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']
    const DIAS = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado']

    const dict: Record<string, string> = {
      // Cliente
      'cliente.razaoSocial':       c?.razaoSocial       ?? '',
      'cliente.nomeFantasia':      c?.nomeFantasia      ?? c?.razaoSocial ?? '',
      'cliente.documento':         this.formatarDocumento(c?.documento),
      'cliente.email':             c?.email             ?? '',
      'cliente.telefone':          c?.telefone          ?? '',
      'cliente.inscricaoEstadual': c?.inscricaoEstadual ?? '',
      'cliente.inscricaoMunicipal': c?.inscricaoMunicipal ?? '',
      'cliente.regime':            c?.regime            ?? '',
      'cliente.tributacao':        c?.tributacao        ?? '',
      'cliente.dataEntrada':       this.formatarData(c?.dataEntrada),
      'cliente.dataEntradaExtenso': this.formatarDataExtenso(c?.dataEntrada),
      'cliente.nire':              c?.nire              ?? '',
      'cliente.cep':               c?.cep               ?? '',
      'cliente.endereco':          enderecoConsolidado,
      'cliente.cidade':            c?.cidade            ?? '',
      'cliente.uf':                c?.uf                ?? '',
      'cliente.areasContratadas':  c?.areasContratadas  ?? '',
      // Responsável
      'responsavel.name':          ctx.responsavel?.name  ?? '',
      'responsavel.firstName':     firstName,
      'responsavel.email':         ctx.responsavel?.email ?? '',
      // Empresa
      'empresa.razaoSocial':       e?.razaoSocial   ?? '',
      'empresa.nomeFantasia':      e?.nomeFantasia  ?? e?.razaoSocial ?? '',
      'empresa.documento':         this.formatarDocumento(e?.documento),
      'empresa.email':             e?.email         ?? '',
      'empresa.telefone':          e?.telefone      ?? '',
      // Serviço / Etapa / Passo
      'servico.nome':              ctx.servico?.nome ?? '',
      'etapa.nome':                ctx.etapa?.nome   ?? '',
      'passo.nome':                ctx.passo?.nome   ?? '',
      // Data (sempre disponível — gerada na hora do envio)
      'data.hoje':                 this.formatarData(hoje),
      'data.hojeExtenso':          this.formatarDataExtenso(hoje),
      'data.dia':                  String(hoje.getDate()).padStart(2, '0'),
      'data.mes':                  MESES[hoje.getMonth()] ?? '',
      'data.mesNum':               String(hoje.getMonth() + 1).padStart(2, '0'),
      'data.ano':                  String(hoje.getFullYear()),
      'data.diaSemana':            DIAS[hoje.getDay()] ?? '',
    }
    return texto.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, key) => dict[key] ?? `{{${key}}}`)
  }

  /**
   * Resolve contexto de tags + retorna a lista de templates renderizados
   * (assunto/corpo com {{...}} substituído) prontos pra exibir ou disparar.
   * Usado tanto pelo togglePasso (envio automático) quanto pelo modal de
   * confirmação (preview).
   */
  async previewEmailsDoPasso(execPassoId: string) {
    const execPasso = await prisma.servicoExecucaoPasso.findUnique({
      where: { id: execPassoId },
      select: { passoId: true, passoNome: true, etapaNome: true, execucaoId: true },
    })
    if (!execPasso) return []
    const templates = await prisma.servicoPassoEmailTemplate.findMany({
      where: { passoId: execPasso.passoId, ativo: true },
      orderBy: [{ ordem: 'asc' }, { createdAt: 'asc' }],
      include: { anexos: { orderBy: { createdAt: 'asc' } } },
    })
    if (templates.length === 0) return []

    const exec = await prisma.servicoExecucao.findUnique({
      where: { id: execPasso.execucaoId },
      select: {
        responsavelId: true, clienteId: true,
        servico: { select: { nome: true } },
      },
    })
    // Carrega cliente completo — campos extras usados nas tags expandidas
    // (endereço, IE/IM, regime, datas, NIRE, telefone, e-mail, etc).
    const cliente = exec
      ? await prisma.cliente.findUnique({
          where: { id: exec.clienteId },
          select: {
            razaoSocial: true, nomeFantasia: true, documento: true,
            email: true, telefone: true,
            inscricaoEstadual: true, inscricaoMunicipal: true,
            regime: true, tributacao: true, dataEntrada: true,
            nire: true, cep: true,
            logradouro: true, numero: true, complemento: true,
            bairro: true, cidade: true, uf: true,
            empresaId: true,
          },
        })
      : null
    const responsavel = exec?.responsavelId
      ? await prisma.user.findUnique({
          where: { id: exec.responsavelId },
          select: { name: true, email: true },
        })
      : null
    // Carrega empresa (multi-tenant) via cliente.empresaId — usado nas tags `empresa.*`
    const empresa = cliente?.empresaId
      ? await prisma.empresa.findUnique({
          where: { id: cliente.empresaId },
          select: { razaoSocial: true, nomeFantasia: true, cnpj: true, email: true, telefone: true },
        })
      : null
    // Áreas contratadas do cliente — string consolidada "Fiscal, Contábil, Trabalhista"
    // (sem áreas → string vazia). Usada pela tag {{cliente.areasContratadas}}.
    const areasContratadasArr = exec ? await prisma.clienteAreaContratada.findMany({
      where: { clienteId: exec.clienteId, contratado: true },
      include: { area: { select: { name: true } } },
      orderBy: { area: { name: 'asc' } },
    }) : []
    const areasContratadasStr = areasContratadasArr.map(a => a.area.name).join(', ')

    // Normaliza enums prisma pra string nos campos regime/tributacao
    const clienteNorm = cliente ? {
      ...cliente,
      regime: cliente.regime ? String(cliente.regime) : null,
      tributacao: cliente.tributacao ? String(cliente.tributacao) : null,
      areasContratadas: areasContratadasStr,
    } : null
    // Empresa.cnpj → empresa.documento (alias pra ficar consistente com cliente.documento)
    const empresaNorm = empresa ? { ...empresa, documento: empresa.cnpj } : null
    const ctx = {
      cliente: clienteNorm, responsavel, empresa: empresaNorm,
      servico: exec?.servico ?? null,
      etapa: { nome: execPasso.etapaNome },
      passo: { nome: execPasso.passoNome },
    }

    return templates.map(t => ({
      id: t.id,
      nome: t.nome,
      assunto: this.resolveTagsTexto(t.assunto, ctx),
      corpo: this.resolveTagsTexto(t.corpo, ctx),
      destinatarios: t.destinatarios,
      exigirConfirmacao: t.exigirConfirmacao,
      anexos: (t as any).anexos as Array<{ id: string; fileName: string; storageKey: string; fileSize: number | null; mimeType: string | null }>,
    }))
  }

  /**
   * Dispara os e-mails de um execPasso. Quando `extraDestinatarios` é
   * passado, soma à lista default do template. Chamado pelo togglePasso
   * (automático) ou pelo endpoint `enviarEmailsPasso` (confirmação manual).
   */
  async enviarEmailsDoPasso(
    execPassoId: string,
    opts?: { extraDestinatarios?: string[]; somenteTemplateIds?: string[] },
  ) {
    const templates = await this.previewEmailsDoPasso(execPassoId)
    const filtrados = opts?.somenteTemplateIds
      ? templates.filter(t => opts.somenteTemplateIds!.includes(t.id))
      : templates
    if (filtrados.length === 0) return { enviados: 0 }

    // Disparo via EmailService (injetado). Cada template é fire-and-forget
    // pra não bloquear togglePasso. Falha silenciosamente (log no console).
    const extras = (opts?.extraDestinatarios ?? []).filter(e => e && /@/.test(e))
    // Resolve o diretório de uploads igual o UploadController (process.cwd()/uploads).
    // Anexos não encontrados são logados e ignorados — não bloqueia o envio.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const fs = require('fs') as typeof import('fs')
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const path = require('path') as typeof import('path')
    const uploadsDir = path.join(process.cwd(), 'uploads')

    let enviados = 0
    for (const t of filtrados) {
      const dests = Array.from(new Set([...t.destinatarios, ...extras]))
      if (dests.length === 0) continue
      try {
        const attachments: Array<{ filename: string; content: Buffer; cid?: string }> = []
        for (const a of (t.anexos ?? [])) {
          const filePath = path.join(uploadsDir, a.storageKey)
          if (!fs.existsSync(filePath)) {
            console.warn('[ServicoPassoEmail] Anexo não encontrado no disco:', a.storageKey)
            continue
          }
          attachments.push({ filename: a.fileName, content: fs.readFileSync(filePath) })
        }
        // Converte imagens do corpo em CID inline — evita imagens quebradas
        // quando o destinatário não tem acesso ao /api/upload do backend.
        const { htmlProcessado, inlineAttachments } = this.inlineImagensDoHtml(t.corpo)
        for (const inlA of inlineAttachments) attachments.push(inlA)
        // Aplica estilos inline (h1/h2/h3/listas/etc) pra renderização consistente
        // em qualquer client de email — classes Tailwind não funcionam no destino.
        const htmlFinal = this.aplicarEstilosInlineEmail(htmlProcessado)
        await this.emailService.sendMail({
          to: dests,
          subject: t.assunto,
          html: htmlFinal,
          attachments: attachments.length > 0 ? attachments : undefined,
        })
        enviados++
      } catch (e) {
        console.warn('[ServicoPassoEmail] Falha ao enviar:', (e as Error).message)
      }
    }
    return { enviados }
  }

  // ── SLA derivado (caminho crítico) ─────────────────────────
  // Servico.slaHoras e Etapa.slaHoras NUNCA são definidos pelo usuário:
  //  • Etapa.slaHoras = caminho crítico dos passos via dependeDoPassoId
  //    (passos sem dependência rodam em paralelo — contam só pelo mais longo)
  //  • Servico.slaHoras = soma das etapas (etapas ainda são sequenciais)
  // Estes campos persistidos servem para cálculo de prazoLimite em execucoes.

  /** Tempo do passo em minutos: slaMinutos é canônico; slaHoras é fallback legado. */
  /**
   * Resolve o responsável de uma execução conforme a estratégia configurada no
   * template do serviço. Chamado por createExecucao quando o caller não passou
   * `responsavelId` explícito (override manual sempre vence).
   *
   *  - ORCAMENTO       → Orcamento.responsavelId (só se houver orcamentoId)
   *  - CLIENTE_AREA    → ClienteAreaContratada.responsavelId (match area.name=servico.categoria,
   *                       case-insensitive). Fallback para substitutoId.
   *  - MANUAL_FIXO     → servico.responsavelFixoId
   *  - HERDA_PREDECESSOR → retorna null (predecessor já passou via input.responsavelId
   *                       quando encadeamento.herdaResponsavel=true).
   *
   * Retorna null se a estratégia não conseguiu resolver — execução fica sem
   * responsável e o gestor atribui manualmente depois.
   */
  /**
   * Nova resolução obrigatória — usa os campos `atribuicao*` do template como
   * fonte única. Retorna `{ candidatos, claimFirst }`:
   *  - Se NENHUMA fonte for "setor" e a união resolve para exatamente 1
   *    pessoa, esse user vira responsavelId direto.
   *  - Se há FONTE de SETOR (atribuicaoAreas com qualquer área), o resultado
   *    é sempre claim-first — semântica intencional: a execução cai no painel
   *    do setor e o primeiro a marcar um passo reivindica.
   *  - Se a união tem >1 candidatos (ainda que sem setor), também claim-first.
   *  - Se nenhum candidato e sem setor → null (gestor atribui manualmente).
   */
  private async resolverCandidatos(
    servico: {
      id: string; categoria: string | null;
      atribuicaoColaboradores: string[];
      atribuicaoAreas: string[];
      atribuicaoUsaOrcamento: boolean;
      atribuicaoUsaClienteArea: boolean;
    },
    ctx: { clienteId: string; orcamentoId: string | null },
  ): Promise<{ candidatos: string[]; claimFirst: boolean }> {
    const candidatos = new Set<string>()

    // 1) Colaboradores listados diretamente
    for (const id of servico.atribuicaoColaboradores) candidatos.add(id)

    // 2) Usuários ativos das áreas listadas — fonte COLETIVA (força claim-first)
    const temFonteSetor = servico.atribuicaoAreas.length > 0
    if (temFonteSetor) {
      const usuarios = await prisma.user.findMany({
        where: { isActive: true, areaId: { in: servico.atribuicaoAreas } },
        select: { id: true },
      })
      for (const u of usuarios) candidatos.add(u.id)
    }

    // 3) Responsável do orçamento (se flag ligada e há orçamento)
    if (servico.atribuicaoUsaOrcamento && ctx.orcamentoId) {
      const o = await prisma.orcamento.findUnique({
        where: { id: ctx.orcamentoId },
        select: { responsavelId: true },
      })
      if (o?.responsavelId) candidatos.add(o.responsavelId)
    }

    // 4) Responsável do cliente na área do serviço (ClienteAreaContratada)
    if (servico.atribuicaoUsaClienteArea && servico.categoria) {
      const vinculo = await prisma.clienteAreaContratada.findFirst({
        where: {
          clienteId: ctx.clienteId,
          area: { name: { equals: servico.categoria, mode: 'insensitive' } },
        },
        select: { responsavelId: true, substitutoId: true },
      })
      if (vinculo?.responsavelId) candidatos.add(vinculo.responsavelId)
      else if (vinculo?.substitutoId) candidatos.add(vinculo.substitutoId)
    }

    return {
      candidatos: Array.from(candidatos),
      // Setor é "coletivo por definição" — sempre claim-first, mesmo com 1 user.
      claimFirst: temFonteSetor,
    }
  }

  private passoMinutos(p: { slaMinutos: number | null; slaHoras: number | null }): number {
    return p.slaMinutos ?? (p.slaHoras != null ? p.slaHoras * 60 : 0)
  }

  /** SLA total da etapa em minutos = SOMA do tempo de todos os passos.
   *  Modelo operacional típico: o operador executa em sequência, mesmo passos
   *  sem `dependeDoPassoId` explícita. A dependência só governa o gating em
   *  runtime (não pode concluir o sucessor antes do antecessor) — não afeta
   *  a contagem do tempo total da etapa. */
  private criticalPathMinutos(
    passos: Array<{ id: string; slaMinutos: number | null; slaHoras: number | null; dependeDoPassoId: string | null }>,
  ): number {
    return passos.reduce((sum, p) => sum + this.passoMinutos(p), 0)
  }

  private async recomputeSlaEtapaECascata(etapaId: string) {
    const etapa = await prisma.servicoEtapa.findUnique({
      where: { id: etapaId },
      include: { passos: { select: { id: true, slaMinutos: true, slaHoras: true, dependeDoPassoId: true } } },
    })
    if (!etapa) return
    const etapaMin = this.criticalPathMinutos(etapa.passos)
    const etapaHoras = etapaMin > 0 ? Math.ceil(etapaMin / 60) : null
    await prisma.servicoEtapa.update({ where: { id: etapaId }, data: { slaHoras: etapaHoras } })
    await this.recomputeSlaServico(etapa.servicoId)
  }

  private async recomputeSlaServico(servicoId: string) {
    const etapas = await prisma.servicoEtapa.findMany({
      where: { servicoId },
      include: { passos: { select: { id: true, slaMinutos: true, slaHoras: true, dependeDoPassoId: true } } },
    })
    const totalMin = etapas.reduce((acc, et) => acc + this.criticalPathMinutos(et.passos), 0)
    const totalHoras = totalMin > 0 ? Math.ceil(totalMin / 60) : null
    await prisma.servico.update({ where: { id: servicoId }, data: { slaHoras: totalHoras } })
  }

  // ── Encadeamento entre Servicos (DAG no template) ────────
  // Cada ServicoEncadeamento eh uma aresta: ao concluir o servicoOrigem,
  // o sistema cria automaticamente uma execucao do servicoDestino. Permite
  // construir cadeias do tipo: Transferencia → Onboarding → Capacitacao.

  async listEncadeamentos(filters?: { servicoOrigemId?: string; servicoDestinoId?: string }) {
    const where: any = {}
    if (filters?.servicoOrigemId) where.servicoOrigemId = filters.servicoOrigemId
    if (filters?.servicoDestinoId) where.servicoDestinoId = filters.servicoDestinoId
    return prisma.servicoEncadeamento.findMany({
      where,
      orderBy: [{ servicoOrigemId: 'asc' }, { ordem: 'asc' }],
      include: {
        servicoOrigem:  { select: { id: true, nome: true } },
        servicoDestino: { select: { id: true, nome: true } },
      },
    })
  }

  async addEncadeamento(input: CreateEncadeamentoInput) {
    if (input.servicoOrigemId === input.servicoDestinoId) {
      throw new Error('Um serviço não pode encadear-se a si mesmo')
    }
    // Detecta ciclo: se a partir do destino conseguimos voltar a origem,
    // adicionar essa aresta criaria um ciclo no DAG.
    if (await this.encadeamentoCriaCiclo(input.servicoOrigemId, input.servicoDestinoId)) {
      throw new Error('Encadeamento criaria um ciclo no fluxo de processos')
    }
    return prisma.servicoEncadeamento.create({
      data: {
        servicoOrigemId:  input.servicoOrigemId,
        servicoDestinoId: input.servicoDestinoId,
        ordem:            input.ordem ?? 0,
        iniciaAuto:       input.iniciaAuto ?? true,
        obrigatorio:      input.obrigatorio ?? true,
        herdaResponsavel: input.herdaResponsavel ?? true,
        condicao:         input.condicao ? (input.condicao as any) : undefined,
        observacao:       input.observacao || null,
        // Rotulo exibido na aresta (ex.: "Sim"/"Não" pra saídas de DECISAO).
        // Pode vir null pra remover; undefined deixa null padrão na criação.
        rotulo:           input.rotulo ?? null,
      },
    })
  }

  async updateEncadeamento(id: string, partial: Partial<CreateEncadeamentoInput>) {
    return prisma.servicoEncadeamento.update({
      where: { id },
      data: {
        ordem:            partial.ordem,
        iniciaAuto:       partial.iniciaAuto,
        obrigatorio:      partial.obrigatorio,
        herdaResponsavel: partial.herdaResponsavel,
        condicao:         partial.condicao !== undefined ? (partial.condicao as any) : undefined,
        observacao:       partial.observacao,
        // Aceita string (definir), null (limpar) ou undefined (manter).
        // O editor visual usa isso pra rotular saídas de DECISAO ("Sim"/"Não").
        rotulo:           partial.rotulo,
      },
    })
  }

  async removeEncadeamento(id: string) {
    return prisma.servicoEncadeamento.delete({ where: { id } })
  }

  /**
   * BFS a partir do servicoDestinoId — se em algum momento alcancarmos
   * servicoOrigemId, adicionar a aresta proposta criaria um ciclo. Limita
   * profundidade implicitamente via Set de visitados.
   */
  private async encadeamentoCriaCiclo(origemId: string, destinoId: string): Promise<boolean> {
    if (origemId === destinoId) return true
    const visited = new Set<string>()
    const queue: string[] = [destinoId]
    while (queue.length > 0) {
      const node = queue.shift()!
      if (node === origemId) return true
      if (visited.has(node)) continue
      visited.add(node)
      const arestas = await prisma.servicoEncadeamento.findMany({
        where: { servicoOrigemId: node },
        select: { servicoDestinoId: true },
      })
      for (const a of arestas) queue.push(a.servicoDestinoId)
    }
    return false
  }

  // ── Execucoes ─────────────────────────────────────────────

  async listExecucoes(filters?: { status?: string; clienteId?: string; empresaId?: string }) {
    const where: any = {}
    if (filters?.status) where.status = filters.status
    if (filters?.clienteId) where.clienteId = filters.clienteId
    // Quando há empresaId no contexto, mostra execuções da empresa OU órfãs
    // (empresa_id NULL — legado ou criadas por scripts antes do scoping).
    // Mantém o badge de stats e a tabela consistentes.
    if (filters?.empresaId) {
      where.OR = [{ empresaId: filters.empresaId }, { empresaId: null }]
    }

    return prisma.servicoExecucao.findMany({
      where,
      include: {
        servico: { select: { id: true, nome: true } },
        cliente: { select: { id: true, razaoSocial: true, documento: true } },
        passos: { orderBy: { ordem: 'asc' } },
      },
      orderBy: { iniciadoEm: 'desc' },
    })
  }

  async getExecucao(id: string) {
    const exec = await prisma.servicoExecucao.findUnique({
      where: { id },
      include: {
        servico: { select: { id: true, nome: true, descricao: true, slaHoras: true } },
        cliente: { select: { id: true, razaoSocial: true, documento: true } },
        passos: { orderBy: { ordem: 'asc' } },
      },
    })
    if (!exec) return exec

    // Enriquece cada passo com os dados dos usuários (concluidoPor + ignoradoPor) —
    // ambos armazenam só ID, sem relação Prisma. JOIN manual aqui.
    const userIds = Array.from(new Set([
      ...exec.passos.map(p => p.concluidoPor),
      ...exec.passos.map(p => (p as any).ignoradoPor),
    ].filter((u): u is string => !!u)))
    const usersMap = new Map<string, { id: string; name: string; image: string | null }>()
    if (userIds.length > 0) {
      const users = await prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, name: true, image: true },
      })
      for (const u of users) usersMap.set(u.id, u)
    }
    return {
      ...exec,
      passos: exec.passos.map(p => ({
        ...p,
        concluidoPorUsuario: p.concluidoPor ? usersMap.get(p.concluidoPor) ?? null : null,
        ignoradoPorUsuario: (p as any).ignoradoPor ? usersMap.get((p as any).ignoradoPor) ?? null : null,
      })),
    }
  }

  async createExecucao(
    input: CreateExecucaoInput,
    empresaId?: string,
    /**
     * Parametros internos usados quando a execucao eh criada como sucessora
     * dentro de um Processo (cascata via ServicoEncadeamento). Nao expostos
     * no schema Zod publico — so chamadas internas do backend setam esses.
     */
    internal?: {
      processoId?: string | null
      predecessorExecucaoId?: string | null
      encadeamentoId?: string | null
      /** Default: EM_ANDAMENTO. AGUARDANDO_INICIO: sucessores opcionais ou iniciaAuto=false.
       *  AGUARDANDO_RESPOSTA: bloco PERGUNTA — engine pausa esperando resposta humana. */
      statusInicial?: 'EM_ANDAMENTO' | 'AGUARDANDO_INICIO' | 'AGUARDANDO_RESPOSTA'
    },
  ) {
    // Buscar template do servico com etapas e passos
    const servico = await prisma.servico.findUnique({
      where: { id: input.servicoId },
      include: { etapas: { orderBy: { ordem: 'asc' }, include: { passos: { orderBy: { ordem: 'asc' } } } } },
    })
    if (!servico) throw new Error('Servico nao encontrado')

    const statusInicial = internal?.statusInicial ?? 'EM_ANDAMENTO'
    // SLA so comeca a contar quando a execucao esta efetivamente EM_ANDAMENTO.
    // Em AGUARDANDO_INICIO, prazoLimite fica nulo — sera calculado quando
    // o gestor confirmar (Fase 6: iniciarSucessorManual).
    const iniciadoEm = new Date()
    const prazoLimite = statusInicial === 'EM_ANDAMENTO' && servico.slaHoras
      ? new Date(iniciadoEm.getTime() + servico.slaHoras * 60 * 60 * 1000)
      : null

    // ── Resolução de responsável (modelo novo, obrigatório) ──
    // Se o caller passou explicitamente, respeita (override manual). Caso
    // contrário, resolve via campos `atribuicao*` do template:
    //   - claimFirst=true (há fonte SETOR)  → null, sempre claim-first
    //   - 1 candidato e sem setor           → vira responsavelId direto
    //   - 0 ou >1 e sem setor               → null (claim-first via inbox)
    let responsavelId: string | null = input.responsavelId || null
    let claimFirstCandidatos: string[] = []
    if (!responsavelId) {
      const { candidatos, claimFirst } = await this.resolverCandidatos(
        servico as any,
        { clienteId: input.clienteId, orcamentoId: input.orcamentoId ?? null },
      )
      if (!claimFirst && candidatos.length === 1) {
        responsavelId = candidatos[0]!
      } else {
        // Sem responsável direto — notificamos os candidatos depois de criar
        // a execução pra cada um saber que tem novo serviço disponível pro
        // setor (primeiro a marcar passo reivindica).
        claimFirstCandidatos = candidatos
      }
    }

    // Criar execucao herdando prioridade do template (a menos que input sobrescreva)
    const execucao = await prisma.servicoExecucao.create({
      data: {
        servicoId: input.servicoId,
        clienteId: input.clienteId,
        orcamentoId: input.orcamentoId || null,
        responsavelId: responsavelId || null,
        status: statusInicial,
        prioridade: (input.prioridade as any) ?? servico.prioridadePadrao,
        prazoLimite,
        observacoes: input.observacoes || null,
        empresaId: empresaId || null,
        iniciadoEm,
        processoId: internal?.processoId || null,
        predecessorExecucaoId: internal?.predecessorExecucaoId || null,
        encadeamentoId: internal?.encadeamentoId || null,
      },
    })

    // Pass 1: criar todos os passos da execucao baseados no template.
    // Mantemos um mapa templatePassoId -> execPassoId para depois mapear deps.
    const passoIdMap = new Map<string, string>()
    let ordemGlobal = 0
    for (const etapa of servico.etapas) {
      for (const passo of etapa.passos) {
        const execPasso = await prisma.servicoExecucaoPasso.create({
          data: {
            execucaoId: execucao.id,
            passoId: passo.id,
            etapaNome: etapa.nome,
            passoNome: passo.nome,
            ordem: ordemGlobal++,
            obrigatorio: passo.obrigatorio,
            permiteIgnorar: (passo as any).permiteIgnorar ?? false,
          },
        })
        passoIdMap.set(passo.id, execPasso.id)
      }
    }

    // Pass 2: aplicar dependencias entre execPassos (baseadas nas deps do template).
    // Nao da pra fazer no pass 1 porque o passo dependente pode ainda nao existir.
    for (const etapa of servico.etapas) {
      for (const passo of etapa.passos) {
        if (passo.dependeDoPassoId) {
          const myExecId = passoIdMap.get(passo.id)
          const depExecId = passoIdMap.get(passo.dependeDoPassoId)
          if (myExecId && depExecId) {
            await prisma.servicoExecucaoPasso.update({
              where: { id: myExecId },
              data: { dependeDoExecPassoId: depExecId },
            })
          }
        }
      }
    }

    // Evento timeline
    await this.addEvento(execucao.id, input.responsavelId || undefined, 'criado',
      `Execução criada${input.orcamentoId ? ' a partir de orçamento aprovado' : ''}`)

    // Notificações por email — dispara evento conforme statusInicial.
    // PERGUNTA cai em AGUARDANDO_RESPOSTA (humano responde no painel).
    // EM_ANDAMENTO dispara INICIADA. AGUARDANDO_INICIO não dispara (só
    // quando o gestor confirmar via iniciarSucessorManual).
    if (statusInicial === 'EM_ANDAMENTO') {
      void this.notificacaoService.disparar(execucao.id, 'INICIADA')
    } else if (statusInicial === 'AGUARDANDO_RESPOSTA') {
      void this.notificacaoService.disparar(execucao.id, 'AGUARDANDO_RESPOSTA')
    }

    // Claim-first: notificação no sino pra todos os candidatos. Sem
    // responsavelId, a execução aparece em /meus-servicos de cada candidato;
    // o primeiro a marcar passo reivindica e a execução some dos demais.
    if (claimFirstCandidatos.length > 0) {
      const cliente = await prisma.cliente.findUnique({
        where: { id: input.clienteId },
        select: { razaoSocial: true, nomeFantasia: true },
      }).catch(() => null)
      const clienteNome = cliente?.nomeFantasia || cliente?.razaoSocial || 'cliente'
      void this.notificationService.criarParaUsers(claimFirstCandidatos, {
        titulo: `Novo serviço disponível: ${servico.nome}`,
        mensagem: `${clienteNome} — primeiro a iniciar um passo reivindica.`,
        tipo: 'info',
        origem: 'servicos',
        link: `/meus-servicos?exec=${execucao.id}`,
        empresaId: empresaId || null,
      })
    }

    // SSE — notifica todos os clientes (widget Serviços em Andamento,
    // /meus-servicos) que devem refetchar. Candidatos = todos os usuários que
    // têm visibilidade da execução: responsável direto (se houver) + lista de
    // candidatos do claim-first.
    const candidatosVisibilidade = responsavelId
      ? [responsavelId]
      : claimFirstCandidatos
    this.execEvents.emit({
      type: 'created',
      execucaoId: execucao.id,
      servicoId: input.servicoId,
      empresaId: empresaId || null,
      candidatos: candidatosVisibilidade,
      actorUserId: input.responsavelId || null,
    })

    return this.getExecucao(execucao.id)
  }

  async togglePasso(id: string, userId?: string, valoresCampos?: Record<string, unknown>, camposRevisados?: string[]) {
    const passo = await prisma.servicoExecucaoPasso.findUnique({ where: { id } })
    if (!passo) throw new Error('Passo nao encontrado')

    // Passos ignorados não podem ser concluídos diretamente — usuário precisa
    // primeiro "desfazer ignorar" e depois concluir.
    if ((passo as any).ignorado && !passo.concluido) {
      throw new Error('Este passo está marcado como ignorado. Desfaça o "ignorar" antes de concluí-lo.')
    }

    // Marcando como CONCLUIDO: validar dependencias
    if (!passo.concluido) {
      // 1) Dependência explícita configurada no template (FK dependeDoExecPassoId)
      if (passo.dependeDoExecPassoId) {
        const dep = await prisma.servicoExecucaoPasso.findUnique({
          where: { id: passo.dependeDoExecPassoId },
          select: { concluido: true, passoNome: true },
        })
        if (dep && !(dep.concluido || (dep as any).ignorado)) {
          throw new Error(`Este passo depende de "${dep.passoNome}". Conclua ou ignore o passo anterior primeiro.`)
        }
      }

      // 2) Obrigatoriedade sequencial: passos OBRIGATÓRIOS anteriores (na ordem)
      // devem estar concluídos OU ignorados. Passos opcionais podem ficar pendentes.
      const obrigatoriosPendentes = await prisma.servicoExecucaoPasso.findMany({
        where: {
          execucaoId: passo.execucaoId,
          ordem: { lt: passo.ordem },
          obrigatorio: true,
          concluido: false,
          ignorado: false,
        } as any,
        select: { passoNome: true, ordem: true },
        orderBy: { ordem: 'asc' },
      })
      if (obrigatoriosPendentes.length > 0) {
        const primeiro = obrigatoriosPendentes[0]!
        throw new Error(
          `Existe${obrigatoriosPendentes.length > 1 ? 'm' : ''} ${obrigatoriosPendentes.length} passo${obrigatoriosPendentes.length > 1 ? 's' : ''} obrigatório${obrigatoriosPendentes.length > 1 ? 's' : ''} pendente${obrigatoriosPendentes.length > 1 ? 's' : ''} antes deste. ` +
          `Conclua "${primeiro.passoNome}" primeiro.`,
        )
      }
    }

    const agora = new Date()
    const novoConcluido = !passo.concluido
    // Tracking de tempo: se o passo nao tinha iniciadoEm e ele esta sendo
    // concluido, marca como iniciado tambem (concluiu sem "iniciar" antes).
    const precisaSetarIniciado = novoConcluido && !passo.iniciadoEm
    const tempoGasto = novoConcluido && passo.iniciadoEm
      ? Math.round((agora.getTime() - passo.iniciadoEm.getTime()) / 60000)
      : passo.tempoGastoMinutos

    // Captura de campos do cliente vinculados — quando o passo está concluindo
    // (novoConcluido=true), valida obrigatórios e atualiza Cliente em tx antes
    // de commitar a conclusão. Se o frontend não enviou valoresCampos mas o
    // passo tem campos obrigatórios vinculados, lança erro pra o frontend
    // abrir o modal de captura (orientação: chamar previewCamposClienteDoPasso
    // antes pra saber se precisa do modal).
    if (novoConcluido) {
      const vinculos = await prisma.servicoPassoCampoCliente.findMany({
        where: { passoId: passo.passoId, ativo: true },
        select: { campoChave: true, obrigatorio: true, labelOverride: true },
      })
      const temObrigatorio = vinculos.some(v => v.obrigatorio)
      if (vinculos.length > 0 && !valoresCampos && temObrigatorio) {
        throw new Error('CAPTURA_CAMPOS_OBRIGATORIA')
      }
      if (valoresCampos && vinculos.length > 0) {
        await this.atualizarCamposClienteDoPasso(id, valoresCampos, userId, camposRevisados)
      }
    }

    const updated = await prisma.servicoExecucaoPasso.update({
      where: { id },
      data: {
        concluido: novoConcluido,
        concluidoPor: novoConcluido ? userId || null : null,
        concluidoEm: novoConcluido ? agora : null,
        ...(precisaSetarIniciado ? { iniciadoEm: agora } : {}),
        ...(novoConcluido ? { tempoGastoMinutos: tempoGasto } : {}),
      },
    })

    // Verificar se todos os passos estao concluidos
    const execucao = await prisma.servicoExecucao.findUnique({
      where: { id: passo.execucaoId },
      include: { passos: true },
    })
    const todosConcluidos = execucao && execucao.passos.every(p => p.id === id ? novoConcluido : p.concluido)

    // Claim-first: se a execução está sem responsável e o user marcou um passo
    // (concluindo), ele se torna o responsável. Aplica ao fluxo Legalização
    // (e qualquer execução criada sem responsável definido).
    let reivindicou = false
    if (novoConcluido && userId && execucao && !execucao.responsavelId) {
      await prisma.servicoExecucao.update({
        where: { id: execucao.id },
        data: { responsavelId: userId },
      })
      await this.addEvento(execucao.id, userId, 'reivindicado',
        'Execução reivindicada — primeiro passo iniciado pelo usuário')
      reivindicou = true
    }

    // Eventos na timeline
    await this.addEvento(
      passo.execucaoId, userId,
      novoConcluido ? 'passo_concluido' : 'passo_reaberto',
      `${novoConcluido ? 'Concluiu' : 'Reabriu'} passo "${passo.passoNome}"`,
    )

    // SSE — notifica clientes (widget, /meus-servicos) que devem refetchar.
    // Emitir SEM candidatos (lista vazia) faz o cliente filtrar por
    // empresaId — todos os usuários da empresa refetcham e o backend devolve
    // a realidade atualizada pra cada um (quem não é mais candidato perde
    // visibilidade da execução claim-first reivindicada).
    if (execucao) {
      this.execEvents.emit({
        type: reivindicou ? 'claimed' : (novoConcluido ? 'passo_concluido' : 'passo_reaberto'),
        execucaoId: execucao.id,
        servicoId: execucao.servicoId,
        empresaId: execucao.empresaId,
        candidatos: [],
        actorUserId: userId || null,
      })
    }

    if (todosConcluidos && execucao) {
      await this.finalizarExecucaoComCascata(
        {
          id: execucao.id,
          status: execucao.status,
          orcamentoId: execucao.orcamentoId,
          servicoId: execucao.servicoId,
          clienteId: execucao.clienteId,
          responsavelId: execucao.responsavelId,
          empresaId: execucao.empresaId,
          processoId: (execucao as any).processoId ?? null,
          predecessorExecucaoId: (execucao as any).predecessorExecucaoId ?? null,
        },
        userId,
        agora,
        'Todos os passos concluídos — execução finalizada',
      )
    } else if (execucao && execucao.status === 'CONCLUIDO') {
      // Reabrir se desmarcou um passo
      await prisma.servicoExecucao.update({
        where: { id: execucao.id },
        data: { status: 'EM_ANDAMENTO', concluidoEm: null },
      })
      await this.addEvento(execucao.id, userId, 'execucao_reaberta', 'Execução reaberta — passo desmarcado após conclusão')
    }

    // E-mail templates do passo — disparados na CONCLUSÃO (não na reabertura).
    // Templates com exigirConfirmacao=false vão direto. Os que exigem
    // confirmação são retornados no response pra o frontend abrir modal.
    let emailsPendentesConfirmacao: Array<{
      id: string; nome: string; assunto: string; corpo: string; destinatarios: string[]
    }> = []
    if (novoConcluido) {
      const renderizados = await this.previewEmailsDoPasso(id)
      const automaticos = renderizados.filter(r => !r.exigirConfirmacao)
      emailsPendentesConfirmacao = renderizados
        .filter(r => r.exigirConfirmacao)
        .map(({ exigirConfirmacao: _, ...rest }) => rest)
      if (automaticos.length > 0) {
        void this.enviarEmailsDoPasso(id, {
          somenteTemplateIds: automaticos.map(a => a.id),
        })
      }
      // Lembretes do passo — dispara silenciosamente, criando eventos na agenda
      // corporativa com data = hoje + offset. Falhas individuais são logadas e
      // não interrompem o togglePasso.
      if (userId) {
        void this.dispararLembretesDoPasso(id, userId)
      }
    }

    return { ...updated, emailsPendentesConfirmacao }
  }

  async updatePassoObs(id: string, observacao: string) {
    return prisma.servicoExecucaoPasso.update({ where: { id }, data: { observacao } })
  }

  /**
   * Marca um passo como "ignorado". Só permitido se o passo tem permiteIgnorar=true
   * no snapshot. Passos ignorados desbloqueiam os próximos sem terem sido concluídos
   * e contam como fechados para fins de finalização da execução.
   */
  async ignorarPasso(id: string, motivo: string | null, userId?: string) {
    const passo = await prisma.servicoExecucaoPasso.findUnique({ where: { id } })
    if (!passo) throw new Error('Passo não encontrado')
    if (passo.concluido) {
      throw new Error('Este passo já foi concluído. Não é possível ignorá-lo.')
    }
    if ((passo as any).ignorado) {
      throw new Error('Este passo já está marcado como ignorado.')
    }
    if (!(passo as any).permiteIgnorar) {
      throw new Error('Este passo não pode ser ignorado.')
    }
    const agora = new Date()
    const updated = await prisma.servicoExecucaoPasso.update({
      where: { id },
      data: {
        ignorado: true,
        ignoradoPor: userId || null,
        ignoradoEm: agora,
        ignoradoMotivo: motivo?.trim() || null,
      } as any,
    })
    await this.addEvento(passo.execucaoId, userId, 'passo_ignorado',
      `Passo "${passo.passoNome}" ignorado${motivo ? ` — ${motivo}` : ''}`)
    return updated
  }

  /**
   * Desfaz o "ignorado" — passo volta ao estado pendente.
   */
  async desfazerIgnorarPasso(id: string, userId?: string) {
    const passo = await prisma.servicoExecucaoPasso.findUnique({ where: { id } })
    if (!passo) throw new Error('Passo não encontrado')
    if (!(passo as any).ignorado) {
      throw new Error('Este passo não está ignorado.')
    }
    const updated = await prisma.servicoExecucaoPasso.update({
      where: { id },
      data: {
        ignorado: false,
        ignoradoPor: null,
        ignoradoEm: null,
        ignoradoMotivo: null,
      } as any,
    })
    await this.addEvento(passo.execucaoId, userId, 'passo_designorado',
      `Passo "${passo.passoNome}" deixou de ser ignorado`)
    return updated
  }

  async concluirExecucao(id: string, userId?: string) {
    // Bloqueia conclusão se houver algum passo obrigatório pendente (não concluído E não
    // ignorado) — defesa contra chamadas diretas (sem passar pelo frontend, que já desabilita
    // o botão). Passos ignorados contam como "fechados" para fins de conclusão.
    const pendentes = await prisma.servicoExecucaoPasso.count({
      where: { execucaoId: id, obrigatorio: true, concluido: false, ignorado: false } as any,
    })
    if (pendentes > 0) {
      throw new Error(`Não é possível concluir: ${pendentes} passo${pendentes > 1 ? 's' : ''} obrigatório${pendentes > 1 ? 's' : ''} ainda pendente${pendentes > 1 ? 's' : ''}.`)
    }
    const exec = await prisma.servicoExecucao.findUnique({
      where: { id },
      select: {
        id: true, status: true, orcamentoId: true, servicoId: true, clienteId: true,
        responsavelId: true, empresaId: true, processoId: true, predecessorExecucaoId: true,
      },
    })
    if (!exec) throw new Error('Execução não encontrada')
    return this.finalizarExecucaoComCascata(exec, userId, new Date(), 'Execução finalizada manualmente')
  }

  /**
   * Responde a um bloco PERGUNTA. Valida que a execução está pausada esperando
   * resposta, que as opções escolhidas existem na lista do template, que a
   * cardinalidade bate com perguntaMulti, grava ProcessoRespostaPergunta,
   * marca execução CONCLUIDO e dispara só os sucessores cujo rotulo casa com
   * alguma opção escolhida.
   */
  async responderPergunta(
    input: { execucaoId: string; opcoes: string[]; observacao?: string | null },
    userId?: string,
  ) {
    const exec = await prisma.servicoExecucao.findUnique({
      where: { id: input.execucaoId },
      select: {
        id: true, status: true, orcamentoId: true, servicoId: true, clienteId: true,
        responsavelId: true, empresaId: true, processoId: true, predecessorExecucaoId: true,
        servico: {
          select: {
            id: true, tipo: true, nome: true,
            perguntaTexto: true, perguntaOpcoes: true, perguntaMulti: true,
          },
        },
      },
    })
    if (!exec) throw new Error('Execução não encontrada')
    if (exec.servico.tipo !== 'PERGUNTA') {
      throw new Error('Esta execução não é de um bloco PERGUNTA')
    }
    if (exec.status !== 'AGUARDANDO_RESPOSTA') {
      throw new Error(`Execução não está aguardando resposta — status atual: ${exec.status}`)
    }
    const opcoesValidas = (exec.servico.perguntaOpcoes as string[] | null) ?? []
    if (opcoesValidas.length === 0) {
      throw new Error('Template do bloco PERGUNTA sem opções configuradas')
    }
    const escolhidasUnicas = Array.from(new Set(input.opcoes.map(s => s.trim()).filter(Boolean)))
    if (escolhidasUnicas.length === 0) {
      throw new Error('Nenhuma opção informada')
    }
    if (!exec.servico.perguntaMulti && escolhidasUnicas.length > 1) {
      throw new Error('Este bloco aceita escolha única — não pode marcar várias opções')
    }
    const lowerValidas = opcoesValidas.map(o => o.trim().toLowerCase())
    const invalidas = escolhidasUnicas.filter(e => !lowerValidas.includes(e.toLowerCase()))
    if (invalidas.length > 0) {
      throw new Error(`Opções inválidas: ${invalidas.join(', ')}`)
    }

    // Persiste resposta (snapshot do texto e opções) e finaliza com cascata filtrada
    const agora = new Date()
    await prisma.processoRespostaPergunta.create({
      data: {
        processoId: exec.processoId,
        execucaoId: exec.id,
        servicoId: exec.servico.id,
        perguntaSnapshot: exec.servico.perguntaTexto ?? '',
        opcoesSnapshot: opcoesValidas as any,
        opcoesEscolhidas: escolhidasUnicas as any,
        respondidoPor: userId ?? null,
        respondidoEm: agora,
        observacao: input.observacao || null,
      },
    })
    if (exec.processoId) {
      await this.processoService.addEvento(
        exec.processoId, userId, 'resposta_pergunta',
        `Resposta a "${exec.servico.nome}": ${escolhidasUnicas.join(', ')}`,
        { execucaoId: exec.id, opcoes: escolhidasUnicas, observacao: input.observacao ?? null },
      )
    }

    const descricaoEvento = `Bloco PERGUNTA respondido: ${escolhidasUnicas.join(', ')}`
    return this.finalizarExecucaoComCascata(exec, userId, agora, descricaoEvento, escolhidasUnicas)
  }

  /**
   * Marca a execução como CONCLUIDO, registra evento na timeline, dispara as
   * cascatas:
   *
   *  1. **Orçamento → FINALIZADO** (decisão 1a — apenas a execução-raiz finaliza
   *     o orçamento; sucessores de cadeia herdam orcamentoId mas não disparam).
   *  2. **Cria execuções sucessoras** definidas em ServicoEncadeamento (DAG no
   *     template). Avalia condicionais; status inicial decidido por iniciaAuto/obrigatorio.
   *  3. **Recalcula status do Processo** (se a execução faz parte de um) —
   *     marca como CONCLUIDO quando todas execuções da cadeia atingirem estado terminal.
   *
   * Idempotente: se o status já era CONCLUIDO, garante apenas as cascatas
   * dependentes (não duplica evento principal nem cria sucessores novamente).
   */
  private async finalizarExecucaoComCascata(
    exec: {
      id: string
      status: string
      orcamentoId: string | null
      servicoId: string
      clienteId: string
      responsavelId: string | null
      empresaId: string | null
      processoId: string | null
      predecessorExecucaoId: string | null
    },
    userId: string | undefined,
    agora: Date,
    descricaoEvento: string,
    /** Quando informado, filtra encadeamentos pelo rotulo (usado por responderPergunta). */
    filtroRotulos?: string[] | null,
  ) {
    const jaEstavaConcluida = exec.status === 'CONCLUIDO'
    const updated = jaEstavaConcluida
      ? await prisma.servicoExecucao.findUnique({ where: { id: exec.id } })
      : await prisma.servicoExecucao.update({
          where: { id: exec.id },
          data: { status: 'CONCLUIDO', concluidoEm: agora },
        })
    if (!jaEstavaConcluida) {
      await this.addEvento(exec.id, userId, 'concluido', descricaoEvento)
      // Notificações por email — evento CONCLUIDA. Dispara só na primeira vez
      // (idempotência: chamadas repetidas pra mesma execução não duplicam).
      void this.notificacaoService.disparar(exec.id, 'CONCLUIDA')
    }

    // 1) Orcamento → FINALIZADO (so a raiz da cadeia, decisao 1a)
    //    Sucessores de cadeia herdam orcamentoId mas NAO devem refinalizar o
    //    orcamento. A diferenca eh predecessorExecucaoId: raiz nao tem.
    //
    //    A FSM eh APROVADO → LIBERADO → FINALIZADO. No fluxo manual, o gestor
    //    move LIBERADO ao iniciar a execucao. Aqui, o trigger eh automatico —
    //    a execucao ja rodou. Pulamos APROVADO → LIBERADO silenciosamente
    //    (sem disparar email "Liberado para execucao", que faria sentido apenas
    //    no inicio) e logo em seguida LIBERADO → FINALIZADO normal (com email
    //    de finalizacao para o cliente + criacao da pesquisa NPS).
    if (exec.orcamentoId && !exec.predecessorExecucaoId) {
      try {
        const orc = await prisma.orcamento.findUnique({
          where: { id: exec.orcamentoId },
          select: { status: true },
        })
        if (orc?.status === 'APROVADO') {
          await this.orcamentoService.changeStatus(
            exec.orcamentoId, 'LIBERADO', userId,
            { skipNotifications: true },
          )
        }
        // Re-busca o status pos-LIBERADO (pode ter saltado o passo acima
        // se o gestor ja havia movido manualmente).
        const orcAtual = await prisma.orcamento.findUnique({
          where: { id: exec.orcamentoId },
          select: { status: true },
        })
        if (orcAtual && orcAtual.status === 'LIBERADO') {
          await this.orcamentoService.changeStatus(exec.orcamentoId, 'FINALIZADO', userId)
        }
      } catch (e) {
        console.warn('[Servico] Falha ao finalizar orçamento vinculado:', (e as Error).message)
      }
    }

    // 2) Cria sucessores via ServicoEncadeamento (so na primeira vez —
    //    se ja estava concluida e essa funcao foi rechamada idempotentemente,
    //    nao queremos criar sucessores duplicados).
    if (!jaEstavaConcluida) {
      try {
        await this.criarExecucoesSucessoras(exec, userId, filtroRotulos)
      } catch (e) {
        console.warn('[Servico] Falha ao criar sucessores:', (e as Error).message)
      }
    }

    // 3) Recalcula status do Processo (se a execucao faz parte de um).
    //    Se todas execucoes do processo estao em estado terminal, processo
    //    vai para CONCLUIDO.
    if (exec.processoId) {
      try {
        await this.processoService.recalcularStatus(exec.processoId, userId)
      } catch (e) {
        console.warn('[Servico] Falha ao recalcular processo:', (e as Error).message)
      }
    }

    return updated
  }

  /**
   * Cria as execucoes sucessoras definidas em ServicoEncadeamento partindo da
   * execucao predecessora. Para cada aresta:
   *
   *  - Avalia a condicao (se houver) contra cliente+orcamento — se falsa, pula
   *    e registra evento "sucessor_pulado_condicao" no processo.
   *  - Decide status inicial:
   *    - iniciaAuto=true && obrigatorio=true → EM_ANDAMENTO
   *    - caso contrario → AGUARDANDO_INICIO (gestor confirma manualmente)
   *  - Herda responsavel se herdaResponsavel=true.
   *  - Herda clienteId, orcamentoId, empresaId, processoId do predecessor.
   *  - Vincula via predecessorExecucaoId + encadeamentoId para rastreabilidade.
   *
   * Os sucessores rodam em paralelo (decisao 3b) — todas as arestas elegiveis
   * geram execucoes ao mesmo tempo, sem ordem entre elas.
   */
  private async criarExecucoesSucessoras(
    predecessor: {
      id: string
      servicoId: string
      clienteId: string
      orcamentoId: string | null
      responsavelId: string | null
      empresaId: string | null
      processoId: string | null
    },
    userId?: string,
    /** Quando informado, filtra encadeamentos pelo rotulo (case-insensitive).
     *  Usado pela resposta de bloco PERGUNTA — só dispara sucessores cujo
     *  rotulo casa com alguma opção escolhida pelo gestor. */
    filtroRotulos?: string[] | null,
  ) {
    const encadeamentos = await prisma.servicoEncadeamento.findMany({
      where: { servicoOrigemId: predecessor.servicoId },
      orderBy: { ordem: 'asc' },
      include: { servicoDestino: { select: { id: true, nome: true, tipo: true } } },
    })
    if (encadeamentos.length === 0) return

    const rotulosNormalizados = filtroRotulos?.map(r => r.trim().toLowerCase()) ?? null

    // Carrega contexto p/ avaliar condicoes — uma unica query
    const ctx = await this.carregarContextoCondicao(predecessor.clienteId, predecessor.orcamentoId)

    for (const enc of encadeamentos) {
      // 0) Filtro por rotulo (resposta de PERGUNTA) — descarta arestas sem rotulo
      //    ou cujo rotulo nao casa com nenhuma opção escolhida.
      if (rotulosNormalizados) {
        const r = enc.rotulo?.trim().toLowerCase()
        if (!r || !rotulosNormalizados.includes(r)) {
          if (predecessor.processoId) {
            await this.processoService.addEvento(
              predecessor.processoId, userId, 'sucessor_pulado_rotulo',
              `Sucessor "${enc.servicoDestino.nome}" não disparado (rótulo "${enc.rotulo ?? '—'}" não está entre opções escolhidas)`,
              { encadeamentoId: enc.id, predecessorExecucaoId: predecessor.id, rotulo: enc.rotulo },
            )
          }
          continue
        }
      }

      // 1) Condicao (se houver)
      const condicao = enc.condicao as Condicao | null | undefined
      if (condicao && !avaliarCondicao(condicao, ctx)) {
        if (predecessor.processoId) {
          await this.processoService.addEvento(
            predecessor.processoId, userId, 'sucessor_pulado_condicao',
            `Sucessor "${enc.servicoDestino.nome}" não criado (condição não atendida)`,
            { encadeamentoId: enc.id, predecessorExecucaoId: predecessor.id, servicoDestinoId: enc.servicoDestinoId },
          )
        }
        continue
      }

      // 2) Status inicial — PERGUNTA sempre pausa, ignorando iniciaAuto/obrigatorio.
      const statusInicial: 'EM_ANDAMENTO' | 'AGUARDANDO_INICIO' | 'AGUARDANDO_RESPOSTA' =
        enc.servicoDestino.tipo === 'PERGUNTA'
          ? 'AGUARDANDO_RESPOSTA'
          : (enc.iniciaAuto && enc.obrigatorio) ? 'EM_ANDAMENTO' : 'AGUARDANDO_INICIO'

      // 3) Heranca de responsavel
      const responsavelId = enc.herdaResponsavel ? predecessor.responsavelId : null

      // 4) Cria execucao sucessora
      const novaExec = await this.createExecucao(
        {
          servicoId: enc.servicoDestinoId,
          clienteId: predecessor.clienteId,
          orcamentoId: predecessor.orcamentoId || undefined,
          responsavelId: responsavelId || undefined,
        },
        predecessor.empresaId || undefined,
        {
          processoId: predecessor.processoId,
          predecessorExecucaoId: predecessor.id,
          encadeamentoId: enc.id,
          statusInicial,
        },
      )

      // 5) Evento no processo (se houver)
      if (predecessor.processoId && novaExec) {
        const motivoLabel =
          statusInicial === 'EM_ANDAMENTO' ? 'iniciada automaticamente' :
          statusInicial === 'AGUARDANDO_RESPOSTA' ? 'aguardando resposta humana (bloco PERGUNTA)' :
          'aguardando início'
        await this.processoService.addEvento(
          predecessor.processoId, userId, 'execucao_criada',
          `Execução de "${enc.servicoDestino.nome}" criada (${motivoLabel})`,
          { execucaoId: novaExec.id, encadeamentoId: enc.id, statusInicial },
        )
      }
    }
  }

  /** Carrega cliente + orcamento (campos do DSL) numa unica viagem ao banco. */
  private async carregarContextoCondicao(clienteId: string, orcamentoId: string | null) {
    const [cliente, orcamento] = await Promise.all([
      prisma.cliente.findUnique({
        where: { id: clienteId },
        select: { regime: true, situacao: true, tributacao: true, categoria: true, tipoCliente: true },
      }),
      orcamentoId
        ? prisma.orcamento.findUnique({
            where: { id: orcamentoId },
            select: { tipo: true, totalGeral: true },
          })
        : Promise.resolve(null),
    ])
    return { cliente, orcamento }
  }

  async cancelarExecucao(id: string) {
    const result = await prisma.servicoExecucao.update({
      where: { id },
      data: { status: 'CANCELADO', concluidoEm: new Date() },
    })
    void this.notificacaoService.disparar(id, 'CANCELADA')
    return result
  }

  /**
   * Retorna o "impacto" do cancelamento — usado pelo frontend pra montar o
   * confirm dialog antes de cancelar uma execução vinda de orçamento/CRM.
   * Inclui apenas referências que existem (orçamento+oportunidade vinculados).
   */
  async getCancelamentoImpacto(id: string) {
    const exec = await prisma.servicoExecucao.findUnique({
      where: { id },
      select: {
        id: true, status: true, orcamentoId: true,
        servico: { select: { nome: true } },
        cliente: { select: { id: true, razaoSocial: true, nomeFantasia: true } },
      },
    })
    if (!exec) throw new Error('Execução não encontrada')

    // ServicoExecucao não tem relation direta com Orcamento — query separada.
    // Idem Orcamento↔Oportunidade (só FK oportunidadeId).
    let orcamentoInfo: { id: string; numero: number; status: string } | null = null
    let oportunidadeInfo: { id: string; titulo: string } | null = null
    if (exec.orcamentoId) {
      const orc = await prisma.orcamento.findUnique({
        where: { id: exec.orcamentoId },
        select: { id: true, numero: true, status: true, oportunidadeId: true },
      })
      if (orc) {
        orcamentoInfo = { id: orc.id, numero: orc.numero, status: orc.status }
        if (orc.oportunidadeId) {
          const op = await prisma.oportunidade.findUnique({
            where: { id: orc.oportunidadeId },
            select: { id: true, titulo: true },
          })
          if (op) oportunidadeInfo = { id: op.id, titulo: op.titulo }
        }
      }
    }

    return {
      servicoNome: exec.servico?.nome ?? null,
      clienteNome: exec.cliente?.nomeFantasia || exec.cliente?.razaoSocial || null,
      orcamento: orcamentoInfo,
      oportunidade: oportunidadeInfo,
    }
  }

  // ── Sucessores aguardando confirmacao manual (Fase 6) ────
  // Quando um encadeamento foi configurado com iniciaAuto=false ou obrigatorio=false,
  // a execucao sucessora eh criada em status AGUARDANDO_INICIO. O gestor pode
  // entao iniciar (vai para EM_ANDAMENTO + recalcula SLA) ou pular (PULADO,
  // se sucessor opcional). Ao pular, recalcula status do processo (pode finalizar
  // a cadeia se for o ultimo elo pendente).

  async iniciarSucessorManual(execucaoId: string, userId?: string) {
    const exec = await prisma.servicoExecucao.findUnique({
      where: { id: execucaoId },
      include: { servico: { select: { slaHoras: true, nome: true } } },
    })
    if (!exec) throw new Error('Execução não encontrada')
    if (exec.status !== 'AGUARDANDO_INICIO') {
      throw new Error('Esta execução não está aguardando início — status atual: ' + exec.status)
    }
    const agora = new Date()
    // Recalcula prazoLimite com base no SLA do template, contando a partir de agora
    // (SLA nao correu enquanto a execucao estava AGUARDANDO_INICIO).
    const prazoLimite = exec.servico.slaHoras
      ? new Date(agora.getTime() + exec.servico.slaHoras * 60 * 60 * 1000)
      : null
    const updated = await prisma.servicoExecucao.update({
      where: { id: execucaoId },
      data: { status: 'EM_ANDAMENTO', iniciadoEm: agora, prazoLimite },
    })
    await this.addEvento(execucaoId, userId, 'iniciado', 'Execução iniciada manualmente pelo gestor')
    if (exec.processoId) {
      await this.processoService.addEvento(
        exec.processoId, userId, 'sucessor_iniciado_manual',
        `Execução de "${exec.servico.nome}" iniciada manualmente`,
        { execucaoId },
      )
    }
    return updated
  }

  async pularSucessorOpcional(execucaoId: string, motivo: string | null, userId?: string) {
    const exec = await prisma.servicoExecucao.findUnique({
      where: { id: execucaoId },
      include: {
        servico:      { select: { nome: true } },
        encadeamento: { select: { obrigatorio: true } },
      },
    })
    if (!exec) throw new Error('Execução não encontrada')
    if (exec.status !== 'AGUARDANDO_INICIO') {
      throw new Error('Esta execução não está aguardando início — status atual: ' + exec.status)
    }
    // Guard: só pode pular se o encadeamento original era opcional. Sucessores
    // obrigatorios criados em AGUARDANDO_INICIO (porque iniciaAuto=false) não
    // podem ser pulados — gestor TEM que iniciar.
    if (exec.encadeamento && exec.encadeamento.obrigatorio) {
      throw new Error('Sucessor obrigatório não pode ser pulado. Use "Iniciar" para começar a execução.')
    }
    const agora = new Date()
    const updated = await prisma.servicoExecucao.update({
      where: { id: execucaoId },
      data: { status: 'PULADO', concluidoEm: agora },
    })
    await this.addEvento(
      execucaoId, userId, 'pulado',
      `Execução pulada${motivo ? ` — ${motivo}` : ''}`,
    )
    if (exec.processoId) {
      await this.processoService.addEvento(
        exec.processoId, userId, 'sucessor_pulado_manual',
        `Execução de "${exec.servico.nome}" pulada${motivo ? `: ${motivo}` : ''}`,
        { execucaoId, motivo },
      )
      // Pular pode ser o último elo pendente — recalcula status do processo
      await this.processoService.recalcularStatus(exec.processoId, userId)
    }
    return updated
  }

  // ── Fase 4 — Colaboracao ─────────────────────────────────

  /**
   * Pausa a execucao com motivo. Recalcula o prazoLimite ao retomar pra
   * "descontar" o tempo pausado (SLA nao corre durante pausa).
   */
  async pausarExecucao(id: string, motivo: string, userId?: string) {
    const exec = await prisma.servicoExecucao.findUnique({ where: { id } })
    if (!exec) throw new Error('Execucao nao encontrada')
    if (exec.pausado) throw new Error('Execucao ja esta pausada')
    const updated = await prisma.servicoExecucao.update({
      where: { id },
      data: { pausado: true, pausadoEm: new Date(), pausadoPor: userId || null, pausadoMotivo: motivo },
    })
    await this.addEvento(id, userId, 'pausado', `Execução pausada: ${motivo}`)
    void this.notificacaoService.disparar(id, 'PAUSADA')
    return updated
  }

  async retomarExecucao(id: string, userId?: string) {
    const exec = await prisma.servicoExecucao.findUnique({ where: { id } })
    if (!exec) throw new Error('Execucao nao encontrada')
    if (!exec.pausado || !exec.pausadoEm) throw new Error('Execucao nao esta pausada')
    // Recalcula prazoLimite estendendo pelo tempo de pausa
    const tempoPausadoMs = Date.now() - exec.pausadoEm.getTime()
    const novoPrazo = exec.prazoLimite
      ? new Date(exec.prazoLimite.getTime() + tempoPausadoMs)
      : null
    const updated = await prisma.servicoExecucao.update({
      where: { id },
      data: {
        pausado: false,
        pausadoEm: null,
        pausadoPor: null,
        pausadoMotivo: null,
        prazoLimite: novoPrazo,
      },
    })
    const horasPausa = Math.round(tempoPausadoMs / (60 * 60 * 1000))
    await this.addEvento(id, userId, 'retomado', `Execução retomada após ${horasPausa}h de pausa`)
    return updated
  }

  // ── Comentarios por passo ──
  async listComentariosPasso(execPassoId: string) {
    const items = await prisma.servicoExecucaoPassoComentario.findMany({
      where: { execPassoId },
      orderBy: { createdAt: 'asc' },
    })
    // Enriquece com dados do usuario
    const userIds = [...new Set(items.map(c => c.userId).filter(Boolean) as string[])]
    const users = userIds.length > 0
      ? await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true, image: true } })
      : []
    const map = new Map(users.map(u => [u.id, u]))
    return items.map(c => ({ ...c, usuario: c.userId ? map.get(c.userId) || null : null }))
  }

  async addComentarioPasso(execPassoId: string, mensagem: string, userId?: string) {
    const passo = await prisma.servicoExecucaoPasso.findUnique({
      where: { id: execPassoId },
      select: { execucaoId: true, passoNome: true },
    })
    if (!passo) throw new Error('Passo nao encontrado')
    const created = await prisma.servicoExecucaoPassoComentario.create({
      data: { execPassoId, userId: userId || null, mensagem },
    })
    await this.addEvento(passo.execucaoId, userId, 'comentario', `Comentário em "${passo.passoNome}"`)
    return created
  }

  async deleteComentarioPasso(id: string) {
    return prisma.servicoExecucaoPassoComentario.delete({ where: { id } })
  }

  // ── Anexos por passo ──
  async listAnexosPasso(execPassoId: string) {
    return prisma.servicoExecucaoPassoAnexo.findMany({
      where: { execPassoId },
      orderBy: { createdAt: 'desc' },
    })
  }

  async addAnexoPasso(input: { execPassoId: string; fileName: string; fileUrl: string; fileSize?: number | null; mimeType?: string | null }, userId?: string) {
    const passo = await prisma.servicoExecucaoPasso.findUnique({
      where: { id: input.execPassoId },
      select: { execucaoId: true, passoNome: true },
    })
    if (!passo) throw new Error('Passo nao encontrado')
    const created = await prisma.servicoExecucaoPassoAnexo.create({
      data: {
        execPassoId: input.execPassoId,
        fileName: input.fileName,
        fileUrl: input.fileUrl,
        fileSize: input.fileSize ?? null,
        mimeType: input.mimeType ?? null,
        userId: userId || null,
      },
    })
    await this.addEvento(passo.execucaoId, userId, 'anexo', `Anexo "${input.fileName}" em "${passo.passoNome}"`)
    return created
  }

  async deleteAnexoPasso(id: string) {
    return prisma.servicoExecucaoPassoAnexo.delete({ where: { id } })
  }

  // ── Watchers ──
  async listWatchers(execucaoId: string) {
    const items = await prisma.servicoExecucaoWatcher.findMany({
      where: { execucaoId },
      orderBy: { createdAt: 'asc' },
    })
    const userIds = items.map(w => w.userId)
    const users = userIds.length > 0
      ? await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true, email: true, image: true } })
      : []
    const map = new Map(users.map(u => [u.id, u]))
    return items.map(w => ({ ...w, usuario: map.get(w.userId) || null }))
  }

  async addWatcher(execucaoId: string, userId: string) {
    // upsert silencioso — se ja existe, nao falha
    return prisma.servicoExecucaoWatcher.upsert({
      where: { execucaoId_userId: { execucaoId, userId } },
      update: {},
      create: { execucaoId, userId },
    })
  }

  async removeWatcher(execucaoId: string, userId: string) {
    return prisma.servicoExecucaoWatcher.delete({
      where: { execucaoId_userId: { execucaoId, userId } },
    })
  }

  // ── Eventos (timeline) ──
  async listEventos(execucaoId: string) {
    const items = await prisma.servicoExecucaoEvento.findMany({
      where: { execucaoId },
      orderBy: { createdAt: 'desc' },
    })
    const userIds = [...new Set(items.map(e => e.userId).filter(Boolean) as string[])]
    const users = userIds.length > 0
      ? await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true, image: true } })
      : []
    const map = new Map(users.map(u => [u.id, u]))
    return items.map(e => ({ ...e, usuario: e.userId ? map.get(e.userId) || null : null }))
  }

  /** Helper interno — registra evento na timeline da execucao. Fire-and-forget. */
  private async addEvento(execucaoId: string, userId: string | undefined, tipo: string, descricao: string) {
    return prisma.servicoExecucaoEvento.create({
      data: { execucaoId, userId: userId || null, tipo, descricao },
    }).catch((e: Error) => {
      console.warn('[Servico] Falha ao registrar evento:', e.message)
    })
  }

  /**
   * Lista execucoes visiveis para o usuario logado no painel "Meus Servicos".
   *
   * Regras de visibilidade (qualquer uma satisfazendo libera a execucao):
   *  1. **Master / Diretor / Coordenador**: ve todas as execucoes da empresa
   *  2. **Responsavel direto** (ServicoExecucao.responsavelId == userId)
   *  3. **Responsavel pelo cliente na area** — usuario eh responsavel
   *     em ClienteAreaContratada do cliente da execucao, e a area do
   *     responsavel da execucao bate com a area da contratacao
   *  4. **Lider da area do responsavel** — usuario lidera a area
   *     onde o responsavel da execucao esta lotado (Area.leaderId == userId)
   *  5. **Responsavel pelo orcamento que originou a execucao**
   */
  async listMeusServicos(userId: string, filters?: { status?: string; atrasados?: boolean; incluirArquivados?: boolean }) {
    const agora = new Date()

    // Carrega user com info de role/profile pra decidir scope + área (id + nome).
    // areaId entra nas regras novas de atribuição multi-valor; areaName mantém
    // o claim-first legado (que continua valendo para serviços sem config nova).
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true, role: true, isMaster: true, empresaId: true,
        areaId: true,
        area: { select: { name: true } },
      },
    })
    if (!user) return []
    const callerAreaId = user.areaId ?? null
    const callerAreaName = user.area?.name ?? null

    // Carrega config de dias de exibicao de concluidas (master configura em /servicos/configuracoes)
    const cfg = await this.getMeusServicosConfig()
    const limiteConcluidas = new Date(agora.getTime() - cfg.concluidosDiasExibicao * 24 * 60 * 60 * 1000)

    // Filtros base (status / atrasados) — aplicados em todos os caminhos
    const filtroStatus: any = {}
    if (filters?.status) filtroStatus.status = filters.status
    if (filters?.atrasados) {
      filtroStatus.status = 'EM_ANDAMENTO'
      filtroStatus.prazoLimite = { lt: agora }
    }
    // Regra automatica: execucoes CONCLUIDAS/CANCELADAS antigas (concluidoEm < limite)
    // saem da listagem padrao. Tambem excluimos arquivadas manualmente, exceto quando
    // o filtro `incluirArquivados` foi explicitamente ativado.
    const filtroJanela: any = filters?.incluirArquivados
      ? {}
      : {
          AND: [
            // Nao mostra arquivadas
            { arquivado: false },
            // Concluidas/canceladas mais antigas que a janela ficam ocultas; em andamento sempre visiveis
            {
              OR: [
                { status: { notIn: ['CONCLUIDO', 'CANCELADO'] } },
                { concluidoEm: { gte: limiteConcluidas } },
              ],
            },
          ],
        }

    let where: any
    const isPriv = user.isMaster || user.role === 'DIRETOR' || user.role === 'COORDENADOR'
    if (isPriv) {
      // Master/Diretor/Coordenador: ve tudo da empresa (orfas tambem para nao perder legado)
      where = {
        ...filtroStatus,
        ...(user.empresaId ? { OR: [{ empresaId: user.empresaId }, { empresaId: null }] } : {}),
      }
    } else {
      // Caso geral: agrega IDs visiveis em paralelo
      const [ledAreas, areasResponsavel, orcamentos] = await Promise.all([
        // 4. Areas que userX lidera
        prisma.area.findMany({
          where: { leaderId: userId },
          select: { id: true },
        }),
        // 3. Pares (clienteId, areaId, areaName) onde userX eh responsavel pelo
        // cliente em uma area. areaName usado pra matchar servico.categoria nas
        // execuções vindas com flag `atribuicaoUsaClienteArea`.
        prisma.clienteAreaContratada.findMany({
          where: { responsavelId: userId },
          select: {
            clienteId: true, areaId: true,
            area: { select: { name: true } },
          },
        }),
        // 5. Orcamentos onde userX eh responsavel
        prisma.orcamento.findMany({
          where: { responsavelId: userId },
          select: { id: true },
        }),
      ])
      const ledAreaIds = ledAreas.map(a => a.id)
      const orcamentoIds = orcamentos.map(o => o.id)

      const orClauses: any[] = [
        // 2. Responsavel direto
        { responsavelId: userId },
      ]
      if (ledAreaIds.length > 0) {
        // 4. Lider da area do responsavel da execucao
        orClauses.push({ responsavel: { areaId: { in: ledAreaIds } } })
      }
      if (areasResponsavel.length > 0) {
        // 3. Para cada par (cliente, area), execucoes do cliente cujo
        // responsavel esta na area da contratacao. Cria uma clausula OR
        // por par pra preservar o emparelhamento (cliente E area juntos).
        for (const par of areasResponsavel) {
          orClauses.push({
            clienteId: par.clienteId,
            responsavel: { areaId: par.areaId },
          })
        }
      }
      if (orcamentoIds.length > 0) {
        // 5. Execucoes vindas de orcamento sob responsabilidade do user
        orClauses.push({ orcamentoId: { in: orcamentoIds } })
      }
      if (callerAreaName) {
        // 6. Claim-first do setor (LEGADO): execuções sem responsável cuja
        //    categoria do serviço bate com a área do user. Coberto pela regra
        //    8 abaixo para serviços migrados; mantido como fallback para
        //    serviços ainda sem `atribuicaoAreas` set.
        orClauses.push({
          responsavelId: null,
          servico: { categoria: { equals: callerAreaName, mode: 'insensitive' } },
        })
      }

      // ── Regras novas (atribuição multi-valor) ──
      // Todas filtram execuções sem responsavelId — claim-first via togglePasso.
      // 7. User explicitamente listado em atribuicaoColaboradores
      orClauses.push({
        responsavelId: null,
        servico: { atribuicaoColaboradores: { has: userId } },
      })
      // 8. User pertence a uma área listada em atribuicaoAreas
      if (callerAreaId) {
        orClauses.push({
          responsavelId: null,
          servico: { atribuicaoAreas: { has: callerAreaId } },
        })
      }
      // 9. Flag atribuicaoUsaOrcamento + user é responsável do orçamento origem
      if (orcamentoIds.length > 0) {
        orClauses.push({
          responsavelId: null,
          orcamentoId: { in: orcamentoIds },
          servico: { atribuicaoUsaOrcamento: true },
        })
      }
      // 10. Flag atribuicaoUsaClienteArea + par (cliente, área) bate com
      //     o vínculo do user e a categoria do serviço.
      for (const par of areasResponsavel) {
        const areaName = par.area?.name
        if (!areaName) continue
        orClauses.push({
          responsavelId: null,
          clienteId: par.clienteId,
          servico: {
            atribuicaoUsaClienteArea: true,
            categoria: { equals: areaName, mode: 'insensitive' },
          },
        })
      }

      where = { ...filtroStatus, OR: orClauses }
      // Mantem scope por empresa quando user esta scopado
      if (user.empresaId) {
        where = { AND: [where, { OR: [{ empresaId: user.empresaId }, { empresaId: null }] }] }
      }
    }

    // Aplica a janela de tempo + arquivado por cima do where principal
    if (Object.keys(filtroJanela).length > 0) {
      where = where.AND ? { AND: [...where.AND, filtroJanela] } : { AND: [where, filtroJanela] }
    }

    const execs = await prisma.servicoExecucao.findMany({
      where,
      include: {
        servico: {
          select: {
            id: true, nome: true, slaHoras: true, categoria: true,
            // Inclui campos da pergunta — o frontend renderiza card especial
            // quando a execução é AGUARDANDO_RESPOSTA (PERGUNTA).
            tipo: true, perguntaTexto: true, perguntaOpcoes: true, perguntaMulti: true,
          },
        },
        cliente: { select: { id: true, razaoSocial: true } },
        // _count de comentarios + anexos por passo — agregado no front
        // pra mostrar badges na linha da tabela.
        // Inclui ordem/passoNome/etapaNome/obrigatorio/ignorado pra calcular
        // o "passo atual" (primeiro pendente na ordem) no frontend.
        passos: {
          select: {
            id: true,
            ordem: true,
            passoNome: true,
            etapaNome: true,
            obrigatorio: true,
            concluido: true,
            ignorado: true,
            _count: { select: { comentarios: true, anexos: true } },
          },
          orderBy: { ordem: 'asc' },
        },
      },
      orderBy: [
        // Urgencia primeiro
        { prioridade: 'desc' },
        // Prazos mais proximos
        { prazoLimite: 'asc' },
        { iniciadoEm: 'desc' },
      ],
    })

    // Enriquece com responsavelUsuario — responsavelId é só String? sem relação
    // Prisma. Faz um findMany unico pelos IDs unicos pra exibir avatar+nome no front.
    const respIds = Array.from(new Set(execs.map(e => e.responsavelId).filter((u): u is string => !!u)))
    const respMap = new Map<string, { id: string; name: string; image: string | null }>()
    if (respIds.length > 0) {
      const users = await prisma.user.findMany({
        where: { id: { in: respIds } },
        select: { id: true, name: true, image: true },
      })
      for (const u of users) respMap.set(u.id, u)
    }
    return execs.map(e => ({
      ...e,
      responsavelUsuario: e.responsavelId ? respMap.get(e.responsavelId) ?? null : null,
    }))
  }

  /**
   * Versao enxuta de `listMeusServicos` pro widget do dashboard.
   *
   * Reusa o mesmo escopo de `listMeusServicos` (responsavel direto, lider da
   * area, par cliente×area contratada, orcamento, mais master/diretor/coord
   * com visao total da empresa), mas:
   *  - so traz execucoes ativas: status in (EM_ANDAMENTO, AGUARDANDO_RESPOSTA)
   *  - exclui pausadas e arquivadas
   *  - calcula `situacao` (atrasada | a_vencer | no_prazo) e `passoAtual`
   *    no backend pra entregar payload pequeno
   *  - ordena por urgencia (atrasada -> a_vencer -> no_prazo) e por prazoLimite
   *
   * Critério de situacao (espelha o fluxo-editor):
   *  - atrasada: prazoLimite < now()
   *  - a_vencer: prazoLimite in [now, now+48h)
   *  - no_prazo: prazoLimite >= now+48h OU prazoLimite IS NULL
   */
  async listServicosAndamentoDashboard(userId: string) {
    // Reusa toda a logica de escopo + janela do listMeusServicos. Trazemos
    // somente as execucoes ativas (EM_ANDAMENTO + AGUARDANDO_RESPOSTA),
    // filtrando depois pausadas/arquivadas (incluirArquivados=false ja exclui
    // as arquivadas, mas pausadas chegam aqui e a gente filtra em memoria).
    const todos = await this.listMeusServicos(userId)
    const agora = Date.now()
    const limiar48h = agora + 48 * 60 * 60 * 1000

    type Item = {
      id: string
      servicoNome: string
      clienteNome: string
      categoria: string | null
      prazoLimite: Date | null
      iniciadoEm: Date
      status: string
      situacao: 'no_prazo' | 'a_vencer' | 'atrasada'
      passoAtual: {
        nome: string
        etapaNome: string | null
        ordem: number
        totalPassos: number
        concluidos: number
      } | null
    }

    const itens: Item[] = []
    for (const e of todos) {
      // So execucoes ativas (nao concluidas/canceladas/puladas/aguardando_inicio)
      if (e.status !== 'EM_ANDAMENTO' && e.status !== 'AGUARDANDO_RESPOSTA') continue
      if (e.pausado) continue
      if (e.arquivado) continue

      const prazo = e.prazoLimite ? new Date(e.prazoLimite) : null
      const prazoMs = prazo ? prazo.getTime() : null
      const situacao: Item['situacao'] = prazoMs === null
        ? 'no_prazo'
        : prazoMs < agora
          ? 'atrasada'
          : prazoMs < limiar48h
            ? 'a_vencer'
            : 'no_prazo'

      // Passo atual = primeiro passo NAO concluido E NAO ignorado, na ordem.
      const passosOrdenados = [...e.passos].sort((a, b) => a.ordem - b.ordem)
      const totalPassos = passosOrdenados.length
      const concluidos = passosOrdenados.filter(p => p.concluido || p.ignorado).length
      const atual = passosOrdenados.find(p => !p.concluido && !p.ignorado) ?? null

      itens.push({
        id: e.id,
        servicoNome: e.servico?.nome ?? 'Serviço',
        clienteNome: e.cliente?.razaoSocial ?? '—',
        categoria: e.servico?.categoria ?? null,
        prazoLimite: prazo,
        iniciadoEm: e.iniciadoEm,
        status: e.status,
        situacao,
        passoAtual: atual
          ? {
              nome: atual.passoNome,
              etapaNome: atual.etapaNome ?? null,
              ordem: atual.ordem,
              totalPassos,
              concluidos,
            }
          : null,
      })
    }

    // Ordem: atrasadas primeiro (prazo asc), depois a_vencer (asc), depois no_prazo (asc, null por ultimo)
    const peso = { atrasada: 0, a_vencer: 1, no_prazo: 2 } as const
    itens.sort((a, b) => {
      const w = peso[a.situacao] - peso[b.situacao]
      if (w !== 0) return w
      const av = a.prazoLimite ? a.prazoLimite.getTime() : Number.POSITIVE_INFINITY
      const bv = b.prazoLimite ? b.prazoLimite.getTime() : Number.POSITIVE_INFINITY
      return av - bv
    })

    return itens
  }

  // ── Estatisticas ──────────────────────────────────────────

  /**
   * Indicadores do dashboard sobre serviços em aberto. Escopo conforme perfil:
   *
   *  - **Master / Diretor / Coordenador**: todos serviços em aberto da empresa
   *  - **Líder de área(s)**: serviços em aberto cujos responsáveis estão lotados
   *    em área(s) que ele lidera (Area.leaderId = userId)
   *  - **Demais usuários**: somente serviços onde ele é responsável direto
   */
  async getDashboardStats(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true, isMaster: true, isEmpresaMaster: true, empresaId: true },
    })
    if (!user) return { emAberto: 0, atrasados: 0, pausados: 0, scope: 'proprios' as const }

    const agora = new Date()
    const baseEmAberto: any = { status: 'EM_ANDAMENTO' }

    let scopeWhere: any
    let scope: 'todos' | 'area' | 'proprios'

    const isPriv = user.isMaster || user.isEmpresaMaster
      || user.role === 'DIRETOR' || user.role === 'COORDENADOR'

    if (isPriv) {
      scope = 'todos'
      scopeWhere = user.empresaId
        ? { OR: [{ empresaId: user.empresaId }, { empresaId: null }] }
        : {}
    } else {
      // Verifica se é líder de alguma área — se sim, vê dos colaboradores dessa área
      const ledAreas = await prisma.area.findMany({
        where: { leaderId: userId },
        select: { id: true },
      })
      if (ledAreas.length > 0) {
        scope = 'area'
        const ledAreaIds = ledAreas.map(a => a.id)
        // Coleta todos os colaboradores lotados nessas áreas + ele próprio
        const colabs = await prisma.user.findMany({
          where: { areaId: { in: ledAreaIds } },
          select: { id: true },
        })
        const responsavelIds = Array.from(new Set([...colabs.map(c => c.id), userId]))
        scopeWhere = { responsavelId: { in: responsavelIds } }
      } else {
        scope = 'proprios'
        scopeWhere = { responsavelId: userId }
      }
      // Sempre mantém scope por empresa
      if (user.empresaId) {
        scopeWhere = {
          AND: [scopeWhere, { OR: [{ empresaId: user.empresaId }, { empresaId: null }] }],
        }
      }
    }

    const where = { ...baseEmAberto, ...(scopeWhere.AND ? { AND: scopeWhere.AND } : scopeWhere) }

    const [emAberto, atrasados, pausados] = await Promise.all([
      prisma.servicoExecucao.count({ where }),
      prisma.servicoExecucao.count({
        where: { ...where, prazoLimite: { lt: agora }, pausado: false } as any,
      }),
      prisma.servicoExecucao.count({ where: { ...where, pausado: true } as any }),
    ])

    return { emAberto, atrasados, pausados, scope }
  }

  async getStats(empresaId?: string) {
    // Mesmo critério do listExecucoes: empresa do usuário OU órfãs (null).
    // Pra templates manter o filtro tradicional (template é sempre criado por uma empresa).
    const whereTpl: any = empresaId ? { empresaId } : {}
    const whereExec: any = empresaId ? { OR: [{ empresaId }, { empresaId: null }] } : {}
    const [templates, emAndamento, concluidas] = await Promise.all([
      prisma.servico.count({ where: { ...whereTpl, ativo: true } }),
      prisma.servicoExecucao.count({ where: { ...whereExec, status: 'EM_ANDAMENTO' } }),
      prisma.servicoExecucao.count({ where: { ...whereExec, status: 'CONCLUIDO' } }),
    ])
    return { templates, emAndamento, concluidas }
  }

  // ── Scheduler — notificações de atraso ─────────────────────
  /**
   * Verifica execuções recém-atrasadas (prazo já cruzou now mas ainda não
   * notificaram) e dispara notificação no sino do responsável (+ líder de
   * área quando aplicável).
   *
   * Idempotente: marca `notificadoAtrasoEm` para não disparar duas vezes
   * pra mesma execução.
   *
   * Chamado pelo ServicoScheduler (a cada hora).
   */
  async notificarExecucoesAtrasadas() {
    const agora = new Date()

    // Busca execuções atrasadas ainda não notificadas. Usa SQL raw porque
    // o cliente Prisma pode ainda não ter o campo `notificadoAtrasoEm`
    // tipado em runtime (após schema push); SQL raw bypassa isso.
    const rows = await prisma.$queryRawUnsafe<Array<{
      id: string
      servico_id: string
      cliente_id: string
      responsavel_id: string | null
      empresa_id: string | null
      processo_id: string | null
      prazo_limite: Date
    }>>(
      `SELECT id, servico_id, cliente_id, responsavel_id, empresa_id, processo_id, prazo_limite
       FROM servico_execucoes
       WHERE status = 'EM_ANDAMENTO'
         AND pausado = false
         AND prazo_limite IS NOT NULL
         AND prazo_limite < $1
         AND notificado_atraso_em IS NULL
       LIMIT 500`,
      agora,
    )

    if (rows.length === 0) return { verificados: 0, notificados: 0 }

    // Carrega contexto (servico, cliente) para mensagem da notificação
    const servicoIds = Array.from(new Set(rows.map(r => r.servico_id)))
    const clienteIds = Array.from(new Set(rows.map(r => r.cliente_id)))
    const [servicos, clientes] = await Promise.all([
      prisma.servico.findMany({
        where: { id: { in: servicoIds } },
        select: { id: true, nome: true },
      }),
      prisma.cliente.findMany({
        where: { id: { in: clienteIds } },
        select: { id: true, razaoSocial: true },
      }),
    ])
    const servicoMap = new Map(servicos.map(s => [s.id, s.nome]))
    const clienteMap = new Map(clientes.map(c => [c.id, c.razaoSocial]))

    let notificados = 0
    for (const row of rows) {
      const servicoNome = servicoMap.get(row.servico_id) ?? 'Execução'
      const clienteNome = clienteMap.get(row.cliente_id) ?? 'cliente'
      // Link via /meus-servicos?exec= pra funcionar com usuários sem permissão
      // de leitura no módulo "servicos" (caso de /processos/[id] que é readProcedure).
      const link = `/meus-servicos?exec=${row.id}`

      // 1) Notificação in-app (sino) — só faz sentido se há responsável
      if (row.responsavel_id) {
        try {
          await this.notificationService.criar({
            userId: row.responsavel_id,
            titulo: `⏰ Execução atrasada: ${servicoNome}`,
            mensagem: `${clienteNome} — prazo venceu em ${row.prazo_limite.toLocaleDateString('pt-BR')}`,
            tipo: 'warning',
            link,
            origem: 'servicos',
            empresaId: row.empresa_id,
          })
          notificados++
        } catch (e) {
          console.warn('[Servico] Falha ao notificar atraso:', (e as Error).message)
        }
      }

      // 2) Notificação por e-mail (engine de regras) — independe de responsável
      void this.notificacaoService.disparar(row.id, 'ATRASADA')
    }

    // Marca todas como notificadas (mesmo as sem responsável — para não
    // re-tentar inutilmente toda hora). Usa SQL raw novamente.
    if (rows.length > 0) {
      const ids = rows.map(r => r.id)
      await prisma.$executeRawUnsafe(
        `UPDATE servico_execucoes SET notificado_atraso_em = $1 WHERE id = ANY($2::text[])`,
        agora,
        ids,
      )
    }

    return { verificados: rows.length, notificados }
  }

  // ── Materiais de apoio (template) ─────────────────────────
  //   Anexa NOTA/LINK/ARQUIVO em uma Etapa ou Passo do template.
  //   Cada execução nova herda os materiais via /servicos/[id]/etapas e
  //   /servicos/[id]/passos no get de execução (frontend mostra readonly).

  async listMateriaisDeEtapa(etapaId: string) {
    return prisma.servicoMaterial.findMany({
      where: { etapaId },
      orderBy: { ordem: 'asc' },
    })
  }

  async listMateriaisDePasso(passoId: string) {
    return prisma.servicoMaterial.findMany({
      where: { passoId },
      orderBy: { ordem: 'asc' },
    })
  }

  async createMaterial(input: CreateMaterialInput, opts?: { empresaId?: string; userId?: string }) {
    // Calcula ordem = próximo disponível no container
    const ordemAtual = await prisma.servicoMaterial.aggregate({
      where: input.etapaId ? { etapaId: input.etapaId } : { passoId: input.passoId! },
      _max: { ordem: true },
    })
    const proximaOrdem = (ordemAtual._max.ordem ?? -1) + 1
    return prisma.servicoMaterial.create({
      data: {
        etapaId:   input.etapaId  || null,
        passoId:   input.passoId  || null,
        tipo:      input.tipo,
        titulo:    input.titulo,
        conteudo:  input.conteudo,
        mimeType:  input.mimeType || null,
        fileName:  input.fileName || null,
        fileSize:  input.fileSize ?? null,
        ordem:     input.ordem ?? proximaOrdem,
        empresaId: opts?.empresaId || null,
        createdBy: opts?.userId    || null,
      },
    })
  }

  async updateMaterial(input: UpdateMaterialInput) {
    const { id, ...data } = input
    // Limpa campos undefined pra não sobrescrever com null inadvertidamente
    const patch: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(data)) {
      if (v !== undefined) patch[k] = v
    }
    return prisma.servicoMaterial.update({ where: { id }, data: patch })
  }

  async deleteMaterial(id: string) {
    return prisma.servicoMaterial.delete({ where: { id } })
  }

  async reorderMateriais(ids: string[]) {
    // Atualiza ordem em paralelo — ids[i] vira ordem = i
    await Promise.all(ids.map((id, i) => prisma.servicoMaterial.update({
      where: { id },
      data: { ordem: i },
    })))
    return { ok: true, atualizados: ids.length }
  }

  // ── Grupos de serviço (M→N) ───────────────────────────────
  //   Rotulo + ação opcional. Um serviço pode estar em vários grupos.

  async listGrupos(empresaId?: string) {
    return prisma.servicoGrupo.findMany({
      where: { ativo: true, ...(empresaId ? { empresaId } : {}) },
      orderBy: [{ ordem: 'asc' }, { nome: 'asc' }],
      include: {
        itens: {
          orderBy: { ordem: 'asc' },
          include: {
            servico: {
              select: {
                id: true, nome: true, categoria: true, tipo: true,
                categoriaServico: true, slaHoras: true, ativo: true,
              },
            },
          },
        },
        _count: { select: { itens: true } },
      },
    })
  }

  async getGrupo(id: string) {
    return prisma.servicoGrupo.findUnique({
      where: { id },
      include: {
        itens: {
          orderBy: { ordem: 'asc' },
          include: {
            servico: {
              select: {
                id: true, nome: true, categoria: true, tipo: true,
                categoriaServico: true, slaHoras: true, prioridadePadrao: true, ativo: true,
              },
            },
          },
        },
      },
    })
  }

  async createGrupo(input: CreateGrupoInput, empresaId?: string) {
    const grupo = await prisma.servicoGrupo.create({
      data: {
        nome: input.nome,
        descricao: input.descricao ?? null,
        cor: input.cor ?? null,
        ordem: input.ordem ?? 0,
        empresaId: empresaId ?? null,
      },
    })
    // Se já vieram serviços iniciais, cria os vínculos com ordem = índice
    const ids = input.servicoIds ?? []
    if (ids.length > 0) {
      await prisma.servicoGrupoItem.createMany({
        data: ids.map((sid, i) => ({ grupoId: grupo.id, servicoId: sid, ordem: i })),
        skipDuplicates: true,
      })
    }
    return this.getGrupo(grupo.id)
  }

  async updateGrupo(input: UpdateGrupoInput) {
    const { id, ...data } = input
    const patch: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(data)) if (v !== undefined) patch[k] = v
    return prisma.servicoGrupo.update({ where: { id }, data: patch })
  }

  async deleteGrupo(id: string) {
    // Soft-delete — preserva histórico e referências
    return prisma.servicoGrupo.update({ where: { id }, data: { ativo: false } })
  }

  /** Substitui o conjunto completo de serviços do grupo (deleta o que sumiu,
   *  cria o que apareceu, atualiza ordem dos demais). A ordem é o índice. */
  async setGrupoServicos(grupoId: string, servicoIds: string[]) {
    const existing = await prisma.servicoGrupoItem.findMany({
      where: { grupoId }, select: { servicoId: true },
    })
    const existingSet = new Set(existing.map(e => e.servicoId))
    const wantedSet = new Set(servicoIds)
    const toRemove = [...existingSet].filter(sid => !wantedSet.has(sid))
    const toAdd    = servicoIds.filter(sid => !existingSet.has(sid))

    const ops: any[] = []
    if (toRemove.length > 0) {
      ops.push(prisma.servicoGrupoItem.deleteMany({
        where: { grupoId, servicoId: { in: toRemove } },
      }))
    }
    if (toAdd.length > 0) {
      ops.push(prisma.servicoGrupoItem.createMany({
        data: toAdd.map(sid => ({ grupoId, servicoId: sid, ordem: servicoIds.indexOf(sid) })),
        skipDuplicates: true,
      }))
    }
    // Atualiza ordem dos que JÁ existiam (createMany não atualiza ordem).
    for (let i = 0; i < servicoIds.length; i++) {
      const sid = servicoIds[i]
      if (existingSet.has(sid)) {
        ops.push(prisma.servicoGrupoItem.update({
          where: { grupoId_servicoId: { grupoId, servicoId: sid } },
          data: { ordem: i },
        }))
      }
    }
    await prisma.$transaction(ops)
    return { ok: true, adicionados: toAdd.length, removidos: toRemove.length, total: servicoIds.length }
  }

  /** Ação operacional — cria uma ServicoExecucao para cada serviço do grupo
   *  no cliente informado. Respeita a ordem do grupo nas execuções (campo ordem
   *  fica refletido no iniciadoEm em ms — primeiro item iniciado primeiro). */
  async iniciarGrupo(input: IniciarGrupoInput, userId?: string) {
    const grupo = await prisma.servicoGrupo.findUnique({
      where: { id: input.grupoId },
      include: {
        itens: {
          orderBy: { ordem: 'asc' },
          include: { servico: { select: { id: true, nome: true, prioridadePadrao: true, slaHoras: true, ativo: true } } },
        },
      },
    })
    if (!grupo || !grupo.ativo) throw new Error('Grupo não encontrado ou inativo.')
    if (grupo.itens.length === 0) throw new Error('Grupo vazio — adicione serviços antes de iniciar.')

    const cliente = await prisma.cliente.findUnique({ where: { id: input.clienteId }, select: { id: true, empresaId: true } })
    if (!cliente) throw new Error('Cliente não encontrado.')

    // Cria execuções sequencialmente pra manter ordem cronológica
    const execucoes: Array<{ id: string; servicoId: string; nome: string }> = []
    for (const item of grupo.itens) {
      if (!item.servico.ativo) continue
      const exec = await this.createExecucao({
        servicoId: item.servicoId,
        clienteId: input.clienteId,
        responsavelId: input.responsavelId ?? undefined,
        observacoes: input.observacoes ?? undefined,
      }, cliente.empresaId ?? undefined)
      execucoes.push({ id: exec.id, servicoId: item.servicoId, nome: item.servico.nome })
    }
    return { ok: true, grupoId: grupo.id, nomeGrupo: grupo.nome, execucoes }
  }

  /** Define quais grupos um serviço pertence — versão "lado serviço" do M→N.
   *  Mantém a ordem do grupo intacta (não altera ordem dos demais serviços
   *  no grupo); só adiciona/remove o vínculo com este serviço. */
  async setServicoGrupos(servicoId: string, grupoIds: string[]) {
    const existing = await prisma.servicoGrupoItem.findMany({
      where: { servicoId }, select: { grupoId: true },
    })
    const existingSet = new Set(existing.map(e => e.grupoId))
    const wantedSet = new Set(grupoIds)
    const toRemove = [...existingSet].filter(gid => !wantedSet.has(gid))
    const toAdd    = grupoIds.filter(gid => !existingSet.has(gid))

    const ops: any[] = []
    if (toRemove.length > 0) {
      ops.push(prisma.servicoGrupoItem.deleteMany({
        where: { servicoId, grupoId: { in: toRemove } },
      }))
    }
    // Pra cada grupo novo, calcula a ordem como (max+1) dentro do grupo
    // (mantém a sequência interna do grupo coerente).
    for (const gid of toAdd) {
      const max = await prisma.servicoGrupoItem.aggregate({
        where: { grupoId: gid }, _max: { ordem: true },
      })
      ops.push(prisma.servicoGrupoItem.create({
        data: { grupoId: gid, servicoId, ordem: (max._max.ordem ?? -1) + 1 },
      }))
    }
    if (ops.length > 0) await prisma.$transaction(ops)
    return { ok: true, adicionados: toAdd.length, removidos: toRemove.length, total: grupoIds.length }
  }
}
