/**
 * Devolve para o "claim-first do setor" execuções que foram atribuídas
 * erroneamente pelo bug do resolver antigo (que atribuía direto quando
 * `atribuicaoAreas` tinha 1 só user na área).
 *
 * Filtro de segurança:
 *  - Apenas execuções não-concluídas/canceladas.
 *  - Apenas execuções onde NENHUM passo foi marcado/ignorado (sem trabalho real).
 *  - Apenas serviços que TÊM `atribuicaoAreas` configurado (intenção do gestor).
 *
 * Resultado: responsavelId fica null → execução volta a aparecer pra todos
 * os usuários da área no /meus-servicos. Primeiro a marcar passo reivindica.
 */
import { prisma } from '../src/client'

async function main() {
  const execs = await prisma.servicoExecucao.findMany({
    where: {
      status: { in: ['EM_ANDAMENTO', 'AGUARDANDO_INICIO', 'AGUARDANDO_RESPOSTA'] },
      responsavelId: { not: null },
      arquivado: false,
      passos: { none: { OR: [{ concluido: true }, { ignorado: true } as any] } },
      servico: {
        atribuicaoAreas: { isEmpty: false },
      },
    },
    select: {
      id: true,
      responsavelId: true,
      servico: { select: { nome: true, atribuicaoAreas: true } },
    },
  })

  if (execs.length === 0) {
    console.log('Nada a fazer — nenhuma execução elegível.')
    return
  }

  console.log(`\nEncontradas ${execs.length} execuções pra resetar:`)
  for (const e of execs) {
    console.log(`  - ${e.id}  [${e.servico.nome}]  responsável: ${e.responsavelId}`)
  }

  const r = await prisma.servicoExecucao.updateMany({
    where: { id: { in: execs.map(e => e.id) } },
    data: { responsavelId: null },
  })
  console.log(`\n✓ Reset concluído. ${r.count} execuções devolvidas pro setor.\n`)
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
