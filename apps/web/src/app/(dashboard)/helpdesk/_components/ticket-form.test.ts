import { describe, expect, it } from 'vitest'

import { anexosPersistiveis, rascunhoTemConteudo } from './ticket-form'
import type { AnexoStaged } from './anexos-dropzone'

/**
 * #HLP0384 — regras do rascunho do novo ticket.
 *
 * O relato que originou isto: "o ticket apaga quando você troca de página... às
 * vezes precisamos pegar alguma coisa para complementar o ticket". As duas
 * decisões sutis do rascunho estão aqui, porque errar qualquer uma reintroduz a
 * perda de trabalho de um jeito mais difícil de perceber do que o bug original.
 */

const anexo = (over: Partial<AnexoStaged> = {}): AnexoStaged => ({
  id: 'a1',
  fileName: 'print.png',
  fileUrl: 'https://cdn/print.png',
  mimeType: 'image/png',
  tamanho: 1024,
  status: 'ready',
  ...over,
})

describe('rascunhoTemConteudo', () => {
  it('guarda quando há título', () => {
    expect(rascunhoTemConteudo({ titulo: 'Erro no relatório' })).toBe(true)
  })

  it('guarda quando há descrição de verdade', () => {
    expect(rascunhoTemConteudo({ descricao: '<p>não consigo emitir</p>' })).toBe(true)
  })

  it('não guarda editor vazio', () => {
    // O RichEditor nunca devolve string vazia: entrega marcação sem texto.
    // Tratar isso como conteúdo faria o aviso de "recuperamos o que você
    // escreveu" aparecer para quem não escreveu nada.
    expect(rascunhoTemConteudo({ descricao: '<p></p>' })).toBe(false)
    expect(rascunhoTemConteudo({ descricao: '<p>&nbsp;</p>' })).toBe(false)
    expect(rascunhoTemConteudo({ titulo: '   ' })).toBe(false)
  })

  it('não guarda só porque um tipo foi escolhido', () => {
    // Escolher "Erro" é um clique, não redação. Guardar por isso faria o
    // formulário reabrir com aviso de rascunho sem nada dentro.
    expect(rascunhoTemConteudo({ tipo: 'INCIDENTE', prioridade: 'ALTA' })).toBe(false)
  })

  it('guarda quando só há anexo — o print já subiu', () => {
    expect(rascunhoTemConteudo({ anexos: [anexo()] })).toBe(true)
  })

  it('rascunho vazio não é conteúdo', () => {
    expect(rascunhoTemConteudo({})).toBe(false)
  })
})

describe('anexosPersistiveis', () => {
  it('mantém o anexo já enviado', () => {
    expect(anexosPersistiveis([anexo()])).toHaveLength(1)
  })

  it('descarta upload em andamento e upload que falhou', () => {
    // Nenhum dos dois tem fileUrl utilizável: voltariam como card quebrado.
    const lista = [
      anexo({ id: 'ok' }),
      anexo({ id: 'subindo', status: 'uploading', fileUrl: '' }),
      anexo({ id: 'falhou', status: 'error', fileUrl: '' }),
    ]
    expect(anexosPersistiveis(lista).map(a => a.id)).toEqual(['ok'])
  })

  it('descarta o "ready" sem fileUrl', () => {
    expect(anexosPersistiveis([anexo({ fileUrl: '' })])).toHaveLength(0)
  })

  it('joga fora o previewUrl', () => {
    // ObjectURL só vale enquanto a aba viver — e a graça do rascunho é
    // sobreviver a ela. Guardado, viraria imagem quebrada na reabertura.
    const salvos = anexosPersistiveis([anexo({ previewUrl: 'blob:http://localhost/abc' })])
    expect(salvos[0]!.previewUrl).toBeUndefined()
    expect(salvos[0]!.fileUrl).toBe('https://cdn/print.png')
  })

  it('sobrevive a um ciclo de serialização', () => {
    // É assim que o rascunho vai e volta do localStorage.
    const original = anexosPersistiveis([anexo({ previewUrl: 'blob:x' })])
    const voltou = JSON.parse(JSON.stringify(original)) as AnexoStaged[]
    expect(voltou[0]!.fileUrl).toBe('https://cdn/print.png')
    expect(voltou[0]!.status).toBe('ready')
  })
})
