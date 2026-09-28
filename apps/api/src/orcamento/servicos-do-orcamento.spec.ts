import { acaoAposServicos, situacaoDosServicos } from './servicos-do-orcamento'

const d = (s: string) => new Date(s)

describe('situacaoDosServicos', () => {
  it('todos terminais com ao menos um concluído', () => {
    const s = situacaoDosServicos([
      { status: 'CONCLUIDO', concluidoEm: d('2026-09-20T12:00:00Z') },
      { status: 'CONCLUIDO', concluidoEm: d('2026-09-22T12:00:00Z') },
      { status: 'PULADO', concluidoEm: null },
    ])
    expect(s.todosConcluidos).toBe(true)
    expect(s.concluidos).toBe(2)
    expect(s.concluidoEm).toEqual(d('2026-09-22T12:00:00Z'))
  })

  it('execução ainda em andamento (ex.: sucessora da cadeia) segura', () => {
    const s = situacaoDosServicos([
      { status: 'CONCLUIDO', concluidoEm: d('2026-09-20T12:00:00Z') },
      { status: 'EM_ANDAMENTO', concluidoEm: null },
    ])
    expect(s.todosConcluidos).toBe(false)
    expect(s.concluidoEm).toBeNull()
  })

  it('sem execução, ou só canceladas, não conta como concluído', () => {
    expect(situacaoDosServicos([]).todosConcluidos).toBe(false)
    expect(situacaoDosServicos([{ status: 'CANCELADO', concluidoEm: null }]).todosConcluidos).toBe(false)
  })
})

describe('acaoAposServicos', () => {
  it('aprovado com serviço concluído espera o financeiro (o caso do #4803)', () => {
    expect(acaoAposServicos('APROVADO', true)).toBe('AGUARDAR_LIBERACAO')
  })
  it('liberado com serviço concluído finaliza', () => {
    expect(acaoAposServicos('LIBERADO', true)).toBe('FINALIZAR')
  })
  it('serviço pendente, ou orçamento em outro status: nada', () => {
    expect(acaoAposServicos('LIBERADO', false)).toBe('NADA')
    expect(acaoAposServicos('FINALIZADO', true)).toBe('NADA')
    expect(acaoAposServicos('ENCERRADO', true)).toBe('NADA')
  })
})
