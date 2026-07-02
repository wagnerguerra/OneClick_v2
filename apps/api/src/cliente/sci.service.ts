import { Injectable } from '@nestjs/common'
import { spawnSync } from 'child_process'
import * as path from 'path'

export interface SciResult {
  idCliente: number
  razaoSocial: string
  cnpj: string
  metodo: string
}

export interface SciBalanceteLinha {
  CLASSIFICACAO: string
  NOME_CONTA: string
  BDSALDO_ANTERIOR: number
  DEBITO: number
  CREDITO: number
  BDMOVIMENTO: number
  BDSALDO_ATUAL: number
}

@Injectable()
export class SciService {
  private readonly scriptPath = path.resolve(process.cwd(), 'src', 'cliente', 'sci_id_sistema.py')
  // Copiado do SERPRO2 (erp_sci/sci_metrics.py - 459 linhas, testado)
  private readonly metricsPath = path.resolve(process.cwd(), 'src', 'cliente', 'sci_metrics.py')
  private readonly python = process.env.SCI_PYTHON || 'python'
  private readonly timeoutMs = Number(process.env.SCI_TIMEOUT_MS || 30000)

  /**
   * Busca o ID do cliente no SCI (BDCODEMP) pelo CNPJ.
   * Usa script Python + fdb para conectar ao Firebird.
   */
  async buscarIdSistemaPorCnpj(cnpj: string): Promise<SciResult | null> {
    const cnpjLimpo = cnpj.replace(/\D/g, '')
    if (cnpjLimpo.length !== 14) {
      throw new Error('CNPJ deve ter 14 dígitos')
    }

    const result = spawnSync(this.python, [this.scriptPath, cnpjLimpo], {
      env: {
        ...process.env,
        SCI_DSN: process.env.SCI_DSN || '',
        SCI_USER: process.env.SCI_USER || '',
        SCI_PASSWORD: process.env.SCI_PASSWORD || '',
        SCI_CHARSET: process.env.SCI_CHARSET || 'UTF8',
      },
      timeout: this.timeoutMs,
      encoding: 'utf8',
    })

    // Erro de execução
    if (result.error) {
      if (result.error.message.includes('ETIMEDOUT') || result.error.message.includes('SIGTERM')) {
        throw new Error('Timeout ao consultar o SCI. Verifique a conectividade com o servidor Firebird.')
      }
      throw new Error(`Erro ao executar script SCI: ${result.error.message}`)
    }

    // Stderr com erro
    if (result.stderr && result.stderr.trim()) {
      const stderr = result.stderr.trim()
      // Ignorar warnings do Python, só tratar erros reais
      if (stderr.includes('Error') || stderr.includes('Traceback')) {
        throw new Error(`Erro no SCI: ${stderr.split('\n').pop()}`)
      }
    }

    // Parse do stdout
    const stdout = (result.stdout || '').trim()
    if (!stdout) {
      throw new Error('SCI não retornou dados. Verifique a conexão com o Firebird.')
    }

    let parsed: Record<string, unknown>
    try {
      parsed = JSON.parse(stdout)
    } catch {
      throw new Error(`Resposta inválida do SCI: ${stdout.slice(0, 200)}`)
    }

    // Erro retornado pelo script
    if (parsed.error) {
      if (String(parsed.error).includes('Nao encontrado')) {
        return null
      }
      throw new Error(String(parsed.error))
    }

    // Sucesso
    if (parsed.id_cliente) {
      return {
        idCliente: Number(parsed.id_cliente),
        razaoSocial: String(parsed.razao_social || '').trim(),
        cnpj: cnpjLimpo,
        metodo: String(parsed.metodo || 'unknown'),
      }
    }

    return null
  }

