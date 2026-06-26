import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import ExtratoEditPage from './page'

describe('Página Editor de Extrato', () => {
  it('renderiza o seletor de extrato e o botão de cadastro', () => {
    render(<ExtratoEditPage />)
    expect(screen.getByLabelText('Extrato bancário')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Cadastro/i })).toBeInTheDocument()
  })
})
