import { describe, expect, it } from 'vitest'
import JSZip from 'jszip'
import { EMPTY_TREATMENT_DEFINITION } from '@saas/types'
import { buildModeloJson } from './export-modelos'
import { lerArquivosDeModelo, lerModeloJson } from './import-modelos'

// Dados fictícios.
const DEF_OK = {
  ...EMPTY_TREATMENT_DEFINITION,
  contasCorrentes: { modo: 'UNICA' as const, unica: '78', coluna: '', mapa: [] },
  columnMapping: { ...EMPTY_TREATMENT_DEFINITION.columnMapping, descricao: 'Histórico', valor: 'Valor', data: 'Data' },
  debitoCredito: { tipo: 'SINAL' as const, coluna: '', mapa: [] },
  contrapartida: { modo: 'PALAVRA_CHAVE' as const, palavraChave: [{ palavraChave: 'TARIFA', conta: '412', historicoFixo: '' }], descricao: [] },
}

function exportado(nome: string, tipo: 'EXTRATO_BANCARIO' | 'PLANILHA_CLIENTE' | null = 'EXTRATO_BANCARIO') {
  const r = buildModeloJson(nome, tipo, DEF_OK)
  if (!r.ok) throw new Error(r.error)
  return r.json
}

describe('lerModeloJson', () => {
  it('volta exatamente o que a exportação gerou', () => {
    const r = lerModeloJson('modelo-sicoob.json', exportado('Sicoob'))
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.modelo.nome).toBe('Sicoob')
    expect(r.modelo.tipoArquivo).toBe('EXTRATO_BANCARIO')
    expect(r.modelo.definition).toEqual(JSON.parse(exportado('Sicoob')).definition)
  })

  it('aceita tipo nulo (a tela pede o tipo antes de importar)', () => {
    const r = lerModeloJson('x.json', exportado('Sem tipo', null))
    expect(r.ok && r.modelo.tipoArquivo).toBeNull()
  })

  it('arquivo exportado antes de um bloco novo entra com o default', () => {
    const obj = JSON.parse(exportado('Antigo'))
    delete obj.definition.aceitaVazio
    delete obj.definition.jurosDescontos
    const r = lerModeloJson('antigo.json', JSON.stringify(obj))
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.modelo.definition.aceitaVazio).toEqual(EMPTY_TREATMENT_DEFINITION.aceitaVazio)
    expect(r.modelo.definition.jurosDescontos).toEqual(EMPTY_TREATMENT_DEFINITION.jurosDescontos)
  })

  it('rejeita o que não é modelo, com o motivo', () => {
    expect(lerModeloJson('a.json', '{ não é json')).toMatchObject({ ok: false, erro: 'Não é um JSON válido.' })
    expect(lerModeloJson('a.json', '[]')).toMatchObject({ ok: false })
    expect(lerModeloJson('a.json', JSON.stringify({ formato: 'outra-coisa' }))).toMatchObject({ ok: false })
    const v2 = { ...JSON.parse(exportado('X')), versaoFormato: 2 }
    expect(lerModeloJson('a.json', JSON.stringify(v2))).toMatchObject({ ok: false, erro: expect.stringContaining('Versão') })
    const semValor = JSON.parse(exportado('X'))
    semValor.definition.columnMapping.valor = ''
    expect(lerModeloJson('a.json', JSON.stringify(semValor))).toMatchObject({ ok: false, erro: expect.stringContaining('columnMapping.valor') })
    const comLixo = { ...JSON.parse(exportado('X')), id: 'abc' }
    expect(lerModeloJson('a.json', JSON.stringify(comLixo)).ok).toBe(false)
  })
})

describe('lerArquivosDeModelo', () => {
  it('lê os .json de dentro do .zip (como o "Exportar N" gera) e relata os demais', async () => {
    const zip = new JSZip()
    zip.file('modelo-b.json', exportado('B'))
    zip.file('modelo-a.json', exportado('A'))
    zip.file('leia-me.txt', 'ignorado')
    const blob = await zip.generateAsync({ type: 'blob' })
    const lidos = await lerArquivosDeModelo([
      new File([blob], 'modelos.zip'),
      new File(['x'], 'planilha.xlsx'),
    ])
    expect(lidos.map((l) => l.arquivo)).toEqual(['modelos.zip › modelo-a.json', 'modelos.zip › modelo-b.json', 'planilha.xlsx'])
    expect(lidos.map((l) => l.ok)).toEqual([true, true, false])
  })

  it('.zip sem .json vira erro', async () => {
    const zip = new JSZip()
    zip.file('nada.txt', 'x')
    const lidos = await lerArquivosDeModelo([new File([await zip.generateAsync({ type: 'blob' })], 'vazio.zip')])
    expect(lidos).toEqual([{ arquivo: 'vazio.zip', ok: false, erro: 'O .zip não contém nenhum .json.' }])
  })
})