  /**
   * Busca metricas do SCI para parametros de contrato.
   * Usa o script sci_metrics.py do SERPRO2 (já testado e validado).
   */
  async buscarMetricasSci(cnpj: string, datai: string, dataf: string, indicadores?: string[]): Promise<Record<string, unknown>> {
    const cnpjLimpo = cnpj.replace(/\D/g, '')
    if (cnpjLimpo.length !== 14) throw new Error('CNPJ deve ter 14 dígitos')

    const args = [this.metricsPath, datai, dataf, cnpjLimpo]
    if (indicadores && indicadores.length > 0) {
      args.push(indicadores.join(','))
    }

    const result = spawnSync(this.python, args, {
      cwd: path.dirname(this.metricsPath),
      env: { ...process.env },
      timeout: this.timeoutMs * 2, // metricas demoram mais
      encoding: 'utf8',
    })

    if (result.error) {
      throw new Error(`Erro ao executar metricas SCI: ${result.error.message}`)
    }

    const stdout = (result.stdout || '').trim()
    if (!stdout) throw new Error('SCI metricas: sem resposta')

    let parsed: Record<string, unknown>
    try { parsed = JSON.parse(stdout) } catch { throw new Error(`Resposta invalida: ${stdout.slice(0, 200)}`) }

    if (parsed.sucesso === false) throw new Error(String(parsed.erro || 'Erro desconhecido no SCI'))

    return parsed
  }

