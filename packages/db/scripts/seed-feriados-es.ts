/**
 * Seed dos feriados estaduais do Espírito Santo e municipais da Grande Vitória.
 *
 * Fontes consultadas (mai/2026):
 *   - Decreto Estadual ES Nº 124-S/2026 — divulga feriados + pontos facultativos
 *   - Vitória: prefeitura, Folha Vitória, calendariobrasil.org
 *   - Vila Velha: prefeitura + Folha Vitória
 *   - Cariacica: Lei Municipal 317/1967 (São João Batista)
 *   - Serra: Lei Municipal 228/1967 (N. Sra. Conceição)
 *   - Guarapari: site oficial da prefeitura (Emancipação, São Pedro, N. Sra. Conceição)
 *
 * Feriados NACIONAIS (fixos + móveis) NÃO entram aqui — são tratados em
 * apps/api/src/notificacao/feriados-br.ts (lib runtime).
 *
 * Feriados MÓVEIS municipais (ex.: Festa da Penha em Vila Velha, móvel) também
 * ficam fora desta seed — seriam complicados de gravar como Date recorrente.
 * Cadastro manual quando virar necessidade.
 *
 * Execução:
 *   cd packages/db
 *   pnpm exec tsx scripts/seed-feriados-es.ts
 *
 * Idempotente: pode rodar várias vezes — match por (nome + tipo + uf + cidade).
 */

import { prisma } from '../src/client'

type FeriadoSeed = {
  nome: string
  tipo: 'NACIONAL' | 'ESTADUAL' | 'MUNICIPAL' | 'PONTO_FACULTATIVO'
  /** Mês e dia. Ano usado é apenas referência (recorrente=true). */
  mes: number
  dia: number
  uf?: string
  cidade?: string
  observacao: string
}

// Ano de referência pra preencher o campo Date (recorrente=true ignora o ano).
const ANO_REF = 2026

const FERIADOS: FeriadoSeed[] = [
  // ────────────────────────────────────────────────────────────
  // ESTADO — ESPÍRITO SANTO
  // ────────────────────────────────────────────────────────────
  {
    nome: 'Colonização do Solo Espírito-Santense',
    tipo: 'PONTO_FACULTATIVO',
    mes: 5, dia: 23,
    uf: 'ES',
    observacao:
      'Marca a chegada dos portugueses à Prainha (Vila Velha) em 1535. Ponto facultativo estadual conforme Decreto ES Nº 124-S/2026 — em Vila Velha, é feriado municipal pleno.',
  },

  // ────────────────────────────────────────────────────────────
  // VITÓRIA
  // ────────────────────────────────────────────────────────────
  {
    nome: 'Nossa Senhora da Vitória',
    tipo: 'MUNICIPAL',
    mes: 9, dia: 8,
    uf: 'ES', cidade: 'Vitória',
    observacao:
      'Padroeira da cidade, coincidente com o aniversário do município de Vitória. Feriado municipal estabelecido pela Prefeitura de Vitória.',
  },

  // ────────────────────────────────────────────────────────────
  // VILA VELHA
  // ────────────────────────────────────────────────────────────
  {
    nome: 'Colonização do Solo Espírito-Santense (Vila Velha)',
    tipo: 'MUNICIPAL',
    mes: 5, dia: 23,
    uf: 'ES', cidade: 'Vila Velha',
    observacao:
      'Em Vila Velha, a data é feriado municipal pleno (não apenas ponto facultativo como no resto do estado). Comemora a colonização que começou na Prainha em 1535.',
  },

  // ────────────────────────────────────────────────────────────
  // CARIACICA
  // ────────────────────────────────────────────────────────────
  {
    nome: 'São João Batista',
    tipo: 'MUNICIPAL',
    mes: 6, dia: 24,
    uf: 'ES', cidade: 'Cariacica',
    observacao:
      'Padroeiro de Cariacica e aniversário do município. Lei Municipal Nº 317/1967. Antes da emancipação política (30/12/1890), o território era chamado "Distrito de São João Batista".',
  },

  // ────────────────────────────────────────────────────────────
  // SERRA
  // ────────────────────────────────────────────────────────────
  {
    nome: 'Nossa Senhora da Conceição (Serra)',
    tipo: 'MUNICIPAL',
    mes: 12, dia: 8,
    uf: 'ES', cidade: 'Serra',
    observacao: 'Padroeira de Serra. Lei Municipal Nº 228/1967.',
  },

  // ────────────────────────────────────────────────────────────
  // GUARAPARI
  // ────────────────────────────────────────────────────────────
  {
    nome: 'São Pedro',
    tipo: 'MUNICIPAL',
    mes: 6, dia: 29,
    uf: 'ES', cidade: 'Guarapari',
    observacao: 'Padroeiro de Guarapari — feriado municipal.',
  },
  {
    nome: 'Emancipação Política de Guarapari',
    tipo: 'MUNICIPAL',
    mes: 9, dia: 19,
    uf: 'ES', cidade: 'Guarapari',
    observacao:
      'Aniversário da emancipação política do município (1891) — também tratada como data de fundação por lei municipal que unificou as celebrações.',
  },
  {
    nome: 'Nossa Senhora da Conceição (Guarapari)',
    tipo: 'MUNICIPAL',
    mes: 12, dia: 8,
    uf: 'ES', cidade: 'Guarapari',
    observacao: 'Padroeira de Guarapari — feriado municipal.',
  },
]

async function main() {
  console.log(`\nCadastrando ${FERIADOS.length} feriados estaduais ES + municipais Grande Vitória\n`)

  let criados = 0
  let atualizados = 0
  let erros = 0

  for (const f of FERIADOS) {
    try {
      const data = new Date(Date.UTC(ANO_REF, f.mes - 1, f.dia))
      const existing = await prisma.feriado.findFirst({
        where: {
          nome: f.nome,
          tipo: f.tipo,
          uf: f.uf ?? null,
          cidade: f.cidade ?? null,
          empresaId: null,
        },
        select: { id: true },
      })
      const payload = {
        nome: f.nome,
        tipo: f.tipo,
        data,
        recorrente: true,
        uf: f.uf ?? null,
        cidade: f.cidade ?? null,
        observacao: f.observacao,
        empresaId: null,
      }
      if (existing) {
        await prisma.feriado.update({ where: { id: existing.id }, data: payload })
        atualizados++
        console.log(`ATUALIZADO ${String(f.dia).padStart(2,'0')}/${String(f.mes).padStart(2,'0')}  ${f.tipo.padEnd(18)} ${(f.cidade ?? f.uf ?? '—').padEnd(14)} ${f.nome}`)
      } else {
        await prisma.feriado.create({ data: payload })
        criados++
        console.log(`CRIADO     ${String(f.dia).padStart(2,'0')}/${String(f.mes).padStart(2,'0')}  ${f.tipo.padEnd(18)} ${(f.cidade ?? f.uf ?? '—').padEnd(14)} ${f.nome}`)
      }
    } catch (e: any) {
      erros++
      console.error(`ERRO em "${f.nome}":`, e?.message ?? e)
    }
  }

  console.log('\n──────────────────────────────────────────────')
  console.log(`Total processados: ${FERIADOS.length}`)
  console.log(`Criados:           ${criados}`)
  console.log(`Atualizados:       ${atualizados}`)
  console.log(`Erros:             ${erros}`)
}

main()
  .catch((e) => { console.error('Erro fatal:', e); process.exit(1) })
  .finally(() => prisma.$disconnect())
