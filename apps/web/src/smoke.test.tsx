import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'

// Smoke test da infra de testes (Fase 0): confirma que o Vitest roda com jsdom,
// renderiza componente React e que o matcher do jest-dom funciona.
// Pode ser removido quando houver specs reais.
function Hello({ name }: { name: string }) {
  return <p>Olá, {name}</p>
}

describe('infra de testes (apps/web)', () => {
  it('renderiza componente e usa matcher do jest-dom', () => {
    render(<Hello name="Ferramentas" />)
    expect(screen.getByText('Olá, Ferramentas')).toBeInTheDocument()
  })
})