  /** Período de referência dos parâmetros sugeridos: último mês completo. */
  periodoSugerido(): { datai: string; dataf: string } {
    const now = new Date()
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0)
    const datai = `${lastMonth.getFullYear()}-${String(lastMonth.getMonth() + 1).padStart(2, '0')}-01`
    const dataf = `${lastMonthEnd.getFullYear()}-${String(lastMonthEnd.getMonth() + 1).padStart(2, '0')}-${String(lastMonthEnd.getDate()).padStart(2, '0')}`
    return { datai, dataf }
  }

  /** Calcula os parâmetros a partir das métricas já obtidas (local OU via ponte). */
  calcularParametrosDeMetricas(
    metrics: Record<string, unknown>,
    periodo: { datai: string; dataf: string },
  ): { parametros: Record<string, number>; periodo: { datai: string; dataf: string }; origem: string } {
    const avg = (rows: unknown[], asInteger = true): number => {
      if (!Array.isArray(rows) || rows.length === 0) return 0
      const sum = (rows as Array<Record<string, unknown>>).reduce((s, r) => s + (Number(r.movimentacao) || 0), 0)
      const a = sum / rows.length
      return asInteger ? Math.round(a) : Number(a.toFixed(2))
    }
    return {
      parametros: {
        lancamentos: avg(metrics.lancamentos as unknown[] || [], true),
        faturamento: avg(metrics.faturamento as unknown[] || [], false),
        nfEntrada: avg(metrics.nf_entrada as unknown[] || [], true),
        nfSaida: avg(metrics.nf_saida as unknown[] || [], true),
        nfPrestado: avg(metrics.nf_prestado as unknown[] || [], true),
        nfTomado: avg(metrics.nf_tomado as unknown[] || [], true),
        funcionarios: avg(metrics.vidas as unknown[] || [], true),
      },
      periodo,
      origem: 'sci_media_3m',
    }
  }

  /**
   * Calcula parametros sugeridos: media do último mês completo. (Conexão direta —
   * o fallback pra ponte do Launcher é feito no router getParametrosSugeridos.)
   */
  async calcularParametrosSugeridos(cnpj: string): Promise<{
    parametros: Record<string, number>
    periodo: { datai: string; dataf: string }
    origem: string
  }> {
    const periodo = this.periodoSugerido()
    const metrics = await this.buscarMetricasSci(cnpj, periodo.datai, periodo.dataf)
    return this.calcularParametrosDeMetricas(metrics, periodo)
  }

  /**
   * Busca balancete de um mês do SCI via VSUC_SP_RETORNA_BALANCETE.
   * Usa o script Python sci_balancete.py (mesma base do SERPRO2).
   */
  private readonly balancetePath = path.resolve(process.cwd(), 'src', 'cliente', 'sci_balancete.py')

  async buscarBalanceteMes(
    prcodemp: number,
    datai: string,  // YYYY-MM-DD
    dataf: string,  // YYYY-MM-DD
    ref: number,    // AAAAMM
  ): Promise<SciBalanceteLinha[]> {
    if (!prcodemp || prcodemp <= 0) throw new Error('PRCODEMP inválido (id_sistema)')
    if (!ref || ref < 200001) throw new Error('Ref (AAAAMM) inválido')

    const result = spawnSync(this.python, [
      this.balancetePath,
      String(prcodemp),
      datai,
      dataf,
      '1', // ignora_zeramento = sempre 1
      String(ref),
    ], {
      cwd: path.dirname(this.balancetePath),
      env: {
        ...process.env,
        PYTHONIOENCODING: 'utf-8',
        SCI_DSN: process.env.SCI_DSN || '',
        SCI_USER: process.env.SCI_USER || '',
        SCI_PASSWORD: process.env.SCI_PASSWORD || '',
        SCI_CHARSET: process.env.SCI_CHARSET || 'UTF8',
        SCI_BAL_CTA_INI: process.env.SCI_BAL_CTA_INI || '19',
        SCI_BAL_CTA_FIN: process.env.SCI_BAL_CTA_FIN || '101156',
        SCI_BAL_CODTPCC: process.env.SCI_BAL_CODTPCC || '',
        SCI_BAL_DATE_STYLE: process.env.SCI_BAL_DATE_STYLE || 'us_slash',
        SCI_BAL_CONTABILIZACAO: process.env.SCI_BAL_CONTABILIZACAO || '0',
        SCI_BAL_CONSOLIDADA: process.env.SCI_BAL_CONSOLIDADA || '0',
        SCI_BAL_TODAS_CONTAS: process.env.SCI_BAL_TODAS_CONTAS || '1',
        SCI_BAL_NIVEIS: process.env.SCI_BAL_NIVEIS || '1,2,3,4,5',
      },
      timeout: (this.timeoutMs * 2) || 60000,
      encoding: 'utf8',
      maxBuffer: 10 * 1024 * 1024,
      windowsHide: true,
    })

    if (result.error) {
      if (result.error.message.includes('ETIMEDOUT') || result.error.message.includes('SIGTERM')) {
        throw new Error(`Timeout ao consultar balancete SCI (ref=${ref}). Verifique a conexão Firebird.`)
      }
      throw new Error(`Erro ao executar sci_balancete.py: ${result.error.message}`)
    }

    if (result.status !== 0) {
      const stderr = (result.stderr || '').trim()
      throw new Error(`sci_balancete.py falhou (exit ${result.status}): ${stderr.slice(0, 300)}`)
    }

    const stdout = (result.stdout || '').trim()
    if (!stdout) throw new Error(`SCI balancete: sem resposta para ref=${ref}`)

    let parsed: { sucesso?: boolean; dados?: Array<Record<string, unknown>> }
    try { parsed = JSON.parse(stdout) } catch { throw new Error(`Resposta inválida do SCI: ${stdout.slice(0, 200)}`) }

    if (!parsed.sucesso || !Array.isArray(parsed.dados)) {
      throw new Error(`SCI retornou erro para ref=${ref}`)
    }

    // Normalizar colunas (Firebird retorna nomes variados)
    return parsed.dados.map((row) => ({
      CLASSIFICACAO: String(row.CLASSIFICACAO ?? row.CONTA_LONGA ?? row.BDCTALON ?? '').trim(),
      NOME_CONTA: String(row.NOME_CONTA ?? row.BDNOMCTA ?? '').trim(),
      BDSALDO_ANTERIOR: Number(row.BDSALDO_ANTERIOR ?? 0),
      DEBITO: Number(row.DEBITO ?? row.BDSALDO_DEB ?? 0),
      CREDITO: Number(row.CREDITO ?? row.BDSALDO_CRE ?? 0),
      BDMOVIMENTO: Number(row.BDMOVIMENTO ?? 0),
      BDSALDO_ATUAL: Number(row.BDSALDO_ATUAL ?? 0),
    }))
  }
}
