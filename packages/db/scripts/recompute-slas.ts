/**
 * Recalcula slaHoras de todas as ServicoEtapa e Servico após mudar a fórmula
 * de critical-path → soma simples. Sem destrutivo: só atualiza os totais.
 */
import { prisma } from '../src/client'

function passoMin(p: { slaMinutos: number | null; slaHoras: number | null }): number {
  return p.slaMinutos ?? (p.slaHoras != null ? p.slaHoras * 60 : 0)
}

async function main() {
  console.log('🔧 Recalculando SLAs (soma simples)\n')

  const etapas = await prisma.servicoEtapa.findMany({
    select: {
      id: true, servicoId: true, nome: true,
      passos: { select: { id: true, slaMinutos: true, slaHoras: true } },
    },
  })

  let etapasAtualizadas = 0
  for (const e of etapas) {
    const totalMin = e.passos.reduce((s, p) => s + passoMin(p), 0)
    const totalHoras = totalMin > 0 ? Math.ceil(totalMin / 60) : null
    await prisma.servicoEtapa.update({ where: { id: e.id }, data: { slaHoras: totalHoras } })
    etapasAtualizadas++
  }
  console.log(`  ✓ ${etapasAtualizadas} etapa(s) atualizadas`)

  // Recalcula serviços: soma das etapas
  const servicos = await prisma.servico.findMany({
    select: { id: true, nome: true, etapas: { select: { slaHoras: true } } },
  })
  let servicosAtualizados = 0
  for (const s of servicos) {
    const total = s.etapas.reduce((sum, et) => sum + (et.slaHoras ?? 0), 0)
    const novoSla = total > 0 ? total : null
    await prisma.servico.update({ where: { id: s.id }, data: { slaHoras: novoSla } })
    servicosAtualizados++
  }
  console.log(`  ✓ ${servicosAtualizados} serviço(s) atualizados`)

  console.log('\n✅ Concluído')
}

main().catch(e => { console.error('❌', e); process.exit(1) }).finally(() => prisma.$disconnect())
