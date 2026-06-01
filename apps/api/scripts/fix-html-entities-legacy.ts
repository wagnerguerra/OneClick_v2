/**
 * Fix-up: decodifica HTML entities (&Ccedil; → Ç, &ccedil; → ç, etc) em campos
 * já migrados do legado. Roda em qualquer Cliente/Orçamento/Mensagem com
 * idOneClick definido (sinal de origem legada).
 */

import { prisma } from '@saas/db'

const DRY_RUN = !process.argv.includes('--commit')

const ENTITY_REGEX = /&(?:[a-zA-Z]+|#\d+|#x[0-9a-fA-F]+);/

function decodeEntities(v: string): string {
  return v
    .replace(/&Ccedil;/g, 'Ç').replace(/&ccedil;/g, 'ç')
    .replace(/&Atilde;/g, 'Ã').replace(/&atilde;/g, 'ã')
    .replace(/&Aacute;/g, 'Á').replace(/&aacute;/g, 'á')
    .replace(/&Acirc;/g, 'Â').replace(/&acirc;/g, 'â')
    .replace(/&Agrave;/g, 'À').replace(/&agrave;/g, 'à')
    .replace(/&Eacute;/g, 'É').replace(/&eacute;/g, 'é')
    .replace(/&Ecirc;/g, 'Ê').replace(/&ecirc;/g, 'ê')
    .replace(/&Iacute;/g, 'Í').replace(/&iacute;/g, 'í')
    .replace(/&Oacute;/g, 'Ó').replace(/&oacute;/g, 'ó')
    .replace(/&Ocirc;/g, 'Ô').replace(/&ocirc;/g, 'ô')
    .replace(/&Otilde;/g, 'Õ').replace(/&otilde;/g, 'õ')
    .replace(/&Uacute;/g, 'Ú').replace(/&uacute;/g, 'ú')
    .replace(/&Uuml;/g, 'Ü').replace(/&uuml;/g, 'ü')
    .replace(/&Ntilde;/g, 'Ñ').replace(/&ntilde;/g, 'ñ')
    .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, n) => String.fromCharCode(parseInt(n, 16)))
}

;(async () => {
  console.log(`=== Fix-up HTML entities ===`)
  console.log(`Modo: ${DRY_RUN ? 'DRY-RUN' : '⚠️  COMMIT'}\n`)

  let totalOrc = 0, totalCli = 0, totalMsg = 0, totalEv = 0

  // ── Orçamentos ──
  const orcs = await prisma.orcamento.findMany({
    select: { id: true, observacoes: true, decisaoNome: true, decisaoObs: true },
  })
  for (const o of orcs) {
    const updates: Record<string, string> = {}
    if (o.observacoes && ENTITY_REGEX.test(o.observacoes)) updates.observacoes = decodeEntities(o.observacoes)
    if (o.decisaoNome && ENTITY_REGEX.test(o.decisaoNome)) updates.decisaoNome = decodeEntities(o.decisaoNome)
    if (o.decisaoObs && ENTITY_REGEX.test(o.decisaoObs)) updates.decisaoObs = decodeEntities(o.decisaoObs)
    if (Object.keys(updates).length > 0) {
      if (!DRY_RUN) await prisma.orcamento.update({ where: { id: o.id }, data: updates })
      totalOrc++
    }
  }
  console.log(`Orçamentos com entities: ${totalOrc}`)

  // ── Clientes ──
  const clis = await prisma.cliente.findMany({
    where: { idOneClick: { not: null } },
    select: { id: true, razaoSocial: true, nomeFantasia: true, observacoes: true, logradouro: true, bairro: true, cidade: true, complemento: true },
  })
  for (const c of clis) {
    const updates: Record<string, string> = {}
    if (c.razaoSocial && ENTITY_REGEX.test(c.razaoSocial)) updates.razaoSocial = decodeEntities(c.razaoSocial)
    if (c.nomeFantasia && ENTITY_REGEX.test(c.nomeFantasia)) updates.nomeFantasia = decodeEntities(c.nomeFantasia)
    if (c.observacoes && ENTITY_REGEX.test(c.observacoes)) updates.observacoes = decodeEntities(c.observacoes)
    if (c.logradouro && ENTITY_REGEX.test(c.logradouro)) updates.logradouro = decodeEntities(c.logradouro)
    if (c.bairro && ENTITY_REGEX.test(c.bairro)) updates.bairro = decodeEntities(c.bairro)
    if (c.cidade && ENTITY_REGEX.test(c.cidade)) updates.cidade = decodeEntities(c.cidade)
    if (c.complemento && ENTITY_REGEX.test(c.complemento)) updates.complemento = decodeEntities(c.complemento)
    if (Object.keys(updates).length > 0) {
      if (!DRY_RUN) await prisma.cliente.update({ where: { id: c.id }, data: updates })
      totalCli++
    }
  }
  console.log(`Clientes com entities:   ${totalCli}`)

  // ── Mensagens ──
  const msgs = await prisma.orcamentoMensagem.findMany({
    select: { id: true, mensagem: true },
  })
  for (const m of msgs) {
    if (m.mensagem && ENTITY_REGEX.test(m.mensagem)) {
      if (!DRY_RUN) await prisma.orcamentoMensagem.update({ where: { id: m.id }, data: { mensagem: decodeEntities(m.mensagem) } })
      totalMsg++
    }
  }
  console.log(`Mensagens com entities:  ${totalMsg}`)

  // ── Eventos ──
  const evs = await prisma.orcamentoEvento.findMany({
    select: { id: true, descricao: true },
  })
  for (const e of evs) {
    if (e.descricao && ENTITY_REGEX.test(e.descricao)) {
      if (!DRY_RUN) await prisma.orcamentoEvento.update({ where: { id: e.id }, data: { descricao: decodeEntities(e.descricao) } })
      totalEv++
    }
  }
  console.log(`Eventos com entities:    ${totalEv}`)

  console.log('')
  if (DRY_RUN) console.log('⚠️  DRY-RUN — nada gravado.')
  else console.log('✅ COMMIT concluído.')

  await prisma.$disconnect()
})().catch(e => { console.error(e); process.exit(1) })
