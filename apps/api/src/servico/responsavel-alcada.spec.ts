/**
 * Quem pode definir o responsável pela execução de um serviço.
 *
 * A trava que estes testes existem para prender: a alçada de uma chefia é a
 * ÁREA pela qual ela responde. Antes, `role === 'GESTOR'` entrava na lista de
 * privilegiados globais — então ligar a permissão "Alterar responsável pelos
 * serviços" para a gestora do Fiscal a deixava definir responsável de serviço
 * Contábil também. O recorte por área existia no código, mas só valia para quem
 * NÃO fosse privilegiado, ou seja: nunca para gestor.
 *
 * Os testes falam em Joseli/Fiscal porque foi o caso que expôs o furo.
 */

import { decidirAlcadaResponsavel } from './responsavel-alcada'

const FISCAL = { id: 'area-fiscal', name: 'Fiscal', isActive: true }
const CONTABIL = { id: 'area-contabil', name: 'Contábil', isActive: true }

/** Joseli: líder cadastrada da área Fiscal (`Area.leaderId`), não global. */
const JOSELI = { isGlobal: false, ledAreaIds: [FISCAL.id] }
const DIRETOR = { isGlobal: true, ledAreaIds: [] }
/** Chefia com a permissão ligada, mas sem área sob liderança. */
const SEM_AREA = { isGlobal: false, ledAreaIds: [] }

describe('alçada por área para definir quem executa', () => {
  it('gestora do Fiscal PODE no serviço do Fiscal', () => {
    const r = decidirAlcadaResponsavel(JOSELI, 'svc-fiscal', FISCAL)
    expect(r.podeDefinir).toBe(true)
    expect(r.motivo).toBeNull()
  })

  it('gestora do Fiscal NÃO PODE no serviço do Contábil', () => {
    const r = decidirAlcadaResponsavel(JOSELI, 'svc-contabil', CONTABIL)
    expect(r.podeDefinir).toBe(false)
    // O motivo nomeia a área: é o texto que a tela mostra no lugar do menu.
    expect(r.motivo).toContain('Contábil')
  })

  it('quem não lidera área nenhuma não pode em lugar nenhum', () => {
    expect(decidirAlcadaResponsavel(SEM_AREA, 'svc-fiscal', FISCAL).podeDefinir).toBe(false)
  })

  it('diretoria continua global — qualquer área, sem precisar liderar', () => {
    const r = decidirAlcadaResponsavel(DIRETOR, 'svc-contabil', CONTABIL)
    expect(r.podeDefinir).toBe(true)
  })

  it('serviço SEM área configurada recusa, e o motivo aponta o conserto', () => {
    const r = decidirAlcadaResponsavel(JOSELI, 'svc-orfao', null)
    expect(r.podeDefinir).toBe(false)
    expect(r.motivo).toContain('não tem área configurada')
  })

  it('área DESATIVADA conta como sem área — não vira porta aberta', () => {
    const r = decidirAlcadaResponsavel(JOSELI, 'svc-x', { ...FISCAL, isActive: false })
    expect(r.podeDefinir).toBe(false)
  })

  it('usuário inexistente nunca decide nada', () => {
    expect(decidirAlcadaResponsavel(null, 'svc-fiscal', FISCAL).podeDefinir).toBe(false)
  })
})
