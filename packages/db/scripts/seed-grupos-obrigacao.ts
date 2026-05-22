/**
 * Seed dos templates iniciais de GrupoObrigacao baseados nos clusters reais
 * identificados pelo diagnóstico Acessórias (217 empresas analisadas).
 *
 * Templates criados:
 *   1. Simples Nacional · Comércio/Serviços
 *   2. Lucro Presumido · Geral
 *   3. Lucro Real · Geral
 *   4. MEI · Mínimo (DASN-SIMEI)
 *   5. Trabalhista · Folha mensal (qualquer regime)
 *   6. Contábil · Fechamento anual (Balanço + DRE + ECD)
 *
 * Vincula apenas obrigações marcadas `ehObrigacaoAcessoria=true` (as 36 do
 * seed-obrigacoes-fiscais). Idempotente — match por slug.
 *
 * Execução:
 *   cd packages/db
 *   pnpm exec tsx scripts/seed-grupos-obrigacao.ts
 */
import { prisma } from '../src/client'

type TemplateSeed = {
  slug: string
  nome: string
  tributacao?: 'SIMPLES_NACIONAL' | 'LUCRO_PRESUMIDO' | 'LUCRO_REAL' | 'MEI'
  area?: string
  cor: string
  descricao: string
  /** Match por prefixo do nome — pega a obrigação cujo `nome` começa com este texto. */
  obrigacoesPorPrefixo: string[]
  /** Prefixos CNAE (2 dígitos = seção/divisão CNAE). Vazio = genérico. */
  cnaesAplicaveis: string[]
}

