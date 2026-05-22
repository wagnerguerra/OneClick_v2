/**
 * Limpa execuções/movimentações de teste mantendo cadastros e templates.
 *
 * Apaga:
 *   - Todas as ServicoExecucao + filhos (passos, eventos, watchers, comentários, anexos)
 *   - Todas as Orcamento + filhos (itens, mensagens, arquivos, eventos)
 *   - Todas as Oportunidade + filhos (tarefas, mensagens, arquivos, eventos, tags-join)
 *   - Todos os Processo + filhos (eventos, respostas-pergunta)
 *   - Todas as PesquisaSatisfacao
 *
 * Mantém:
 *   - Servico, ServicoEtapa, ServicoPasso, ServicoEncadeamento, ServicoFluxoLayout (templates)
 *   - ServicoCatalogo, CrmEtapa, CrmTag (templates/cadastros)
 *   - Cliente, User, Empresa, Colaborador (cadastros)
 *
 * Executa em transação — atômico (tudo ou nada).
 */
import { prisma } from '../src/client'

async function main() {
  console.log('\n→ Iniciando limpeza em transação...\n')

  const result = await prisma.$transaction(async (tx) => {
    // 1. ServicoExecucao — filhos cascade (Cascade no schema), mas ordem
    // explícita garante mesmo se algum FK não tiver onDelete: Cascade.
    const execEventos    = await tx.servicoExecucaoEvento.deleteMany({})
    const execWatchers   = await tx.servicoExecucaoWatcher.deleteMany({})
    const execAnexos     = await tx.servicoExecucaoPassoAnexo.deleteMany({})
    const execComents    = await tx.servicoExecucaoPassoComentario.deleteMany({})
    const execPassos     = await tx.servicoExecucaoPasso.deleteMany({})
    // ServicoExecucao tem auto-ref via predecessorExecucaoId (SetNull). Apagar
    // tudo de uma vez funciona porque SetNull dissolve as referências antes.
    const execucoes      = await tx.servicoExecucao.deleteMany({})

    // 2. Orcamento — apago antes da Oportunidade (orcamento.oportunidadeId).
    const orcEventos     = await tx.orcamentoEvento.deleteMany({})
    const orcMensagens   = await tx.orcamentoMensagem.deleteMany({})
    const orcArquivos    = await tx.orcamentoArquivo.deleteMany({})
    const orcItens       = await tx.orcamentoItem.deleteMany({})
    const orcamentos     = await tx.orcamento.deleteMany({})

    // 3. Oportunidade
    const oppEventos     = await tx.oportunidadeEvento.deleteMany({})
    const oppMensagens   = await tx.oportunidadeMensagem.deleteMany({})
    const oppArquivos    = await tx.oportunidadeArquivo.deleteMany({})
    const oppTarefas     = await tx.oportunidadeTarefa.deleteMany({})
    const oppTagsJoin    = await tx.oportunidadeTag.deleteMany({})
    const oportunidades  = await tx.oportunidade.deleteMany({})

    // 4. Processo (já vazio, mas roda por garantia)
    const procRespostas  = await tx.processoRespostaPergunta.deleteMany({})
    const procEventos    = await tx.processoEvento.deleteMany({})
    const processos      = await tx.processo.deleteMany({})

    // 5. Pesquisa de Satisfação
    const pesquisas      = await tx.pesquisaSatisfacao.deleteMany({})

    return {
      execEventos: execEventos.count,
      execWatchers: execWatchers.count,
      execAnexos: execAnexos.count,
      execComents: execComents.count,
      execPassos: execPassos.count,
      execucoes: execucoes.count,
      orcEventos: orcEventos.count,
      orcMensagens: orcMensagens.count,
      orcArquivos: orcArquivos.count,
      orcItens: orcItens.count,
      orcamentos: orcamentos.count,
      oppEventos: oppEventos.count,
      oppMensagens: oppMensagens.count,
      oppArquivos: oppArquivos.count,
      oppTarefas: oppTarefas.count,
      oppTagsJoin: oppTagsJoin.count,
      oportunidades: oportunidades.count,
      procRespostas: procRespostas.count,
      procEventos: procEventos.count,
      processos: processos.count,
      pesquisas: pesquisas.count,
    }
  }, { timeout: 60000 })

  // Relatório
  let total = 0
  console.log('\n═══════════════════════════════════════════════════')
  console.log('  LIMPEZA CONCLUÍDA — linhas removidas:')
  console.log('═══════════════════════════════════════════════════\n')
  for (const [k, v] of Object.entries(result)) {
    if (v > 0) console.log(`  ${k.padEnd(20)} ${v}`)
    total += v
  }
  console.log(`\n  TOTAL: ${total} linhas removidas\n`)

  // Verificação pós-limpeza
  console.log('→ Verificando cadastros (devem estar intactos):\n')
  const check = await Promise.all([
    prisma.servico.count(),
    prisma.servicoEtapa.count(),
    prisma.servicoPasso.count(),
    prisma.servicoEncadeamento.count(),
    prisma.servicoFluxoLayout.count(),
    prisma.servicoCatalogo.count(),
    prisma.crmEtapa.count(),
    prisma.cliente.count(),
    prisma.user.count(),
  ])
  console.log(`  servicos                 ${check[0]}`)
  console.log(`  servico_etapas           ${check[1]}`)
  console.log(`  servico_passos           ${check[2]}`)
  console.log(`  servico_encadeamentos    ${check[3]}`)
  console.log(`  servico_fluxo_layouts    ${check[4]}`)
  console.log(`  servicos_catalogo        ${check[5]}`)
  console.log(`  crm_etapas               ${check[6]}`)
  console.log(`  clientes                 ${check[7]}`)
  console.log(`  users                    ${check[8]}\n`)
}

main()
  .catch(e => { console.error('ERRO — transação revertida:', e); process.exit(1) })
  .finally(() => prisma.$disconnect())
