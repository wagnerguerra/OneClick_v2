import { destinatariosDoLembreteDeTarefa } from './lembrete-destinatarios'

describe('destinatariosDoLembreteDeTarefa', () => {
  it('avisa os membros que ainda não deram ciência', () => {
    const membros = [
      { usuarioId: 'criador', ciente: true },
      { usuarioId: 'ana', ciente: false },
      { usuarioId: 'bia', ciente: false },
    ]
    expect(destinatariosDoLembreteDeTarefa(membros, 'criador')).toEqual(['ana', 'bia'])
  })

  it('inclui o criador quando ele também está pendente', () => {
    const membros = [{ usuarioId: 'criador', ciente: false }, { usuarioId: 'ana', ciente: false }]
    expect(destinatariosDoLembreteDeTarefa(membros, 'criador')).toEqual(['criador', 'ana'])
  })

  it('tarefa antiga, sem membros gravados, avisa o criador', () => {
    expect(destinatariosDoLembreteDeTarefa([], 'criador')).toEqual(['criador'])
  })

  it('todos cientes: ninguém a avisar', () => {
    expect(destinatariosDoLembreteDeTarefa([{ usuarioId: 'ana', ciente: true }], 'criador')).toEqual([])
  })
})
