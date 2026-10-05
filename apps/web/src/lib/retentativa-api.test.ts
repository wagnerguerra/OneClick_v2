import { describe, expect, it, vi } from 'vitest'
import { erroDeRede, fetchComRetentativa, respostaDeIndisponibilidade } from './retentativa-api'

const resp = (status: number, contentType = 'application/json') =>
  new Response(status === 204 ? null : '{}', { status, headers: { 'content-type': contentType } })
const semEspera = { esperas: [10, 10, 10], dormir: () => Promise.resolve() }

describe('respostaDeIndisponibilidade (#HLP0412)', () => {
  it('proxy sem a API: 502/503/504', () => {
    expect(respostaDeIndisponibilidade(502, 'text/html')).toBe(true)
    expect(respostaDeIndisponibilidade(503, null)).toBe(true)
    expect(respostaDeIndisponibilidade(504, 'application/json')).toBe(true)
  })
  it('500 em texto (rewrite do Next sem backend) é indisponibilidade', () => {
    expect(respostaDeIndisponibilidade(500, 'text/plain')).toBe(true)
  })
  it('erro de verdade da API vem em JSON e NÃO é repetido', () => {
    expect(respostaDeIndisponibilidade(500, 'application/json')).toBe(false)
    expect(respostaDeIndisponibilidade(400, 'application/json')).toBe(false)
    expect(respostaDeIndisponibilidade(403, 'application/json')).toBe(false)
    expect(respostaDeIndisponibilidade(200, 'application/json')).toBe(false)
  })
  it('falha de rede', () => {
    expect(erroDeRede(new TypeError('Failed to fetch'))).toBe(true)
    expect(erroDeRede(new Error('outra coisa'))).toBe(false)
  })
})

describe('fetchComRetentativa', () => {
  it('API volta no meio: repete e devolve a resposta boa, com aviso', async () => {
    const aviso = { mostrar: vi.fn(), esconder: vi.fn() }
    const fazer = vi.fn()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(resp(502, 'text/html'))
      .mockResolvedValueOnce(resp(200))
    const r = await fetchComRetentativa(fazer, { ...semEspera, aviso })
    expect(r.status).toBe(200)
    expect(fazer).toHaveBeenCalledTimes(3)
    expect(aviso.mostrar).toHaveBeenCalledTimes(1)
    expect(aviso.esconder).toHaveBeenCalledTimes(1)
  })

  it('erro de negócio passa direto, sem repetir nem avisar', async () => {
    const aviso = { mostrar: vi.fn(), esconder: vi.fn() }
    const fazer = vi.fn().mockResolvedValue(resp(400))
    const r = await fetchComRetentativa(fazer, { ...semEspera, aviso })
    expect(r.status).toBe(400)
    expect(fazer).toHaveBeenCalledTimes(1)
    expect(aviso.mostrar).not.toHaveBeenCalled()
  })

  it('desiste depois das esperas e devolve o último erro', async () => {
    const aviso = { mostrar: vi.fn(), esconder: vi.fn() }
    const fazer = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'))
    await expect(fetchComRetentativa(fazer, { ...semEspera, aviso })).rejects.toThrow('Failed to fetch')
    expect(fazer).toHaveBeenCalledTimes(4)
    expect(aviso.esconder).toHaveBeenCalledTimes(1)
  })

  it('pedido cancelado pelo chamador não é repetido', async () => {
    const ctrl = new AbortController()
    ctrl.abort()
    const fazer = vi.fn().mockResolvedValue(resp(503, 'text/html'))
    const r = await fetchComRetentativa(fazer, { ...semEspera, signal: ctrl.signal })
    expect(r.status).toBe(503)
    expect(fazer).toHaveBeenCalledTimes(1)
  })
})
