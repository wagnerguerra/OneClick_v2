import { AgendaGoogleService, ehIdDoGoogle } from './agenda-google.service'

describe('ehIdDoGoogle', () => {
  it('aceita id de evento do Google e de instância de recorrência', () => {
    expect(ehIdDoGoogle('4f1u2kq9m0h3lbvc8s6ndh0abc')).toBe(true)
    expect(ehIdDoGoogle('4f1u2kq9m0h3lbvc8s6ndh0abc_20261006T120000Z')).toBe(true)
  })
  it('recusa o google_id herdado do v1 (não existe no Google)', () => {
    expect(ehIdDoGoogle('ab12cd_27456')).toBe(false)
    expect(ehIdDoGoogle(null)).toBe(false)
    expect(ehIdDoGoogle('')).toBe(false)
  })
})

describe('state assinado do OAuth', () => {
  const antes = process.env.BETTER_AUTH_SECRET
  beforeAll(() => { process.env.BETTER_AUTH_SECRET = 'segredo-de-teste-com-mais-de-32-caracteres' })
  afterAll(() => { process.env.BETTER_AUTH_SECRET = antes })
  const svc = new AgendaGoogleService()
  const assinar = (id: string) => (svc as unknown as { assinarState(u: string): string }).assinarState(id)

  it('devolve o usuário do state legítimo', () => {
    expect(svc.verificarState(assinar('user-1'))).toBe('user-1')
  })
  it('recusa state adulterado (trocar o usuário invalida a assinatura)', () => {
    const [, sig] = assinar('user-1').split('.')
    const forjado = `${Buffer.from(`user-2.${Date.now() + 60000}`).toString('base64url')}.${sig}`
    expect(svc.verificarState(forjado)).toBeNull()
    expect(svc.verificarState('user-1')).toBeNull()
    expect(svc.verificarState(undefined)).toBeNull()
  })
  it('recusa state expirado', () => {
    jest.useFakeTimers().setSystemTime(Date.now())
    const s = assinar('user-1')
    jest.setSystemTime(Date.now() + 16 * 60 * 1000)
    expect(svc.verificarState(s)).toBeNull()
    jest.useRealTimers()
  })
})
