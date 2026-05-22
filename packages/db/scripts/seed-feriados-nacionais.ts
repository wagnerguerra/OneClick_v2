/**
 * Seed dos 12 feriados nacionais brasileiros — fixos (9) + móveis (3).
 *
 * Fixos entram como `recorrente=true` (vale todo ano automaticamente).
 * Móveis (Carnaval, Sexta-feira Santa, Corpus Christi) entram como
 * `recorrente=false` expandidos para um intervalo razoável (2024–2032).
 *
 * Mantém paralelo ao util `apps/api/src/notificacao/feriados-br.ts`, que
 * o scheduler de recorrência usa em runtime. Os dois precisam ficar em
 * sincronia — quem mudar a regra (ex.: adicionar feriado novo) precisa
 * atualizar ambos.
 *
 * Execução:
 *   cd packages/db
 *   pnpm exec tsx scripts/seed-feriados-nacionais.ts
 *
 * Idempotente: match por (nome + tipo=NACIONAL + data exata).
 */

import { prisma } from '../src/client'

const ANO_REF = 2026

const FIXOS: Array<{ nome: string; mes: number; dia: number; observacao: string }> = [
  { nome: 'Confraternização Universal',  mes: 1,  dia: 1,  observacao: 'Lei Federal Nº 662/1949. Início do ano civil — feriado nacional.' },
  { nome: 'Tiradentes',                  mes: 4,  dia: 21, observacao: 'Lei Federal Nº 662/1949. Dia do Mártir da Inconfidência Mineira.' },
  { nome: 'Dia do Trabalho',             mes: 5,  dia: 1,  observacao: 'Lei Federal Nº 662/1949. Dia Internacional do Trabalhador.' },
  { nome: 'Independência do Brasil',     mes: 9,  dia: 7,  observacao: 'Lei Federal Nº 662/1949. Proclamação da independência em 1822.' },
  { nome: 'Nossa Senhora Aparecida',     mes: 10, dia: 12, observacao: 'Lei Federal Nº 6.802/1980. Padroeira do Brasil.' },
  { nome: 'Finados',                     mes: 11, dia: 2,  observacao: 'Lei Federal Nº 662/1949. Dia dos Fiéis Defuntos.' },
  { nome: 'Proclamação da República',    mes: 11, dia: 15, observacao: 'Lei Federal Nº 662/1949. Proclamação em 1889.' },
  { nome: 'Consciência Negra',           mes: 11, dia: 20, observacao: 'Lei Federal Nº 14.759/2023, em vigor desde 2024 (substitui regras anteriores).' },
  { nome: 'Natal',                       mes: 12, dia: 25, observacao: 'Lei Federal Nº 662/1949. Nascimento de Jesus Cristo.' },
]

const ANOS_MOVEIS = [2024, 2025, 2026, 2027, 2028, 2029, 2030, 2031, 2032]

/** Algoritmo de Meeus/Jones/Butcher — domingo de Páscoa. */
function dataPascoa(ano: number): Date {
  const a = ano % 19
  const b = Math.floor(ano / 100)
  const c = ano % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const mes = Math.floor((h + l - 7 * m + 114) / 31)
  const dia = ((h + l - 7 * m + 114) % 31) + 1
  return new Date(Date.UTC(ano, mes - 1, dia))
}

function moveis(ano: number): Array<{ nome: string; data: Date; observacao: string }> {
  const pascoa = dataPascoa(ano)
  const carnaval = new Date(pascoa); carnaval.setUTCDate(pascoa.getUTCDate() - 47)
  const sextaSanta = new Date(pascoa); sextaSanta.setUTCDate(pascoa.getUTCDate() - 2)
  const corpus = new Date(pascoa); corpus.setUTCDate(pascoa.getUTCDate() + 60)
  return [
    { nome: `Carnaval (${ano})`,          data: carnaval,   observacao: 'Feriado nacional móvel — 47 dias antes da Páscoa. Tradicionalmente terça-feira de Carnaval.' },
    { nome: `Sexta-feira Santa (${ano})`, data: sextaSanta, observacao: 'Feriado nacional móvel — 2 dias antes do Domingo de Páscoa.' },
    { nome: `Corpus Christi (${ano})`,    data: corpus,     observacao: 'Feriado nacional móvel — 60 dias após o Domingo de Páscoa (5ª-feira).' },
  ]
}

async function main() {
  console.log(`\nCadastrando 9 feriados nacionais fixos (recorrentes) + móveis para ${ANOS_MOVEIS.length} anos\n`)

  let criados = 0
  let atualizados = 0
  let erros = 0

  // FIXOS (recorrente=true)
  for (const f of FIXOS) {
    try {
      const data = new Date(Date.UTC(ANO_REF, f.mes - 1, f.dia))
      const existing = await prisma.feriado.findFirst({
        where: { nome: f.nome, tipo: 'NACIONAL', empresaId: null, recorrente: true },
        select: { id: true },
      })
      const payload = { nome: f.nome, tipo: 'NACIONAL' as const, data, recorrente: true, uf: null, cidade: null, observacao: f.observacao, empresaId: null }
      if (existing) {
        await prisma.feriado.update({ where: { id: existing.id }, data: payload })
        atualizados++
        console.log(`ATUALIZADO  FIXO    ${String(f.dia).padStart(2,'0')}/${String(f.mes).padStart(2,'0')}  ${f.nome}`)
      } else {
        await prisma.feriado.create({ data: payload })
        criados++
        console.log(`CRIADO      FIXO    ${String(f.dia).padStart(2,'0')}/${String(f.mes).padStart(2,'0')}  ${f.nome}`)
      }
    } catch (e: any) { erros++; console.error(`ERRO em "${f.nome}":`, e?.message) }
  }

  // MÓVEIS (recorrente=false, um registro por ano)
  for (const ano of ANOS_MOVEIS) {
    for (const m of moveis(ano)) {
      try {
        const existing = await prisma.feriado.findFirst({
          where: { nome: m.nome, tipo: 'NACIONAL', empresaId: null, recorrente: false, data: m.data },
          select: { id: true },
        })
        const payload = { nome: m.nome, tipo: 'NACIONAL' as const, data: m.data, recorrente: false, uf: null, cidade: null, observacao: m.observacao, empresaId: null }
        if (existing) {
          await prisma.feriado.update({ where: { id: existing.id }, data: payload })
          atualizados++
        } else {
          await prisma.feriado.create({ data: payload })
          criados++
          const dia = String(m.data.getUTCDate()).padStart(2, '0')
          const mes = String(m.data.getUTCMonth() + 1).padStart(2, '0')
          console.log(`CRIADO      MÓVEL   ${dia}/${mes}/${ano}  ${m.nome}`)
        }
      } catch (e: any) { erros++; console.error(`ERRO em "${m.nome}":`, e?.message) }
    }
  }

  console.log('\n──────────────────────────────────────────────')
  console.log(`Criados:     ${criados}`)
  console.log(`Atualizados: ${atualizados}`)
  console.log(`Erros:       ${erros}`)
}

main()
  .catch((e) => { console.error('Erro fatal:', e); process.exit(1) })
  .finally(() => prisma.$disconnect())
