/**
 * Cria o grupo "Onboarding Cliente Mensal" reunindo os 3 serviços de
 * onboarding (Fiscal, Trabalhista, Contábil) na ordem operacional padrão.
 *
 * Ordem dentro do grupo:
 *   1. Contábil   — saldos iniciais primeiro (base pra tudo)
 *   2. Fiscal     — paralelo, usa o plano de contas do contábil
 *   3. Trabalhista — última (depende do contábil pra integrar folha+encargos)
 *
 * Cor: emerald — combina com o tom do módulo Cadastros.
 */
import { prisma } from '../src/client'

async function main() {
  console.log('🏗️  Criando grupo "Onboarding Cliente Mensal"\n')

  const fiscal = await prisma.servico.findFirst({ where: { nome: 'Onboarding Fiscal' }, select: { id: true, empresaId: true } })
  const trab   = await prisma.servico.findFirst({ where: { nome: 'Onboarding Trabalhista' }, select: { id: true } })
  const cont   = await prisma.servico.findFirst({ where: { nome: 'Onboarding Contábil' }, select: { id: true } })

  if (!fiscal) throw new Error('Onboarding Fiscal não encontrado')
  if (!trab)   throw new Error('Onboarding Trabalhista não encontrado')
  if (!cont)   throw new Error('Onboarding Contábil não encontrado')

  const existing = await prisma.servicoGrupo.findFirst({ where: { nome: 'Onboarding Cliente Mensal' } })
  if (existing) {
    console.log(`⚠️  Grupo já existe: ${existing.id}`)
    process.exit(0)
  }

  const grupo = await prisma.servicoGrupo.create({
    data: {
      nome: 'Onboarding Cliente Mensal',
      descricao: 'Trio de transição quando uma empresa entra na carteira — integra Contábil, Fiscal e Trabalhista em sequência. Use "iniciar grupo" para disparar os 3 no cliente novo.',
      cor: '#10b981',
      ordem: 0,
      empresaId: fiscal.empresaId,
      itens: {
        create: [
          { servicoId: cont.id,   ordem: 0 },
          { servicoId: fiscal.id, ordem: 1 },
          { servicoId: trab.id,   ordem: 2 },
        ],
      },
    },
    include: {
      itens: {
        orderBy: { ordem: 'asc' },
        include: { servico: { select: { nome: true, slaHoras: true } } },
      },
    },
  })

  console.log(`✓ Grupo criado: ${grupo.id}`)
  console.log(`  Cor: ${grupo.cor}`)
  console.log(`  Serviços (na ordem do grupo):`)
  let slaTotal = 0
  for (const item of grupo.itens) {
    const sla = item.servico.slaHoras ?? 0
    slaTotal += sla
    console.log(`    ${item.ordem + 1}. ${item.servico.nome.padEnd(28)} ${sla}h`)
  }
  console.log(`\n  SLA agregado: ${slaTotal}h`)
  console.log(`\n✅ Pronto. Acesse /servicos/grupos pra ver o grupo na listagem.`)
}

main().catch(e => { console.error('❌', e); process.exit(1) }).finally(() => prisma.$disconnect())
