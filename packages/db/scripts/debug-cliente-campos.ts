import { prisma } from '../src/client'
async function main() {
  const total = await prisma.cliente.count()
  const comTrib = await prisma.cliente.count({ where: { tributacao: { not: null } } })
  const comCnae = await prisma.cliente.count({ where: { cnaePrincipal: { not: null } } })
  console.log(`Total clientes:                 ${total}`)
  console.log(`Com tributação preenchida:      ${comTrib}`)
  console.log(`Com cnaePrincipal preenchido:   ${comCnae}`)

  // Distribuição de tributação
  const dist = await prisma.cliente.groupBy({ by: ['tributacao'], _count: true })
  console.log(`\nDistribuição de tributação:`)
  for (const d of dist) console.log(`  ${d.tributacao ?? '(null)'}: ${d._count}`)

  // Sample com CNAE
  const sample = await prisma.cliente.findMany({
    where: { cnaePrincipal: { not: null } },
    select: { razaoSocial: true, cnaePrincipal: true },
    take: 5,
  })
  console.log(`\nSample com CNAE:`)
  for (const s of sample) console.log(`  ${s.cnaePrincipal} | ${s.razaoSocial}`)
}
main().catch(console.error).finally(() => prisma.$disconnect())
