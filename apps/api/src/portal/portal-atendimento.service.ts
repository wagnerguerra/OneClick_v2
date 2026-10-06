import { TRPCError } from '@trpc/server'
import { prisma } from '@saas/db'
import type { OrcamentoService } from '../orcamento/orcamento.service'
import type { ManifestacaoService } from '../manifestacao/manifestacao.service'
import type { ManifestacaoNotificacaoService } from '../manifestacao/manifestacao-notificacao.service'
import type { NotificationService } from '../notification/notification.service'
import type { VinculoPortal } from './portal-escopo'

/**
 * Guia "Atendimento" do portal do cliente (06/10/2026).
 *
 * O cliente solicita serviços (vira um orçamento NOVO no kanban, origem
 * PORTAL) e registra reclamações, sugestões e elogios (viram manifestações,
 * origem CLIENTE, canal PORTAL — as mesmas telas da Qualidade). Acompanha a
 * situação e conversa com a equipe: vê só o que a equipe marcou como visível.
 *
 * Portões, todos no servidor:
 *  - módulo `chamados` (empresa) + ao menos uma das quatro permissões
 *    (`portalModuloProcedure('chamados')`, via `modulosDoVinculo`);
 *  - a permissão ESPECÍFICA da ação (`exigirPermissao`);
 *  - recorte pelo cliente do vínculo, e ADMINISTRADOR vê o de toda a empresa
 *    (cliente) — os demais, só o que eles mesmos abriram.
 */
export type TipoAtendimento = 'SERVICO' | 'RECLAMACAO' | 'SUGESTAO' | 'ELOGIO'
type TipoManifestacao = Exclude<TipoAtendimento, 'SERVICO'>

const PERMISSAO: Record<TipoAtendimento, 'podeSolicitarServicos' | 'podeRegistrarReclamacao' | 'podeRegistrarSugestao' | 'podeRegistrarElogio'> = {
  SERVICO: 'podeSolicitarServicos',
  RECLAMACAO: 'podeRegistrarReclamacao',
  SUGESTAO: 'podeRegistrarSugestao',
  ELOGIO: 'podeRegistrarElogio',
}

/** Situação do orçamento em linguagem de cliente — o kanban interno tem mais nuances. */
const SITUACAO_ORCAMENTO: Record<string, string> = {
  NOVO: 'Recebida', A_ENVIAR: 'Em análise', ENVIADO: 'Proposta enviada', APROVADO: 'Aprovada',
  LIBERADO: 'Em execução', FINALIZADO: 'Concluída', ENCERRADO: 'Encerrada', CANCELADO: 'Cancelada',
}
const SITUACAO_MANIFESTACAO: Record<string, string> = {
  RECEBIDA: 'Recebida', RESPONDIDA: 'Respondida', ENCERRADA: 'Encerrada',
  AGUARDANDO_RETORNO: 'Recebida', AGUARDANDO_ANALISE: 'Em análise', REGISTRAR_EFICACIA: 'Em tratamento',
  NAO_PROCEDENTE: 'Analisada', FINALIZADA: 'Finalizada',
}
/** Encerrado = sem mais conversa pelo portal. */
const FECHADO = new Set(['FINALIZADO', 'ENCERRADO', 'CANCELADO', 'ENCERRADA', 'FINALIZADA', 'NAO_PROCEDENTE'])

export interface ItemAtendimento {
  id: string
  tipo: TipoAtendimento
  /** "#4712" no orçamento; protocolo na manifestação. */
  codigo: string
  titulo: string
  situacao: string
  status: string
  aberto: boolean
  criadoEm: string
  autorNome: string | null
}

export interface MensagemAtendimento {
  id: string
  texto: string
  doCliente: boolean
  autorNome: string | null
  criadoEm: string
}

/** Texto do cliente → HTML seguro (o orçamento guarda HTML no texto interno). */
function paraHtml(t: string): string {
  return t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
    .split(/\r?\n/).map(l => `<p>${l || '<br>'}</p>`).join('')
}

/** HTML de mensagens internas → texto (o portal mostra texto puro). */
function paraTexto(html: string | null | undefined): string {
  return (html ?? '').replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>/gi, '\n').replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&')
    .replace(/\n{3,}/g, '\n\n').trim()
}

export class PortalAtendimentoService {
  constructor(
    private readonly orcamentos: OrcamentoService,
    private readonly manifestacoes: ManifestacaoService,
    private readonly avisosManifestacao: ManifestacaoNotificacaoService,
    private readonly notificacoes: NotificationService,
  ) {}

  // ── Portões ──────────────────────────────────────────────

