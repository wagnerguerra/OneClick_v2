import {
  jobToolIdSchema,
  toolJobStatusSchema,
  toolJobResponseSchema,
  listToolJobsSchema,
  spedCreateFieldsSchema,
  TOOL_AREA,
  ferramentasModuleSlug,
} from '@saas/types/ferramentas'

// Fase 1 — passo 1 (TDD): schemas Zod compartilhados das ferramentas.
describe('schemas de ferramentas (@saas/types/ferramentas)', () => {
  it('jobToolIdSchema cobre as 8 ferramentas job-based e rejeita id desconhecido', () => {
    for (const id of [
      'nfe',
      'sped',
      'sped-merge',
      'sci-consolidado',
      'comparacao-planilhas',
      'comparacao-nfse',
      'sci-portal-nacional',
      'gnre',
    ]) {
      expect(jobToolIdSchema.parse(id)).toBe(id)
    }
    expect(() => jobToolIdSchema.parse('coisa-inexistente')).toThrow()
  })

  it('TOOL_AREA mapeia o bloco/menu de cada ferramenta (fiscal vs contábil)', () => {
    expect(TOOL_AREA.sped).toBe('fiscal')
    expect(TOOL_AREA.nfe).toBe('fiscal')
    expect(TOOL_AREA['comparacao-nfse']).toBe('fiscal')
    // gnre é Contábil no menu, ainda que seja job-based tecnicamente
    expect(TOOL_AREA.gnre).toBe('contabil')
  })

  it('ferramentasModuleSlug deriva o slug RBAC por área', () => {
    expect(ferramentasModuleSlug('fiscal')).toBe('ferramentas-fiscal')
    expect(ferramentasModuleSlug('contabil')).toBe('ferramentas-contabil')
  })

  it('toolJobStatusSchema aceita os estados do webapp', () => {
    for (const s of ['queued', 'running', 'done', 'failed', 'not_found']) {
      expect(toolJobStatusSchema.parse(s)).toBe(s)
    }
    expect(() => toolJobStatusSchema.parse('paused')).toThrow()
  })

  it('toolJobResponseSchema valida uma linha de job e aplica default de progress', () => {
    const row = toolJobResponseSchema.parse({
      id: 'cuid_1',
      code: 7,
      tool: 'sped',
      status: 'queued',
      fileNameIn: 'arquivo.txt',
      createdAt: '2026-06-26T12:00:00.000Z',
    })
    expect(row.progress).toBe(0)
    expect(row.fileNameOut ?? null).toBeNull()
    expect(row.createdAt).toBeInstanceOf(Date)
  })

  it('listToolJobsSchema herda paginação e aceita filtros opcionais', () => {
    const def = listToolJobsSchema.parse({})
    expect(def.page).toBe(1)
    expect(def.limit).toBe(20)
    const filtered = listToolJobsSchema.parse({ tool: 'gnre', area: 'contabil', status: 'done' })
    expect(filtered.tool).toBe('gnre')
    expect(filtered.area).toBe('contabil')
  })

  it('spedCreateFieldsSchema valida campos opcionais sheets/presentRegs', () => {
    expect(spedCreateFieldsSchema.parse({})).toEqual({})
    const parsed = spedCreateFieldsSchema.parse({ sheets: ['0150', '0200'], presentRegs: ['0000'] })
    expect(parsed.sheets).toEqual(['0150', '0200'])
  })
})
