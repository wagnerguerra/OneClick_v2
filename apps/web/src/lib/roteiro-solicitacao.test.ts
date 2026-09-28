import { describe, expect, it } from 'vitest'
import { ROTEIRO_SOLICITACAO_ORCAMENTO, detalhamentoPreenchido } from '@/components/orcamento/roteiro-solicitacao'

// #HLP0411 — roteiro do Detalhamento ao pedir orçamento.
describe('detalhamentoPreenchido', () => {
  it('roteiro intacto conta como vazio', () => {
    expect(detalhamentoPreenchido(ROTEIRO_SOLICITACAO_ORCAMENTO)).toBe(false)
    expect(detalhamentoPreenchido('<p></p>')).toBe(false)
  })
  it('qualquer resposta no roteiro conta como preenchido', () => {
    const respondido = ROTEIRO_SOLICITACAO_ORCAMENTO.replace(
      '<p><strong>Nome do serviço:</strong></p><p></p>',
      '<p><strong>Nome do serviço:</strong></p><p>Parcelamento de débitos</p>',
    )
    expect(detalhamentoPreenchido(respondido)).toBe(true)
  })
  it('texto livre, sem o roteiro, também vale', () => {
    expect(detalhamentoPreenchido('<p>Orçar abertura de filial em SP</p>')).toBe(true)
  })
})
