import { describe, it, expect, beforeEach } from 'vitest'
import {
  CHAVE_RECENTES, chaveDe, lerRecentes, registrarRecente, filtrarPermitidos,
} from './busca-global-recentes'

/** O menu de quem só alcança a Gestão de Arquivos. */
const SO_ARQUIVOS = ['/gestao-arquivos']

beforeEach(() => localStorage.clear())

describe('filtrarPermitidos', () => {
  it('descarta a tela que o usuário não alcança', () => {
    // O vazamento relatado: rastro de outra sessão no mesmo navegador.
    const trilha = [
      { titulo: 'Usuários', href: '/usuarios' },
      { titulo: 'Clientes', href: '/clientes' },
      { titulo: 'HelpDesk', href: '/helpdesk' },
      { titulo: 'Gestão de Arquivos', href: '/gestao-arquivos' },
    ]
    expect(filtrarPermitidos(trilha, SO_ARQUIVOS).map(r => r.href)).toEqual(['/gestao-arquivos'])
  })

  it('mantém a rota interna da tela permitida', () => {
    const trilha = [{ titulo: 'Usuários', href: '/usuarios/cmu17c92f/editar' }]
    expect(filtrarPermitidos(trilha, ['/usuarios'])).toHaveLength(1)
    expect(filtrarPermitidos(trilha, SO_ARQUIVOS)).toHaveLength(0)
  })

  it('não deixa um prefixo de texto liberar outra rota', () => {
    const trilha = [{ titulo: 'Inativos', href: '/clientes-inativos' }]
    expect(filtrarPermitidos(trilha, ['/clientes'])).toHaveLength(0)
  })

  it('não oferece nada quando a lista de permitidos está vazia', () => {
    // É o intervalo em que as permissões ainda não chegaram: no escuro, nada.
    const trilha = [{ titulo: 'Usuários', href: '/usuarios' }]
    expect(filtrarPermitidos(trilha, [])).toHaveLength(0)
  })
})

describe('trilha por usuário', () => {
  it('não entrega a trilha de um usuário para outro', () => {
    registrarRecente('user-a', 'Usuários', '/usuarios')
    expect(lerRecentes('user-a').map(r => r.href)).toEqual(['/usuarios'])
    // `user-b` tem a própria trilha; a chave antiga é que ele não deve herdar
    // de um colega — aqui ela nem existe.
    expect(lerRecentes('user-b')).toEqual([])
  })

  it('não entrega trilha nenhuma antes da sessão resolver', () => {
    registrarRecente('user-a', 'Usuários', '/usuarios')
    expect(lerRecentes(null)).toEqual([])
  })

  it('ignora a gravação sem usuário', () => {
    registrarRecente(null, 'Usuários', '/usuarios')
    expect(localStorage.getItem(CHAVE_RECENTES)).toBeNull()
  })

  it('apaga a chave antiga em vez de herdá-la', () => {
    // O balde sem dono: o rastro de quem usou o navegador antes. Herdar seria
    // o próprio vazamento — o filtro de permissão barraria a tela que este
    // usuário não alcança, mas deixaria passar tudo que os dois alcançam.
    localStorage.setItem(CHAVE_RECENTES, JSON.stringify([{ titulo: 'Clientes', href: '/clientes' }]))
    expect(lerRecentes('user-a')).toEqual([])
    expect(localStorage.getItem(CHAVE_RECENTES)).toBeNull()
  })

  it('sobe o item repetido para o topo em vez de duplicar', () => {
    registrarRecente('user-a', 'A', '/a')
    registrarRecente('user-a', 'B', '/b')
    registrarRecente('user-a', 'A', '/a')
    expect(lerRecentes('user-a').map(r => r.href)).toEqual(['/a', '/b'])
  })

  it('guarda no máximo seis', () => {
    for (let i = 0; i < 9; i++) registrarRecente('user-a', `T${i}`, `/t${i}`)
    expect(lerRecentes('user-a')).toHaveLength(6)
  })

  it('sobrevive a JSON corrompido no storage', () => {
    localStorage.setItem(chaveDe('user-a'), '{isso não é json')
    expect(lerRecentes('user-a')).toEqual([])
  })
})
