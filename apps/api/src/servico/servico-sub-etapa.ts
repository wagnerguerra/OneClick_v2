/**
 * Ordem real dos passos de uma etapa com sub-etapas (07/10/2026).
 *
 * Passos DIRETOS da etapa (sem sub-etapa) vêm primeiro, na ordem deles;
 * depois cada sub-etapa, na ordem da sub-etapa, com os passos dela na ordem
 * deles. É essa sequência que vira a `ordem` da execução — e, com ela, a regra
 * "passo obrigatório anterior em aberto bloqueia os seguintes".
 *
 * Passo que aponta para uma sub-etapa que não veio na lista (dado
 * inconsistente) é tratado como direto, para nunca sumir da execução.
 */
export interface PassoComSubEtapa { id: string; ordem: number; subEtapaId?: string | null }
export interface SubEtapaOrdenavel { id: string; nome: string; ordem: number }

export function ordenarPassosDaEtapa<P extends PassoComSubEtapa>(etapa: {
  passos: P[]
  subEtapas?: SubEtapaOrdenavel[] | null
}): Array<{ passo: P; subEtapaNome: string | null }> {
  const subs = [...(etapa.subEtapas ?? [])].sort((a, b) => a.ordem - b.ordem)
  const conhecidas = new Set(subs.map(s => s.id))
  const porOrdem = (a: P, b: P) => a.ordem - b.ordem
  const diretos = etapa.passos.filter(p => !p.subEtapaId || !conhecidas.has(p.subEtapaId)).sort(porOrdem)
  const out: Array<{ passo: P; subEtapaNome: string | null }> = diretos.map(passo => ({ passo, subEtapaNome: null }))
  for (const sub of subs) {
    for (const passo of etapa.passos.filter(p => p.subEtapaId === sub.id).sort(porOrdem)) {
      out.push({ passo, subEtapaNome: sub.nome })
    }
  }
  return out
}
