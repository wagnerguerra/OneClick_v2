import { prisma } from '../src/client'

const TOP_LEVEL_ID = 'cmp1j4t2x00009ge037k8z0gc'

async function main() {
  const top = await prisma.servico.findUnique({
    where: { id: TOP_LEVEL_ID },
    include: {
      etapas: { include: { passos: true } },
      itensDeFluxo: {
        orderBy: { nome: 'asc' },
        include: {
          etapas: { include: { passos: true }, orderBy: { ordem: 'asc' } },
          encadeamentosOrigem: { include: { servicoDestino: { select: { id: true, nome: true } } } },
        },
      },
    },
  })
  if (!top) { console.log('Não achei o top-level'); return }
  console.log(`Top-level: ${top.nome} (${top.categoriaServico})`)
  console.log(`Etapas próprias: ${top.etapas.length}`)
  console.log(`Itens de fluxo: ${top.itensDeFluxo.length}\n`)
  for (const item of top.itensDeFluxo) {
    console.log(`• ${item.nome} (${item.tipo})`)
    console.log(`  etapas=${item.etapas.length} | passos=${item.etapas.reduce((a, e) => a + e.passos.length, 0)} | sucessores=${item.encadeamentosOrigem.length}`)
    for (const e of item.etapas) {
      console.log(`    └─ Etapa: ${e.nome} (${e.passos.length} passos)`)
    }
    for (const enc of item.encadeamentosOrigem) {
      console.log(`    → ${enc.servicoDestino.nome}`)
    }
  }
}

main().catch(console.error).finally(() => prisma.$disconnect())
