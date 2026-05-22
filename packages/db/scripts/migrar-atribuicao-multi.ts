/**
 * Migração: traduz o `atribuicaoResponsavel` legado para os campos novos
 * (atribuicaoColaboradores / atribuicaoAreas / atribuicaoUsaOrcamento /
 *  atribuicaoUsaClienteArea) preservando comportamento atual.
 *
 * Regras:
 *  - MANUAL_FIXO + responsavelFixoId → atribuicaoColaboradores = [id]
 *  - CLIENTE_AREA                     → atribuicaoUsaClienteArea = true
 *  - HERDA_PREDECESSOR                → mantém só legado (cadeia/fluxo)
 *  - ORCAMENTO (default) com categoria 'Legalização' → atribuicaoAreas = [areaId]
 *  - ORCAMENTO com Fiscal/Contábil/Trabalhista → atribuicaoUsaClienteArea = true
 *  - ORCAMENTO outras áreas → atribuicaoUsaOrcamento = true
 *
 * Idempotente: só altera serviços onde NENHUM campo novo está set.
 */
import { prisma } from '../src/client'

async function main() {
  const todasAreas = await prisma.area.findMany({ select: { id: true, name: true } })
  const areaPorNome = new Map(todasAreas.map(a => [a.name.toLowerCase(), a.id]))

  const servicos = await prisma.servico.findMany({
    select: {
      id: true, nome: true, categoria: true,
      atribuicaoResponsavel: true, responsavelFixoId: true,
      atribuicaoColaboradores: true, atribuicaoAreas: true,
      atribuicaoUsaOrcamento: true, atribuicaoUsaClienteArea: true,
    },
  })

  let migrados = 0
  let pulados = 0
  for (const s of servicos) {
    // Já migrado?
    const jaTemConfig =
      s.atribuicaoColaboradores.length > 0 ||
      s.atribuicaoAreas.length > 0 ||
      s.atribuicaoUsaOrcamento ||
      s.atribuicaoUsaClienteArea
    if (jaTemConfig) { pulados++; continue }

    const data: any = {}
    const cat = (s.categoria ?? '').toLowerCase()

    if (s.atribuicaoResponsavel === 'MANUAL_FIXO' && s.responsavelFixoId) {
      data.atribuicaoColaboradores = [s.responsavelFixoId]
    } else if (s.atribuicaoResponsavel === 'CLIENTE_AREA') {
      data.atribuicaoUsaClienteArea = true
    } else if (s.atribuicaoResponsavel === 'HERDA_PREDECESSOR') {
      // Mantém só legado — herda em runtime via cadeia/fluxo. Sem candidatos
      // diretos no novo modelo.
    } else {
      // ORCAMENTO (default): cascata semântica antiga
      if (cat === 'legalização' || cat === 'legalizacao') {
        const areaId = areaPorNome.get('legalização') ?? areaPorNome.get('legalizacao')
        if (areaId) data.atribuicaoAreas = [areaId]
      } else if (['fiscal', 'contábil', 'contabil', 'trabalhista'].includes(cat)) {
        data.atribuicaoUsaClienteArea = true
        // Fallback: se cliente não tiver responsável da área, o engine ainda
        // pode usar o do orçamento.
        data.atribuicaoUsaOrcamento = true
      } else {
        data.atribuicaoUsaOrcamento = true
      }
    }

    if (Object.keys(data).length === 0) { pulados++; continue }
    await prisma.servico.update({ where: { id: s.id }, data })
    migrados++
  }

  console.log(`\n✓ Migração concluída`)
  console.log(`  Serviços migrados:  ${migrados}`)
  console.log(`  Pulados (já config / herda):  ${pulados}`)
  console.log(`  Total:               ${servicos.length}\n`)
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