  private exigirPermissao(v: VinculoPortal, tipo: TipoAtendimento) {
    if (!v[PERMISSAO[tipo]]) {
      throw new TRPCError({ code: 'FORBIDDEN', message: 'Seu acesso não permite esta ação. Fale com o administrador da sua empresa.' })
    }
  }

  private async empresaDoCliente(clienteId: string): Promise<string> {
    const c = await prisma.cliente.findUnique({ where: { id: clienteId }, select: { empresaId: true } })
    if (!c?.empresaId) throw new TRPCError({ code: 'NOT_FOUND', message: 'Empresa do cliente não encontrada.' })
    return c.empresaId
  }

  /** Administrador do cliente vê tudo da empresa; os demais, o que abriram. */
  private veTudo(v: VinculoPortal) { return v.nivel === 'ADMINISTRADOR' }

  /** O que esta pessoa pode fazer — a tela monta as abas a partir disto. */
  permissoes(v: VinculoPortal) {
    return {
      SERVICO: v.podeSolicitarServicos, RECLAMACAO: v.podeRegistrarReclamacao,
      SUGESTAO: v.podeRegistrarSugestao, ELOGIO: v.podeRegistrarElogio,
      veTudo: this.veTudo(v),
    }
  }

  // ── Serviços ─────────────────────────────────────────────

  /** Catálogo que o escritório marcou como orçável — sem preço. */
  async servicosDisponiveis(v: VinculoPortal) {
    this.exigirPermissao(v, 'SERVICO')
    const empresaId = await this.empresaDoCliente(v.clienteId)
    return prisma.servico.findMany({
      where: { empresaId, ativo: true, disponivelOrcamento: true },
      select: { id: true, nome: true, descricao: true },
      orderBy: { nome: 'asc' },
    })
  }

