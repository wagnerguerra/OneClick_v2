import { Injectable, Inject, forwardRef } from '@nestjs/common'
import { prisma } from '@saas/db'
import { RecorrenciaScheduler } from '../notificacao/recorrencia.scheduler'
import type { CreateObrigacaoInput, ListObrigacoesInput } from '@saas/types'

@Injectable()
export class ObrigacaoService {
  constructor(
    @Inject(forwardRef(() => RecorrenciaScheduler))
    private readonly recorrenciaScheduler: RecorrenciaScheduler,
  ) {}

  /**
   * Lista todos os templates globais marcados como `ehObrigacaoAcessoria=true`
   * (empresaId=null = catálogo global compartilhado). Para cada um anexa:
   *  - recorrencia (já persistida)
   *  - proximaExecucao (recalculada em runtime via RecorrenciaScheduler)
   *  - contagem de execuções vigentes
   */
  async listObrigacoes(filtro: ListObrigacoesInput) {
    const where: any = {
      empresaId: null,
      ehObrigacaoAcessoria: true,
    }
    if (filtro?.ativo !== undefined) where.ativo = filtro.ativo
    if (filtro?.categoria) where.categoria = filtro.categoria
    if (filtro?.search) {
      where.OR = [
        { nome: { contains: filtro.search, mode: 'insensitive' } },
        { descricao: { contains: filtro.search, mode: 'insensitive' } },
      ]
    }

    const obrigacoes = await prisma.servico.findMany({
      where,
      include: {
        recorrencia: true,
        _count: { select: { execucoes: true } },
      },
      orderBy: [{ categoria: 'asc' }, { nome: 'asc' }],
    })

    // Filtro de frequência aplicado pós-query porque está em ServicoRecorrencia.
    const filtrados = filtro?.frequencia
      ? obrigacoes.filter((o) => o.recorrencia?.frequencia === filtro.frequencia)
      : obrigacoes

    const agora = new Date()
    // Pré-carrega feriados do ano corrente + próximo (cobre regras
    // mensais/trimestrais que apontam pra próxima ocorrência no início do
    // ano seguinte). Custo: 1 query, 1× por chamada de list.
    const extrasNaoUteis = await this.recorrenciaScheduler.carregarDiasNaoUteis([
      agora.getFullYear(),
      agora.getFullYear() + 1,
    ])
    return filtrados.map((o) => {
      const r = o.recorrencia
      const proxima = r
        ? this.recorrenciaScheduler.calcularProximaExecucao(
            {
              frequencia: r.frequencia,
              ancoragem: r.ancoragem,
              valorAncoragem: r.valorAncoragem,
              competenciaOffset: r.competenciaOffset,
              modoPersonalizado: r.modoPersonalizado,
              diasDoMes: r.diasDoMes,
              mesesDoAno: r.mesesDoAno,
              ajusteVencimento: r.ajusteVencimento,
            },
            agora,
            extrasNaoUteis,
          )
        : null
      return {
        id: o.id,
        nome: o.nome,
        descricao: o.descricao,
        categoria: o.categoria,
        ativo: o.ativo,
        prioridadePadrao: o.prioridadePadrao,
        fonteUrl: o.fonteUrl,
        documentacaoUrl: o.documentacaoUrl,
        recorrencia: r
          ? {
              frequencia: r.frequencia,
              ancoragem: r.ancoragem,
              valorAncoragem: r.valorAncoragem,
              competenciaOffset: r.competenciaOffset,
              modoPersonalizado: r.modoPersonalizado,
              diasDoMes: r.diasDoMes,
              mesesDoAno: r.mesesDoAno,
              ativa: r.ativa,
            }
          : null,
        proximaExecucao: proxima,
        totalExecucoes: o._count.execucoes,
      }
    })
  }

  async toggleAtivo(id: string) {
    const atual = await prisma.servico.findUnique({ where: { id }, select: { ativo: true, ehObrigacaoAcessoria: true } })
    if (!atual || !atual.ehObrigacaoAcessoria) throw new Error('Obrigação não encontrada')
    return prisma.servico.update({ where: { id }, data: { ativo: !atual.ativo } })
  }

