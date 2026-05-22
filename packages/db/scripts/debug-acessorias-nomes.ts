import { prisma } from '../src/client'

async function main() {
  // Nomes únicos no Acessórias com contagem de execuções
  const exec = await prisma.servicoExecucao.findMany({
    where: { acessoriasPrazo: { not: null }, acessoriasNome: { not: null } },
    select: { acessoriasNome: true },
  })
  const counts = new Map<string, number>()
  for (const e of exec) {
    const n = e.acessoriasNome ?? '(null)'
    counts.set(n, (counts.get(n) ?? 0) + 1)
  }
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1])
  console.log(`\n${top.length} nomes únicos no Acessórias. Top 30:`)
  for (const [nome, n] of top.slice(0, 30)) {
    console.log(`  ${String(n).padStart(4)}× ${nome}`)
  }

  // Nossas 28 obrigações
  const obrig = await prisma.servico.findMany({
    where: { ehObrigacaoAcessoria: true },
    select: { nome: true },
    orderBy: { nome: 'asc' },
  })
  console.log(`\n28 obrigações cadastradas:`)
  for (const o of obrig) {
    console.log(`  - ${o.nome}`)
  }
}
main().catch(console.error).finally(() => prisma.$disconnect())
