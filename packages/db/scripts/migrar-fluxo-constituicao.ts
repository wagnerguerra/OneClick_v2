/**
 * Migra os 11 serviços criados pelo seed-constituicao.ts para a nova estrutura:
 *  - Cria 1 Servico top-level "Constituição de Novo Cliente" (categoriaServico: EXTRA)
 *  - Marca os 11 itens existentes como categoriaServico: FLUXO + servicoPaiId = novo
 *
 * Uso: pnpm --filter @saas/db exec tsx scripts/migrar-fluxo-constituicao.ts
 */
import { prisma } from '../src/client'

async function main() {
  console.log('🔀 Migrando para estrutura Serviço × Itens de Fluxo\n')

  // 1) Localiza os 11 serviços criados — eles começam com "N. " (1. , 2. , ...)
  const itensExistentes = await prisma.servico.findMany({
    where: { nome: { startsWith: '1. ' } },
    select: { id: true, empresaId: true },
  })

  if (itensExistentes.length === 0) {
    throw new Error('Nenhum item de fluxo encontrado (esperado "1. Coleta..."). Rode seed-constituicao.ts primeiro.')
  }

  // Pega todos com prefixo "N. " — assume que o seed criou na ordem
  const todosItens = await prisma.servico.findMany({
    where: {
      OR: [
        { nome: { startsWith: '1. ' } },
        { nome: { startsWith: '2. ' } },
        { nome: { startsWith: '3. ' } },
        { nome: { startsWith: '4. ' } },
        { nome: { startsWith: '5. ' } },
        { nome: { startsWith: '6. ' } },
        { nome: { startsWith: '7. ' } },
        { nome: { startsWith: '8. ' } },
        { nome: { startsWith: '9. ' } },
        { nome: { startsWith: '10. ' } },
        { nome: { startsWith: '11. ' } },
      ],
    },
    orderBy: { nome: 'asc' },
    select: { id: true, nome: true, empresaId: true },
  })

  console.log(`Itens de fluxo encontrados: ${todosItens.length}`)
  if (todosItens.length !== 11) {
    console.warn(`⚠️  Esperava 11, encontrei ${todosItens.length}. Continuando mesmo assim.`)
  }

  const empresaId = todosItens[0].empresaId

  // 2) Cria o Servico top-level "Constituição de Novo Cliente"
  const topLevel = await prisma.servico.create({
    data: {
      nome: 'Constituição de Novo Cliente',
      descricao: 'Serviço extra de constituição completa de novo cliente — abre CNPJ, valida inscrições, prepara dossiê e libera para os setores mensais. Fluxo completo descrito nos itens encadeados.',
      categoria: 'Legalização',
      tipo: 'ATIVIDADE',
      categoriaServico: 'EXTRA',
      prioridadePadrao: 'MEDIA',
      ativo: true,
      recorrenteMensal: false,
      disponivelOrcamento: true,
      empresaId,
    },
  })
  console.log(`\n✓ Criado serviço top-level (EXTRA): ${topLevel.nome}`)
  console.log(`  id: ${topLevel.id}`)

  // 3) Marca os 11 como FLUXO com servicoPaiId apontando pro novo
  const result = await prisma.servico.updateMany({
    where: { id: { in: todosItens.map(i => i.id) } },
    data: {
      categoriaServico: 'FLUXO',
      servicoPaiId: topLevel.id,
      disponivelOrcamento: false,
    },
  })
  console.log(`\n✓ ${result.count} itens marcados como FLUXO (vinculados ao serviço pai)`)

  // 4) Define os MENSAL/EXTRA existentes (caso haja outros serviços do passado)
  //    Regra: recorrenteMensal=true ⇒ MENSAL, false ⇒ EXTRA. Não toca em FLUXO.
  const ajustadosMensais = await prisma.servico.updateMany({
    where: { recorrenteMensal: true, categoriaServico: { not: 'FLUXO' } },
    data: { categoriaServico: 'MENSAL' },
  })
  const ajustadosExtras = await prisma.servico.updateMany({
    where: { recorrenteMensal: false, categoriaServico: { not: 'FLUXO' } },
    data: { categoriaServico: 'EXTRA' },
  })
  console.log(`\n✓ Outros serviços alinhados: ${ajustadosMensais.count} MENSAL, ${ajustadosExtras.count} EXTRA`)

  console.log(`\n✅ Migração concluída.`)
  console.log(`   Acesse /servicos — só "Constituição de Novo Cliente" deve aparecer.`)
  console.log(`   Em /servicos/${topLevel.id}, aba Fluxo, virá a cadeia dos 11 itens.`)
}

main()
  .catch(err => {
    console.error('❌ Erro na migração:', err)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
