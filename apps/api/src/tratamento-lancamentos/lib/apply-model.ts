// ============================================================
// Motor de conversão: aplica um Modelo de Tratamento aos lançamentos extraídos
// e produz o conteúdo SCI — ou a lista de PENDÊNCIAS, quando algum lançamento
// não pôde ser interpretado.
//
// Tipos de pendência (alinhados ao plano):
//   DC_NAO_MAPEADO              valor da coluna de débito/crédito sem direção definida
//   CONTA_NAO_MAPEADA           sem conta de contrapartida para a descrição/palavra-chave
//   CONTA_CORRENTE_NAO_MAPEADA  (modo múltiplas contas) valor da coluna sem conta corrente
//   CAMPO_VAZIO                 coluna obrigatória sem valor na linha
//   DATA_INVALIDA              data não reconhecida
//   VALOR_INVALIDO             valor não numérico
//   COLUNA_NAO_ENCONTRADA      coluna selecionada no De/Para ausente no arquivo
// ============================================================

import { matchPalavraChaveIndex, resolveHistorico, JUROS_DESCONTOS_HISTORICO, type TreatmentDefinition, type JurosDescontosRule, type JurosDescontoTipo, type ExtractedTableInput, type CellValue } from '@saas/types'
import { parseData, parseValor } from './parsers'
import { buildSciLine, buildSciFile, type Direcao } from './sci-format'

export type PendenciaTipo = 'DC_NAO_MAPEADO' | 'CONTA_NAO_MAPEADA' | 'CONTA_CORRENTE_NAO_MAPEADA' | 'CAMPO_VAZIO' | 'DATA_INVALIDA' | 'VALOR_INVALIDO' | 'COLUNA_NAO_ENCONTRADA'

export interface Pendencia {
  /** Linha de dados (1-based) na tabela extraída; 0 = pendência do modelo. */
  linha: number
  tipo: PendenciaTipo
  /** Coluna/aspecto causador (para destaque na UI). */
  campo: string
  mensagem: string
  /** Valor bruto causador (tooltip/realce). */
  valor?: string
}

export interface ConversionResult {
  /** Conteúdo do .txt SCI; null quando há pendências. */
  sciText: string | null
  totalLancamentos: number
  pendencias: Pendencia[]
}

/** Situação de uma linha após aplicar o modelo (visualizador de debug). */
export type TraceStatus = 'ok' | 'pulada-regra' | 'ignorada-zero' | 'pendencia'

/**
 * Traço por-linha de como o modelo interpretou cada lançamento — populado só
 * quando `applyModel` recebe um coletor `trace`. Alimenta o visualizador de
 * debug (tabela "após de/para" + linhas puladas/ignoradas). Mesma fonte da
 * lógica de conversão, para não divergir.
 */
export interface TraceRow {
  linha: number
  /** Valores BRUTOS das colunas mapeadas. */
  data: string
  valor: string
  descricao: string
  /** Colunas opcionais do De/Para (vazio quando não mapeadas). */
  participante: string
  numeroNf: string
  documento: string
  /** Interpretação. */
  dataParsed: string | null
  valorParsed: number | null
  direcao: Direcao | null
  contaContrapartida: string | null
  contaCorrente: string | null
  status: TraceStatus
  pendenciaTipos: PendenciaTipo[]
}

function cell(row: Record<string, CellValue>, col: string): string {
  if (!col) return ''
  const v = row[col]
  return v === null || v === undefined ? '' : String(v).trim()
}

interface CpMatch { conta: string; historicoFixo?: string; direcao?: Direcao; pular?: boolean }

/** Resolve a contrapartida de uma descrição conforme o modo do modelo. */
function matchContrapartida(def: TreatmentDefinition, descricao: string): CpMatch | null {
  const cp = def.contrapartida
  if (cp.modo === 'PALAVRA_CHAVE') {
    // Regra de correspondência compartilhada (fonte única em @saas/types), para que
    // a conversão e o painel de correspondência do editor casem exatamente.
    const idx = matchPalavraChaveIndex(descricao, cp.palavraChave)
    if (idx < 0) return null
    const item = cp.palavraChave[idx]!
    return { conta: item.conta, historicoFixo: item.historicoFixo, direcao: item.direcao, pular: item.pular }
  }
  const item = cp.descricao.find((i) => i.descricao === descricao)
  return item ? { conta: item.conta, historicoFixo: item.historicoFixo, direcao: item.direcao, pular: item.pular } : null
}

interface JdItem { tipo: JurosDescontoTipo; valor: number }

