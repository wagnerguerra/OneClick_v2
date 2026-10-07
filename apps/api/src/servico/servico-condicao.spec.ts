import { avaliarCondicoes, afetadosPelaTroca, condicoesEfetivasDoTemplate } from './servico-condicao'

const pg = (id: string, ordem: number, resposta: string[] = [], condicoes?: unknown) =>
  ({ id, ordem, tipo: 'PERGUNTA', perguntaTexto: `P ${id}`, respostaOpcoes: resposta, condicoes })
const ps = (id: string, ordem: number, condicoes?: unknown, concluido = false) =>
  ({ id, ordem, tipo: 'PASSO', respostaOpcoes: [], condicoes, concluido, passoNome: id })
const se = (perguntaExecPassoId: string, ...opcoes: string[]) => ({ perguntaExecPassoId, opcoes })

describe('avaliarCondicoes', () => {
  it('pergunta sem resposta deixa o condicionado aguardando (não riscado)', () => {
    const r = avaliarCondicoes([pg('q', 0), ps('a', 1, [se('q', 'Sim')])])
    expect(r.get('a')).toEqual({ estado: 'aguardando', perguntaId: 'q' })
  })

  it('resposta única: casa = aplica, não casa = não se aplica', () => {
    const passos = [pg('q', 0, ['Não']), ps('a', 1, [se('q', 'Sim')]), ps('b', 2, [se('q', 'Não')]), ps('c', 3)]
    const r = avaliarCondicoes(passos)
    expect(r.get('a')?.estado).toBe('nao_se_aplica')
    expect(r.get('b')?.estado).toBe('aplica')
    expect(r.get('c')?.estado).toBe('aplica')
  })

  it('múltipla: vale tudo que casar com QUALQUER opção marcada', () => {
    const r = avaliarCondicoes([pg('q', 0, ['A', 'C']), ps('a', 1, [se('q', 'A')]), ps('b', 2, [se('q', 'B')]), ps('c', 3, [se('q', 'B', 'C')])])
    expect(r.get('a')?.estado).toBe('aplica')
    expect(r.get('b')?.estado).toBe('nao_se_aplica')
    expect(r.get('c')?.estado).toBe('aplica')
  })

  it('herança: etapa + passo precisam valer; pergunta que não se aplica arrasta os dependentes', () => {
    const passos = [
      pg('q1', 0, ['Não']),
      pg('q2', 1, ['Sim'], [se('q1', 'Sim')]),   // q2 não se aplica
      ps('a', 2, [se('q2', 'Sim')]),             // cascata
      ps('b', 3, [se('q1', 'Não'), se('q1', 'Sim')]), // duas condições, uma falha
    ]
    const r = avaliarCondicoes(passos)
    expect(r.get('q2')?.estado).toBe('nao_se_aplica')
    expect(r.get('a')?.estado).toBe('nao_se_aplica')
    expect(r.get('b')?.estado).toBe('nao_se_aplica')
  })

  it('condição apontando para pergunta inexistente é ignorada', () => {
    expect(avaliarCondicoes([ps('a', 0, [se('sumiu', 'X')])]).get('a')?.estado).toBe('aplica')
  })
})

describe('afetadosPelaTroca (dry-run)', () => {
  it('lista só os concluídos que deixariam de valer; histórico fica com quem chama', () => {
    const passos = [pg('q', 0, ['Sim']), ps('a', 1, [se('q', 'Sim')], true), ps('b', 2, [se('q', 'Sim')], false), ps('c', 3, [se('q', 'Não')], false)]
    expect(afetadosPelaTroca(passos, 'q', ['Não']).map(p => p.id)).toEqual(['a'])
    expect(afetadosPelaTroca(passos, 'q', ['Sim'])).toEqual([])
  })
})

describe('condicoesEfetivasDoTemplate', () => {
  const etapa1 = { id: 'e1' }
  const etapa2 = { id: 'e2', condicaoPassoId: 'q', condicaoOpcoes: ['Sim'] }
  const sub = { id: 's1', condicaoPassoId: 'q', condicaoOpcoes: ['Não', 'Inexistente'] }
  const q = { id: 'q', tipo: 'PERGUNTA', perguntaOpcoes: ['Sim', 'Não'] }

  it('combina etapa + sub-etapa + passo e descarta opção que não existe', () => {
    const m = condicoesEfetivasDoTemplate([
      { passo: q, etapa: etapa1, sub: null },
      { passo: { id: 'a', condicaoPassoId: 'q', condicaoOpcoes: ['Sim'] }, etapa: etapa2, sub },
    ])
    expect(m.get('q')).toEqual([])
    expect(m.get('a')).toEqual([
      { perguntaPassoId: 'q', opcoes: ['Sim'] },
      { perguntaPassoId: 'q', opcoes: ['Não'] },
      { perguntaPassoId: 'q', opcoes: ['Sim'] },
    ])
  })

  it('pergunta depois do item (ou dentro da etapa condicionada por ela) é descartada', () => {
    const m = condicoesEfetivasDoTemplate([
      { passo: { id: 'a', condicaoPassoId: 'q', condicaoOpcoes: ['Sim'] }, etapa: etapa1, sub: null },
      { passo: q, etapa: etapa2, sub: null },
    ])
    expect(m.get('a')).toEqual([])
    expect(m.get('q')).toEqual([]) // etapa2 condicionada à própria pergunta dela
  })

  it('passo comum não serve de pergunta', () => {
    const m = condicoesEfetivasDoTemplate([
      { passo: { id: 'x', tipo: 'PASSO', perguntaOpcoes: ['Sim'] }, etapa: etapa1, sub: null },
      { passo: { id: 'a', condicaoPassoId: 'x', condicaoOpcoes: ['Sim'] }, etapa: etapa1, sub: null },
    ])
    expect(m.get('a')).toEqual([])
  })
})
