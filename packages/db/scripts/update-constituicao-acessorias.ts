/**
 * Adiciona 3 passos novos na última etapa ("Encerramento e liberação") do
 * serviço "Constituição de Empresa". Os passos cobrem a integração com o
 * Acessórias — passo-a-passo pra operador fechar o ciclo:
 *  1. Cadastrar no Acessórias (manual no portal, OU via botão no /clientes/[id])
 *  2. Ativar obrigações conforme regime+atividade no portal
 *  3. Validar primeira sincronização no OneClick
 *
 * Estratégia: insere os passos ANTES do "Checklist final" mantendo
 * a ordem coerente. Idempotente — se já existirem (mesmo nome), pula.
 */
import { prisma } from '../src/client'

const SERVICO_ID = 'cmp1ojm0300019gssh8vh2ad2' // Constituição de Empresa

const NOVOS_PASSOS = [
  {
    nome: 'Cadastrar cliente no Acessórias — manual no portal OU via botão "Cadastrar/Sincronizar no Acessórias" no detalhe do cliente',
    obrigatorio: true,
    permiteIgnorar: false,
    slaMinutos: 20,
  },
  {
    nome: 'Ativar obrigações no portal do Acessórias conforme regime + atividade (Acessórias tem template por CNAE)',
    obrigatorio: true,
    permiteIgnorar: false,
    slaMinutos: 30,
  },
  {
    nome: 'Validar primeira sincronização — empresa deve aparecer em /acessorias → Empresas; deliveries devem cair na rotina mensal',
    obrigatorio: true,
    permiteIgnorar: false,
    slaMinutos: 15,
  },
]

async function main() {
  console.log('🔧 Atualizando Constituição de Empresa com passos Acessórias\n')

  const servico = await prisma.servico.findUnique({
    where: { id: SERVICO_ID },
    include: { etapas: { include: { passos: true }, orderBy: { ordem: 'asc' } } },
  })
  if (!servico) { console.error('❌ Serviço não encontrado.'); process.exit(1) }

  // Acha a última etapa ("Encerramento e liberação")
  const ultimaEtapa = servico.etapas[servico.etapas.length - 1]
  if (!ultimaEtapa) { console.error('❌ Serviço sem etapas.'); process.exit(1) }
  console.log(`✓ Última etapa: "${ultimaEtapa.nome}" (${ultimaEtapa.passos.length} passos atuais)\n`)

  // Encontra a posição do "Checklist final" pra inserir antes
  const idxChecklist = ultimaEtapa.passos.findIndex(p =>
    p.nome.toLowerCase().includes('checklist final'),
  )
  const insertAt = idxChecklist >= 0 ? idxChecklist : ultimaEtapa.passos.length

  // Detecta duplicatas (idempotência)
  const existingNomes = new Set(ultimaEtapa.passos.map(p => p.nome.toLowerCase()))
  const naoExistem = NOVOS_PASSOS.filter(np => {
    const k = np.nome.toLowerCase().slice(0, 30) // prefix-based dedup
    for (const ex of existingNomes) if (ex.startsWith(k.slice(0, 20))) return false
    return true
  })

  if (naoExistem.length === 0) {
    console.log('⚠️  Todos os passos já existem — nada a fazer.')
    return
  }
  console.log(`⊕ ${naoExistem.length} passo(s) novo(s) a inserir na posição ${insertAt + 1}/${ultimaEtapa.passos.length + 1}\n`)

  // Reordena os passos que ficam DEPOIS do ponto de inserção
  await prisma.$transaction(async tx => {
    // Empurra ordem dos passos a partir de insertAt
    for (let i = ultimaEtapa.passos.length - 1; i >= insertAt; i--) {
      await tx.servicoPasso.update({
        where: { id: ultimaEtapa.passos[i].id },
        data: { ordem: i + naoExistem.length },
      })
    }
    // Insere os novos
    for (let j = 0; j < naoExistem.length; j++) {
      const def = naoExistem[j]
      await tx.servicoPasso.create({
        data: {
          etapaId: ultimaEtapa.id,
          nome: def.nome,
          ordem: insertAt + j,
          obrigatorio: def.obrigatorio,
          permiteIgnorar: def.permiteIgnorar,
          slaMinutos: def.slaMinutos,
          slaHoras: def.slaMinutos > 0 ? Math.max(1, Math.round(def.slaMinutos / 60)) : null,
        },
      })
      console.log(`  ✓ ${insertAt + j + 1}. ${def.nome.slice(0, 70)}…`)
    }
  })

  // Recalcula slaHoras da etapa e do serviço
  const passosAtualizados = await prisma.servicoPasso.findMany({
    where: { etapaId: ultimaEtapa.id },
    select: { slaMinutos: true },
  })
  const slaEtapaMin = passosAtualizados.reduce((s, p) => s + (p.slaMinutos ?? 0), 0)
  await prisma.servicoEtapa.update({
    where: { id: ultimaEtapa.id },
    data: { slaHoras: Math.max(0, Math.round(slaEtapaMin / 60)) },
  })

  // SLA total do serviço
  const todasEtapas = await prisma.servicoEtapa.findMany({
    where: { servicoId: SERVICO_ID },
    include: { passos: { select: { slaMinutos: true } } },
  })
  const slaTotalMin = todasEtapas.reduce(
    (s, et) => s + et.passos.reduce((sp, p) => sp + (p.slaMinutos ?? 0), 0),
    0,
  )
  await prisma.servico.update({
    where: { id: SERVICO_ID },
    data: { slaHoras: Math.max(0, Math.round(slaTotalMin / 60)) },
  })

  console.log(`\n✅ Concluído`)
  console.log(`   SLA da etapa: ${(slaEtapaMin / 60).toFixed(1)}h`)
  console.log(`   SLA total do serviço: ${(slaTotalMin / 60).toFixed(1)}h`)
}

main().catch(e => { console.error('❌', e); process.exit(1) }).finally(() => prisma.$disconnect())
