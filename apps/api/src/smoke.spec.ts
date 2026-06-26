import { paginationSchema } from '@saas/types/pagination'

// Smoke test da infra de testes (Fase 0). Garante que o runner roda e que os
// path mappings (@saas/*) resolvem. Pode ser removido quando houver specs reais.
describe('infra de testes (apps/api)', () => {
  it('runner executa', () => {
    expect(1 + 1).toBe(2)
  })

  it('resolve @saas/types e valida schema compartilhado', () => {
    const parsed = paginationSchema.parse({})
    expect(parsed.page).toBe(1)
    expect(parsed.limit).toBe(20)
  })
})
