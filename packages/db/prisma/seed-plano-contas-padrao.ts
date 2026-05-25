/**
 * Seed: PlanoContasCategoriaPadrao — template SERPRO2 (142 contas)
 *
 * Mapeia cada Classificação contábil (ex: "04.2.1.01.001") para uma Categoria
 * de DRE + Sinal, replicando fielmente o `dPlano de Contas` do PowerBI usado
 * como referência (Dashboard Financeiro - Serrafer.pbix).
 *
 * Cada cliente pode sobrescrever entradas individuais via ClienteBiCategoria
 * (campos categoriaDre + sinal). Quando não houver override, o cálculo do BI
 * usa este template global.
 *
 * Idempotente — usa upsert por classificacao.
 *
 * Uso:
 *   pnpm --filter @saas/db tsx prisma/seed-plano-contas-padrao.ts
 */
import { PrismaClient } from '../src/generated/client'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const prisma = new PrismaClient()

interface PlanoSeedRow {
  classificacao: string
  nivel1: string | null
  nivel2: string | null
  nivel3: string | null
  nivel4: string | null
  nivel5: string | null
  categoriaDre: string
  sinal: number
}

async function main() {
  const jsonPath = resolve(__dirname, 'plano-contas-padrao.json')
  const data = JSON.parse(readFileSync(jsonPath, 'utf-8')) as PlanoSeedRow[]
  console.log(`Carregadas ${data.length} contas do template SERPRO2`)

  let upserted = 0
  for (const row of data) {
    await prisma.planoContasCategoriaPadrao.upsert({
      where: { classificacao: row.classificacao },
      create: {
        classificacao: row.classificacao,
        nivel1: row.nivel1,
        nivel2: row.nivel2,
        nivel3: row.nivel3,
        nivel4: row.nivel4,
        nivel5: row.nivel5,
        categoriaDre: row.categoriaDre,
        sinal: row.sinal,
      },
      update: {
        nivel1: row.nivel1,
        nivel2: row.nivel2,
        nivel3: row.nivel3,
        nivel4: row.nivel4,
        nivel5: row.nivel5,
        categoriaDre: row.categoriaDre,
        sinal: row.sinal,
      },
    })
    upserted++
  }

  // Distribuição final
  const dist = await prisma.planoContasCategoriaPadrao.groupBy({
    by: ['categoriaDre'],
    _count: { _all: true },
  })
  console.log(`\n✅ ${upserted} contas processadas.\n\nDistribuição:`)
  for (const d of dist.sort((a, b) => b._count._all - a._count._all)) {
    console.log(`  ${d.categoriaDre.padEnd(25)} ${d._count._all} contas`)
  }
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
