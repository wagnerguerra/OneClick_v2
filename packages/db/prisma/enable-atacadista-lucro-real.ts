// Bulk activation: marca todos os templates do segmento Atacadista LR
// com disponivelOrcamento: true. Idempotente — re-run não duplica.
//
// Use somente APÓS revisar o markdown gerado por list-atacadista-lucro-real.ts.
//
// Reverter (se quiser desativar tudo de novo):
//   UPDATE servicos SET disponivel_orcamento = false
//   WHERE segmento_slug = 'atacadista-lucro-real';

import { PrismaClient } from '../src/generated/client'
const prisma = new PrismaClient()

const SLUG = 'atacadista-lucro-real'

async function main() {
  console.log(`Ativando templates do segmento "${SLUG}"...\n`)

  const antes = await prisma.servico.findMany({
    where: { segmentoSlug: SLUG, ativo: true },
    select: { id: true, nome: true, disponivelOrcamento: true },
    orderBy: { nome: 'asc' },
  })

  let jaAtivos = 0
  for (const s of antes) {
    if (s.disponivelOrcamento) jaAtivos++
  }

  const result = await prisma.servico.updateMany({
    where: { segmentoSlug: SLUG, ativo: true, disponivelOrcamento: false },
    data: { disponivelOrcamento: true },
  })

  console.log(`Total templates do segmento: ${antes.length}`)
  console.log(`Já ativos antes: ${jaAtivos}`)
  console.log(`Ativados agora: ${result.count}`)
  console.log(`\nDetalhes:`)
  for (const s of antes) {
    const status = s.disponivelOrcamento ? '✓ já estava ativo' : '✓ ativado agora'
    console.log(`  ${s.nome}  →  ${status}`)
  }

  console.log(`\n✓ Pronto. Templates aparecerão no seletor de itens de orçamento.`)
  console.log(`  Para reverter: UPDATE servicos SET disponivel_orcamento=false WHERE segmento_slug='${SLUG}';`)

  await prisma.$disconnect()
}

main().catch(e => { console.error(e); process.exit(1) })
