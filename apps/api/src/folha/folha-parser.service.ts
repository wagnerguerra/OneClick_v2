import { Injectable } from '@nestjs/common'
import type { FolhaSecaoParsed, FolhaDadoParsed } from '@saas/types'

/**
 * Parser do TXT da Folha Analítica (formato largura fixa V.12.x)
 *
 * Identifica seções por CNPJ, extrai eventos provento/desconto
 * e retorna dados estruturados prontos para contabilização.
 */
@Injectable()
export class FolhaParserService {

  /**
   * Parseia o conteúdo completo do TXT da Folha Analítica.
   * Retorna array de seções, cada uma com seus eventos.
   */
  parse(conteudo: string): FolhaSecaoParsed[] {
    // Normalizar encoding (Windows-1252 pode ter caracteres estranhos)
    const text = conteudo.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
    const lines = text.split('\n')

    const secoes: FolhaSecaoParsed[] = []
    let i = 0

    while (i < lines.length) {
      // Buscar início de seção: linha de "====..."
      if (!lines[i]!.startsWith('====')) { i++; continue }

      // Verificar se é TOTAL GERAL ou DEMONSTRATIVO (ignorar)
      const proximasLinhas = lines.slice(i, i + 5).join(' ')
      if (proximasLinhas.includes('TOTAL GERAL') || proximasLinhas.includes('DEMONSTRATIVO DE INCIDENCIAS')) {
        i++; continue
      }

      // Linha 2: endereço + setor + emissão
      const linha2 = lines[i + 2] ?? ''
      // Linha 3: CNPJ + competência + seção
      const linha3 = lines[i + 3] ?? ''

      // Extrair endereço (antes do setor)
      const endereco = this.extrairEndereco(linha2)
      // Extrair setor
      const setor = this.extrairSetor(linha2)
      // Extrair emissão
      const emissao = this.extrairEmissao(linha2)
      // Extrair CNPJ
      const cnpj = this.extrairCnpj(linha3)
      // Extrair competência
      const competencia = this.extrairCompetencia(linha3)
      // Extrair seção
      const secao = this.extrairSecao(linha3)

      if (!cnpj) { i++; continue }

      // Ignorar seções sem setor (são TOTAIS consolidados — duplicariam valores)
      if (!setor) { i++; continue }

      // Avançar até "TOTAIS DA SECAO" e depois até o cabeçalho "Cod  Descrição..."
      i += 4 // Pular a segunda linha de ====
      let splitCol = 70 // Posição padrão para dividir esquerda/direita

      // Buscar cabeçalho da tabela de eventos
      while (i < lines.length && !lines[i]!.includes('Cod') && !lines[i]!.startsWith('----')) { i++ }

      // Detectar splitCol pela posição do segundo "Cod"
      if (i < lines.length && lines[i]!.includes('Cod')) {
        const headerLine = lines[i]!
        const firstCod = headerLine.indexOf('Cod')
        if (firstCod >= 0) {
          const secondCod = headerLine.indexOf('Cod', firstCod + 3)
          if (secondCod > firstCod) splitCol = secondCod
        }
        i++ // Pular cabeçalho
      }

      // Pular linha de traços "----..."
      while (i < lines.length && lines[i]!.startsWith('----')) { i++ }

      // Ler eventos até próxima linha de traços "----..."
      const eventos: FolhaDadoParsed[] = []
      while (i < lines.length && !lines[i]!.startsWith('----') && !lines[i]!.startsWith('====')) {
        const line = lines[i]!
        if (line.trim().length === 0) { i++; continue }

        const ladoEsquerdo = line.substring(0, Math.min(splitCol, line.length))
        const ladoDireito = line.length > splitCol ? line.substring(splitCol) : ''

        const evtDebito = this.parsearEvento(ladoEsquerdo)
        const evtCredito = this.parsearEvento(ladoDireito)

        if (evtDebito || evtCredito) {
          eventos.push({
            endereco, setor, emissao, cnpj, competencia,
            codDebito: evtDebito?.codigo,
            descDebito: evtDebito?.descricao,
            valorDebito: evtDebito?.valor,
            codCredito: evtCredito?.codigo,
            descCredito: evtCredito?.descricao,
            valorCredito: evtCredito?.valor,
          })
        }

        i++
      }

      if (eventos.length > 0) {
        secoes.push({ cnpj, endereco, setor, emissao, competencia, secao, eventos })
      }

      i++
    }

    return secoes
  }

  private extrairEndereco(linha: string): string {
    // Endereço está no início da linha, antes do setor
    const setorIdx = Math.max(
      linha.indexOf('ADMINISTRATIVO'),
      linha.indexOf('ADMINISTRA'),
      linha.indexOf('DOCENTE'),
    )
    if (setorIdx > 0) return linha.substring(0, setorIdx).trim()
    // Fallback: antes de "Emissão"
    const emIdx = linha.indexOf('Emiss')
    if (emIdx > 0) return linha.substring(0, emIdx).trim()
    return linha.trim()
  }

  private extrairSetor(linha: string): string {
    if (linha.includes('DOCENTE')) return 'DOCENTE'
    const admIdx = linha.indexOf('ADMINISTRA')
    if (admIdx >= 0) {
      // Capturar ADMINISTRATIVO ou ADMINISTRACAO
      const rest = linha.substring(admIdx)
      const match = rest.match(/^(ADMINISTRA\S*)/i)
      return match ? match[1]! : 'ADMINISTRATIVO'
    }
    return ''
  }

  private extrairEmissao(linha: string): string {
    const match = linha.match(/Emiss[ãa]o:\s*(\d{2}\/\d{2}\/\d{4}\s+\d{2}:\d{2}:\d{2})/)
    return match ? match[1]! : ''
  }

  private extrairCnpj(linha: string): string {
    const match = linha.match(/(\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2})/)
    return match ? match[1]! : ''
  }

  private extrairCompetencia(linha: string): string {
    const match = linha.match(/Comp:\s*(\d{2}\/\d{4})/)
    return match ? match[1]! : ''
  }

  private extrairSecao(linha: string): string {
    const match = linha.match(/Se[çc][ãa]o:\s*(\S+)/)
    return match ? match[1]! : ''
  }

  private parsearEvento(texto: string): { codigo: number; descricao: string; valor: number } | null {
    const trimmed = texto.trim()
    if (!trimmed || trimmed.length < 5) return null

    // Primeiro token = código numérico
    const tokens = trimmed.split(/\s+/)
    const codStr = tokens[0]
    if (!codStr || !/^\d{1,4}$/.test(codStr)) return null
    const codigo = parseInt(codStr, 10)

    // Último valor monetário no formato brasileiro (9.999,99)
    const valorMatch = trimmed.match(/(\d{1,3}(?:\.\d{3})*,\d{2})\s*[B]?\s*$/)
    if (!valorMatch) return null
    const valorStr = valorMatch[1]!
    const valor = parseFloat(valorStr.replace(/\./g, '').replace(',', '.'))

    // Descrição = tudo entre código e o bloco numérico final
    const codEnd = trimmed.indexOf(codStr) + codStr.length
    const valorStart = trimmed.lastIndexOf(valorStr)
    // Voltar mais para pegar N.F. e Ref antes do valor
    const descPart = trimmed.substring(codEnd, valorStart).trim()
    // Limpar números finais (N.F., Ref)
    const descClean = descPart.replace(/\s+\d+\s+[\d.,]+\s*$/, '').replace(/\s+\d+\s*$/, '').trim()
    const descricao = descClean || `Evento ${codigo}`

    if (valor === 0) return null

    return { codigo, descricao, valor }
  }
}
