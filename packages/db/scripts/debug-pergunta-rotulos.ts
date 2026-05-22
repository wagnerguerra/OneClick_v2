/** Diagnóstico: lista arestas saindo de blocos PERGUNTA e seus rótulos.
 *  Se rotulo estiver null/vazio, o header amber não aparece nos sucessores. */
import { prisma } from '../src/client'

async function main() {
  const arestas = await prisma.servicoEncadeamento.findMany({
    where: { servicoOrigem: { tipo: 'PERGUNTA' } },
    include: {
      servicoOrigem: { select: { nome: true, perguntaOpcoes: true } },
      servicoDestino: { select: { nome: true } },
    },
    orderBy: [{ servicoOrigemId: 'asc' }],
  })

  if (arestas.length === 0) {
    console.log('⚠️  Nenhuma aresta saindo de bloco PERGUNTA encontrada.')
    return
  }

  console.log(`Total: ${arestas.length} aresta(s) saindo de blocos PERGUNTA\n`)

  // Agrupa por bloco PERGUNTA
  const porOrigem = new Map<string, typeof arestas>()
  for (const a of arestas) {
    const k = a.servicoOrigem.nome
    if (!porOrigem.has(k)) porOrigem.set(k, [])
    porOrigem.get(k)!.push(a)
  }

  for (const [perguntaNome, list] of porOrigem) {
    const opcoes = list[0].servicoOrigem.perguntaOpcoes as string[] | null
    console.log(`📌 PERGUNTA: "${perguntaNome}"`)
    console.log(`   Opções configuradas: ${JSON.stringify(opcoes)}`)
    for (const a of list) {
      const status = !a.rotulo ? '❌ SEM RÓTULO' : '✅'
      console.log(`   ${status}  → "${a.servicoDestino.nome}"  rotulo=${JSON.stringify(a.rotulo)}`)
    }
    console.log('')
  }
}

main().catch(e => { console.error(e); process.exit(1) }).finally(() => prisma.$disconnect())
