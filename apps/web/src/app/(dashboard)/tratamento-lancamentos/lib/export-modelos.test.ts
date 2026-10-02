import { describe, expect, it } from 'vitest'
import JSZip from 'jszip'
import {
  createTreatmentModelSchema,
  updateTreatmentModelSchema,
  treatmentModelExportSchema,
  EMPTY_TREATMENT_DEFINITION,
} from '@saas/types'
import {
  buildModeloJson, nomeArquivoModelo, nomeUnico, exportarModelosZip, nomeZipModelos,
  type ModeloParaExportar,
} from './export-modelos'

// Definição válida mínima (De/Para obrigatório preenchido).
const DEF_OK = {
  ...EMPTY_TREATMENT_DEFINITION,
  contasCorrentes: { modo: 'UNICA', unica: '78', coluna: '', mapa: [] },
  columnMapping: { ...EMPTY_TREATMENT_DEFINITION.columnMapping, descricao: 'Histórico', valor: 'Valor', data: 'Data' },
  debitoCredito: { tipo: 'SINAL', coluna: '', mapa: [] },
  contrapartida: { modo: 'PALAVRA_CHAVE', palavraChave: [{ palavraChave: 'TARIFA', conta: '412', historicoFixo: '' }], descricao: [] },
}

function parse(json: string) {
  return JSON.parse(json) as Record<string, unknown>
}

describe('buildModeloJson', () => {
  it('monta o arquivo no contrato, com tipo e definição', () => {
    const r = buildModeloJson('Extrato Itaú — padrão', 'EXTRATO_BANCARIO', DEF_OK)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const obj = parse(r.json)
    expect(treatmentModelExportSchema.safeParse(obj).success).toBe(true)
    expect(obj).toMatchObject({
      formato: 'tratamento-lancamentos/modelo',
      versaoFormato: 1,
      nome: 'Extrato Itaú — padrão',
      tipoArquivo: 'EXTRATO_BANCARIO',
    })
    expect(r.fileName).toBe('modelo-extrato-itau-padrao.json')
    // JSON indentado em 2 espaços, terminando em quebra de linha.
    expect(r.json.startsWith('{\n  "formato"')).toBe(true)
    expect(r.json.endsWith('}\n')).toBe(true)
  })

  it('leva tipoArquivo null (modelo anterior ao campo)', () => {
    const r = buildModeloJson('Sem tipo', null, DEF_OK)
    expect(r.ok).toBe(true)
    if (r.ok) expect(parse(r.json).tipoArquivo).toBeNull()
  })

  it('normaliza snapshot legado para o schema corrente', () => {
    // Formato antigo: conta corrente em string, contrapartida {modo, itens}, sem juros/descontos.
    const legado = {
      contaCorrente: '100051',
      columnMapping: { descricao: 'Hist', valor: 'Valor', data: 'Data' },
      debitoCredito: { tipo: 'SINAL' },
      contrapartida: { modo: 'DESCRICAO', itens: [{ descricao: 'PIX', conta: '10' }] },
    }
    const r = buildModeloJson('Legado', 'PLANILHA_CLIENTE', legado)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const def = parse(r.json).definition as Record<string, Record<string, unknown>>
    expect(def.contasCorrentes).toEqual({ modo: 'UNICA', unica: '100051', coluna: '', mapa: [] })
    expect(def.contrapartida).toEqual({ modo: 'DESCRICAO', palavraChave: [], descricao: [{ descricao: 'PIX', conta: '10' }] })
    expect(def.jurosDescontos).toEqual(EMPTY_TREATMENT_DEFINITION.jurosDescontos)
    expect(def.columnMapping!.participante).toBe('')
  })

  it('rejeita definição inválida com o motivo', () => {
    // Sem a coluna de valor (obrigatória no De/Para).
    const invalida = { ...DEF_OK, columnMapping: { ...DEF_OK.columnMapping, valor: '' } }
    const r = buildModeloJson('Quebrado', 'EXTRATO_BANCARIO', invalida)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toContain('columnMapping.valor')
  })

  it('não inclui ids internos nem chaves estranhas ao contrato', () => {
    const comLixo = { ...DEF_OK, id: 'v1', authorId: 'u1', columnMapping: { ...DEF_OK.columnMapping, clienteId: 'c1' } }
    const r = buildModeloJson('Limpo', 'EXTRATO_BANCARIO', comLixo)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(Object.keys(parse(r.json)).sort()).toEqual(['definition', 'formato', 'nome', 'tipoArquivo', 'versaoFormato'])
    expect(r.json).not.toMatch(/"(id|code|authorId|clienteId|empresaId|currentVersionId)"/)
  })

  it('apara espaços do nome', () => {
    const r = buildModeloJson('ADRIA ', null, DEF_OK)
    expect(r.ok && parse(r.json).nome).toBe('ADRIA')
  })
})

