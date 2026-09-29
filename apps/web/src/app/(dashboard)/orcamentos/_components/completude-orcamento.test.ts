import { describe, expect, it } from 'vitest'
import { calcularCompletude, type EntradaCompletude } from './completude-orcamento'

const base: EntradaCompletude = {
  status: 'NOVO', itens: [], valorTotal: 0, arquivos: 0, mensagens: 0,
  temSolicitante: false, temResponsavelServico: false, prazoVariant: 'ok',
}

describe('calcularCompletude', () => {
  it('orçamento recém-criado e vazio: só o prazo pontua', () => {
    const c = calcularCompletude(base)
    expect(c.pct).toBe(10)
    expect(c.nivel).toBe('incompleto')
    expect(c.falta).toEqual(expect.arrayContaining(['itens', 'anexos', 'mensagens', 'solicitante']))
  })

  it('finalizado com tudo preenchido chega a 100', () => {
    const c = calcularCompletude({
      ...base, status: 'FINALIZADO', itens: [{ tipo: 'SERVICO', valorTotal: 500 }], valorTotal: 500,
      arquivos: 2, mensagens: 4, temSolicitante: true, temResponsavelServico: true, prazoVariant: 'neutral',
    })
    expect(c.pct).toBe(100)
    expect(c.nivel).toBe('completo')
    expect(c.falta).toEqual([])
  })

  it('enviado com itens e valor, sem anexo nem mensagem: em andamento', () => {
    const c = calcularCompletude({
      ...base, status: 'ENVIADO', itens: [{ tipo: 'SERVICO', valorTotal: 1200 }], valorTotal: 1200,
      temSolicitante: true, temResponsavelServico: true,
    })
    // 16 etapa + 15 itens + 5 valor + 10 pessoas + 10 prazo
    expect(c.pct).toBe(56)
    expect(c.nivel).toBe('andamento')
    expect(c.falta).toContain('anexos')
  })

  it('prazo: atenção vale metade, vencido não pontua', () => {
    expect(calcularCompletude({ ...base, prazoVariant: 'warning' }).pct).toBe(5)
    expect(calcularCompletude({ ...base, prazoVariant: 'danger' }).pct).toBe(0)
  })

  it('encerrado não pontua etapa e não pede para avançar', () => {
    const c = calcularCompletude({ ...base, status: 'ENCERRADO' })
    expect(c.falta).not.toContain('avançar as etapas')
    expect(c.pct).toBe(10)
  })
})
