import { isValidCnpj, isValidCpf, isValidDocumento, limparCnpj } from './documento.util'

describe('documento.util — CNPJ alfanumérico (#HLP CNPJ alfanumérico)', () => {
  describe('isValidCnpj — caso oficial Serpro/RFB', () => {
    // Exemplo canônico dos dois PDFs oficiais, DV recalculado à mão.
    it('valida o CNPJ alfanumérico oficial 12ABC34501DE35', () => {
      expect(isValidCnpj('12ABC34501DE35')).toBe(true)
      expect(isValidCnpj('12.ABC.345/01DE-35')).toBe(true) // com máscara
    })

    it('rejeita o mesmo CNPJ com DV errado', () => {
      expect(isValidCnpj('12ABC34501DE34')).toBe(false)
      expect(isValidCnpj('12ABC34501DE36')).toBe(false)
    })

    it('rejeita DV não numérico (os 2 últimos devem ser dígitos)', () => {
      expect(isValidCnpj('12ABC34501DEA5')).toBe(false)
      expect(isValidCnpj('ABC1234501DEXY')).toBe(false)
    })

    it('rejeita caractere inválido nas 12 primeiras posições', () => {
      expect(isValidCnpj('12-BC34501DE35')).toBe(false)
      expect(isValidCnpj('12abc34501de35')).toBe(true) // minúsculo é normalizado p/ maiúsculo
    })
  })

  describe('isValidCnpj — compatibilidade com o numérico tradicional', () => {
    it('continua validando CNPJ numérico válido', () => {
      expect(isValidCnpj('11222333000181')).toBe(true)
      expect(isValidCnpj('11.222.333/0001-81')).toBe(true)
    })

    it('rejeita numérico com DV errado e placeholders repetidos', () => {
      expect(isValidCnpj('11222333000182')).toBe(false)
      expect(isValidCnpj('00000000000000')).toBe(false)
      expect(isValidCnpj('11111111111111')).toBe(false)
    })

    it('rejeita tamanho diferente de 14', () => {
      expect(isValidCnpj('1122233300018')).toBe(false)
      expect(isValidCnpj('112223330001810')).toBe(false)
    })
  })

  describe('limparCnpj', () => {
    it('preserva letras e remove pontuação, em maiúsculo', () => {
      expect(limparCnpj('12.ABC.345/01DE-35')).toBe('12ABC34501DE35')
      expect(limparCnpj('12abc34501de35')).toBe('12ABC34501DE35')
      expect(limparCnpj('11.222.333/0001-81')).toBe('11222333000181')
    })
  })

  describe('isValidDocumento — CPF e CNPJ', () => {
    it('valida CPF numérico', () => {
      expect(isValidCpf('52998224725')).toBe(true)
      expect(isValidDocumento('529.982.247-25')).toBe(true)
    })
    it('valida CNPJ alfanumérico via documento', () => {
      expect(isValidDocumento('12.ABC.345/01DE-35')).toBe(true)
    })
    it('documento de tamanho inválido é rejeitado', () => {
      expect(isValidDocumento('123')).toBe(false)
    })
  })
})
