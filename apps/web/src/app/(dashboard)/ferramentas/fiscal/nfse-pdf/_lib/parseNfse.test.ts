import { describe, it, expect } from 'vitest'
import { parseNfseXml } from './parseNfse'

// Fase 3 — port nfse-pdf: smoke da lógica pura de parse (DOMParser).
describe('parseNfseXml', () => {
  it('marca conteúdo não-NFS-e como não suportado', () => {
    const r = parseNfseXml('<foo>bar</foo>')
    expect(r.kind).not.toBe('nfse')
    expect(r.kind).not.toBe('evento')
  })

  it('não lança em string inválida', () => {
    expect(() => parseNfseXml('isto não é xml')).not.toThrow()
  })
})