  async solicitarServico(v: VinculoPortal, userId: string, input: { servicoIds: string[]; descricao: string }) {
    this.exigirPermissao(v, 'SERVICO')
    const empresaId = await this.empresaDoCliente(v.clienteId)
    const servicos = input.servicoIds.length
      ? await prisma.servico.findMany({
        where: { id: { in: input.servicoIds }, empresaId, ativo: true, disponivelOrcamento: true },
        select: { id: true, nome: true, valorPadrao: true },
      })
      : []
    if (servicos.length !== new Set(input.servicoIds).size) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'Um dos serviços escolhidos não está mais disponível. Recarregue a página.' })
    }
    const quem = await prisma.user.findUnique({ where: { id: userId }, select: { name: true, email: true } })
    const lista = servicos.length ? `<p><b>Serviços solicitados:</b> ${servicos.map(s => paraHtml(s.nome).replace(/<\/?p>/g, '')).join(', ')}</p>` : ''
    const textoInterno = `<p><b>Solicitação pelo portal do cliente</b> — ${paraHtml(quem?.name || 'usuário do portal').replace(/<\/?p>/g, '')}</p>${lista}${paraHtml(input.descricao)}`

    // O `create` do módulo numera com o advisory lock e avisa o "novo
    // orçamento" pelos e-mails configurados — o mesmo caminho do interno.
    const orc = await this.orcamentos.create(
      { clienteId: v.clienteId, textoInterno, contatos: quem?.name ?? null, emailsContatos: quem?.email ?? null } as Parameters<OrcamentoService['create']>[0],
      userId,
      empresaId,
    )
    await prisma.orcamento.update({
      where: { id: orc.id },
      // Sem responsável: fica para o comercial assumir, como a solicitação interna.
      data: { origem: 'PORTAL', portalUsuarioId: userId, responsavelId: null, solicitanteId: null },
    })
    // Os serviços entram como itens (valor padrão do catálogo; a equipe ajusta
    // antes de enviar a proposta). O cliente nunca vê valores pelo portal.
    for (const s of servicos) {
      await this.orcamentos.addItem({
        orcamentoId: orc.id, tipo: 'SERVICO', descricao: s.nome, quantidade: 1,
        valorUnitario: Number(s.valorPadrao ?? 0), catalogoId: s.id,
      }).catch(() => undefined)
    }
    // A conversa começa com o pedido, visível aos dois lados.
    await prisma.orcamentoMensagem.create({
      data: {
        orcamentoId: orc.id, userId, viaPortal: true, visivelCliente: true,
        mensagem: `${servicos.length ? `Serviços: ${servicos.map(s => s.nome).join(', ')}\n\n` : ''}${input.descricao}`,
      },
    })
    return { id: orc.id, codigo: `#${String(orc.numero).padStart(4, '0')}` }
  }

  // ── Manifestações ────────────────────────────────────────

  async registrarManifestacao(v: VinculoPortal, userId: string, tipo: TipoManifestacao, input: { titulo?: string | null; descricao: string; dataOcorrido?: string | null }) {
    this.exigirPermissao(v, tipo)
    const empresaId = await this.empresaDoCliente(v.clienteId)
    const quem = await prisma.user.findUnique({ where: { id: userId }, select: { name: true, email: true } })
    const criado = await this.manifestacoes.criar({
      tipo, origem: 'CLIENTE', anonima: false, clienteId: v.clienteId, canal: 'PORTAL',
      informanteNome: quem?.name ?? null, informanteEmail: quem?.email ?? null, informanteTelefone: null,
      areaId: null, elogiadosIds: [], titulo: input.titulo || null, descricao: input.descricao,
      dataOcorrido: input.dataOcorrido || null, publica: false,
    } as Parameters<ManifestacaoService['criar']>[0], userId, empresaId)
    return { id: criado.id, codigo: criado.protocolo }
  }

  // ── Listar / detalhe ─────────────────────────────────────

  async listar(v: VinculoPortal, userId: string, tipo: TipoAtendimento): Promise<ItemAtendimento[]> {
    this.exigirPermissao(v, tipo)
    const empresaId = await this.empresaDoCliente(v.clienteId)
    const proprios = !this.veTudo(v)
    if (tipo === 'SERVICO') {
      const rows = await prisma.orcamento.findMany({
        where: { empresaId, clienteId: v.clienteId, origem: 'PORTAL', ...(proprios ? { portalUsuarioId: userId } : {}) },
        select: { id: true, numero: true, status: true, createdAt: true, portalUsuarioId: true, itens: { where: { tipo: 'SERVICO' }, select: { descricao: true }, take: 3 } },
        orderBy: { createdAt: 'desc' },
        take: 100,
      })
      const nomes = await this.nomes(rows.map(r => r.portalUsuarioId))
      return rows.map(r => ({
        id: r.id, tipo, codigo: `#${String(r.numero).padStart(4, '0')}`,
        titulo: r.itens.map(i => i.descricao).join(', ') || 'Solicitação de serviço',
        situacao: SITUACAO_ORCAMENTO[r.status] ?? r.status, status: r.status, aberto: !FECHADO.has(r.status),
        criadoEm: r.createdAt.toISOString(), autorNome: r.portalUsuarioId ? nomes.get(r.portalUsuarioId) ?? null : null,
      }))
    }
    const rows = await prisma.manifestacao.findMany({
      // Só o que veio pelo portal: o registro feito pela equipe (telefone,
      // e-mail) pode carregar contexto interno e não é exposto aqui.
      where: { empresaId, clienteId: v.clienteId, tipo, canal: 'PORTAL', excluidaEm: null, ...(proprios ? { autorId: userId } : {}) },
      select: { id: true, protocolo: true, titulo: true, descricao: true, status: true, criadoEm: true, autorId: true },
      orderBy: { criadoEm: 'desc' },
      take: 100,
    })
    const nomes = await this.nomes(rows.map(r => r.autorId))
    return rows.map(r => ({
      id: r.id, tipo, codigo: r.protocolo,
      titulo: r.titulo || paraTexto(r.descricao).slice(0, 80),
      situacao: SITUACAO_MANIFESTACAO[r.status] ?? r.status, status: r.status, aberto: !FECHADO.has(r.status),
      criadoEm: r.criadoEm.toISOString(), autorNome: r.autorId ? nomes.get(r.autorId) ?? null : null,
    }))
  }

  async detalhe(v: VinculoPortal, userId: string, tipo: TipoAtendimento, id: string) {
    this.exigirPermissao(v, tipo)
    const empresaId = await this.empresaDoCliente(v.clienteId)
    const proprios = !this.veTudo(v)
    if (tipo === 'SERVICO') {
      const o = await prisma.orcamento.findFirst({
        where: { id, empresaId, clienteId: v.clienteId, origem: 'PORTAL', ...(proprios ? { portalUsuarioId: userId } : {}) },
        select: { id: true, numero: true, status: true, createdAt: true, itens: { where: { tipo: 'SERVICO' }, select: { descricao: true } } },
      })
      if (!o) throw new TRPCError({ code: 'NOT_FOUND', message: 'Solicitação não encontrada.' })
      const msgs = await prisma.orcamentoMensagem.findMany({
        where: { orcamentoId: o.id, visivelCliente: true },
        select: { id: true, mensagem: true, viaPortal: true, userId: true, createdAt: true },
        orderBy: { createdAt: 'asc' },
      })
      const nomes = await this.nomes(msgs.map(m => m.userId))
      return {
        id: o.id, tipo, codigo: `#${String(o.numero).padStart(4, '0')}`,
        titulo: o.itens.map(i => i.descricao).join(', ') || 'Solicitação de serviço',
        situacao: SITUACAO_ORCAMENTO[o.status] ?? o.status, aberto: !FECHADO.has(o.status), criadoEm: o.createdAt.toISOString(),
        descricao: null as string | null,
        respostas: [] as Array<{ titulo: string; texto: string }>,
        mensagens: msgs.map((m): MensagemAtendimento => ({
          id: m.id, texto: paraTexto(m.mensagem), doCliente: m.viaPortal,
          autorNome: m.viaPortal ? (m.userId ? nomes.get(m.userId) ?? null : null) : 'Equipe', criadoEm: m.createdAt.toISOString(),
        })),
      }
    }
    const m = await prisma.manifestacao.findFirst({
      where: { id, empresaId, clienteId: v.clienteId, tipo, canal: 'PORTAL', excluidaEm: null, ...(proprios ? { autorId: userId } : {}) },
      select: {
        id: true, protocolo: true, titulo: true, descricao: true, status: true, criadoEm: true,
        resposta: true, retornoCliente: true, retornoFinal: true,
        mensagens: { where: { interna: false }, select: { id: true, texto: true, viaPortal: true, autorId: true, criadoEm: true }, orderBy: { criadoEm: 'asc' } },
      },
    })
    if (!m) throw new TRPCError({ code: 'NOT_FOUND', message: 'Registro não encontrado.' })
    const nomes = await this.nomes(m.mensagens.map(x => x.autorId))
    // O que a equipe escreveu PARA o cliente nos campos da tratativa.
    const respostas = [
      m.retornoCliente && { titulo: 'Retorno da equipe', texto: paraTexto(m.retornoCliente) },
      m.resposta && { titulo: 'Resposta da equipe', texto: paraTexto(m.resposta) },
      m.retornoFinal && { titulo: 'Conclusão', texto: paraTexto(m.retornoFinal) },
    ].filter((x): x is { titulo: string; texto: string } => !!x)
    return {
      id: m.id, tipo, codigo: m.protocolo, titulo: m.titulo || 'Registro',
      situacao: SITUACAO_MANIFESTACAO[m.status] ?? m.status, aberto: !FECHADO.has(m.status), criadoEm: m.criadoEm.toISOString(),
      descricao: paraTexto(m.descricao),
      respostas,
      mensagens: m.mensagens.map((x): MensagemAtendimento => ({
        id: x.id, texto: paraTexto(x.texto), doCliente: x.viaPortal,
        autorNome: x.viaPortal ? (x.autorId ? nomes.get(x.autorId) ?? null : null) : 'Equipe', criadoEm: x.criadoEm.toISOString(),
      })),
    }
  }

  /** Resposta do cliente na conversa: visível aos dois lados, e a equipe é avisada. */
  async responder(v: VinculoPortal, userId: string, tipo: TipoAtendimento, id: string, texto: string) {
    const item = await this.detalhe(v, userId, tipo, id) // mesmos portões e recorte
    if (!item.aberto) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Este atendimento já foi encerrado. Abra um novo se precisar.' })
    if (tipo === 'SERVICO') {
      await prisma.orcamentoMensagem.create({ data: { orcamentoId: id, userId, mensagem: texto, viaPortal: true, visivelCliente: true } })
      const o = await prisma.orcamento.findUnique({ where: { id }, select: { numero: true, responsavelId: true, empresaId: true } })
      const quem = await prisma.user.findUnique({ where: { id: userId }, select: { name: true } })
      const dest = [o?.responsavelId].filter((x): x is string => !!x)
      if (dest.length) {
        await this.notificacoes.criarParaUsers(dest, {
          titulo: `Mensagem do cliente no orçamento #${String(o!.numero).padStart(4, '0')}`,
          mensagem: `${quem?.name ?? 'O cliente'} escreveu pelo portal: ${texto.slice(0, 140)}`,
          link: `/orcamentos/${id}`, origem: 'portal', empresaId: o?.empresaId ?? null,
        }).catch(() => undefined)
      }
      return { ok: true }
    }
    await prisma.manifestacaoMensagem.create({ data: { manifestacaoId: id, autorId: userId, texto, interna: false, viaPortal: true } })
    void this.avisosManifestacao.notificar(id, 'MENSAGEM', userId, 'Mensagem do cliente pelo portal')
    return { ok: true }
  }

  private async nomes(ids: Array<string | null>): Promise<Map<string, string>> {
    const unicos = [...new Set(ids.filter((x): x is string => !!x))]
    if (!unicos.length) return new Map()
    const us = await prisma.user.findMany({ where: { id: { in: unicos } }, select: { id: true, name: true } })
    return new Map(us.map(u => [u.id, u.name ?? '']))
  }
}
