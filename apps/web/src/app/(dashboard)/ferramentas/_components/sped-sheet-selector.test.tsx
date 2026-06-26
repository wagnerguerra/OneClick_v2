import { render, screen, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'

const inspectSped = vi.fn()
vi.mock('@/lib/ferramentas-api', () => ({ inspectSped: (...a: unknown[]) => inspectSped(...a) }))

import { SpedSheetSelector } from './sped-sheet-selector'

describe('SpedSheetSelector', () => {
  beforeEach(() => inspectSped.mockReset())

  const filesWith = () => ({ file: [new File(['0000|x'], 'sped.txt', { type: 'text/plain' })] })

  it('inspeciona, mostra as abas principais e reporta sheets (default todas)', async () => {
    inspectSped.mockResolvedValue({ presentRegs: ['0150', '0200', 'C100'] })
    const onFields = vi.fn()
    const onBlock = vi.fn()

    render(<SpedSheetSelector files={filesWith()} color="#818cf8" onFields={onFields} onBlock={onBlock} />)

    expect(await screen.findByText(/0150 — Participantes/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Marcar todos' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Desmarcar todos' })).toBeInTheDocument()

    await waitFor(() => {
      const lastCall = onFields.mock.calls.at(-1)?.[0] as { sheets?: string }
      expect(lastCall?.sheets).toBeDefined()
      const sheets = JSON.parse(lastCall!.sheets!) as string[]
      expect(sheets).toContain('0150')
      expect(sheets).toContain('C100')
    })
  })

  it('não renderiza nada sem arquivo', () => {
    const { container } = render(
      <SpedSheetSelector files={{}} color="#818cf8" onFields={vi.fn()} onBlock={vi.fn()} />,
    )
    expect(container).toBeEmptyDOMElement()
  })
})
