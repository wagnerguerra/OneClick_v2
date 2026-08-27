import { Injectable, Inject } from '@nestjs/common'
import { prisma } from '@saas/db'
import { CadeiaProvedoresService } from './cadeia-provedores.service'
import { detectarDivergencias, CAMPOS_AUTOMATICOS, type CadastroComparavel } from './divergencias'
import type { DadosCnpj } from './provedor-cnpj'

/**
 * Orquestra o dossiê: consulta, guarda com procedência, compara com o cadastro
 * e enfileira divergências.
 *
 * O que este serviço NUNCA faz: sobrescrever em silêncio um campo preenchido à
 * mão. A única exceção é o CNAE (ver CAMPOS_AUTOMATICOS) — e mesmo ele fica
 * registrado como fato com fonte e data.
 */

/** Dados cadastrais mudam pouco; consultar de novo dentro disso é desperdício. */
const TTL_RECEITA_DIAS = 60

type ResultadoEnriquecimento = {
  clienteId: string
  ok: boolean
  fonte?: string
  motivo?: string
  doCache?: boolean
  divergencias?: number
  aplicadosDireto?: string[]
}

@Injectable()
export class DossieService {
  constructor(
    @Inject(CadeiaProvedoresService) private readonly cadeia: CadeiaProvedoresService,
  ) {}

  // ── Leitura ──────────────────────────────────────────────────

  /** O dossiê montado a partir dos fatos gravados — nunca do payload cru. */
  async getDossie(clienteId: string, usuarioId?: string) {
    const [fatos, sugestoes, ultimaColeta] = await Promise.all([
      prisma.clienteDossieFato.findMany({
        where: { clienteId },
        orderBy: [{ bloco: 'asc' }, { campo: 'asc' }],
      }),
      prisma.clienteDossieSugestao.findMany({
        where: { clienteId, status: 'pendente' },
        orderBy: { coletadoEm: 'desc' },
      }),
      prisma.clienteDossieColeta.findFirst({
        where: { clienteId, status: 'ok' },
        orderBy: { coletadoEm: 'desc' },
        select: { fonte: true, urlFonte: true, coletadoEm: true, bloco: true },
      }),
    ])

    // LGPD: o dossiê expõe QSA, que é pessoa física. Fica registrado quem abriu.
    if (usuarioId) await this.registrarAcesso(clienteId, usuarioId, 'visualizou')

    const blocos: Record<string, Array<{ campo: string; valor: string | null; valorJson: unknown; fonte: string; urlFonte: string | null; coletadoEm: Date; oficial: boolean }>> = {}
    for (const f of fatos) {
      const lista = blocos[f.bloco] ?? []
      lista.push({
        campo: f.campo,
        valor: f.valor,
        valorJson: f.valorJson,
        fonte: f.fonte,
        urlFonte: f.urlFonte,
        coletadoEm: f.coletadoEm,
        oficial: f.oficial,
      })
      blocos[f.bloco] = lista
    }

    return {
      blocos,
      sugestoes,
      ultimaColeta: ultimaColeta ?? null,
      vazio: fatos.length === 0,
    }
  }

  async registrarAcesso(clienteId: string, usuarioId: string, acao: string) {
    await prisma.clienteDossieAcesso.create({ data: { clienteId, usuarioId, acao } })
      .catch(() => { /* trilha não pode derrubar a leitura */ })
  }

  // ── Enriquecimento ───────────────────────────────────────────

