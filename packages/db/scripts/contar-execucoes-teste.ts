/**
 * Script SOMENTE LEITURA — conta linhas das tabelas de "execução" pra mostrar
 * ao usuário o que será limpo antes da operação destrutiva.
 *
 * Não apaga nada — só faz SELECT COUNT(*).
 */
import { prisma } from '../src/client'

async function main() {
  // Quebra ServicoExecucao em obrigação acessória vs serviço normal
  const execAcessoria = await prisma.servicoExecucao.count({
    where: { servico: { ehObrigacaoAcessoria: true } },
  })
  const execServicoNormal = await prisma.servicoExecucao.count({
    where: { servico: { ehObrigacaoAcessoria: false } },
  })
  const totalExec = await prisma.servicoExecucao.count()

  console.log('\n=== ServicoExecucao — quebra por tipo do template ===')
  console.log(`  Obrigações acessórias (sync Acessórias)     ${execAcessoria}`)
  console.log(`  Serviços normais (execuções de teste)       ${execServicoNormal}`)
  console.log(`  TOTAL                                       ${totalExec}\n`)

  // Quantas estão vinculadas a Processo (cadeia de serviços)
  const execComProcesso = await prisma.servicoExecucao.count({
    where: { processoId: { not: null } },
  })
  const execComOrcamento = await prisma.servicoExecucao.count({
    where: { orcamentoId: { not: null } },
  })
  console.log(`  Vinculadas a Processo                       ${execComProcesso}`)
  console.log(`  Vinculadas a Orçamento                      ${execComOrcamento}`)

  // Quebra por status
  const porStatus = await prisma.servicoExecucao.groupBy({
    by: ['status'],
    _count: true,
  })
  console.log('\n  Por status:')
  for (const s of porStatus) console.log(`    ${s.status.padEnd(20)} ${s._count}`)

  // Movimentações comerciais
  console.log('\n=== Movimentações comerciais ===')
  const movs = await Promise.all([
    prisma.orcamento.count(),
    prisma.orcamentoItem.count(),
    prisma.orcamentoMensagem.count(),
    prisma.orcamentoArquivo.count(),
    prisma.orcamentoEvento.count(),
    prisma.oportunidade.count(),
    prisma.oportunidadeTarefa.count(),
    prisma.oportunidadeMensagem.count(),
    prisma.oportunidadeArquivo.count(),
    prisma.oportunidadeEvento.count(),
    prisma.processo.count(),
    prisma.processoEvento.count(),
    prisma.processoRespostaPergunta.count(),
    prisma.pesquisaSatisfacao.count(),
  ])
  const labs = [
    'orcamentos', 'orcamento_itens', 'orcamento_mensagens', 'orcamento_arquivos', 'orcamento_eventos',
    'oportunidades', 'oportunidade_tarefas', 'oportunidade_mensagens', 'oportunidade_arquivos', 'oportunidade_eventos',
    'processos', 'processo_eventos', 'processo_respostas_pergunta', 'pesquisas_satisfacao',
  ]
  for (let i = 0; i < labs.length; i++) {
    if (movs[i] > 0) console.log(`  ${labs[i].padEnd(40)} ${movs[i]}`)
  }
}

main().catch(e => { console.error(e); process.exit(1) }).finally(() => prisma.$disconnect())
