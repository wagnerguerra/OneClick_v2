/**
 * Popula etapas e passos do serviço "Alteração Contratual" (contexto ES).
 *
 * Cobre os cenários mais comuns: mudança de endereço, sócios, capital,
 * atividade (CNAE), nome empresarial e administração. Em cada execução real,
 * o operador marca como ignorado os passos que não se aplicam ao caso.
 *
 * Estrutura: 8 etapas, ~50 passos. SLA agregado ~25h.
 *
 * Órgãos referenciados (ES):
 *  - JUCEES — Junta Comercial do ES
 *  - REDESIM — portal federal de viabilidade + DBE
 *  - SEFAZ-ES — Inscrição Estadual
 *  - SEFAZ Municipal — Inscrição Municipal/Alvará
 *  - VVS / IDAF / CBMES — Vigilância Sanitária, Ambiental, Bombeiros
 *  - e-CAC — RFB (cadastro PJ)
 *  - DT-e — Domicílio Tributário Eletrônico do ES
 */
import { prisma } from '../src/client'

const SERVICO_ID = 'cmp2ijuwa00029gxwlba0u79x'

type PassoDef = { nome: string; obrigatorio?: boolean; permiteIgnorar?: boolean; slaMinutos?: number }
type EtapaDef = { nome: string; passos: PassoDef[] }

