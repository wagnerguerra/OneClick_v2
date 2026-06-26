import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import FiscalHub from './page'

describe('Hub de Ferramentas Fiscais', () => {
  it('lista as ferramentas fiscais com link para abrir', () => {
    render(<FiscalHub />)
    expect(screen.getByText('Ferramentas Fiscais')).toBeInTheDocument()
    expect(screen.getByText('SPED → XLSX')).toBeInTheDocument()
    expect(screen.getByText('NFS-e → PDF')).toBeInTheDocument()
    // card vira link para a ferramenta
    const links = screen.getAllByRole('link')
    expect(links.some((a) => a.getAttribute('href') === '/ferramentas/fiscal/sped')).toBe(true)
    expect(screen.getAllByText('Abrir ferramenta').length).toBeGreaterThan(1)
  })
})
