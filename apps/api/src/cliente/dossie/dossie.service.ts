import { Injectable, Inject } from '@nestjs/common'
import { prisma } from '@saas/db'
import { CadeiaProvedoresService } from './cadeia-provedores.service'
import { detectarDivergencias, CAMPOS_AUTOMATICOS, type CadastroComparavel } from './divergencias'
import type { DadosCnpj } from './provedor-cnpj'
import { perfisDoSite } from './redes-sociais'
import { buscarComGuarda } from '../../common/fetch-seguro'

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

    // CPF completo dos sócios — vem da tabela `socios`, preenchida pela
    // Legalização a partir do PDF da Situação Fiscal (Integra Contador).
    //
    // O documento que o PROVEDOR devolve continua mascarado no fato gravado, e
    // isso não muda: a base de CPF é aquela, obtida como contador da empresa,
    // e não uma cópia feita a partir da consulta pública.
    const socios = await prisma.socio.findMany({
      where: { clienteId, cpf: { not: '' } },
      select: { nomeCompleto: true, cpf: true, participacao: true },
    }).catch(() => [])
    const cpfPorNome = new Map(
      socios.map(s => [this.chaveNome(s.nomeCompleto), {
        cpf: s.cpf,
        participacao: s.participacao != null ? Number(s.participacao) : null,
      }]),
    )

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

    // O quadro societário do dossiê ganha o CPF que a casa já tem. Casar por
    // nome é o único caminho: o documento do provedor vem mascarado, então não
    // serve de chave.
    const doQsa = blocos['receita']?.find(f => f.campo === 'socios')
    if (doQsa && Array.isArray(doQsa.valorJson) && cpfPorNome.size > 0) {
      doQsa.valorJson = (doQsa.valorJson as Array<Record<string, unknown>>).map(s => {
        const conhecido = cpfPorNome.get(this.chaveNome(String(s.nome ?? '')))
        return conhecido
          ? { ...s, documento: conhecido.cpf, documentoCompleto: true, participacao: conhecido.participacao }
          : s
      })
    }

    return {
      blocos,
      sugestoes,
      ultimaColeta: ultimaColeta ?? null,
      vazio: fatos.length === 0,
      /** Quantos sócios ainda estão sem CPF completo — a tela oferece buscar. */
      sociosSemCpf: Array.isArray(doQsa?.valorJson)
        ? (doQsa.valorJson as Array<Record<string, unknown>>).filter(x => !x.documentoCompleto).length
        : 0,
    }
  }

  /**
   * Nome vira chave comparável: sem acento, sem pontuação, caixa única.
   * "JOSÉ DA SILVA" e "Jose da Silva" são a mesma pessoa no QSA.
   */
  private chaveNome(nome: string): string {
    return nome
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, ' ')
      .trim()
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
  async enriquecer(
    clienteId: string,
    opts?: {
      forcar?: boolean
      usuarioId?: string
      /**
       * Narra o que está acontecendo, passo a passo. Existe porque a coleta
       * encadeia até tres provedores e pode levar dezenas de segundos: sem
       * isso, a tela mostra um spinner mudo e ninguem sabe se travou.
       */
      passo?: (p: { chave: string; rotulo: string; status: 'rodando' | 'ok' | 'erro'; detalhe?: string }) => void
    },
  ): Promise<ResultadoEnriquecimento> {
    const passo = opts?.passo
    const cliente = await prisma.cliente.findUnique({
      where: { id: clienteId },
      select: {
        id: true, documento: true, cnpjAcessorias: true, tipoDocumento: true,
        email: true,
        razaoSocial: true, nomeFantasia: true, cnaePrincipal: true,
        inscricaoEstadual: true, capitalSocial: true,
        cep: true, logradouro: true, numero: true, complemento: true,
        bairro: true, cidade: true, uf: true, telefone: true,
        dataAbertura: true, naturezaJuridica: true, porte: true, situacaoCadastral: true,
      },
    })
    if (!cliente) return { clienteId, ok: false, motivo: 'Cliente não encontrado.' }
    if (cliente.tipoDocumento !== 'CNPJ') {
      return { clienteId, ok: false, motivo: 'O dossiê é de pessoa jurídica; este cliente é CPF.' }
    }

    if (!opts?.forcar) {
      passo?.({ chave: 'cache', rotulo: 'Vendo se já há coleta recente', status: 'rodando' })
      const recente = await this.coletaDentroDoTtl(clienteId)
      passo?.({
        chave: 'cache', rotulo: 'Vendo se já há coleta recente', status: 'ok',
        detalhe: recente ? `sim, de ${recente.fonte} — nada a consultar` : 'não; vamos consultar',
      })
      if (recente) return { clienteId, ok: true, doCache: true, fonte: recente.fonte }
    }

    const documento = cliente.cnpjAcessorias || cliente.documento
    passo?.({ chave: 'consulta', rotulo: `Consultando o CNPJ ${documento}`, status: 'rodando' })

    const { dados, tentativas, erroTerminal } = await this.cadeia.consultar(documento, (t) => {
      if (t.iniciando) {
        passo?.({ chave: `prov-${t.fonte}`, rotulo: `Perguntando ao ${t.fonte}`, status: 'rodando' })
        return
      }
      passo?.({
        chave: `prov-${t.fonte}`,
        rotulo: `Perguntando ao ${t.fonte}`,
        status: t.status === 'ok' ? 'ok' : 'erro',
        detalhe: t.status === 'ok' ? `${t.latenciaMs} ms` : (t.erro ?? t.status),
      })
    })
    passo?.({ chave: 'consulta', rotulo: `Consultando o CNPJ ${documento}`, status: dados ? 'ok' : 'erro' })

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
      complemento: cliente.complemento,
      bairro: cliente.bairro,
      cidade: cliente.cidade,
      uf: cliente.uf,
      telefone: cliente.telefone,
      email: cliente.email,
      // Data vira texto no formato da fonte ('AAAA-MM-DD') só para comparar.
      dataAbertura: cliente.dataAbertura ? cliente.dataAbertura.toISOString().slice(0, 10) : null,
      naturezaJuridica: cliente.naturezaJuridica,
      porte: cliente.porte,
      situacaoCadastral: cliente.situacaoCadastral,
    }

    passo?.({ chave: 'fatos', rotulo: 'Gravando os dados coletados', status: 'rodando' })
    await this.gravarFatos(clienteId, dados)
    passo?.({ chave: 'fatos', rotulo: 'Gravando os dados coletados', status: 'ok' })

    passo?.({ chave: 'auto', rotulo: 'Preenchendo o que estava em branco no cadastro', status: 'rodando' })
    const aplicadosDireto = await this.aplicarAutomaticos(clienteId, comparavel, dados)
    passo?.({
      chave: 'auto', rotulo: 'Preenchendo o que estava em branco no cadastro', status: 'ok',
      detalhe: aplicadosDireto.length > 0 ? `${aplicadosDireto.length} campo(s)` : 'nada a preencher',
    })

    passo?.({ chave: 'div', rotulo: 'Comparando com o cadastro atual', status: 'rodando' })
    const divergencias = await this.registrarDivergencias(clienteId, comparavel, dados)
    passo?.({
      chave: 'div', rotulo: 'Comparando com o cadastro atual', status: 'ok',
      detalhe: divergencias > 0 ? `${divergencias} divergência(s) para decidir` : 'sem divergências',
    })

    passo?.({ chave: 'redes', rotulo: 'Procurando as redes sociais no site da empresa', status: 'rodando' })
    const redes = await this.coletarRedes(clienteId, cliente.email, dados.email)
    passo?.({
      chave: 'redes', rotulo: 'Procurando as redes sociais no site da empresa', status: 'ok',
      detalhe: redes > 0 ? `${redes} perfil(is)` : 'nenhum perfil no site',
    })

    if (opts?.usuarioId) await this.registrarAcesso(clienteId, opts.usuarioId, 'atualizou')

    return { clienteId, ok: true, fonte: dados.fonte, divergencias, aplicadosDireto }
  }

  /**
   * Perfis da empresa nas redes, lidos do rodapé do próprio site.
   *
   * Não é palpite: o link está publicado lá por quem fez o site. O domínio sai
   * do e-mail do cadastro ou do que a Receita devolveu — o mesmo caminho que a
   * busca de logomarca usa.
   */
  private async coletarRedes(
    clienteId: string,
    emailCadastro: string | null,
    emailReceita: string | null,
  ): Promise<number> {
    const dominio = this.dominioDeEmail(emailCadastro) || this.dominioDeEmail(emailReceita)
    if (!dominio) return 0

    const perfis = await perfisDoSite(dominio, (url) => buscarComGuarda(url, { redirect: 'follow' }))
    if (perfis.length === 0) return 0

    await this.upsertFato(clienteId, 'redes', 'perfis', {
      valorJson: perfis as never,
      fonte: `site (${dominio})`,
      urlFonte: `https://${dominio}`,
      // Não é dado oficial da Receita: é o que a empresa publica de si mesma.
      oficial: false,
      coletadoEm: new Date(),
    })
    return perfis.length
  }

  /** Provedor gratuito não é o domínio da empresa; o resto é. */
  private dominioDeEmail(bruto: string | null | undefined): string {
    const m = String(bruto ?? '').match(/[A-Za-z0-9._%+-]+@([A-Za-z0-9.-]+\.[A-Za-z]{2,})/)
    const d = (m?.[1] ?? '').toLowerCase().replace(/\.$/, '')
    const GRATUITOS = new Set([
      'gmail.com', 'hotmail.com', 'hotmail.com.br', 'outlook.com', 'outlook.com.br',
      'yahoo.com', 'yahoo.com.br', 'uol.com.br', 'bol.com.br', 'terra.com.br',
      'live.com', 'icloud.com', 'globo.com', 'ig.com.br', 'me.com', 'msn.com',
    ])
    return d && !GRATUITOS.has(d) ? d : ''
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
    'cep', 'logradouro', 'numero', 'complemento', 'bairro', 'cidade', 'uf',
    'telefone', 'email',
    'dataAbertura', 'naturezaJuridica', 'porte', 'situacaoCadastral',
  ])

  /**
   * Aplica de uma vez tudo o que só PREENCHE campo vazio.
   *
   * A distinção é o ponto: preencher um campo em branco com o dado oficial não
   * apaga trabalho de ninguém — é ganho puro, e pedir clique um a um para dez
   * campos vazios só faz o usuário desistir. Já SOBRESCREVER um campo
   * preenchido é outra conversa, e continua exigindo decisão campo a campo: o
   * cadastro é mantido à mão há anos e às vezes está mais certo que a Receita
   * (endereço novo que ainda não chegou lá).
   */
  async preencherVazios(clienteId: string, usuarioId?: string): Promise<{ aplicados: number }> {
    const pendentes = await prisma.clienteDossieSugestao.findMany({
      where: { clienteId, status: 'pendente' },
    })

    const vazios = pendentes.filter(s =>
      !s.valorAtual?.trim() && DossieService.CAMPOS_APLICAVEIS.has(s.campo))
    if (vazios.length === 0) return { aplicados: 0 }

    const dados: Record<string, unknown> = {}
    for (const s of vazios) {
      dados[s.campo] = DossieService.valorParaColuna(s.campo, s.valorSugerido)
    }

    // Uma escrita só: dez updates seguidos deixariam o cadastro em estado
    // intermediário se um deles falhasse no meio.
    await prisma.cliente.update({ where: { id: clienteId }, data: dados as never })
    await prisma.clienteDossieSugestao.updateMany({
      where: { id: { in: vazios.map(s => s.id) } },
      data: { status: 'aprovada', decididoPor: usuarioId ?? null, decididoEm: new Date() },
    })
    if (usuarioId) await this.registrarAcesso(clienteId, usuarioId, 'preencheu_vazios')

    return { aplicados: vazios.length }
  }

  /**
   * A sugestão guarda TEXTO; a coluna nem sempre é texto. Sem esta conversão,
   * `dataAbertura` receberia a string 'AAAA-MM-DD' numa coluna de data e o
   * Prisma recusaria a escrita inteira — junto com os outros campos do lote.
   */
  private static valorParaColuna(campo: string, valor: string | null): unknown {
    if (!valor) return null
    if (campo === 'capitalSocial') return Number(valor)
    if (campo === 'dataAbertura') {
      const d = new Date(`${valor}T00:00:00.000Z`)
      return Number.isNaN(d.getTime()) ? null : d
    }
    return valor
  }

  async decidirSugestao(id: string, decisao: 'aprovada' | 'rejeitada', usuarioId?: string, observacao?: string) {
    const sug = await prisma.clienteDossieSugestao.findUnique({ where: { id } })
    if (!sug) throw new Error('Sugestão não encontrada.')
    if (sug.status !== 'pendente') throw new Error('Esta sugestão já foi decidida.')

    if (decisao === 'aprovada') {
      if (!DossieService.CAMPOS_APLICAVEIS.has(sug.campo)) {
        throw new Error(`O campo "${sug.campo}" não pode ser atualizado pelo dossiê.`)
      }
      const valor = DossieService.valorParaColuna(sug.campo, sug.valorSugerido)
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
