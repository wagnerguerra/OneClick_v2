import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'

// Evita construir o client tRPC real / rede no render.
vi.mock('@/lib/trpc', () => ({
  trpc: { ferramentas: { list: { query: vi.fn() }, remove: { mutate: vi.fn() } } },
}))

import SpedFerramentaPage from './page'

describe('Página SPED (ferramentas/fiscal/sped)', () => {
  it('renderiza a aba Converter com input de arquivo e botão', () => {
    render(<SpedFerramentaPage />)
    expect(screen.getByLabelText('Arquivo SPED')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Gerar planilha/i })).toBeInTheDocument()
  })
})
