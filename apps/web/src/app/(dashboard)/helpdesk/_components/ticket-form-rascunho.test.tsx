import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'

// O hook carrega categorias e lê o perfil ao ativar. Nada disso importa para o
// rascunho; os dublês existem só para o hook montar.
vi.mock('@/lib/trpc', () => ({
  trpc: { helpdesk: { listCategorias: { query: () => Promise.resolve([]) } } },
}))
vi.mock('@/hooks/use-current-user-profile', () => ({
  useCurrentUserProfile: () => ({ profile: { isMaster: false, role: 'USER' } }),
}))
vi.mock('@/lib/alerts', () => ({
  alerts: { error: vi.fn(), success: vi.fn(), confirm: vi.fn(() => Promise.resolve(true)) },
}))

import { useTicketForm } from './ticket-form'

const CHAVE = 'helpdesk:novo-ticket:rascunho'

/**
 * #HLP0384 — o ciclo do rascunho, do jeito que o usuário vive.
 *
 * "O ticket apaga quando você troca de página, às vezes precisamos pegar alguma
 * coisa para complementar o ticket."
 */
describe('rascunho do novo ticket', () => {
  beforeEach(() => localStorage.clear())
  afterEach(() => vi.restoreAllMocks())

  /** Abre o formulário, com `active` controlável como o container faz. */
  function abrir(inicial = true) {
    return renderHook(
      ({ active }: { active: boolean }) => useTicketForm({ active }),
      { initialProps: { active: inicial } },
    )
  }

  it('guarda o que foi digitado enquanto o formulário está aberto', async () => {
    const { result } = abrir()
    act(() => { result.current.setTitulo('Não consigo emitir a nota') })
    await waitFor(() => expect(localStorage.getItem(CHAVE)).not.toBeNull())
    expect(JSON.parse(localStorage.getItem(CHAVE)!).titulo).toBe('Não consigo emitir a nota')
  })

  it('devolve o conteúdo ao reabrir — o caso do ticket', async () => {
    // A pessoa escreve, sai para buscar o dado que faltava, e volta.
    const primeira = abrir()
    act(() => {
      primeira.result.current.setTitulo('Erro no fechamento')
      primeira.result.current.setDescricao('<p>trava ao salvar</p>')
      primeira.result.current.setTipo('INCIDENTE')
    })
    await waitFor(() => expect(localStorage.getItem(CHAVE)).not.toBeNull())
    primeira.unmount()

    const segunda = abrir()
    await waitFor(() => expect(segunda.result.current.titulo).toBe('Erro no fechamento'))
    expect(segunda.result.current.descricao).toBe('<p>trava ao salvar</p>')
    expect(segunda.result.current.tipo).toBe('INCIDENTE')
    expect(segunda.result.current.rascunhoRestaurado).toBe(true)
  })

  it('não apaga o rascunho no instante em que o formulário abre', async () => {
    // REGRESSÃO: no commit em que `active` vira true os dois efeitos rodam, e o
    // de gravação enxerga o estado vazio do render anterior. Sem o pulo de
    // abertura ele apagava a chave logo antes de ela ser lida — o rascunho
    // nunca voltava, e o sintoma era idêntico ao bug original do ticket.
    localStorage.setItem(CHAVE, JSON.stringify({
      titulo: 'Rascunho anterior', descricao: '<p>texto</p>',
      tipo: 'DUVIDA', prioridade: 'MEDIA', categoriaId: null, anexos: [],
    }))
    const { result } = abrir()
    await waitFor(() => expect(result.current.titulo).toBe('Rascunho anterior'))
    expect(localStorage.getItem(CHAVE)).not.toBeNull()
  })

  it('sobrevive a fechar e reabrir sem desmontar (balão do FAB)', async () => {
    const { result, rerender } = abrir()
    act(() => { result.current.setTitulo('Solicitação de acesso') })
    await waitFor(() => expect(localStorage.getItem(CHAVE)).not.toBeNull())

    rerender({ active: false })
    // Ao fechar, os CAMPOS são limpos; o rascunho no navegador fica.
    await waitFor(() => expect(result.current.titulo).toBe(''))
    expect(localStorage.getItem(CHAVE)).not.toBeNull()

    rerender({ active: true })
    await waitFor(() => expect(result.current.titulo).toBe('Solicitação de acesso'))
  })

  it('abre limpo quando não há rascunho', async () => {
    const { result } = abrir()
    await waitFor(() => expect(result.current.rascunhoRestaurado).toBe(false))
    expect(result.current.titulo).toBe('')
    expect(localStorage.getItem(CHAVE)).toBeNull()
  })

  it('descartar apaga o rascunho e zera os campos', async () => {
    const { result } = abrir()
    act(() => { result.current.setTitulo('Vou desistir deste') })
    await waitFor(() => expect(localStorage.getItem(CHAVE)).not.toBeNull())

    await act(async () => { await result.current.descartarRascunho() })
    await waitFor(() => expect(localStorage.getItem(CHAVE)).toBeNull())
    expect(result.current.titulo).toBe('')
    expect(result.current.rascunhoRestaurado).toBe(false)
  })

  it('apagar o texto à mão também limpa o rascunho', async () => {
    const { result } = abrir()
    act(() => { result.current.setTitulo('escrevi') })
    await waitFor(() => expect(localStorage.getItem(CHAVE)).not.toBeNull())
    act(() => { result.current.setTitulo('') })
    // Senão o texto que a pessoa apagou de propósito voltaria na reabertura.
    await waitFor(() => expect(localStorage.getItem(CHAVE)).toBeNull())
  })

  it('rascunho corrompido não quebra a abertura', async () => {
    localStorage.setItem(CHAVE, '{isto não é json')
    const { result } = abrir()
    await waitFor(() => expect(result.current.rascunhoRestaurado).toBe(false))
    expect(result.current.titulo).toBe('')
  })
})