  /**
   * `forcar` ignora o TTL — é o "Atualizar agora" da tela. Sem ele, cliente
   * consultado há menos de 60 dias responde do que já está gravado.
   */
  async enriquecer(clienteId: string, opts?: { forcar?: boolean; usuarioId?: string }): Promise<ResultadoEnriquecimento> {
    const cliente = await prisma.cliente.findUnique({
      where: { id: clienteId },
      select: {
        id: true, documento: true, cnpjAcessorias: true, tipoDocumento: true,
        razaoSocial: true, nomeFantasia: true, cnaePrincipal: true,
        inscricaoEstadual: true, capitalSocial: true,
        cep: true, logradouro: true, numero: true, bairro: true, cidade: true, uf: true,
      },
    })
    if (!cliente) return { clienteId, ok: false, motivo: 'Cliente não encontrado.' }
    if (cliente.tipoDocumento !== 'CNPJ') {
      return { clienteId, ok: false, motivo: 'O dossiê é de pessoa jurídica; este cliente é CPF.' }
    }

    if (!opts?.forcar) {
      const recente = await this.coletaDentroDoTtl(clienteId)
      if (recente) return { clienteId, ok: true, doCache: true, fonte: recente.fonte }
    }

    const documento = cliente.cnpjAcessorias || cliente.documento
    const { dados, tentativas, erroTerminal } = await this.cadeia.consultar(documento)

    // Toda tentativa vira log, inclusive as que falharam — é o que permite
    // entender depois por que um cliente ficou sem dossiê.
    for (const t of tentativas) {
      await prisma.clienteDossieColeta.create({
        data: {
          clienteId, bloco: 'receita', fonte: t.fonte,
          status: t.status === 'ok' ? 'ok' : 'erro',
          erro: t.erro ?? null,
          latenciaMs: t.latenciaMs,
          payload: t.status === 'ok' && dados ? (dados.payload as never) : undefined,
          urlFonte: t.status === 'ok' && dados ? dados.urlFonte : null,
        },
      }).catch(() => { /* log não derruba a coleta */ })
    }

    if (!dados) {
      const motivo = erroTerminal
        || tentativas.map(t => `${t.fonte}: ${t.erro ?? t.status}`).join(' · ')
        || 'Nenhum provedor disponível.'
      return { clienteId, ok: false, motivo }
    }

    // `capitalSocial` vem como Decimal do Prisma; a comparação é textual.
    const comparavel: CadastroComparavel = {
      razaoSocial: cliente.razaoSocial,
      nomeFantasia: cliente.nomeFantasia,
      cnaePrincipal: cliente.cnaePrincipal,
      inscricaoEstadual: cliente.inscricaoEstadual,
      capitalSocial: cliente.capitalSocial != null ? cliente.capitalSocial.toString() : null,
      cep: cliente.cep,
      logradouro: cliente.logradouro,
      numero: cliente.numero,
      bairro: cliente.bairro,
      cidade: cliente.cidade,
      uf: cliente.uf,
    }

    await this.gravarFatos(clienteId, dados)
    const aplicadosDireto = await this.aplicarAutomaticos(clienteId, comparavel, dados)
    const divergencias = await this.registrarDivergencias(clienteId, comparavel, dados)
    if (opts?.usuarioId) await this.registrarAcesso(clienteId, opts.usuarioId, 'atualizou')

    return { clienteId, ok: true, fonte: dados.fonte, divergencias, aplicadosDireto }
  }

  private async coletaDentroDoTtl(clienteId: string) {
    const limite = new Date(Date.now() - TTL_RECEITA_DIAS * 24 * 60 * 60 * 1000)
    return prisma.clienteDossieColeta.findFirst({
      where: { clienteId, bloco: 'receita', status: 'ok', coletadoEm: { gte: limite } },
      orderBy: { coletadoEm: 'desc' },
      select: { fonte: true, coletadoEm: true },
    })
  }

