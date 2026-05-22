/**
 * Reset completo do módulo de Serviços — apaga templates, execucoes, encadeamentos,
 * layouts e cláusulas. Mantém orcamentos (orcamento.servicoId vira NULL via SetNull).
 *
 * Uso: pnpm --filter @saas/db tsx scripts/reset-servicos.ts
 *   ou: pnpm --filter @saas/db exec tsx scripts/reset-servicos.ts
 */
import { prisma } from '../src/client'

async function main() {
  console.log('🧹 Iniciando reset do módulo de Serviços...')

  // Ordem importa — filhos primeiro, pais por último.
  const passoAnexos = await prisma.servicoExecucaoPassoAnexo.deleteMany({})
  console.log(`  · ${passoAnexos.count} anexos de passo`)

  const passoComentarios = await prisma.servicoExecucaoPassoComentario.deleteMany({})
  console.log(`  · ${passoComentarios.count} comentários de passo`)

  const watchers = await prisma.servicoExecucaoWatcher.deleteMany({})
  console.log(`  · ${watchers.count} watchers`)

  const eventos = await prisma.servicoExecucaoEvento.deleteMany({})
  console.log(`  · ${eventos.count} eventos de execução`)

  const execPassos = await prisma.servicoExecucaoPasso.deleteMany({})
  console.log(`  · ${execPassos.count} passos de execução`)

  const execucoes = await prisma.servicoExecucao.deleteMany({})
  console.log(`  · ${execucoes.count} execuções`)

  const encadeamentos = await prisma.servicoEncadeamento.deleteMany({})
  console.log(`  · ${encadeamentos.count} encadeamentos`)

  const layouts = await prisma.servicoFluxoLayout.deleteMany({})
  console.log(`  · ${layouts.count} layouts de fluxo`)

  // Processos referenciam Servico.id como raiz (sem SetNull) — apagar antes
  const procEventos = await prisma.processoEvento.deleteMany({})
  console.log(`  · ${procEventos.count} eventos de processo`)

  const processos = await prisma.processo.deleteMany({})
  console.log(`  · ${processos.count} processos`)

  const contratoServicos = await prisma.contratoServico.deleteMany({})
  console.log(`  · ${contratoServicos.count} vínculos contrato↔serviço (contratos preservados)`)

  // Servico tem CASCADE para etapas/passos/clausulas — apagar o pai já cuida deles.
  const servicos = await prisma.servico.deleteMany({})
  console.log(`  · ${servicos.count} serviços (cascade → etapas, passos, cláusulas)`)

  console.log('✅ Reset concluído. Cadastro de serviços está vazio.')
}

main()
  .catch(err => {
    console.error('❌ Erro no reset:', err)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