/**
 * Lê os valores de juros/descontos de UMA linha. Cada valor não-vazio e ≠ 0 vira
 * um item (tipo + magnitude). No modo SEPARADAS, cada coluna já define o tipo; no
 * UNIFICADA, o SINAL do valor classifica juro×desconto conforme `sinalJuros`.
 * Valor não-numérico → pendência VALOR_INVALIDO na própria linha. `faltantes`
 * (coluna ausente no arquivo) já é acusada à parte → aqui a célula vem vazia e é ignorada.
 */
function lerJurosDescontos(row: Record<string, CellValue>, jd: JurosDescontosRule, linha: number, rowPend: Pendencia[]): JdItem[] {
  const out: JdItem[] = []
  const add = (col: string, forceTipo: JurosDescontoTipo | null, rotulo: string) => {
    const raw = cell(row, col)
    if (!raw) return
    const pv = parseValor(row[col])
    if (!pv.valid || pv.value === null) {
      rowPend.push({ linha, tipo: 'VALOR_INVALIDO', campo: col, mensagem: `Valor de ${rotulo} não numérico: "${raw}".`, valor: raw })
      return
    }
    if (pv.value === 0) return // valor zero = sem lançamento (igual à regra do valor principal)
    // UNIFICADA: o sinal classifica. `sinalJuros` diz qual sinal é Juro (o outro é Desconto).
    const tipo: JurosDescontoTipo = forceTipo ?? ((pv.value > 0) === (jd.sinalJuros === 'POSITIVO') ? 'JURO' : 'DESC')
    out.push({ tipo, valor: Math.abs(pv.value) })
  }
  if (jd.modo === 'SEPARADAS') {
    if (jd.colunaJuros) add(jd.colunaJuros, 'JURO', 'juros')
    if (jd.colunaDescontos) add(jd.colunaDescontos, 'DESC', 'desconto')
  } else if (jd.colunaUnificada) {
    add(jd.colunaUnificada, null, 'juros/desconto')
  }
  return out
}

