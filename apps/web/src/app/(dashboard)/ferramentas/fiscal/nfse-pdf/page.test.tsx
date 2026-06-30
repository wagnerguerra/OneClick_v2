import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import NfsePdfPage from './page'

describe('Página NFS-e → PDF', () => {
  it('renderiza o seletor de pasta e o botão de gerar', () => {
    render(<NfsePdfPage />)
    expect(screen.getByLabelText('Pasta de XMLs')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Gerar DANFSe/i })).toBeInTheDocument()
  })
})
