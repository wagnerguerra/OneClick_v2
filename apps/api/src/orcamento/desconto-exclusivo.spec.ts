/**
 * Desconto geral OU por item — nunca os dois.
 *
 * O que estes testes prendem, em ordem de importância:
 *
 *  1. o bloqueio existe (era a soma silenciosa que produziu 40% no #4630);
 *  2. ele NÃO trava quem já tem os dois — zerar e reenviar o mesmo valor
 *     continuam passando. Sem isso, o orçamento antigo fica impossível de
 *     salvar, porque a tela salva sozinha e manda o registro inteiro.
 */

import {
  decidirDesconto,
  intensidadeDesconto,
  MOTIVO_GERAL_BLOQUEADO,
  MOTIVO_ITEM_BLOQUEADO,
} from './desconto-exclusivo'

describe('intensidadeDesconto', () => {
  it('pega o maior entre percentual e reais — só responde "tem desconto?"', () => {
    expect(intensidadeDesconto(20, 0)).toBe(20)
    expect(intensidadeDesconto(0, 150)).toBe(150)
    expect(intensidadeDesconto(10, 150)).toBe(150)
  })

  it('nulo, vazio e texto não-numérico valem zero', () => {
    expect(intensidadeDesconto(null, undefined)).toBe(0)
    expect(intensidadeDesconto('', '')).toBe(0)
    expect(intensidadeDesconto('abc', null)).toBe(0)
  })

  it('Decimal do Prisma chega como string', () => {
    expect(intensidadeDesconto('20.00', '0.00')).toBe(20)
  })
})

describe('decidirDesconto', () => {
  it('bloqueia desconto novo quando o outro lado já tem', () => {
    const d = decidirDesconto(20, 0, true, MOTIVO_GERAL_BLOQUEADO)
    expect(d.permitido).toBe(false)
    expect(d.motivo).toBe(MOTIVO_GERAL_BLOQUEADO)
  })

  it('libera quando o outro lado está zerado', () => {
    expect(decidirDesconto(20, 0, false, MOTIVO_GERAL_BLOQUEADO)).toEqual({ permitido: true, motivo: null })
  })

  it('ZERAR sempre passa — é a saída de quem já tem os dois', () => {
    expect(decidirDesconto(0, 20, true, MOTIVO_ITEM_BLOQUEADO).permitido).toBe(true)
  })

  it('reenviar o MESMO valor passa — o #4630 tem que continuar editável', () => {
    // A tela salva sozinha a cada tecla e manda o orçamento inteiro. Sem esta
    // regra, mexer na forma de pagamento de um orçamento que já tem os dois
    // descontos dispararia o bloqueio e travaria o registro.
    expect(decidirDesconto(20, 20, true, MOTIVO_GERAL_BLOQUEADO).permitido).toBe(true)
  })

  it('AUMENTAR o desconto que já existe é valor novo, e é barrado', () => {
    expect(decidirDesconto(30, 20, true, MOTIVO_GERAL_BLOQUEADO).permitido).toBe(false)
  })

  it('reduzir também é valor novo — a regra não abre exceção por ser menor', () => {
    expect(decidirDesconto(10, 20, true, MOTIVO_GERAL_BLOQUEADO).permitido).toBe(false)
  })

  it('cada lado tem a sua mensagem, e ela diz o que fazer', () => {
    expect(MOTIVO_GERAL_BLOQUEADO).toContain('Zere o desconto dos itens')
    expect(MOTIVO_ITEM_BLOQUEADO).toContain('Zere o desconto geral')
  })
})

describe('o caso que originou a regra — orçamento #4630', () => {
  // 2 serviços (2.200 + 5.000) com 20% cada, mais 20% de desconto geral:
  // 1.440 + 1.440 = 2.880 sobre 7.200 = 40%, com a tela mostrando 20%.
  it('com desconto nos itens, o geral não entra', () => {
    expect(decidirDesconto(20, 0, true, MOTIVO_GERAL_BLOQUEADO).permitido).toBe(false)
  })

  it('com desconto geral, o item não entra', () => {
    expect(decidirDesconto(20, 0, true, MOTIVO_ITEM_BLOQUEADO).permitido).toBe(false)
  })

  it('zerando o geral, o desconto por item volta a ser aceito', () => {
    const geralZerado = false
    expect(decidirDesconto(20, 0, geralZerado, MOTIVO_ITEM_BLOQUEADO).permitido).toBe(true)
  })
})