export function applyModel(table: ExtractedTableInput, def: TreatmentDefinition, anoCompetencia?: number, trace?: TraceRow[]): ConversionResult {
  const cm = def.columnMapping
  const dcMapa = new Map(def.debitoCredito.mapa.map((m) => [m.valor, m.direcao]))
  const cc = def.contasCorrentes
  const ccMapa = new Map(cc.mapa.map((m) => [m.valor, m.conta]))
  const jd = def.jurosDescontos

  const lines: string[] = []
  const pendencias: Pendencia[] = []

  // Pendência de modelo: conta corrente é necessária para os campos <3>/<4>.
  if (cc.modo === 'UNICA') {
    if (!cc.unica.trim()) {
      pendencias.push({ linha: 0, tipo: 'CAMPO_VAZIO', campo: 'contaCorrente', mensagem: 'Conta corrente não informada no modelo.' })
    }
  } else if (!cc.coluna.trim()) {
    pendencias.push({ linha: 0, tipo: 'CAMPO_VAZIO', campo: 'contasCorrentes', mensagem: 'Coluna que identifica a conta corrente não definida no modelo.' })
  }

  // Pendência de modelo: juros/descontos ativo exige as contas e ao menos uma coluna.
  if (jd.ativo) {
    if (!jd.contaJuros.trim()) pendencias.push({ linha: 0, tipo: 'CAMPO_VAZIO', campo: 'jurosDescontos.contaJuros', mensagem: 'Conta contábil de Juros não informada no modelo.' })
    if (!jd.contaDescontos.trim()) pendencias.push({ linha: 0, tipo: 'CAMPO_VAZIO', campo: 'jurosDescontos.contaDescontos', mensagem: 'Conta contábil de Descontos não informada no modelo.' })
    if (jd.modo === 'SEPARADAS') {
      if (!jd.colunaJuros.trim()) pendencias.push({ linha: 0, tipo: 'CAMPO_VAZIO', campo: 'jurosDescontos', mensagem: 'Coluna de Juros não definida no modelo.' })
      if (!jd.colunaDescontos.trim()) pendencias.push({ linha: 0, tipo: 'CAMPO_VAZIO', campo: 'jurosDescontos', mensagem: 'Coluna de Descontos não definida no modelo.' })
    } else if (!jd.colunaUnificada.trim()) {
      pendencias.push({ linha: 0, tipo: 'CAMPO_VAZIO', campo: 'jurosDescontos', mensagem: 'Coluna unificada de Juros/Descontos não definida no modelo.' })
    }
  }

  // Colunas selecionadas no De/Para (+ coluna ativa de D/C e de conta corrente)
  // que precisam EXISTIR nos cabeçalhos do arquivo. Cada ausente vira uma
  // pendência "coluna não encontrada". NÃO encerramos o processamento: seguimos
  // linha a linha para acusar também as pendências das colunas PRESENTES (ex.:
  // valores vazios). A checagem por-linha de uma coluna AUSENTE é pulada (via
  // `faltantes`) — a pendência de coluna já cobre, sem a tempestade de CAMPO_VAZIO.
  const headerSet = new Set(table.headers)
  const selecionadas = [
    cm.descricao, cm.valor, cm.data,
    def.debitoCredito.tipo === 'COLUNA' ? def.debitoCredito.coluna : '',
    cc.modo === 'MULTIPLAS' ? cc.coluna : '',
    cm.participante ?? '', cm.numeroNf ?? '', cm.documento ?? '',
    // Colunas de juros/descontos (quando ativo) também precisam existir no arquivo.
    ...(jd.ativo ? (jd.modo === 'SEPARADAS' ? [jd.colunaJuros, jd.colunaDescontos] : [jd.colunaUnificada]) : []),
  ].filter((c) => !!c && !!c.trim())
  const faltantes = new Set<string>()
  for (const col of [...new Set(selecionadas)]) {
    if (!headerSet.has(col)) {
      faltantes.add(col)
      pendencias.push({ linha: 0, tipo: 'COLUNA_NAO_ENCONTRADA', campo: col, mensagem: `Coluna "${col}" não encontrada no arquivo.` })
    }
  }
  // Coluna ESSENCIAL ausente (descrição/valor/data + coluna ativa de D/C e de
  // conta corrente) impede gerar qualquer linha — sem ela não há lançamento
  // válido —, mas as linhas ainda são percorridas p/ acusar as colunas presentes.
  // Opcionais ausentes (participante/NF/CNPJ) não bloqueiam a geração.
  const bloqueiaLinhas = [
    cm.descricao, cm.valor, cm.data,
    def.debitoCredito.tipo === 'COLUNA' ? def.debitoCredito.coluna : '',
    cc.modo === 'MULTIPLAS' ? cc.coluna : '',
  ].some((c) => !!c && faltantes.has(c))

  table.rows.forEach((row, i) => {
    const linha = i + 1
    const rowPend: Pendencia[] = []

    const descricao = cell(row, cm.descricao)
    const participante = cm.participante ? cell(row, cm.participante) : ''
    const numeroNf = cm.numeroNf ? cell(row, cm.numeroNf) : ''
    // CNPJ/CPF: valor fixo (extrato bancário, sem a coluna) tem prioridade; senão
    // lê da coluna mapeada. São mutuamente exclusivos no editor.
    const documentoFixo = cm.documentoFixo?.trim() ?? ''
    const documento = documentoFixo || (cm.documento ? cell(row, cm.documento) : '')

    if (!descricao && !faltantes.has(cm.descricao)) rowPend.push({ linha, tipo: 'CAMPO_VAZIO', campo: cm.descricao, mensagem: 'Descrição vazia. Não foi possível determinar a contrapartida.' })
    // Colunas opcionais do De/Para: se SELECIONADAS (e presentes), também precisam
    // ter valor na linha (concepção: qualquer coluna escolhida precisa ter valor).
    if (cm.participante && !participante && !faltantes.has(cm.participante)) rowPend.push({ linha, tipo: 'CAMPO_VAZIO', campo: cm.participante, mensagem: 'Nome do participante vazio.' })
    if (cm.numeroNf && !numeroNf && !faltantes.has(cm.numeroNf)) rowPend.push({ linha, tipo: 'CAMPO_VAZIO', campo: cm.numeroNf, mensagem: 'Número da NF vazio.' })
    if (cm.documento && !documento && !faltantes.has(cm.documento)) rowPend.push({ linha, tipo: 'CAMPO_VAZIO', campo: cm.documento, mensagem: 'CNPJ/CPF vazio.' })

    // Data (campo obrigatório)
    const dataStr = cell(row, cm.data)
    const pd = parseData(cm.data ? row[cm.data] : '', anoCompetencia)
    if (!pd.valid && !faltantes.has(cm.data)) {
      rowPend.push(dataStr
        ? { linha, tipo: 'DATA_INVALIDA', campo: cm.data, mensagem: `Data inválida: "${dataStr}".`, valor: dataStr }
        : { linha, tipo: 'CAMPO_VAZIO', campo: cm.data, mensagem: 'Data vazia.' })
    }

    // Valor (campo obrigatório)
    const valorStr = cell(row, cm.valor)
    const pv = parseValor(cm.valor ? row[cm.valor] : '')
    if (!pv.valid && !faltantes.has(cm.valor)) {
      rowPend.push(valorStr
        ? { linha, tipo: 'VALOR_INVALIDO', campo: cm.valor, mensagem: `Valor não numérico: "${valorStr}".`, valor: valorStr }
        : { linha, tipo: 'CAMPO_VAZIO', campo: cm.valor, mensagem: 'Valor vazio.' })
    }

    // Coletor do traço de debug (no-op quando `trace` não foi passado). Emite
    // UMA entrada por linha, no ponto de saída, com o que já se sabe.
    const pushTrace = (status: TraceStatus, extra?: Partial<TraceRow>) => {
      if (!trace) return
      trace.push({
        linha, data: dataStr, valor: valorStr, descricao,
        participante, numeroNf, documento,
        dataParsed: pd.valid ? (pd.yyyymmdd ?? null) : null,
        valorParsed: pv.valid ? (pv.value ?? null) : null,
        direcao: null, contaContrapartida: null, contaCorrente: null,
        status, pendenciaTipos: [],
        ...extra,
      })
    }

    // Contrapartida (conta + possivelmente direção). Vem ANTES da checagem de zero:
    // um item "Pular linha" não é lançamento nem gera juros/descontos.
    const match = matchContrapartida(def, descricao)
    // Item marcado "Pular linha": a correspondência não é lançamento → ignora a
    // linha inteira (sem SCI e sem pendência), independente dos outros campos.
    if (match?.pular) { pushTrace('pulada-regra', { contaContrapartida: match.conta?.trim() || null }); return }

    // Valor principal exatamente ZERO → a linha PRINCIPAL é ignorada (validado com a
    // gestora). Mas juros/descontos da linha ainda são lançamentos independentes.
    const mainIsZero = pv.valid && pv.value === 0
    // Juros/descontos desta linha (cada valor não-vazio e ≠ 0 vira um lançamento).
    const jdItens = jd.ativo ? lerJurosDescontos(row, jd, linha, rowPend) : []

    // Nada a emitir (principal zero e sem juros/desconto) → ignora a linha, como
    // antes (valor zero sai sem cobrar contrapartida/direção).
    if (mainIsZero && jdItens.length === 0) { pushTrace('ignorada-zero'); return }

    // Contrapartida da PRINCIPAL — só exigida quando a principal vai ser emitida.
    // (Descrição vazia já gerou CAMPO_VAZIO; não acusar "sem contrapartida" sobre isso.)
    if (!mainIsZero && descricao && (!match || !match.conta.trim())) {
      rowPend.push({ linha, tipo: 'CONTA_NAO_MAPEADA', campo: cm.descricao, mensagem: `Sem conta de contrapartida para "${descricao}".`, valor: descricao })
    }

    // Direção (débito/crédito) — a MESMA regra vale para a principal e para os JD.
    let direcao: Direcao | null = null
    if (def.debitoCredito.tipo === 'COLUNA') {
      const dcVal = cell(row, def.debitoCredito.coluna)
      if (!dcVal) {
        if (!faltantes.has(def.debitoCredito.coluna)) rowPend.push({ linha, tipo: 'CAMPO_VAZIO', campo: def.debitoCredito.coluna, mensagem: 'Valor de débito/crédito vazio.' })
      } else {
        const dir = dcMapa.get(dcVal)
        if (!dir) rowPend.push({ linha, tipo: 'DC_NAO_MAPEADO', campo: def.debitoCredito.coluna, mensagem: `Valor "${dcVal}" não mapeado como débito/crédito.`, valor: dcVal })
        else direcao = dir
      }
    } else if (def.debitoCredito.tipo === 'SINAL') {
      // Direção pelo sinal do valor: negativo = crédito, positivo = débito.
      // (o parser já converteu marcadores C/CD/D/DB em sinal.) Valor inválido já
      // gerou VALOR_INVALIDO; valor zero já foi ignorado acima.
      if (pv.valid && pv.value !== null) {
        direcao = pv.value < 0 ? 'CREDITO' : 'DEBITO'
      }
    } else if (match) {
      if (match.direcao) direcao = match.direcao
      else rowPend.push({ linha, tipo: 'DC_NAO_MAPEADO', campo: cm.descricao, mensagem: `"${descricao}" sem débito/crédito definido na contrapartida.`, valor: descricao })
    }

    // Caso de borda: modo DESCRIÇÃO + descrição sem contrapartida + principal
    // ignorada (zero) deixa a direção nula SEM pendência (a principal não a cobrou).
    // Se há JD a emitir, sem direção não dá para montá-los → vira pendência aqui.
    if (jdItens.length && !direcao && def.debitoCredito.tipo === 'DESCRICAO' && !match) {
      rowPend.push({ linha, tipo: 'CONTA_NAO_MAPEADA', campo: cm.descricao, mensagem: `Sem contrapartida para "${descricao}" — necessária para o débito/crédito do juros/desconto.`, valor: descricao })
    }

    // Conta corrente do lançamento: fixa (UNICA) ou pela coluna do banco (MULTIPLAS).
    let contaCorrente = ''
    if (cc.modo === 'UNICA') {
      contaCorrente = cc.unica.trim()
    } else {
      const ccVal = cell(row, cc.coluna)
      if (!ccVal) {
        if (!faltantes.has(cc.coluna)) rowPend.push({ linha, tipo: 'CAMPO_VAZIO', campo: cc.coluna, mensagem: 'Valor de conta corrente vazio.' })
      } else {
        const conta = ccMapa.get(ccVal)
        if (!conta || !conta.trim()) rowPend.push({ linha, tipo: 'CONTA_CORRENTE_NAO_MAPEADA', campo: cc.coluna, mensagem: `Valor "${ccVal}" sem conta corrente mapeada.`, valor: ccVal })
        else contaCorrente = conta.trim()
      }
    }

    // Vira pendência (sem linha) se houver problema na linha OU se falta uma
    // coluna essencial (bloqueiaLinhas) — nesse caso sem ruído por-linha, já que a
    // pendência "coluna não encontrada" explica.
    if (rowPend.length || bloqueiaLinhas) {
      if (rowPend.length) pendencias.push(...rowPend)
      pushTrace('pendencia', {
        direcao, contaContrapartida: match?.conta?.trim() || null,
        contaCorrente: contaCorrente || null, pendenciaTipos: rowPend.map((p) => p.tipo),
      })
      return
    }

    const ymd = pd.yyyymmdd as string
    const partesData = { ano: ymd.slice(0, 4), mes: ymd.slice(4, 6), dia: ymd.slice(6, 8) }
    // Campos comuns às linhas desta origem (principal e juros/descontos).
    const comum = { yyyymmdd: ymd, direcao: direcao as Direcao, contaCorrente, participante, numeroNf, documento }

    // Linha PRINCIPAL — omitida quando o valor é zero (mas os JD abaixo saem).
    if (!mainIsZero) {
      // Resolve variáveis {{...}} do histórico fixo desta linha: valores de colunas
      // (row) e partes da data já parseada (yyyymmdd), sem re-parse.
      const historicoFixoRaw = (match as CpMatch).historicoFixo
      const historicoFixo = historicoFixoRaw
        ? resolveHistorico(historicoFixoRaw, (h) => cell(row, h), partesData)
        : historicoFixoRaw
      lines.push(buildSciLine({
        ...comum,
        numero: lines.length + 1,
        contaContrapartida: (match as CpMatch).conta.trim(),
        // Magnitude sempre positiva: a direção (débito/crédito) já carrega o sinal.
        valor: Math.abs(pv.value as number),
        historicoFixo,
      }))
    }

    // Linhas de JUROS/DESCONTOS — mesmos campos, EXCETO: valor (o de juros/desconto),
    // contrapartida (a conta contábil de juros/descontos), histórico (sempre o
    // automático + termo "JUROS"/"DESC", ignorando o histórico fixo) e direção:
    // JUROS espelham a direção da linha principal; DESCONTOS usam a INVERSA
    // (validado com a gestora do contábil).
    const dcPrincipal = direcao as Direcao
    const dcInverso: Direcao = dcPrincipal === 'DEBITO' ? 'CREDITO' : 'DEBITO'
    for (const it of jdItens) {
      const conta = (it.tipo === 'JURO' ? jd.contaJuros : jd.contaDescontos).trim()
      lines.push(buildSciLine({
        ...comum,
        numero: lines.length + 1,
        direcao: it.tipo === 'JURO' ? dcPrincipal : dcInverso,
        contaContrapartida: conta,
        valor: it.valor,
        jdTermo: JUROS_DESCONTOS_HISTORICO[it.tipo],
      }))
    }

    pushTrace('ok', {
      direcao, contaContrapartida: match?.conta?.trim() || null, contaCorrente,
    })
  })

  return {
    sciText: pendencias.length ? null : buildSciFile(lines),
    totalLancamentos: table.rows.length,
    pendencias,
  }
}
