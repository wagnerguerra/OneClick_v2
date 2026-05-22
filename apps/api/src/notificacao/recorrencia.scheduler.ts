import { Injectable, Logger, OnModuleInit, OnModuleDestroy, Inject, forwardRef } from '@nestjs/common'
import { CronJob } from 'cron'
import { prisma } from '@saas/db'
import { ServicoService } from '../servico/servico.service'
import { aplicarAjusteVencimento } from './feriados-br'

/**
 * Scheduler diário (6h) que dispara execuções recorrentes.
 *
 * Para cada registro ServicoRecorrencia ativo com proximaExecucao<=now:
 *  1. Cria ServicoExecucao via ServicoService.createExecucao() — reusa toda a
 *     lógica de criação (passos, prazo, watchers etc).
 *  2. Atualiza ultimaExecucao e recalcula proximaExecucao.
 *
 * Modos:
 *  - Simples: frequencia + ancoragem + valorAncoragem (1 disparo por período).
 *  - Personalizado: modoPersonalizado=true + diasDoMes[] + mesesDoAno[] —
 *    permite múltiplos disparos no mesmo mês (ex.: dias 5 e 20) e filtragem
 *    por meses específicos (ex.: trimestral em jan/abr/jul/out).
 *
 * Idempotência: a regra avança o cursor proximaExecucao ao final do disparo.
 * Se o scheduler rodar 2 vezes no mesmo dia (ex.: restart), o segundo run
 * verá proximaExecucao já no futuro e pulará.
 */
