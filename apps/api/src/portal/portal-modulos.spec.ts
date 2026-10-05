/**
 * Liberação dos módulos do portal.
 *
 * A regra é pequena e a consequência não é: errar aqui ou esconde do cliente
 * um módulo que o escritório vendeu, ou mostra um que ele decidiu não abrir.
 */

import { MODULOS_DO_PORTAL, resolverLiberados, modulosDoVinculo } from './portal-modulos'

describe('resolverLiberados', () => {
  it('sem exceção nenhuma, vale o padrão do catálogo', () => {
    // É este caso que faz o deploy não apagar Documentos do portal de quem já
    // usa: empresa sem linha nenhuma continua com o que o catálogo diz.
    const r = resolverLiberados([])
    for (const m of MODULOS_DO_PORTAL) {
      expect(r.has(m.slug)).toBe(m.padrao)
    }
  })

  it('a exceção vence o padrão, nos dois sentidos', () => {
    expect(resolverLiberados([{ modulo: 'documentos', liberado: false }]).has('documentos')).toBe(false)
    expect(resolverLiberados([{ modulo: 'certidoes', liberado: true }]).has('certidoes')).toBe(true)
  })

  it('slug fora do catálogo é ignorado', () => {
    // Módulo removido do código deixa linha órfã no banco. Uma linha órfã não
    // pode reaparecer como módulo fantasma no menu de ninguém.
    const r = resolverLiberados([{ modulo: 'modulo-que-nao-existe-mais', liberado: true }])
    expect(r.has('modulo-que-nao-existe-mais')).toBe(false)
  })

  it('uma exceção não contamina os outros módulos', () => {
    const r = resolverLiberados([{ modulo: 'documentos', liberado: false }])
    expect(r.has('documentos')).toBe(false)
    // Obrigações continua com o padrão dela.
    expect(r.has('obrigacoes')).toBe(true)
  })
})

describe('o catálogo', () => {
  it('não tem slug repetido', () => {
    // Dois com o mesmo slug fariam o último vencer em silêncio, e a tela do
    // master mostraria dois interruptores para a mesma coisa.
    const slugs = MODULOS_DO_PORTAL.map(m => m.slug)
    expect(new Set(slugs).size).toBe(slugs.length)
  })

  it('nada nasce ligado sem ter tela', () => {
    // Ligar o que não existe produz item de menu que leva a página em branco —
    // pior para o cliente do que a ausência do item.
    for (const m of MODULOS_DO_PORTAL) {
      if (m.padrao) expect(m.implementado).toBe(true)
    }
  })

  it('os módulos que já estão no ar nascem ligados', () => {
    // O contrário apagaria do portal, no deploy, o que o cliente já usava.
    const porSlug = new Map(MODULOS_DO_PORTAL.map(m => [m.slug, m]))
    expect(porSlug.get('documentos')?.padrao).toBe(true)
    expect(porSlug.get('obrigacoes')?.padrao).toBe(true)
  })
})

describe('modulosDoVinculo — o BI exige a EMPRESA e a PESSOA', () => {
  const daEmpresa = resolverLiberados([])

  it('o BI nasce liberado para a empresa: o portão de verdade é a pessoa', () => {
    expect(daEmpresa.has('bi')).toBe(true)
  })

  it('sem a permissão da pessoa, o BI some — mesmo com o módulo ligado', () => {
    expect(modulosDoVinculo(daEmpresa, { podeVerBi: false })).not.toContain('bi')
  })

  it('com a permissão, o BI aparece', () => {
    expect(modulosDoVinculo(daEmpresa, { podeVerBi: true })).toContain('bi')
  })

  it('a chave geral da empresa vence a permissão da pessoa', () => {
    // O escritório desligou o BI em /empresas: a marcação no usuário não
    // reabre nada — senão desligar o módulo seria só um pedido.
    const semBi = resolverLiberados([{ modulo: 'bi', liberado: false }])
    expect(modulosDoVinculo(semBi, { podeVerBi: true })).not.toContain('bi')
  })

  it('a permissão do BI não mexe em nenhum outro módulo', () => {
    const sem = modulosDoVinculo(daEmpresa, { podeVerBi: false })
    const com = modulosDoVinculo(daEmpresa, { podeVerBi: true })
    expect(sem.filter(m => m !== 'bi').sort()).toEqual(com.filter(m => m !== 'bi').sort())
    expect(sem).toContain('documentos')
  })
})