const ETAPAS: EtapaDef[] = [
  {
    nome: 'Levantamento e qualificação da alteração',
    passos: [
      { nome: 'Identificar o que vai mudar (endereço · sócios · capital · CNAE · nome · administração)', obrigatorio: true, slaMinutos: 20 },
      { nome: 'Confirmar dados atuais da empresa (NIRE, CNPJ, IE, IM)', obrigatorio: true, slaMinutos: 15 },
      { nome: 'Verificar última alteração registrada na JUCEES (data e número)', obrigatorio: true, slaMinutos: 15 },
      { nome: 'Validar regime tributário atual e impactos da alteração', obrigatorio: true, slaMinutos: 30 },
      { nome: 'Apurar exigências específicas (cláusulas especiais, quórum, anuências)', obrigatorio: true, slaMinutos: 20 },
      { nome: 'Estimar custos (taxa JUCEES, DARE, emolumentos, certidões)', obrigatorio: false, slaMinutos: 15 },
    ],
  },
  {
    nome: 'Coleta documental',
    passos: [
      { nome: 'Contrato social consolidado vigente', obrigatorio: true, slaMinutos: 10 },
      { nome: 'Documentos pessoais atualizados dos sócios envolvidos (RG, CPF/CNH)', obrigatorio: true, slaMinutos: 20 },
      { nome: 'Comprovante de residência dos sócios envolvidos (até 90 dias)', obrigatorio: true, slaMinutos: 15 },
      { nome: 'Certificado digital A1/A3 válido de cada sócio que vai assinar', obrigatorio: true, slaMinutos: 20 },
      { nome: 'Quando mudança de endereço: IPTU / matrícula / contrato de locação + autorização de uso comercial', obrigatorio: false, permiteIgnorar: true, slaMinutos: 20 },
      { nome: 'Quando ingresso de sócio: certidão de casamento / pacto antenupcial (se aplicável)', obrigatorio: false, permiteIgnorar: true, slaMinutos: 15 },
      { nome: 'Quando saída de sócio: instrumento particular de cessão de quotas / quitação', obrigatorio: false, permiteIgnorar: true, slaMinutos: 30 },
      { nome: 'Procuração específica para o contador (caso ainda não exista)', obrigatorio: false, permiteIgnorar: true, slaMinutos: 15 },
    ],
  },
  {
    nome: 'Consulta de viabilidade (REDESIM)',
    passos: [
      { nome: 'Iniciar pedido de viabilidade no REDESIM como ALTERAÇÃO (não constituição)', obrigatorio: true, slaMinutos: 20 },
      { nome: 'Quando mudar endereço: lançar viabilidade locacional do novo CEP', obrigatorio: false, permiteIgnorar: true, slaMinutos: 30 },
      { nome: 'Quando mudar atividade: atualizar CNAEs (principal + secundárias)', obrigatorio: false, permiteIgnorar: true, slaMinutos: 30 },
      { nome: 'Quando mudar nome empresarial: reservar novo nome', obrigatorio: false, permiteIgnorar: true, slaMinutos: 20 },
      { nome: 'Anexar documentação solicitada pelo REDESIM', obrigatorio: true, slaMinutos: 15 },
      { nome: 'Aguardar deferimento da viabilidade (1 a 3 dias úteis)', obrigatorio: true, slaMinutos: 30 },
      { nome: 'Em caso de exigência: ajustar e ressubmeter', obrigatorio: false, permiteIgnorar: true, slaMinutos: 60 },
    ],
  },
  {
    nome: 'Geração do DBE e elaboração da minuta',
    passos: [
      { nome: 'Gerar DBE no Coletor Nacional vinculado à viabilidade aprovada', obrigatorio: true, slaMinutos: 25 },
      { nome: 'Conferir todos os dados do DBE antes de prosseguir', obrigatorio: true, slaMinutos: 15 },
      { nome: 'Redigir minuta de alteração contratual com cláusulas afetadas', obrigatorio: true, slaMinutos: 60 },
      { nome: 'Incluir consolidação completa do contrato social ao final da minuta', obrigatorio: true, slaMinutos: 30 },
      { nome: 'Validar capital social e percentuais de participação após a alteração', obrigatorio: true, slaMinutos: 20 },
      { nome: 'Revisar com sócios e ajustar conforme feedback', obrigatorio: true, slaMinutos: 30 },
      { nome: 'Versão final aprovada por escrito (e-mail/WhatsApp) por todos os sócios', obrigatorio: true, slaMinutos: 15 },
    ],
  },
  {
    nome: 'Protocolo na JUCEES',
    passos: [
      { nome: 'Emitir DARE da taxa de alteração na SEFAZ-ES', obrigatorio: true, slaMinutos: 15 },
      { nome: 'Recolher DARE e anexar comprovante de pagamento', obrigatorio: true, slaMinutos: 15 },
      { nome: 'Montar processo no sistema da JUCEES (Sigfácil) com minuta + DBE + DARE', obrigatorio: true, slaMinutos: 30 },
      { nome: 'Solicitar assinatura digital de cada sócio no processo', obrigatorio: true, slaMinutos: 30 },
      { nome: 'Conferir validade dos certificados antes de protocolar', obrigatorio: true, slaMinutos: 10 },
      { nome: 'Protocolar oficialmente na JUCEES', obrigatorio: true, slaMinutos: 15 },
      { nome: 'Registrar número de protocolo no controle interno', obrigatorio: true, slaMinutos: 5 },
    ],
  },
  {
    nome: 'Acompanhamento e cumprimento de exigências',
    passos: [
      { nome: 'Acompanhar análise da JUCEES (prazo médio 3 a 7 dias úteis)', obrigatorio: true, slaMinutos: 60 },
      { nome: 'Em caso de exigência: ler parecer e identificar pontos a corrigir', obrigatorio: false, permiteIgnorar: true, slaMinutos: 30 },
      { nome: 'Cumprir exigências (ajuste de minuta / documento faltante) e re-protocolar', obrigatorio: false, permiteIgnorar: true, slaMinutos: 120 },
      { nome: 'Receber o ato deferido com chancela da JUCEES', obrigatorio: true, slaMinutos: 15 },
      { nome: 'Baixar contrato consolidado + cartão CNPJ atualizados', obrigatorio: true, slaMinutos: 15 },
    ],
  },
  {
    nome: 'Atualização de inscrições e órgãos',
    passos: [
      { nome: 'Atualizar Inscrição Estadual na SEFAZ-ES (se houver IE ativa)', obrigatorio: false, permiteIgnorar: true, slaMinutos: 45 },
      { nome: 'Atualizar Inscrição Municipal / Alvará na prefeitura competente', obrigatorio: false, permiteIgnorar: true, slaMinutos: 60 },
      { nome: 'Quando aplicável: atualizar Vigilância Sanitária (VVS)', obrigatorio: false, permiteIgnorar: true, slaMinutos: 60 },
      { nome: 'Quando aplicável: atualizar licença ambiental (IDAF / IEMA)', obrigatorio: false, permiteIgnorar: true, slaMinutos: 90 },
      { nome: 'Quando aplicável: atualizar AVCB / vistoria do Corpo de Bombeiros (CBMES)', obrigatorio: false, permiteIgnorar: true, slaMinutos: 60 },
      { nome: 'Atualizar cadastros junto a conselhos profissionais (CRC, CRM, OAB etc.)', obrigatorio: false, permiteIgnorar: true, slaMinutos: 30 },
      { nome: 'Atualizar cadastro no e-CAC / dados da PJ na RFB', obrigatorio: true, slaMinutos: 30 },
      { nome: 'Atualizar DT-e / Domicílio Tributário Eletrônico do ES', obrigatorio: false, permiteIgnorar: true, slaMinutos: 20 },
    ],
  },
  {
    nome: 'Encerramento e comunicação',
    passos: [
      { nome: 'Atualizar dados internos do cliente no sistema (endereço, sócios, capital etc.)', obrigatorio: true, slaMinutos: 20 },
      { nome: 'Revisar/reemitir procurações que ficaram obsoletas pela alteração', obrigatorio: false, permiteIgnorar: true, slaMinutos: 30 },
      { nome: 'Atualizar contrato de prestação de serviços (se houver mudança que impacte)', obrigatorio: false, permiteIgnorar: true, slaMinutos: 20 },
      { nome: 'Comunicar partes interessadas (bancos, fornecedores-chave, ERP do cliente)', obrigatorio: false, permiteIgnorar: true, slaMinutos: 30 },
      { nome: 'Montar dossiê final com todos os documentos da alteração', obrigatorio: true, slaMinutos: 30 },
      { nome: 'Enviar cliente o ato consolidado + cartão CNPJ atualizado', obrigatorio: true, slaMinutos: 10 },
      { nome: 'Checklist final assinado pelo responsável', obrigatorio: true, slaMinutos: 15 },
    ],
  },
]