@Injectable()
export class RecorrenciaScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RecorrenciaScheduler.name)
  private job: CronJob | null = null

  // Sentinela: 31 em diasDoMes significa "último dia do mês" (já que muitos
  // meses não têm dia 31, clamp natural). Centralizar pra evitar number mágico.
  static readonly ULTIMO_DIA = 31

  constructor(
    @Inject(forwardRef(() => ServicoService))
    private readonly servicoService: ServicoService,
  ) {}

  onModuleInit() {
    // Diariamente às 6h. Pode forçar manualmente via método executar().
    this.job = new CronJob('0 6 * * *', () => { void this.executar() })
    this.job.start()
    this.logger.log('RecorrenciaScheduler iniciado — cron 0 6 * * *')
  }

  onModuleDestroy() {
    this.job?.stop()
    this.job = null
  }

  async executar(): Promise<{ disparados: number; ignorados: number; erros: number }> {
    const agora = new Date()
    const stats = { disparados: 0, ignorados: 0, erros: 0 }

    const recorrencias = await prisma.servicoRecorrencia.findMany({
      where: {
        ativa: true,
        OR: [{ proximaExecucao: { lte: agora } }, { proximaExecucao: null }],
      },
      include: {
        servico: {
          select: {
            id: true, nome: true, empresaId: true,
            contratoServicos: {
              select: {
                contrato: { select: { clienteId: true, status: true } },
              },
            },
          },
        },
      },
    })

    for (const r of recorrencias) {
      try {
        // Cliente "ativo" = contrato em vigência (assinado e em prazo)
        const clientesIds = Array.from(new Set(
          r.servico.contratoServicos
            .filter(cs => cs.contrato?.status === 'VIGENTE' || cs.contrato?.status === 'ASSINADO')
            .map(cs => cs.contrato!.clienteId),
        ))
        if (clientesIds.length === 0) {
          stats.ignorados++
          this.logger.debug(`[Recorrencia] Serviço "${r.servico.nome}" sem clientes contratantes ativos — pula`)
        } else {
          // Cria 1 execução por cliente. Atribui responsavelPadrao quando definido.
          for (const clienteId of clientesIds) {
            await this.servicoService.createExecucao(
              {
                servicoId: r.servicoId,
                clienteId,
                responsavelId: r.responsavelPadrao ?? undefined,
              },
              r.empresaId || undefined,
            )
            stats.disparados++
          }
        }
        // Atualiza cursor — independente de ter disparado (evita loop em
        // serviços sem clientes contratantes que sempre cairiam aqui).
        const proxima = this.calcularProximaExecucao(r as any, agora)
        await prisma.servicoRecorrencia.update({
          where: { id: r.id },
          data: { ultimaExecucao: clientesIds.length > 0 ? agora : r.ultimaExecucao, proximaExecucao: proxima },
        })
      } catch (e) {
        stats.erros++
        this.logger.error(`[Recorrencia] Falha em "${r.servico.nome}": ${(e as Error).message}`)
      }
    }

    if (recorrencias.length > 0) {
      this.logger.log(`[Recorrencia] Processadas=${recorrencias.length} disparadas=${stats.disparados} ignoradas=${stats.ignorados} erros=${stats.erros}`)
    }
    return stats
  }

  /**
   * Resolve um "dia do mês" lógico para uma Date concreta, fazendo clamp
   * quando o mês não tem aquele dia. 31 = sempre último dia do mês.
   */
  private resolverDiaNoMes(ano: number, mes: number, diaLogico: number): Date {
    // Dia 0 do mês seguinte = último dia do mês atual (truque conhecido).
    const ultimo = new Date(ano, mes + 1, 0).getDate()
    if (diaLogico >= RecorrenciaScheduler.ULTIMO_DIA) {
      return new Date(ano, mes, ultimo, 9, 0, 0, 0)
    }
    const dia = Math.min(diaLogico, ultimo)
    return new Date(ano, mes, dia, 9, 0, 0, 0)
  }

  /**
   * Pré-carrega os feriados não-FDS dos anos informados a partir da tabela
   * `Feriado` (NACIONAL fixo + móvel + ESTADUAL + MUNICIPAL + PF — qualquer
   * registro vira "dia não útil"). Retorna `Set<YYYY-MM-DD>`.
   *
   * Caller usa em conjunto com `calcularProximaExecucao(r, agora, extras)`
   * pra que feriados cadastrados pelo usuário sejam respeitados no ajuste.
   */
  async carregarDiasNaoUteis(anos: number[]): Promise<Set<string>> {
    if (anos.length === 0) return new Set()
    const set = new Set<string>()
    const anoMin = Math.min(...anos)
    const anoMax = Math.max(...anos)
    const inicio = new Date(anoMin, 0, 1)
    const fimExclusivo = new Date(anoMax + 1, 0, 1)
    const feriados = await prisma.feriado.findMany({
      where: {
        OR: [
          { recorrente: true },
          { recorrente: false, data: { gte: inicio, lt: fimExclusivo } },
        ],
      },
      select: { data: true, recorrente: true },
    })
    for (const f of feriados) {
      const d = new Date(f.data)
      const mm = String(d.getUTCMonth() + 1).padStart(2, '0')
      const dd = String(d.getUTCDate()).padStart(2, '0')
      if (f.recorrente) {
        // Vale em todos os anos do intervalo
        for (const ano of anos) {
          set.add(`${ano}-${mm}-${dd}`)
        }
      } else {
        const yyyy = d.getUTCFullYear()
        set.add(`${yyyy}-${mm}-${dd}`)
      }
    }
    return set
  }

  /**
   * Modo personalizado: gera todas as datas-alvo dentro de uma janela e
   * retorna a 1ª estritamente posterior a `agora`. Varre até 13 meses pra
   * cobrir casos anuais (1 mês de buffer evita falha no fim do ano).
   *
   * O ajuste de FDS/feriado é aplicado em cima de cada candidato ANTES da
   * comparação com `agora` — assim a janela "estritamente posterior" reflete
   * o vencimento real (não o teórico).
   */
  private proximaPersonalizada(
    diasDoMes: number[],
    mesesDoAno: number[],
    agora: Date,
    ajuste: 'MANTER' | 'ANTECIPAR' | 'POSTERGAR' = 'MANTER',
    extras?: Set<string>,
  ): Date | null {
    if (diasDoMes.length === 0) return null
    const mesesValidos = mesesDoAno.length > 0 ? new Set(mesesDoAno) : null
    const cursor = new Date(agora.getFullYear(), agora.getMonth(), 1)
    for (let i = 0; i < 13; i++) {
      const ano = cursor.getFullYear()
      const mes = cursor.getMonth() // 0-indexed
      const mes1Based = mes + 1
      if (!mesesValidos || mesesValidos.has(mes1Based)) {
        // Ordena os dias pra varrer cronologicamente dentro do mês.
        const ordenados = [...diasDoMes].sort((a, b) => a - b)
        for (const d of ordenados) {
          const teorico = this.resolverDiaNoMes(ano, mes, d)
          const ajustado = aplicarAjusteVencimento(teorico, ajuste, extras)
          if (ajustado.getTime() > agora.getTime()) return ajustado
        }
      }
      cursor.setMonth(cursor.getMonth() + 1)
    }
    return null
  }

  /**
   * Aplica a regra padrão de ancoragem (DIA_DO_MES / DIA_UTIL / DIAS_APOS_COMPETENCIA)
   * pra um mês específico — usado quando o override mensal está vazio mas
   * queremos cair na regra default. Aplica ajuste de FDS/feriado no fim.
   */
  calcularComRegraPadrao(
    r: { ancoragem: string; valorAncoragem: number; competenciaOffset: number },
    ano: number,
    mes: number, // 0-indexed
    ajuste: 'MANTER' | 'ANTECIPAR' | 'POSTERGAR' = 'MANTER',
    extras?: Set<string>,
  ): Date {
    let teorico: Date
    switch (r.ancoragem) {
      case 'DIA_UTIL': {
        let d = 1, contador = 0
        teorico = new Date(ano, mes, Math.min(r.valorAncoragem, 28), 9, 0, 0, 0)
        while (d <= 31) {
          const tmp = new Date(ano, mes, d, 9, 0, 0, 0)
          if (tmp.getMonth() !== mes) break
          const dia = tmp.getDay()
          if (dia !== 0 && dia !== 6) contador++
          if (contador === r.valorAncoragem) { teorico = tmp; break }
          d++
        }
        break
      }
      case 'DIAS_APOS_COMPETENCIA': {
        const compMes = mes - r.competenciaOffset
        const fimComp = new Date(ano, compMes + 1, 0)
        teorico = new Date(fimComp.getTime() + r.valorAncoragem * 24 * 60 * 60 * 1000)
        break
      }
      case 'DIA_DO_MES':
      default:
        teorico = new Date(ano, mes, Math.min(r.valorAncoragem, 28), 9, 0, 0, 0)
    }
    return aplicarAjusteVencimento(teorico, ajuste, extras)
  }

  /**
   * Resolve o encoding de ServicoVencimentoMensal.valor pra uma data concreta
   * num dado (ano, mes 0-indexed). Retorna null quando valor=0 ("Não tem").
   *
   * Encoding:
   *   0          → null (não gera vencimento)
   *   1..31      → "Todo dia N" (clamp natural pra fevereiro: dia 30→28/29)
   *   51..70     → "N-ésimo dia útil" (51=1º, ..., 70=20º)
   *   90         → "Último dia útil" do mês
   *   outros     → null (encoding inválido)
   *
   * Ajuste de FDS/feriado é aplicado em cima do resultado (com extras
   * estaduais/municipais quando informados).
   */
  resolverVencimentoMensal(
    valor: number,
    ano: number,
    mes: number, // 0-indexed
    ajuste: 'MANTER' | 'ANTECIPAR' | 'POSTERGAR' = 'MANTER',
    extras?: Set<string>,
  ): Date | null {
    if (valor === 0) return null

    // Dia fixo (1-31)
    if (valor >= 1 && valor <= 31) {
      const ultimo = new Date(ano, mes + 1, 0).getDate()
      const dia = Math.min(valor, ultimo)
      const teorico = new Date(ano, mes, dia, 9, 0, 0, 0)
      return aplicarAjusteVencimento(teorico, ajuste, extras)
    }

    // N-ésimo dia útil (51..70 → 1..20)
    if (valor >= 51 && valor <= 70) {
      const n = valor - 50
      let d = 1, contador = 0
      while (d <= 31) {
        const tmp = new Date(ano, mes, d, 9, 0, 0, 0)
        if (tmp.getMonth() !== mes) break
        const dia = tmp.getDay()
        if (dia !== 0 && dia !== 6) contador++
        if (contador === n) {
          // Dia útil já considera FDS — ainda aplica ajuste pra feriado nacional/estadual
          return aplicarAjusteVencimento(tmp, ajuste, extras)
        }
        d++
      }
      return null
    }

    // Último dia útil
    if (valor === 90) {
      // Começa no último dia do mês e retrocede até achar um dia útil
      const ultimo = new Date(ano, mes + 1, 0).getDate()
      let d = ultimo
      while (d >= 1) {
        const tmp = new Date(ano, mes, d, 9, 0, 0, 0)
        const dia = tmp.getDay()
        if (dia !== 0 && dia !== 6) {
          // ainda aplica ajuste pra feriado
          return aplicarAjusteVencimento(tmp, ajuste, extras)
        }
        d--
      }
      return null
    }

    return null
  }

  /**
   * Lista próximas N execuções a partir de agora (uso na UI, preview).
   * Quando modo simples, retorna sequência calculando iterativamente.
   */
  proximasExecucoes(
    r: {
      frequencia: string
      ancoragem: string
      valorAncoragem: number
      competenciaOffset: number
      modoPersonalizado?: boolean
      diasDoMes?: number[]
      mesesDoAno?: number[]
      ajusteVencimento?: 'MANTER' | 'ANTECIPAR' | 'POSTERGAR'
    },
    agora: Date,
    quantidade = 5,
    extrasNaoUteis?: Set<string>,
  ): Date[] {
    const resultado: Date[] = []
    let cursor = new Date(agora.getTime())
    for (let i = 0; i < quantidade; i++) {
      const proxima = this.calcularProximaExecucao(r, cursor, extrasNaoUteis)
      if (!proxima || proxima.getTime() <= cursor.getTime()) break
      resultado.push(proxima)
      // Avança o cursor pra logo após a data calculada (1 minuto), pra
      // próxima iteração pegar a data seguinte e não a mesma.
      cursor = new Date(proxima.getTime() + 60 * 1000)
    }
    return resultado
  }

  /**
   * Calcula próxima execução a partir de agora, conforme frequência/ancoragem,
   * ou — quando modoPersonalizado=true — usando diasDoMes/mesesDoAno.
   */
  calcularProximaExecucao(
    r: {
      frequencia: string
      ancoragem: string
      valorAncoragem: number
      competenciaOffset: number
      modoPersonalizado?: boolean
      diasDoMes?: number[]
      mesesDoAno?: number[]
      /** Política aplicada quando data calculada cai em FDS/feriado nacional. */
      ajusteVencimento?: 'MANTER' | 'ANTECIPAR' | 'POSTERGAR'
      /** Overrides de vencimento por mês (key = mes 1-12, value = encoded).
       *  Quando preenchido pra um mês, sobrescreve a regra padrão naquele mês.
       *  Só faz sentido com frequencia=MENSAL. */
      vencimentosMensais?: Record<number, number>
    },
    agora: Date,
    /** Dias não-úteis adicionais (estaduais/municipais/pontos facultativos)
     *  carregados pelo caller via `carregarDiasNaoUteis(anos)`. */
    extrasNaoUteis?: Set<string>,
  ): Date {
    const ajuste = r.ajusteVencimento ?? 'MANTER'
    // Modo personalizado tem prioridade — só cai aqui se houver lista de dias.
    if (r.modoPersonalizado && r.diasDoMes && r.diasDoMes.length > 0) {
      const p = this.proximaPersonalizada(r.diasDoMes, r.mesesDoAno ?? [], agora, ajuste, extrasNaoUteis)
      // Fallback: se nada foi encontrado em 13 meses (regra mal configurada),
      // cai pro modo clássico pra evitar proximaExecucao=null travar tudo.
      if (p) return p
    }

    // Overrides por mês (Fase B Acessórias) — só ativo em MENSAL.
    // Itera próximos 13 meses a partir do mês corrente. Pra cada mês:
    //   - Se override existe e != 0: usa resolverVencimentoMensal
    //   - Senão: usa regra padrão (ancoragem + valorAncoragem)
    // Retorna a primeira data > agora.
    const overrides = r.vencimentosMensais
    if (r.frequencia === 'MENSAL' && overrides && Object.keys(overrides).length > 0) {
      const inicio = new Date(agora.getFullYear(), agora.getMonth(), 1)
      for (let i = 0; i < 13; i++) {
        const cur = new Date(inicio.getFullYear(), inicio.getMonth() + i, 1)
        const ano = cur.getFullYear()
        const mes = cur.getMonth() // 0-indexed
        const mes1Based = mes + 1
        const override = overrides[mes1Based]
        let candidato: Date | null = null
        if (override !== undefined && override !== 0) {
          candidato = this.resolverVencimentoMensal(override, ano, mes, ajuste, extrasNaoUteis)
        } else if (override === 0) {
          // Explicitamente "Não tem" pra esse mês — pula
          continue
        } else {
          // Sem override — usa regra padrão (calculada inline abaixo via dataAncoradaEm)
          // Vou retomar a regra normal no final pra evitar duplicação aqui
          candidato = this.calcularComRegraPadrao(r, ano, mes, ajuste, extrasNaoUteis)
        }
        if (candidato && candidato.getTime() > agora.getTime()) return candidato
      }
      // Fallback: nenhum mês válido em 13 meses — devolve regra padrão default no proximo mes
    }

    // Função helper: aplica ancoragem dentro de um dado mês de referência (ano, mes).
    const dataAncoradaEm = (ano: number, mes: number): Date => {
      switch (r.ancoragem) {
        case 'DIA_UTIL': {
          // Conta N dias úteis a partir do dia 1 do mês
          let d = 1, contador = 0
          while (true) {
            const tmp = new Date(ano, mes, d, 9, 0, 0, 0)
            const dia = tmp.getDay()
            if (dia !== 0 && dia !== 6) contador++
            if (contador === r.valorAncoragem) return tmp
            d++
            if (d > 31) break
          }
          return new Date(ano, mes, Math.min(r.valorAncoragem, 28), 9, 0, 0, 0)
        }
        case 'DIAS_APOS_COMPETENCIA': {
          // Mês de competência = mes - competenciaOffset. Final do mês de comp + N dias.
          const compMes = mes - r.competenciaOffset
          const fimComp = new Date(ano, compMes + 1, 0) // dia 0 do mês seguinte = último dia
          return new Date(fimComp.getTime() + r.valorAncoragem * 24 * 60 * 60 * 1000)
        }
        case 'DIA_DO_MES':
        default:
          return new Date(ano, mes, Math.min(r.valorAncoragem, 28), 9, 0, 0, 0)
      }
    }

    // Determina o "mês alvo" base conforme frequência
    let mesAlvo: Date
    switch (r.frequencia) {
      case 'DIARIA':     mesAlvo = new Date(agora.getTime() + 24 * 60 * 60 * 1000); break
      case 'SEMANAL':    mesAlvo = new Date(agora.getTime() + 7 * 24 * 60 * 60 * 1000); break
      case 'MENSAL':     mesAlvo = new Date(agora.getFullYear(), agora.getMonth() + 1, 1); break
      case 'TRIMESTRAL': mesAlvo = new Date(agora.getFullYear(), agora.getMonth() + 3, 1); break
      case 'SEMESTRAL':  mesAlvo = new Date(agora.getFullYear(), agora.getMonth() + 6, 1); break
      case 'ANUAL':      mesAlvo = new Date(agora.getFullYear() + 1, agora.getMonth(), 1); break
      default:           mesAlvo = new Date(agora.getFullYear(), agora.getMonth() + 1, 1)
    }

    // Para DIARIA e SEMANAL, ancoragem fica irrelevante — retorna o mesAlvo.
    // Ajuste aplicado mesmo nesses casos (faz sentido pra SEMANAL cair em FDS).
    if (r.frequencia === 'DIARIA' || r.frequencia === 'SEMANAL') {
      return aplicarAjusteVencimento(mesAlvo, ajuste, extrasNaoUteis)
    }
    const teorico = dataAncoradaEm(mesAlvo.getFullYear(), mesAlvo.getMonth())
    return aplicarAjusteVencimento(teorico, ajuste, extrasNaoUteis)
  }

  /**
   * Calcula a data TEÓRICA (sem ajuste de FDS/feriado) que uma recorrência
   * geraria para uma competência específica. Usado pela auditoria histórica
   * — compara contra `acessoriasPrazo` pra detectar se o órgão antecipou ou
   * postergou.
   *
   * Diferente de `calcularProximaExecucao`, aqui o "mês alvo" é determinado
   * pela competência fornecida (não pela data atual). Frequências DIÁRIA e
   * SEMANAL não fazem sentido aqui — retorna null.
   */
  dataTeoricaParaCompetencia(
    competencia: Date,
    r: {
      frequencia: string
      ancoragem: string
      valorAncoragem: number
      competenciaOffset: number
    },
  ): Date | null {
    if (r.frequencia === 'DIARIA' || r.frequencia === 'SEMANAL') return null
    // Mês de vencimento = mês da competência + competenciaOffset
    const compAno = competencia.getUTCFullYear()
    const compMes = competencia.getUTCMonth()
    const vencMes = compMes + r.competenciaOffset
    // O mesAlvo é uma data no mês de vencimento (qualquer dia serve — só pra
    // ancorar; a função abaixo ignora o dia).
    const ano = compAno + Math.floor(vencMes / 12)
    const mes = ((vencMes % 12) + 12) % 12

    switch (r.ancoragem) {
      case 'DIA_UTIL': {
        let d = 1, contador = 0
        while (true) {
          const tmp = new Date(ano, mes, d, 9, 0, 0, 0)
          const dia = tmp.getDay()
          if (dia !== 0 && dia !== 6) contador++
          if (contador === r.valorAncoragem) return tmp
          d++
          if (d > 31) break
        }
        return new Date(ano, mes, Math.min(r.valorAncoragem, 28), 9, 0, 0, 0)
      }
      case 'DIAS_APOS_COMPETENCIA': {
        // Final do mês de competência + N dias
        const fimComp = new Date(compAno, compMes + 1, 0)
        return new Date(fimComp.getTime() + r.valorAncoragem * 24 * 60 * 60 * 1000)
      }
      case 'DIA_DO_MES':
      default:
        return new Date(ano, mes, Math.min(r.valorAncoragem, 28), 9, 0, 0, 0)
    }
  }
}