  async createObrigacao(input: CreateObrigacaoInput) {
    return prisma.$transaction(async (tx) => {
      const servico = await tx.servico.create({
        data: {
          nome: input.nome,
          descricao: input.descricao ?? null,
          categoria: input.categoria,
          categoriaServico: 'MENSAL',
          ehObrigacaoAcessoria: true,
          atribuicaoResponsavel: 'CLIENTE_AREA',
          fonteUrl: input.fonteUrl ?? null,
          documentacaoUrl: input.documentacaoUrl ?? null,
          empresaId: null,
        },
      })
      if (input.recorrencia) {
        await tx.servicoRecorrencia.create({
          data: {
            servicoId: servico.id,
            ativa: true,
            frequencia: input.recorrencia.frequencia,
            ancoragem: input.recorrencia.ancoragem,
            valorAncoragem: input.recorrencia.valorAncoragem,
            competenciaOffset: input.recorrencia.competenciaOffset,
          },
        })
      }
      return servico
    })
  }

  /**
   * Calendário do ano: expande as próximas execuções de cada obrigação ativa
   * dentro do ano informado. Usa o RecorrenciaScheduler para gerar até 60 datas
   * por regra e filtra as que caem no ano.
   *
   * Retorno: lista chata de {data, obrigacaoId, nome, categoria, frequencia}.
   * Frontend agrupa por data quando renderiza.
   */
  async getCalendario(ano: number) {
    const obrigacoes = await prisma.servico.findMany({
      where: { empresaId: null, ehObrigacaoAcessoria: true, ativo: true },
      include: { recorrencia: true },
    })

    const inicio = new Date(ano, 0, 1, 0, 0, 0, 0)
    const fimExclusivo = new Date(ano + 1, 0, 1, 0, 0, 0, 0)
    // Pra recorrentes que começam antes de jan/01 do ano (ex.: regra trimestral
    // cujo último disparo foi out/ano-anterior), partimos do dia 1 do ano-1
    // como cursor — o scheduler ignora datas <= cursor.
    const cursor = new Date(ano - 1, 11, 31, 0, 0, 0, 0)

    // Carrega feriados (nacionais + estaduais + municipais + PF) do ano corrente
    // e do anterior — usados como "dias não úteis extras" no cálculo de ajuste.
    const extrasNaoUteis = await this.recorrenciaScheduler.carregarDiasNaoUteis([ano - 1, ano])

    type Evento = { obrigacaoId: string; nome: string; categoria: string | null; frequencia: string; data: string }
    const eventos: Evento[] = []

    for (const o of obrigacoes) {
      const r = o.recorrencia
      if (!r || !r.ativa) continue
      // 60 ocorrências é folga generosa: maior frequência (DIARIA) gera 1/dia,
      // 60 cobre ~2 meses; anuais geram 60 anos. Em geral filtramos pelo ano.
      const datas = this.recorrenciaScheduler.proximasExecucoes(
        {
          frequencia: r.frequencia,
          ancoragem: r.ancoragem,
          valorAncoragem: r.valorAncoragem,
          competenciaOffset: r.competenciaOffset,
          modoPersonalizado: r.modoPersonalizado,
          diasDoMes: r.diasDoMes,
          mesesDoAno: r.mesesDoAno,
          ajusteVencimento: r.ajusteVencimento,
        },
        cursor,
        60,
        extrasNaoUteis,
      )
      for (const d of datas) {
        if (d.getTime() < inicio.getTime()) continue
        if (d.getTime() >= fimExclusivo.getTime()) break
        eventos.push({
          obrigacaoId: o.id,
          nome: o.nome,
          categoria: o.categoria,
          frequencia: r.frequencia,
          data: d.toISOString(),
        })
      }
    }

    return eventos
  }

