import { motivoParaRecusarSessao } from './sessao-recusada'

/**
 * A trava de entrada. Antes dela, o Better Auth não olhava `isActive`: excluir
 * um usuário só apagava a sessão aberta, e ele entrava de novo no login seguinte.
 */

const ativa = { isActive: true }
const inativa = { isActive: false }

describe('motivoParaRecusarSessao', () => {
  it('recusa usuário inativo', () => {
    expect(motivoParaRecusarSessao({ isActive: false, isMaster: false, empresa: ativa })).toBe('USUARIO_INATIVO')
  })

  it('recusa master inativo também — desativar é tirar o acesso', () => {
    expect(motivoParaRecusarSessao({ isActive: false, isMaster: true, empresa: ativa })).toBe('USUARIO_INATIVO')
  })

  it('recusa usuário ativo de empresa inativa', () => {
    expect(motivoParaRecusarSessao({ isActive: true, isMaster: false, empresa: inativa })).toBe('EMPRESA_INATIVA')
  })

  it('deixa o master global entrar na empresa inativa — é quem a religa', () => {
    expect(motivoParaRecusarSessao({ isActive: true, isMaster: true, empresa: inativa })).toBeNull()
  })

  it('usuário inativo de empresa inativa: o motivo é o do usuário', () => {
    expect(motivoParaRecusarSessao({ isActive: false, isMaster: false, empresa: inativa })).toBe('USUARIO_INATIVO')
  })

  it('libera ativo em empresa ativa, e ativo sem empresa', () => {
    expect(motivoParaRecusarSessao({ isActive: true, isMaster: false, empresa: ativa })).toBeNull()
    expect(motivoParaRecusarSessao({ isActive: true, isMaster: false, empresa: null })).toBeNull()
  })

  it('usuário não encontrado não é decisão desta regra', () => {
    expect(motivoParaRecusarSessao(null)).toBeNull()
  })
})