// Referências CNAE (2 primeiros dígitos = divisão):
//   10-33 = Indústria de transformação · 41-43 = Construção
//   45-47 = Comércio (atacado/varejo) · 49-53 = Transporte/logística
//   55-56 = Alojamento/alimentação · 58-63 = TI / informação
//   64-66 = Financeiro/seguros · 68 = Imobiliário · 69-75 = Serviços profissionais
//   77-82 = Serviços administrativos · 85 = Educação · 86-88 = Saúde
//   90-96 = Cultura/serviços diversos
const TEMPLATES: TemplateSeed[] = [
  {
    slug: 'simples-nacional-padrao',
    nome: 'Simples Nacional · Padrão',
    tributacao: 'SIMPLES_NACIONAL',
    area: 'Fiscal',
    cor: '#10b981',
    descricao:
      'Conjunto de obrigações típicas do Simples Nacional: DAS mensal + DEFIS anual + escriturações contábeis. Cobre 99% dos clientes Simples observados.',
    obrigacoesPorPrefixo: [
      'DAS — Simples Nacional',
      'DEFIS',
      'Balancete Mensal',
      'Balanço Patrimonial Anual + DRE',
      'eSocial',
      'FGTS Digital',
      'INSS',
      'IRRF',
      'Pagamento de Salários',
    ],
    // Simples Nacional cobre quase todos os CNAEs permitidos pela LC 123/2006.
    // Deixa vazio (genérico) — vai pontuar por tributação independente da atividade.
    cnaesAplicaveis: [],
  },
  {
    slug: 'lucro-presumido-padrao',
    nome: 'Lucro Presumido · Padrão',
    tributacao: 'LUCRO_PRESUMIDO',
    area: 'Fiscal',
    cor: '#0ea5e9',
    descricao:
      'Conjunto típico do Lucro Presumido: IRPJ/CSLL trimestral, PIS/COFINS cumulativo, EFD-Contribuições/ICMS-IPI, ECD/ECF anuais.',
    obrigacoesPorPrefixo: [
      'IRPJ/CSLL — Lucro Presumido',
      'PIS/COFINS',
      'EFD-Contribuições',
      'EFD ICMS/IPI',
      'EFD-Reinf',
      'DCTFWeb',
      'ECD',
      'ECF',
      'Balancete Mensal',
      'Balanço Patrimonial Anual + DRE',
      'eSocial',
      'FGTS Digital',
      'INSS',
      'IRRF',
      'Pagamento de Salários',
    ],
    // Comércio (atacado/varejo), serviços profissionais, alojamento/alimentação,
    // TI, imobiliário, educação, saúde — onde Presumido é mais comum.
    cnaesAplicaveis: [
      '45', '46', '47',           // Comércio
      '55', '56',                  // Alojamento e alimentação
      '58', '59', '60', '61', '62', '63', // Informação/comunicação/TI
      '64', '65', '66',            // Financeiro
      '68',                        // Imobiliário
      '69', '70', '71', '72', '73', '74', '75', // Serviços profissionais
      '77', '78', '79', '80', '81', '82',       // Serviços administrativos
      '85',                        // Educação
      '86', '87', '88',            // Saúde
      '90', '91', '92', '93', '94', '95', '96', // Cultura/outros
    ],
  },
  {
    slug: 'lucro-real-padrao',
    nome: 'Lucro Real · Padrão',
    tributacao: 'LUCRO_REAL',
    area: 'Fiscal',
    cor: '#8b5cf6',
    descricao:
      'Conjunto típico do Lucro Real: IRPJ/CSLL com estimativa mensal, PIS/COFINS não-cumulativo, escriturações completas.',
    obrigacoesPorPrefixo: [
      'IRPJ/CSLL — Lucro Real',
      'PIS/COFINS',
      'EFD-Contribuições',
      'EFD ICMS/IPI',
      'EFD-Reinf',
      'DCTFWeb',
      'ECD',
      'ECF',
      'Balancete Mensal',
      'Balanço Patrimonial Anual + DRE',
      'eSocial',
      'FGTS Digital',
      'INSS',
      'IRRF',
      'Pagamento de Salários',
    ],
    // Indústria, construção, atacado grande, logística, energia/utilities —
    // setores onde Lucro Real é regra (obrigatório acima de R$ 78 mi, ou
    // por opção pelos créditos não-cumulativos de PIS/COFINS).
    cnaesAplicaveis: [
      '05', '06', '07', '08', '09', // Indústrias extrativas
      '10', '11', '12', '13', '14', '15', '16', '17', '18', '19', '20',
      '21', '22', '23', '24', '25', '26', '27', '28', '29', '30', '31', '32', '33', // Indústria de transformação
      '35', '36', '37', '38', '39', // Eletricidade, água, saneamento
      '41', '42', '43',             // Construção
      '45', '46',                   // Atacado (varejo grande/redes)
      '49', '50', '51', '52', '53', // Transporte/logística
      '64', '65', '66',             // Financeiro
    ],
  },
  {
    slug: 'mei-minimo',
    nome: 'MEI · Mínimo',
    tributacao: 'MEI',
    area: 'Fiscal',
    cor: '#f59e0b',
    descricao: 'Obrigações mínimas do MEI: DASN-SIMEI anual e contribuição mensal (via DAS específico).',
    obrigacoesPorPrefixo: ['DASN-SIMEI', 'DAS — Simples Nacional'],
    // MEI tem lista restrita de CNAEs (Resolução CGSN). Deixa vazio (tributação=MEI
    // já é determinante; CNAE específico viraria manutenção infinita).
    cnaesAplicaveis: [],
  },
  {
    slug: 'trabalhista-folha-mensal',
    nome: 'Trabalhista · Folha Mensal',
    area: 'Trabalhista',
    cor: '#a3e635',
    descricao:
      'Conjunto trabalhista comum a qualquer regime: eSocial, FGTS Digital, INSS, IRRF folha, pagamento de salários, 13º.',
    obrigacoesPorPrefixo: [
      'eSocial',
      'FGTS Digital',
      'INSS',
      'IRRF',
      'Pagamento de Salários',
      '13º Salário — 1ª Parcela',
      '13º Salário — 2ª Parcela',
    ],
    // Aplica a qualquer empresa com folha — deixa genérico.
    cnaesAplicaveis: [],
  },
  {
    slug: 'contabil-fechamento-anual',
    nome: 'Contábil · Fechamento Anual',
    area: 'Contábil',
    cor: '#a78bfa',
    descricao:
      'Obrigações contábeis recorrentes e de fechamento anual: balancete mensal + balanço/DRE + ECD.',
    obrigacoesPorPrefixo: ['Balancete Mensal', 'Balanço Patrimonial Anual + DRE', 'ECD'],
    cnaesAplicaveis: [],
  },
]

