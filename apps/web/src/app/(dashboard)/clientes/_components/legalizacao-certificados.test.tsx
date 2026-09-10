import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'

/**
 * #HLP0385 — "Ao tentarmos realizar o cadastramento dos certificados digitais
 * por dentro da página de clientes, estamos sendo direcionados para a página
 * dos certificados."
 *
 * O que este teste tranca é o comportamento relatado: o botão de cadastro da
 * pill Certificados NÃO pode ser um link para outro módulo.
 */

const listCertificados = vi.fn(() => Promise.resolve([] as unknown[]))

/**
 * O card dispara muitas consultas ao montar (sócios, acessos, vencimentos,
 * certidões, DT-e...). Nenhuma interessa aqui, e enumerá-las tornaria o teste
 * refém de cada consulta nova que o card ganhar. O Proxy responde a qualquer
 * caminho com uma lista vazia; só `certificadoDigital.list` tem dublê próprio.
 */
// Três níveis: trpc.<modulo>.<procedimento>.query()
const vazio = () => Promise.resolve([])
const procedimento = { query: vazio, mutate: vazio }
const stub = new Proxy({}, {
  get: () => new Proxy({}, { get: () => procedimento }),
})

vi.mock('@/lib/trpc', () => ({
  trpc: new Proxy({} as Record<string, unknown>, {
    get: (_t, modulo) => {
      if (modulo === 'certificadoDigital') {
        return {
          list: { query: (...a: unknown[]) => listCertificados(...(a as [])) },
          update: { mutate: vi.fn(() => Promise.resolve({})) },
        }
      }
      return (stub as Record<string, unknown>)[modulo as string]
    },
  }),
}))

vi.mock('@/hooks/use-user-permissions', () => ({
  useUserPermissions: () => ({
    isMaster: true, isEmpresaMaster: true, permissions: [], loading: false,
  }),
}))

vi.mock('@/lib/alerts', () => ({
  alerts: { error: vi.fn(), success: vi.fn(), warning: vi.fn(), confirm: vi.fn(() => Promise.resolve(true)) },
}))

import { LegalizacaoCard } from './legalizacao-card'

const register = (() => ({ name: '', onChange: vi.fn(), onBlur: vi.fn(), ref: vi.fn() })) as never

function abrirPillCertificados() {
  const utils = render(
    <LegalizacaoCard register={register} clienteId="cli-1" documento="32401481000133" />,
  )
  fireEvent.click(screen.getByText('Certificado Digital', { selector: 'button, button *' }))
  return utils
}

describe('pill Certificados no detalhe do cliente', () => {
  beforeEach(() => {
    listCertificados.mockClear()
    listCertificados.mockResolvedValue([])
  })

  it('não manda o usuário para o módulo de certificados para cadastrar', async () => {
    const { container } = abrirPillCertificados()
    await waitFor(() => expect(screen.getByText(/Nenhum certificado vinculado/i)).toBeTruthy())

    // O sintoma do ticket: um link de criação apontando para fora.
    const linksDeCriacao = Array.from(container.querySelectorAll('a[href]'))
      .filter(a => (a.getAttribute('href') ?? '').startsWith('/gestao-certificados?clienteId='))
    expect(linksDeCriacao).toHaveLength(0)
  })

  it('abre o cadastro no próprio cliente', async () => {
    abrirPillCertificados()
    await waitFor(() => expect(screen.getByText(/Nenhum certificado vinculado/i)).toBeTruthy())

    fireEvent.click(screen.getByRole('button', { name: /Novo certificado/i }))
    await waitFor(() => expect(screen.getByText(/Cadastrar certificado digital/i)).toBeTruthy())
    // Sem seletor de cliente: o vínculo vem do contexto e não há o que errar.
    expect(screen.queryByText('Cliente vinculado')).toBeNull()
  })

  it('permite editar o certificado sem sair da tela', async () => {
    listCertificados.mockResolvedValue([{
      id: 'cert-1', titular: 'CENTRAL CONTABIL LTDA', documento: '32401481000133',
      expiraEm: new Date(Date.now() + 86400000 * 90).toISOString(),
      emissor: 'AC SAFEWEB', status: 'ATIVO', observacoes: 'renovar com o contador',
    }] as never)

    abrirPillCertificados()
    await waitFor(() => expect(screen.getByText('CENTRAL CONTABIL LTDA')).toBeTruthy())

    fireEvent.click(screen.getByTitle('Editar observações'))
    await waitFor(() => expect(screen.getByText('Editar certificado')).toBeTruthy())
    expect(screen.getByDisplayValue('renovar com o contador')).toBeTruthy()
  })

  it('mostra o documento do certificado na linha', async () => {
    // Regressão: a lista lia `cert.cnpj`, campo que a API não devolve — o
    // documento simplesmente nunca aparecia.
    listCertificados.mockResolvedValue([{
      id: 'cert-1', titular: 'ACME', documento: '32401481000133',
      expiraEm: null, emissor: null, status: 'ATIVO', observacoes: null,
    }] as never)

    abrirPillCertificados()
    await waitFor(() => expect(screen.getByText('32401481000133')).toBeTruthy())
  })
})
