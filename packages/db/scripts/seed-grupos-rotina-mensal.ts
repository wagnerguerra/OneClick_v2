/**
 * Cria 3 grupos pra organizar as rotinas mensais por regime tributário:
 *
 *   - Rotina Mensal — Simples Nacional
 *       Fiscal Mensal — Simples Nacional · Contábil Mensal — Simples Nacional · Trabalhista Mensal
 *
 *   - Rotina Mensal — Lucro Presumido
 *       Fiscal Mensal — Lucro Presumido · Contábil Mensal — Presumido/Real · Trabalhista Mensal
 *
 *   - Rotina Mensal — Lucro Real
 *       Fiscal Mensal — Lucro Real · Contábil Mensal — Presumido/Real · Trabalhista Mensal
 *
 * Trabalhista e Contábil Presumido/Real são compartilhados entre grupos (M→N).
 *
 * Cores: emerald (Simples), sky (Presumido), indigo (Real).
 * Ordem operacional dentro do grupo: Contábil → Fiscal → Trabalhista (base
 * contábil antes da apuração fiscal, folha por último).
 */
import { prisma } from '../src/client'

interface GrupoDef {
  nome: string
  descricao: string
  cor: string
  nomesServicos: string[]
}

const GRUPOS: GrupoDef[] = [
  {
    nome: 'Rotina Mensal — Simples Nacional',
    descricao: 'Pacote de rotina mensal pra clientes optantes do Simples Nacional. Dispare este grupo no início de cada competência para abrir as 3 execuções (Contábil, Fiscal, Trabalhista).',
    cor: '#10b981', // emerald
    nomesServicos: [
      'Contábil Mensal — Simples Nacional',
      'Fiscal Mensal — Simples Nacional',
      'Trabalhista Mensal',
    ],
  },
  {
    nome: 'Rotina Mensal — Lucro Presumido',
    descricao: 'Pacote de rotina mensal pra clientes de Lucro Presumido. Cobre apuração trimestral de IRPJ/CSLL, EFD-Contribuições, DCTFWeb. Inclui Trabalhista compartilhado.',
    cor: '#0ea5e9', // sky
    nomesServicos: [
      'Contábil Mensal — Presumido/Real',
      'Fiscal Mensal — Lucro Presumido',
      'Trabalhista Mensal',
    ],
  },
  {
    nome: 'Rotina Mensal — Lucro Real',
    descricao: 'Pacote de rotina mensal pra clientes de Lucro Real — escrituração contábil completa, SPED Fiscal, EFD-Contrib não-cumulativo, EFD-Reinf, DCTFWeb. Maior densidade operacional do trio.',
    cor: '#6366f1', // indigo
    nomesServicos: [
      'Contábil Mensal — Presumido/Real',
      'Fiscal Mensal — Lucro Real',
      'Trabalhista Mensal',
    ],
  },
]

async function main() {
  console.log('🏗️  Criando 3 grupos de Rotina Mensal por regime\n')

  const ref = await prisma.servico.findFirst({ select: { empresaId: true } })
  const empresaId = ref?.empresaId ?? null

  for (let gi = 0; gi < GRUPOS.length; gi++) {
    const g = GRUPOS[gi]

    const existing = await prisma.servicoGrupo.findFirst({ where: { nome: g.nome } })
    if (existing) {
      console.log(`⚠️  Já existe: ${g.nome} (${existing.id}) — pulando`)
      continue
    }

    // Resolve IDs dos serviços por nome
    const itens: { servicoId: string; ordem: number; nome: string }[] = []
    let problema = false
    for (let i = 0; i < g.nomesServicos.length; i++) {
      const nome = g.nomesServicos[i]
      const s = await prisma.servico.findFirst({ where: { nome }, select: { id: true } })
      if (!s) {
        console.error(`❌ Serviço não encontrado: ${nome}`)
        problema = true
        continue
      }
      itens.push({ servicoId: s.id, ordem: i, nome })
    }
    if (problema) continue

    const grupo = await prisma.servicoGrupo.create({
      data: {
        nome: g.nome,
        descricao: g.descricao,
        cor: g.cor,
        ordem: gi,
        empresaId,
        itens: { create: itens.map(it => ({ servicoId: it.servicoId, ordem: it.ordem })) },
      },
    })
    console.log(`✓ ${g.nome}`)
    console.log(`  id=${grupo.id}  cor=${g.cor}`)
    for (const it of itens) console.log(`    ${it.ordem + 1}. ${it.nome}`)
    console.log('')
  }

  console.log('✅ Concluído')
}

main().catch(e => { console.error('❌', e); process.exit(1) }).finally(() => prisma.$disconnect())