async function main() {
  console.log('🏗️  Populando "Alteração Contratual" (ES)\n')

  const servico = await prisma.servico.findUnique({
    where: { id: SERVICO_ID },
    include: { etapas: { select: { id: true } } },
  })
  if (!servico) { console.error('❌ Serviço não encontrado.'); process.exit(1) }
  console.log(`✓ Serviço: ${servico.nome}`)
  console.log(`  Etapas existentes: ${servico.etapas.length}\n`)

  // Limpa estrutura antiga (caso reseed)
  if (servico.etapas.length > 0) {
    const etapaIds = servico.etapas.map(e => e.id)
    await prisma.servicoPasso.deleteMany({ where: { etapaId: { in: etapaIds } } })
    await prisma.servicoEtapa.deleteMany({ where: { id: { in: etapaIds } } })
    console.log(`🗑️  Limpou ${servico.etapas.length} etapa(s) antiga(s)\n`)
  }

  let slaTotalMin = 0
  let totalPassos = 0
  for (let ei = 0; ei < ETAPAS.length; ei++) {
    const def = ETAPAS[ei]
    const etapa = await prisma.servicoEtapa.create({
      data: { servicoId: SERVICO_ID, nome: def.nome, ordem: ei, slaHoras: 0 },
    })
    let slaEtapaMin = 0
    for (let pi = 0; pi < def.passos.length; pi++) {
      const p = def.passos[pi]
      const slaMin = p.slaMinutos ?? 0
      await prisma.servicoPasso.create({
        data: {
          etapaId: etapa.id,
          nome: p.nome,
          ordem: pi,
          obrigatorio: p.obrigatorio ?? true,
          permiteIgnorar: p.permiteIgnorar ?? false,
          slaMinutos: slaMin,
          slaHoras: slaMin > 0 ? Math.max(1, Math.round(slaMin / 60)) : null,
        },
      })
      slaEtapaMin += slaMin
      totalPassos++
    }
    await prisma.servicoEtapa.update({
      where: { id: etapa.id },
      data: { slaHoras: Math.max(0, Math.round(slaEtapaMin / 60)) },
    })
    slaTotalMin += slaEtapaMin
    console.log(`  ${(ei + 1).toString().padStart(2)}. ${def.nome.padEnd(54)} ${def.passos.length.toString().padStart(2)} passos  SLA ${(slaEtapaMin / 60).toFixed(1)}h`)
  }

  await prisma.servico.update({
    where: { id: SERVICO_ID },
    data: {
      slaHoras: Math.max(0, Math.round(slaTotalMin / 60)),
      descricao: 'Serviço de alteração contratual de PJ — cobre os cenários mais comuns (endereço, sócios, capital, CNAE, nome, administração). Operação no Espírito Santo: JUCEES + REDESIM + SEFAZ-ES.',
      prioridadePadrao: 'ALTA',
    },
  })

  console.log(`\n✅ Concluído`)
  console.log(`   Etapas: ${ETAPAS.length}`)
  console.log(`   Passos: ${totalPassos}`)
  console.log(`   SLA total: ${(slaTotalMin / 60).toFixed(1)}h (${slaTotalMin} min)`)
}

main().catch(e => { console.error('❌', e); process.exit(1) }).finally(() => prisma.$disconnect())