async function main() {
  console.log(`Cadastrando ${TEMPLATES.length} templates de grupo de obrigação...\n`)

  // Carrega todas as obrigações marcadas como acessórias (catálogo global)
  const obrigacoes = await prisma.servico.findMany({
    where: { empresaId: null, ehObrigacaoAcessoria: true },
    select: { id: true, nome: true },
  })
  const obrigacaoMap = new Map(obrigacoes.map((o) => [o.nome, o.id]))

  function resolverIds(prefixos: string[]): string[] {
    const ids: string[] = []
    for (const p of prefixos) {
      // Match por prefixo (nomes podem ter sufixos como "(Folha Mensal)")
      const encontrada = obrigacoes.find((o) => o.nome.startsWith(p))
      if (encontrada) ids.push(encontrada.id)
      else console.warn(`  ⚠ Obrigação não encontrada para prefixo "${p}"`)
    }
    return ids
  }

  let criados = 0
  let atualizados = 0
  for (const t of TEMPLATES) {
    const servicoIds = resolverIds(t.obrigacoesPorPrefixo)
    if (servicoIds.length === 0) {
      console.error(`✗ Template "${t.nome}" sem obrigações válidas — pulando.`)
      continue
    }

    const existing = await prisma.grupoObrigacao.findUnique({ where: { slug: t.slug } })
    if (existing) {
      await prisma.$transaction(async (tx) => {
        await tx.grupoObrigacao.update({
          where: { id: existing.id },
          data: {
            nome: t.nome,
            descricao: t.descricao,
            tributacao: t.tributacao ?? null,
            area: t.area ?? null,
            cor: t.cor,
            ativo: true,
            cnaesAplicaveis: t.cnaesAplicaveis,
          },
        })
        await tx.grupoObrigacaoItem.deleteMany({ where: { grupoId: existing.id } })
        await tx.grupoObrigacaoItem.createMany({
          data: servicoIds.map((sid, i) => ({ grupoId: existing.id, servicoId: sid, ordem: i })),
        })
      })
      atualizados++
      console.log(`ATUALIZADO  ${t.nome.padEnd(38)}  ${servicoIds.length} obrigações · ${t.cnaesAplicaveis.length} CNAEs`)
    } else {
      await prisma.$transaction(async (tx) => {
        const grupo = await tx.grupoObrigacao.create({
          data: {
            slug: t.slug,
            nome: t.nome,
            descricao: t.descricao,
            tributacao: t.tributacao ?? null,
            area: t.area ?? null,
            cor: t.cor,
            ativo: true,
            cnaesAplicaveis: t.cnaesAplicaveis,
            empresaId: null,
          },
        })
        await tx.grupoObrigacaoItem.createMany({
          data: servicoIds.map((sid, i) => ({ grupoId: grupo.id, servicoId: sid, ordem: i })),
        })
      })
      criados++
      console.log(`CRIADO      ${t.nome.padEnd(38)}  ${servicoIds.length} obrigações · ${t.cnaesAplicaveis.length} CNAEs`)
    }
  }

  console.log('\n──────────────────────────────────────────────')
  console.log(`Criados:     ${criados}`)
  console.log(`Atualizados: ${atualizados}`)
}

main().catch((e) => { console.error('Erro fatal:', e); process.exit(1) }).finally(() => prisma.$disconnect())
