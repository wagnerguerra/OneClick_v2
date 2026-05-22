/**
 * Debug: estado do banco pra auditoria de obrigações.
 *
 * Responde 3 perguntas:
 *  1. Quantos Servicos têm ehObrigacaoAcessoria=true?
 *  2. Quantas ServicoExecucao têm acessoriasPrazo preenchido?
 *  3. Quantas dessas execuções batem com servicoId de obrigação marcada?
 */
import { prisma } from '../src/client'

async function main() {
  const obrigacoes = await prisma.servico.findMany({
    where: { ehObrigacaoAcessoria: true },
    select: { id: true, nome: true, empresaId: true },
  })
  console.log(`\n[1] Servicos com ehObrigacaoAcessoria=true: ${obrigacoes.length}`)
  for (const o of obrigacoes.slice(0, 5)) {
    console.log(`    - ${o.id} | empresaId=${o.empresaId} | ${o.nome}`)
  }
  if (obrigacoes.length > 5) console.log(`    ... e mais ${obrigacoes.length - 5}`)

  const totalExec = await prisma.servicoExecucao.count()
  const execComAcessorias = await prisma.servicoExecucao.count({
    where: { acessoriasPrazo: { not: null } },
  })
  console.log(`\n[2] ServicoExecucao total: ${totalExec}`)
  console.log(`    Com acessoriasPrazo preenchido: ${execComAcessorias}`)

  const ids = obrigacoes.map((o) => o.id)
  const execBateObrigacao = await prisma.servicoExecucao.count({
    where: {
      acessoriasPrazo: { not: null },
      servicoId: { in: ids },
    },
  })
  console.log(`\n[3] Execuções com acessoriasPrazo + servicoId de obrigação marcada: ${execBateObrigacao}`)

  // Mapping
  const maps = await prisma.acessoriasObligationMap.count({ where: { ativo: true } })
  console.log(`\n[4] AcessoriasObligationMap ativos: ${maps}`)

  // Sample de execuções com acessoriasPrazo
  const sample = await prisma.servicoExecucao.findMany({
    where: { acessoriasPrazo: { not: null } },
    select: { servicoId: true, acessoriasNome: true, acessoriasComp: true, acessoriasPrazo: true },
    take: 5,
    orderBy: { acessoriasPrazo: 'desc' },
  })
  console.log(`\n[5] Sample de execuções (mais recentes):`)
  for (const s of sample) {
    const obr = obrigacoes.find((o) => o.id === s.servicoId)
    const flag = obr ? 'OBRIGAÇÃO ✓' : 'OUTRO SERVIÇO'
    console.log(`    - ${flag} | servicoId=${s.servicoId} | nome="${s.acessoriasNome}" | comp=${s.acessoriasComp?.toISOString().slice(0,10)} | prazo=${s.acessoriasPrazo?.toISOString().slice(0,10)}`)
  }
}

main()
  .catch((e) => { console.error('Erro:', e); process.exit(1) })
  .finally(() => prisma.$disconnect())