  /** Um fato por campo, sempre com fonte e data. `upsert` porque recoleta atualiza. */
  private async gravarFatos(clienteId: string, d: DadosCnpj) {
    const comum = { fonte: d.fonte, urlFonte: d.urlFonte, oficial: true, coletadoEm: new Date() }

    const texto: Array<[string, string, string | null]> = [
      ['receita', 'razao_social', d.razaoSocial || null],
      ['receita', 'nome_fantasia', d.nomeFantasia],
      ['receita', 'situacao_cadastral', d.situacaoCadastral],
      ['receita', 'data_situacao_cadastral', d.dataSituacaoCadastral],
      ['receita', 'motivo_situacao_cadastral', d.motivoSituacaoCadastral],
      ['receita', 'data_abertura', d.dataAbertura],
      ['receita', 'natureza_juridica', d.naturezaJuridica],
      ['receita', 'porte', d.porte],
      ['receita', 'capital_social', d.capitalSocial != null ? String(d.capitalSocial) : null],
      ['receita', 'matriz', d.matriz == null ? null : d.matriz ? 'Matriz' : 'Filial'],
      ['receita', 'cep', d.cep],
      ['receita', 'logradouro', d.logradouro],
      ['receita', 'numero', d.numero],
      ['receita', 'complemento', d.complemento],
      ['receita', 'bairro', d.bairro],
      ['receita', 'municipio', d.municipio],
      ['receita', 'municipio_ibge', d.municipioIbge],
      ['receita', 'uf', d.uf],
      ['receita', 'email', d.email],
      ['fiscal', 'optante_simples', d.optanteSimples == null ? null : d.optanteSimples ? 'Sim' : 'Não'],
      ['fiscal', 'data_opcao_simples', d.dataOpcaoSimples],
      ['fiscal', 'optante_mei', d.optanteMei == null ? null : d.optanteMei ? 'Sim' : 'Não'],
    ]

    for (const [bloco, campo, valor] of texto) {
      if (valor == null) continue
      await this.upsertFato(clienteId, bloco, campo, { valor, ...comum })
    }

    if (d.cnaes.length > 0) {
      await this.upsertFato(clienteId, 'receita', 'cnaes', { valorJson: d.cnaes as never, ...comum })
    }
    if (d.telefones.length > 0) {
      await this.upsertFato(clienteId, 'receita', 'telefones', { valorJson: d.telefones as never, ...comum })
    }
    if (d.socios.length > 0) {
      // Minimização LGPD: o documento do sócio é mascarado ANTES de ser gravado.
      // O dossiê existe para dizer quem responde pela empresa, não para
      // construir base de CPF.
      const socios = d.socios.map(s => ({ ...s, documento: mascararDocumento(s.documento) }))
      await this.upsertFato(clienteId, 'receita', 'socios', { valorJson: socios as never, ...comum })
    }

    // Os CNAEs também alimentam `cliente_cnaes`, que já é a tabela do cadastro —
    // é dela que vem a descrição da atividade usada na capa do cliente.
    await this.sincronizarCnaes(clienteId, d)
  }

  private async upsertFato(
    clienteId: string, bloco: string, campo: string,
    dados: { valor?: string; valorJson?: never; fonte: string; urlFonte: string; oficial: boolean; coletadoEm: Date },
  ) {
    await prisma.clienteDossieFato.upsert({
      where: { clienteId_bloco_campo: { clienteId, bloco, campo } },
      create: { clienteId, bloco, campo, ...dados },
      update: { ...dados },
    }).catch(() => { /* um campo problemático não invalida o dossiê inteiro */ })
  }

  /**
   * Espelha os CNAEs em `cliente_cnaes`. Substitui a lista da fonte oficial em
   * vez de acumular: CNAE removido na Receita tem que sumir aqui, senão a
   * atividade da empresa vira um histórico que ninguém limpa.
   */
  private async sincronizarCnaes(clienteId: string, d: DadosCnpj) {
    if (d.cnaes.length === 0) return
    await prisma.$transaction([
      prisma.clienteCnae.deleteMany({ where: { clienteId } }),
      prisma.clienteCnae.createMany({
        data: d.cnaes.map(c => ({
          clienteId, codigo: c.codigo, descricao: c.descricao || null, principal: c.principal,
        })),
      }),
    ]).catch((e) => console.warn('[Dossie] Falha ao sincronizar CNAEs:', (e as Error).message))
  }

