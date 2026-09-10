import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'

vi.mock('@/lib/trpc', () => ({
  trpc: { helpdesk: { listCategorias: { query: () => Promise.resolve([]) } } },
}))
vi.mock('@/hooks/use-current-user-profile', () => ({
  useCurrentUserProfile: () => ({ profile: { isMaster: false, role: 'USER' } }),
}))
vi.mock('@/lib/alerts', () => ({
  alerts: { error: vi.fn(), success: vi.fn(), confirm: vi.fn(() => Promise.resolve(true)) },
}))

import { useTicketForm, TicketFormFields } from './ticket-form'

const CHAVE = 'helpdesk:novo-ticket:rascunho'

function Formulario() {
  const form = useTicketForm({ active: true })
  return <TicketFormFields form={form} variant="fab" />
}

/**
 * #HLP0384 — o texto restaurado precisa APARECER, não só existir no estado.
 *
 * Foi essa a falha relatada: o aviso de recuperação apareceu sobre uma
 * descrição em branco. Este teste monta o formulário de verdade e olha o DOM
 * do editor, que é o único lugar onde a diferença se manifesta.
 */
describe('descrição restaurada na tela', () => {
  beforeEach(() => localStorage.clear())

  it('mostra o texto do rascunho dentro do editor', async () => {
    localStorage.setItem(CHAVE, JSON.stringify({
      titulo: '', descricao: '<p>teste</p>',
      tipo: null, prioridade: 'MEDIA', categoriaId: null, anexos: [],
    }))

    const { container } = render(<Formulario />)

    // O aviso é o que o usuário viu; ele sozinho não prova nada.
    await waitFor(() => expect(screen.getByText(/Recuperamos o que você/i)).toBeTruthy())

    await waitFor(() => {
      const editor = container.querySelector('.ProseMirror')
      expect(editor?.textContent).toContain('teste')
    }, { timeout: 3000 })
  })
})