describe('nomes de arquivo', () => {
  it('slug sem acentos nem símbolos', () => {
    expect(nomeArquivoModelo('BRADESCO - LIQUIDACAO DE COBRANÇA')).toBe('modelo-bradesco-liquidacao-de-cobranca.json')
    expect(nomeArquivoModelo('***')).toBe('modelo-sem-nome.json')
  })

  it('nomes repetidos ganham sufixo, pulando os já tomados', () => {
    const usados = new Set<string>()
    expect(nomeUnico('modelo-x.json', usados)).toBe('modelo-x.json')
    expect(nomeUnico('modelo-x-2.json', usados)).toBe('modelo-x-2.json')
    expect(nomeUnico('modelo-x.json', usados)).toBe('modelo-x-3.json')
  })

  it('zip datado', () => {
    expect(nomeZipModelos(new Date(2026, 9, 2))).toBe('modelos-tratamento-2026-10-02.zip')
  })
})

describe('exportarModelosZip', () => {
  it('um .json válido por modelo exportável, nomes únicos, falhas relatadas', async () => {
    const base = { tipoArquivo: 'EXTRATO_BANCARIO' as const, definition: DEF_OK }
    const fonte: Record<string, ModeloParaExportar> = {
      a: { nome: 'Sicoob', ...base },
      b: { nome: 'Sicoob', ...base },
      c: { nome: 'Quebrado', tipoArquivo: null, definition: { ...DEF_OK, columnMapping: { ...DEF_OK.columnMapping, data: '' } } },
    }
    const progresso: number[] = []
    const res = await exportarModelosZip(
      [{ id: 'a', nome: 'Sicoob' }, { id: 'b', nome: 'Sicoob' }, { id: 'c', nome: 'Quebrado' }, { id: 'd', nome: 'Sumiu' }],
      async (id) => {
        if (!(id in fonte)) throw new Error('404')
        return fonte[id]!
      },
      (feitos) => progresso.push(feitos),
    )
    expect(progresso).toEqual([1, 2, 3, 4])
    expect(res.exportados).toBe(2)
    expect(res.falhas.map((f) => f.nome)).toEqual(['Quebrado', 'Sumiu'])

    const zip = await JSZip.loadAsync(res.zip!)
    const nomes = Object.keys(zip.files).sort()
    expect(nomes).toEqual(['modelo-sicoob-2.json', 'modelo-sicoob.json'])
    for (const n of nomes) {
      const obj = JSON.parse(await zip.file(n)!.async('string'))
      expect(treatmentModelExportSchema.safeParse(obj).success).toBe(true)
    }
  })

  it('sem nenhum modelo exportável → zip null', async () => {
    const res = await exportarModelosZip([{ id: 'x', nome: 'X' }], async () => { throw new Error('falhou') })
    expect(res.zip).toBeNull()
    expect(res.exportados).toBe(0)
  })
})

describe('tipo de arquivo no CRUD', () => {
  it('criar exige o tipo; editar não', () => {
    const base = { nome: 'Modelo' }
    expect(createTreatmentModelSchema.safeParse(base).success).toBe(false)
    expect(createTreatmentModelSchema.safeParse({ ...base, tipoArquivo: 'PLANILHA_CLIENTE' }).success).toBe(true)
    expect(createTreatmentModelSchema.safeParse({ ...base, tipoArquivo: 'OUTRO' }).success).toBe(false)
    expect(updateTreatmentModelSchema.safeParse(base).success).toBe(true)
  })
})