  /**
   * Tokens-âncora para match entre obrigação OneClick e nome no Acessórias.
   * Cada obrigação tem 1+ "alternativas" (OR). Cada alternativa é uma lista
   * de tokens que precisam estar TODOS presentes (AND) no acessoriasNome
   * normalizado. Match é case/acento-insensitive.
   *
   * Mantido inline aqui (não em config externa) pra que mudanças no catálogo
   * de 28 obrigações + nomes do Acessórias fiquem versionadas no mesmo lugar.
   */
  private readonly ACESSORIAS_PATTERNS: Record<string, string[][]> = {
    'DAS — Simples Nacional':            [['das', 'mensal'], ['extrato', 'pgdas']],
    'DASN-SIMEI':                        [['dasn'], ['simei']],
    'DEFIS':                             [['defis']],
    'DCTFWeb':                           [['dctfweb'], ['dctf', 'web']],
    'EFD-Contribuições':                 [['efd', 'contribuic']],
    'EFD-Reinf':                         [['reinf']],
    'PIS/COFINS':                        [['darf', 'pis'], ['darf', 'cofins']],
    'IRPJ/CSLL — Lucro Presumido':       [['darf', 'irpj'], ['darf', 'csll'], ['irpj', 'presumido']],
    'IRPJ/CSLL — Lucro Real':            [['darf', 'irpj'], ['darf', 'csll'], ['irpj', 'real']],
    'ECD':                               [['sped', 'ecd'], ['escrituracao', 'contabil', 'digital']],
    'ECF':                               [['sped', 'ecf'], ['escrituracao', 'contabil', 'fiscal']],
    'EFD ICMS/IPI':                      [['efd', 'icms'], ['sped', 'fiscal']],
    'IRPF':                              [['irpf']],
    'DIMOB':                             [['dimob']],
    'DITR':                              [['ditr']],
    'Informe de Rendimentos':            [['informe', 'rendiment']],
    'eSocial':                           [['esocial'], ['e-social']],
    'FGTS Digital':                      [['fgts', 'digital'], ['fgts', 'guia']],
    'INSS':                              [['darf', 'inss']],
    'IRRF':                              [['darf', 'irrf'], ['bases', 'irrf']],
    'Pagamento de Salários':             [['folha', 'pagamento'], ['recibo', 'pagamento', 'salario']],
    '13º Salário — 1ª Parcela':          [['13', 'primeira'], ['13', '1', 'parcela']],
    '13º Salário — 2ª Parcela':          [['13', 'segunda'], ['13', '2', 'parcela']],
    'ICMS — Apuração Mensal':            [['registro', 'apuracao', 'icms'], ['dua', 'icms']],
    'DeSTDA':                            [['destda']],
    'ISSQN':                             [['issqn'], ['servico', 'prestado'], ['servicos', 'tomado']],
    'Balancete':                         [['balancete']],
    'Balanço Patrimonial Anual':         [['balanco', 'patrimonial'], ['livro', 'razao']],
  }

  private normalizarTexto(s: string): string {
    // Remove combining diacritical marks (U+0300..U+036F) — acentos isolados
    // após NFD ficam nesse range. Resultado: "Salário" → "salario".
    return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  }

  /** True se `nomeAcessorias` matchea alguma alternativa de patterns da obrigação. */
  private matchObrigacaoAcessorias(nomeObrigacao: string, nomeAcessorias: string): boolean {
    const nomeNorm = this.normalizarTexto(nomeAcessorias)
    // Encontra a entrada do patterns cuja chave é prefixo do nomeObrigacao
    let patterns: string[][] | null = null
    for (const [key, alts] of Object.entries(this.ACESSORIAS_PATTERNS)) {
      if (nomeObrigacao.startsWith(key)) { patterns = alts; break }
    }
    if (!patterns) return false
    // Pelo menos uma alternativa precisa ter TODOS os tokens presentes
    return patterns.some((alt) => alt.every((tok) => nomeNorm.includes(tok)))
  }