  /** Só o CNAE principal entra direto — ver CAMPOS_AUTOMATICOS. */
  private async aplicarAutomaticos(clienteId: string, cadastro: CadastroComparavel, d: DadosCnpj): Promise<string[]> {
    const aplicados: string[] = []
    for (const campo of CAMPOS_AUTOMATICOS) {
      if (campo === 'cnaePrincipal') {
        const novo = d.cnaes.find(c => c.principal)?.codigo
        if (novo && novo !== cadastro.cnaePrincipal) {
          await prisma.cliente.update({ where: { id: clienteId }, data: { cnaePrincipal: novo } })
          aplicados.push(campo)
        }
      }
    }
    return aplicados
  }

  /**
   * Regrava a fila de pendentes deste cliente a cada coleta.
   *
   * O que já foi decidido (aprovada/rejeitada) fica; o que estava pendente é
   * substituído pelo retrato novo — senão uma divergência já resolvida na fonte
   * continuaria pedindo decisão para sempre.
   */
  private async registrarDivergencias(clienteId: string, cadastro: CadastroComparavel, d: DadosCnpj): Promise<number> {
    const divergencias = detectarDivergencias(cadastro, d)
      .filter(x => !CAMPOS_AUTOMATICOS.includes(x.campo as never))

    await prisma.clienteDossieSugestao.deleteMany({ where: { clienteId, status: 'pendente' } })
    if (divergencias.length === 0) return 0

    await prisma.clienteDossieSugestao.createMany({
      data: divergencias.map(x => ({
        clienteId, campo: x.campo,
        valorAtual: x.valorAtual, valorSugerido: x.valorSugerido,
        fonte: x.fonte, urlFonte: x.urlFonte, status: 'pendente',
      })),
    })
    return divergencias.length
  }

  // ── Decisão sobre as sugestões ───────────────────────────────

  /** Só os campos desta lista podem ser escritos por uma aprovação. */
  private static readonly CAMPOS_APLICAVEIS = new Set([
    'razaoSocial', 'nomeFantasia', 'capitalSocial',
    'cep', 'logradouro', 'numero', 'bairro', 'cidade', 'uf',
  ])

  async decidirSugestao(id: string, decisao: 'aprovada' | 'rejeitada', usuarioId?: string, observacao?: string) {
    const sug = await prisma.clienteDossieSugestao.findUnique({ where: { id } })
    if (!sug) throw new Error('Sugestão não encontrada.')
    if (sug.status !== 'pendente') throw new Error('Esta sugestão já foi decidida.')

    if (decisao === 'aprovada') {
      if (!DossieService.CAMPOS_APLICAVEIS.has(sug.campo)) {
        throw new Error(`O campo "${sug.campo}" não pode ser atualizado pelo dossiê.`)
      }
      const valor: unknown = sug.campo === 'capitalSocial'
        ? (sug.valorSugerido ? Number(sug.valorSugerido) : null)
        : sug.valorSugerido
      await prisma.cliente.update({
        where: { id: sug.clienteId },
        data: { [sug.campo]: valor } as never,
      })
    }

    await prisma.clienteDossieSugestao.update({
      where: { id },
      data: {
        status: decisao,
        decididoPor: usuarioId ?? null,
        decididoEm: new Date(),
        observacao: observacao ?? null,
      },
    })
    if (usuarioId) {
      await this.registrarAcesso(sug.clienteId, usuarioId, decisao === 'aprovada' ? 'aprovou_sugestao' : 'rejeitou_sugestao')
    }
    return { ok: true }
  }
}

/** `12345678900` → `***456789**`: identifica sem expor o documento inteiro. */
export function mascararDocumento(doc: string | null | undefined): string {
  const limpo = String(doc ?? '').replace(/\D/g, '')
  if (limpo.length !== 11) return String(doc ?? '') // já mascarado pela fonte, ou é CNPJ
  return `***${limpo.slice(3, 9)}**`
}
