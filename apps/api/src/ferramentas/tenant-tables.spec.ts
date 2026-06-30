import { TENANT_TABLES } from '@saas/db/tenant-manager'

// Fase 1 — passo 2 (TDD): as tabelas das ferramentas precisam ser provisionadas
// em cada tenant. tenant-manager clona TENANT_TABLES via CREATE TABLE (LIKE ...).
describe('TENANT_TABLES inclui as tabelas das ferramentas', () => {
  it('contém tool_jobs e tool_job_eventos', () => {
    expect(TENANT_TABLES).toContain('tool_jobs')
    expect(TENANT_TABLES).toContain('tool_job_eventos')
  })

  it('tool_jobs vem antes de tool_job_eventos (ordem de dependência)', () => {
    expect(TENANT_TABLES.indexOf('tool_jobs')).toBeLessThan(
      TENANT_TABLES.indexOf('tool_job_eventos'),
    )
  })
})