  /**
   * Auditoria histórica usando deliveries já sincronizadas do Acessórias
   * (tabela ServicoExecucao com acessoriasPrazo preenchido).
   *
   * Para cada obrigação ativa, compara prazoOficial (Acessórias) com data
   * teórica (recorrência sem ajuste) e detecta o padrão de ajuste real:
   *   delta > 0  → órgão POSTERGOU (vencimento veio depois do teórico)
   *   delta < 0  → órgão ANTECIPOU
   *   delta = 0  → MANTEVE
   *
   * Quando ≥60% dos casos "relevantes" (teórico cai em FDS/feriado) convergem
   * para uma direção, sugere ajustar. Senão, devolve "inconclusivo".
   */
  async auditar(opts?: { mesesHistorico?: number }) {
    const meses = opts?.mesesHistorico ?? 60
    const obrigacoes = await prisma.servico.findMany({
      where: { empresaId: null, ehObrigacaoAcessoria: true, ativo: true },
      include: { recorrencia: true },
    })

    const inicioJanela = new Date()
    inicioJanela.setMonth(inicioJanela.getMonth() - meses)

    // Carrega feriados pra checar se o teórico cairia em dia não útil
    const anoMin = inicioJanela.getFullYear()
    const anoMax = new Date().getFullYear()
    const anos = Array.from({ length: anoMax - anoMin + 1 }, (_, i) => anoMin + i)
    const extrasNaoUteis = await this.recorrenciaScheduler.carregarDiasNaoUteis(anos)

    type LinhaAuditoria = {
      obrigacaoId: string
      nome: string
      categoria: string | null
      ajusteAtual: 'MANTER' | 'ANTECIPAR' | 'POSTERGAR'
      amostras: number              // total de execuções com acessoriasPrazo
      relevantes: number            // dos quais teórico cai em FDS/feriado
      postergados: number
      antecipados: number
      mantidos: number              // teórico cai em FDS mas oficial coincide (raro)
      outliersGrandes: number       // delta |>7d| — sinal de regra mal cadastrada
      regraSuspeita: boolean        // ≥50% das amostras com delta grande
      sugestao: 'MANTER' | 'ANTECIPAR' | 'POSTERGAR' | 'INCONCLUSIVO' | 'SEM_DADOS' | 'REGRA_SUSPEITA'
      confianca: number             // 0..100
      exemplos: Array<{ competencia: string; teorico: string; oficial: string; deltaDias: number }>
    }

    // Carrega TODAS as execuções com dados do Acessórias UMA vez (antes do
    // loop). Filtragem por nome acontece em memória.
    const todasExecucoes = await prisma.servicoExecucao.findMany({
      where: {
        acessoriasPrazo: { not: null, gte: inicioJanela },
        acessoriasComp: { not: null },
        acessoriasNome: { not: null },
      },
      select: { acessoriasPrazo: true, acessoriasComp: true, acessoriasNome: true },
      orderBy: { acessoriasPrazo: 'desc' },
    })

    const resultado: LinhaAuditoria[] = []

    for (const o of obrigacoes) {
      const r = o.recorrencia
      const ajusteAtual = (r?.ajusteVencimento as any) ?? 'MANTER'
      const linha: LinhaAuditoria = {
        obrigacaoId: o.id,
        nome: o.nome,
        categoria: o.categoria,
        ajusteAtual,
        amostras: 0,
        relevantes: 0,
        postergados: 0,
        antecipados: 0,
        mantidos: 0,
        outliersGrandes: 0,
        regraSuspeita: false,
        sugestao: 'SEM_DADOS',
        confianca: 0,
        exemplos: [],
      }

      if (!r) { resultado.push(linha); continue }

      // Match flexível por nome do Acessórias (não por servicoId — os mappings
      // antigos podem apontar pra serviços diferentes do template global).
      const execucoes = todasExecucoes.filter((e) =>
        e.acessoriasNome ? this.matchObrigacaoAcessorias(o.nome, e.acessoriasNome) : false,
      )

      linha.amostras = execucoes.length

      for (const e of execucoes) {
        if (!e.acessoriasComp || !e.acessoriasPrazo) continue
        const teorico = this.recorrenciaScheduler.dataTeoricaParaCompetencia(
          new Date(e.acessoriasComp),
          {
            frequencia: r.frequencia,
            ancoragem: r.ancoragem,
            valorAncoragem: r.valorAncoragem,
            competenciaOffset: r.competenciaOffset,
          },
        )
        if (!teorico) continue
        const oficial = new Date(e.acessoriasPrazo)
        // Só consideramos "relevante" quando o teórico cai em FDS/feriado —
        // são esses casos que revelam a política do órgão.
        const teoricoEhNaoUtil = (() => {
          const dia = teorico.getDay()
          if (dia === 0 || dia === 6) return true
          const mm = String(teorico.getMonth() + 1).padStart(2, '0')
          const dd = String(teorico.getDate()).padStart(2, '0')
          return extrasNaoUteis.has(`${teorico.getFullYear()}-${mm}-${dd}`)
        })()
        if (!teoricoEhNaoUtil) continue
        linha.relevantes++

        // Compara em dias (UTC pra evitar shift)
        const deltaDias = Math.round(
          (Date.UTC(oficial.getFullYear(), oficial.getMonth(), oficial.getDate())
            - Date.UTC(teorico.getFullYear(), teorico.getMonth(), teorico.getDate()))
          / (1000 * 60 * 60 * 24),
        )
        // Delta > 7 dias = provável regra mal cadastrada (offset/valorAncoragem
        // errado), não ajuste de FDS. Marca como outlier e não conta na decisão.
        if (Math.abs(deltaDias) > 7) {
          linha.outliersGrandes++
        } else if (deltaDias > 0) linha.postergados++
        else if (deltaDias < 0) linha.antecipados++
        else linha.mantidos++

        if (linha.exemplos.length < 5) {
          linha.exemplos.push({
            competencia: e.acessoriasComp.toISOString().slice(0, 10),
            teorico: teorico.toISOString().slice(0, 10),
            oficial: oficial.toISOString().slice(0, 10),
            deltaDias,
          })
        }
      }

      // Detecta regra suspeita ANTES de classificar: se metade ou mais das
      // amostras tem delta > 7 dias, a regra de recorrência está provavelmente
      // mal cadastrada (offset / valor errado), não é caso de ajuste de FDS.
      linha.regraSuspeita = linha.amostras > 0 && (linha.outliersGrandes / linha.amostras) >= 0.5

      // Decisão da sugestão
      if (linha.amostras === 0) {
        linha.sugestao = 'SEM_DADOS'
      } else if (linha.regraSuspeita) {
        linha.sugestao = 'REGRA_SUSPEITA'
        linha.confianca = Math.round((linha.outliersGrandes / linha.amostras) * 100)
      } else if (linha.relevantes === 0) {
        // Nenhuma vez caiu em FDS/feriado — qualquer ajuste é equivalente a MANTER
        linha.sugestao = 'MANTER'
        linha.confianca = 100
      } else {
        const top = Math.max(linha.postergados, linha.antecipados, linha.mantidos)
        const ratio = top / linha.relevantes
        if (ratio < 0.6) {
          linha.sugestao = 'INCONCLUSIVO'
          linha.confianca = Math.round(ratio * 100)
        } else {
          linha.confianca = Math.round(ratio * 100)
          if (top === linha.postergados) linha.sugestao = 'POSTERGAR'
          else if (top === linha.antecipados) linha.sugestao = 'ANTECIPAR'
          else linha.sugestao = 'MANTER'
        }
      }

      resultado.push(linha)
    }

    return resultado
  }

  /**
   * Aplica a sugestão de auditoria — atualiza ServicoRecorrencia.ajusteVencimento.
   * Recalcula proximaExecucao com o novo ajuste.
   */
  async aplicarSugestao(obrigacaoId: string, novoAjuste: 'MANTER' | 'ANTECIPAR' | 'POSTERGAR') {
    const r = await prisma.servicoRecorrencia.findUnique({ where: { servicoId: obrigacaoId } })
    if (!r) throw new Error('Recorrência não encontrada para essa obrigação.')

    const agora = new Date()
    const extrasNaoUteis = await this.recorrenciaScheduler.carregarDiasNaoUteis([
      agora.getFullYear(),
      agora.getFullYear() + 1,
    ])
    const proxima = this.recorrenciaScheduler.calcularProximaExecucao(
      {
        frequencia: r.frequencia,
        ancoragem: r.ancoragem,
        valorAncoragem: r.valorAncoragem,
        competenciaOffset: r.competenciaOffset,
        modoPersonalizado: r.modoPersonalizado,
        diasDoMes: r.diasDoMes,
        mesesDoAno: r.mesesDoAno,
        ajusteVencimento: novoAjuste,
      },
      agora,
      extrasNaoUteis,
    )
    return prisma.servicoRecorrencia.update({
      where: { servicoId: obrigacaoId },
      data: { ajusteVencimento: novoAjuste, proximaExecucao: proxima },
    })
  }

  /**
   * Estatísticas pro header da página: total por categoria + total ativo.
   */
  async getStats() {
    const todas = await prisma.servico.findMany({
      where: { empresaId: null, ehObrigacaoAcessoria: true },
      select: { categoria: true, ativo: true },
    })
    const stats = {
      total: todas.length,
      ativas: todas.filter((o) => o.ativo).length,
      porCategoria: { Fiscal: 0, Trabalhista: 0, Contábil: 0 } as Record<string, number>,
    }
    for (const o of todas) {
      if (o.categoria) stats.porCategoria[o.categoria] = (stats.porCategoria[o.categoria] ?? 0) + 1
    }
    return stats
  }
}
