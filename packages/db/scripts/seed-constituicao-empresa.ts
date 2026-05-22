/**
 * Popula etapas e passos do serviço "Constituição de Empresa" (contexto ES).
 *
 * Cobre todo o ciclo de abertura: pré-análise, coleta documental, viabilidade,
 * ato constitutivo, JUCEES, pós-registro, procurações e onboarding fiscal.
 *
 * Órgãos referenciados (ES):
 *  - JUCEES (Sigfácil) — Junta Comercial do ES
 *  - REDESIM (federal) — viabilidade locacional + DBE
 *  - SEFAZ-ES — Inscrição Estadual + DARE
 *  - Prefeituras municipais — Inscrição Municipal + Alvará + NFS-e
 *  - VVS / IDAF / IEMA — Vigilância Sanitária, Ambiental
 *  - CBMES — Corpo de Bombeiros (AVCB)
 *  - RFB / e-CAC — CNPJ + caixa postal
 *  - DT-e ES — Domicílio Tributário Eletrônico
 *  - Conselhos profissionais (CRC, CRM, OAB, CREA, CRMV etc.) quando regulada
 *  - SEBRAE-ES — orientação MEI/EI/LTDA
 *
 * 9 etapas · ~70 passos · SLA agregado ~32h.
 */
import { prisma } from '../src/client'

const SERVICO_ID = 'cmp1ojm0300019gssh8vh2ad2'

type PassoDef = { nome: string; obrigatorio?: boolean; permiteIgnorar?: boolean; slaMinutos?: number }
type EtapaDef = { nome: string; passos: PassoDef[] }

const ETAPAS: EtapaDef[] = [
  {
    nome: 'Pré-análise e consultoria inicial',
    passos: [
      { nome: 'Reunião inicial com o(s) empreendedor(es) — entender o negócio', obrigatorio: true, slaMinutos: 60 },
      { nome: 'Levantar atividades pretendidas (principal + secundárias)', obrigatorio: true, slaMinutos: 30 },
      { nome: 'Definir natureza jurídica (MEI, EI, EIRELI, LTDA, SLU, SA, S/S)', obrigatorio: true, slaMinutos: 30 },
      { nome: 'Definir regime tributário inicial (Simples / Presumido / Real)', obrigatorio: true, slaMinutos: 45 },
      { nome: 'Avaliar carga tributária comparativa entre regimes', obrigatorio: true, slaMinutos: 60 },
      { nome: 'Verificar impedimentos no Simples Nacional (atividade + sócios)', obrigatorio: true, slaMinutos: 30 },
      { nome: 'Apresentar proposta de honorários e formalizar contratação', obrigatorio: true, slaMinutos: 30 },
    ],
  },
  {
    nome: 'Coleta documental dos sócios e do imóvel',
    passos: [
      { nome: 'RG + CPF (ou CNH válida) de cada sócio em PDF', obrigatorio: true, slaMinutos: 15 },
      { nome: 'Comprovante de residência de cada sócio (até 90 dias)', obrigatorio: true, slaMinutos: 10 },
      { nome: 'Certidão de casamento atualizada / pacto antenupcial (quando casado)', obrigatorio: false, permiteIgnorar: true, slaMinutos: 15 },
      { nome: 'Certificado digital A1 ou A3 de cada sócio (e-CPF)', obrigatorio: true, slaMinutos: 30 },
      { nome: 'IPTU ou matrícula do imóvel da sede', obrigatorio: true, slaMinutos: 15 },
      { nome: 'Contrato de locação com firma reconhecida (se imóvel alugado)', obrigatorio: false, permiteIgnorar: true, slaMinutos: 20 },
      { nome: 'Autorização do proprietário para uso comercial (quando residencial)', obrigatorio: false, permiteIgnorar: true, slaMinutos: 15 },
      { nome: 'Documentos extras quando sócio é PJ (contrato social + procuração)', obrigatorio: false, permiteIgnorar: true, slaMinutos: 30 },
    ],
  },
  {
    nome: 'Definições societárias',
    passos: [
      { nome: 'Definir nome empresarial (3 opções em ordem de preferência)', obrigatorio: true, slaMinutos: 20 },
      { nome: 'Definir capital social e forma de integralização (à vista / prazo / bens)', obrigatorio: true, slaMinutos: 30 },
      { nome: 'Distribuir quotas entre sócios (percentuais)', obrigatorio: true, slaMinutos: 20 },
      { nome: 'Definir administrador(es) e poderes', obrigatorio: true, slaMinutos: 20 },
      { nome: 'Definir regras de retirada de pró-labore', obrigatorio: true, slaMinutos: 20 },
      { nome: 'Definir regras de distribuição de lucros', obrigatorio: true, slaMinutos: 20 },
      { nome: 'Cláusulas especiais (cessão de quotas, exclusão de sócio, retirada)', obrigatorio: false, permiteIgnorar: true, slaMinutos: 30 },
      { nome: 'Quórum para alterações contratuais', obrigatorio: false, permiteIgnorar: true, slaMinutos: 15 },
    ],
  },
  {
    nome: 'Consulta de viabilidade no REDESIM',
    passos: [
      { nome: 'Iniciar pedido de viabilidade no REDESIM (módulo abertura)', obrigatorio: true, slaMinutos: 30 },
      { nome: 'Reservar nome empresarial na JUCEES (uma das 3 opções)', obrigatorio: true, slaMinutos: 20 },
      { nome: 'Lançar viabilidade locacional (CEP + atividades)', obrigatorio: true, slaMinutos: 30 },
      { nome: 'Anexar IPTU / contrato de locação / autorização', obrigatorio: true, slaMinutos: 15 },
      { nome: 'Aguardar deferimento (1 a 3 dias úteis)', obrigatorio: true, slaMinutos: 60 },
      { nome: 'Conferir parecer (deferido / com exigências / indeferido)', obrigatorio: true, slaMinutos: 15 },
      { nome: 'Ajustar dados e ressubmeter caso indeferido (mudar nome ou endereço)', obrigatorio: false, permiteIgnorar: true, slaMinutos: 60 },
      { nome: 'Comunicar resultado ao cliente', obrigatorio: true, slaMinutos: 10 },
    ],
  },
  {
    nome: 'Geração do DBE e elaboração do contrato social',
    passos: [
      { nome: 'Gerar DBE no Coletor Nacional vinculado à viabilidade aprovada', obrigatorio: true, slaMinutos: 30 },
      { nome: 'Lançar quadro societário e capital no REDESIM', obrigatorio: true, slaMinutos: 30 },
      { nome: 'Redigir contrato social com cláusulas combinadas', obrigatorio: true, slaMinutos: 90 },
      { nome: 'Incluir CNAEs validados pelo REDESIM', obrigatorio: true, slaMinutos: 15 },
      { nome: 'Revisar capital, integralização e percentuais', obrigatorio: true, slaMinutos: 30 },
      { nome: 'Enviar minuta pros sócios revisarem', obrigatorio: true, slaMinutos: 15 },
      { nome: 'Ajustar conforme feedback', obrigatorio: false, permiteIgnorar: true, slaMinutos: 45 },
      { nome: 'Versão final aprovada por todos os sócios (e-mail/WhatsApp)', obrigatorio: true, slaMinutos: 15 },
    ],
  },
  {
    nome: 'Protocolo na JUCEES (Sigfácil)',
    passos: [
      { nome: 'Emitir DARE da taxa de abertura na SEFAZ-ES', obrigatorio: true, slaMinutos: 15 },
      { nome: 'Recolher DARE e anexar comprovante', obrigatorio: true, slaMinutos: 10 },
      { nome: 'Montar processo no Sigfácil com contrato + DBE + DARE + viabilidade', obrigatorio: true, slaMinutos: 30 },
      { nome: 'Solicitar assinatura digital de cada sócio no processo', obrigatorio: true, slaMinutos: 30 },
      { nome: 'Conferir validade dos certificados antes do protocolo', obrigatorio: true, slaMinutos: 10 },
      { nome: 'Protocolar processo oficialmente na JUCEES', obrigatorio: true, slaMinutos: 15 },
      { nome: 'Registrar número do protocolo no controle interno', obrigatorio: true, slaMinutos: 5 },
      { nome: 'Acompanhar análise (prazo médio 3 a 7 dias úteis)', obrigatorio: true, slaMinutos: 60 },
      { nome: 'Cumprir exigências caso surjam (re-protocolo)', obrigatorio: false, permiteIgnorar: true, slaMinutos: 120 },
      { nome: 'Receber NIRE + Contrato Social registrado + CNPJ provisório', obrigatorio: true, slaMinutos: 30 },
    ],
  },
  {
    nome: 'Pós-registro — Inscrições e licenças',
    passos: [
      { nome: 'Confirmar geração automática do CNPJ pela RFB (24h)', obrigatorio: true, slaMinutos: 30 },
      { nome: 'Baixar comprovante de inscrição no CNPJ', obrigatorio: true, slaMinutos: 15 },
      { nome: 'Cadastrar empresa no e-CAC e habilitar caixa postal eletrônica RFB', obrigatorio: true, slaMinutos: 45 },
      { nome: 'Solicitar certificado digital da PJ (e-CNPJ A1 ou A3)', obrigatorio: true, slaMinutos: 60 },
      { nome: 'Solicitar Inscrição Estadual (SEFAZ-ES) — quando atividade comercial', obrigatorio: false, permiteIgnorar: true, slaMinutos: 60 },
      { nome: 'Solicitar Inscrição Municipal na prefeitura do município sede', obrigatorio: true, slaMinutos: 60 },
      { nome: 'Solicitar alvará de funcionamento na prefeitura', obrigatorio: true, slaMinutos: 60 },
      { nome: 'Licença sanitária (VVS) quando atividade alimentícia/saúde', obrigatorio: false, permiteIgnorar: true, slaMinutos: 90 },
      { nome: 'Licença ambiental (IDAF / IEMA) quando atividade potencialmente poluidora', obrigatorio: false, permiteIgnorar: true, slaMinutos: 120 },
      { nome: 'AVCB / vistoria do Corpo de Bombeiros (CBMES) quando exigido', obrigatorio: false, permiteIgnorar: true, slaMinutos: 90 },
      { nome: 'Registro em conselho profissional (CRC/CRM/OAB/CREA/CRMV)', obrigatorio: false, permiteIgnorar: true, slaMinutos: 60 },
      { nome: 'Cadastro no DT-e estadual (Domicílio Tributário ES)', obrigatorio: true, slaMinutos: 20 },
    ],
  },
  {
    nome: 'Procurações e acessos',
    passos: [
      { nome: 'Procuração e-CAC (RFB) com perfil contábil completo', obrigatorio: true, slaMinutos: 30 },
      { nome: 'Procuração SEFAZ-ES Estadual', obrigatorio: false, permiteIgnorar: true, slaMinutos: 30 },
      { nome: 'Procuração / acesso Prefeitura (NFS-e + ISS)', obrigatorio: true, slaMinutos: 30 },
      { nome: 'Procuração Conectividade Social ICP (FGTS / Caixa)', obrigatorio: true, slaMinutos: 30 },
      { nome: 'Procuração eletrônica eSocial (perfil contábil)', obrigatorio: true, slaMinutos: 30 },
      { nome: 'Procuração Domicílio Eletrônico Trabalhista (DET / MTE)', obrigatorio: true, slaMinutos: 20 },
      { nome: 'Configurar acessos no sistema interno do escritório', obrigatorio: true, slaMinutos: 30 },
      { nome: 'Cadastrar emissor de NF-e/NFC-e/NFS-e e fazer NF-teste', obrigatorio: false, permiteIgnorar: true, slaMinutos: 60 },
    ],
  },
  {
    nome: 'Encerramento e liberação para rotina',
    passos: [
      { nome: 'Montar dossiê digital completo com todos os atos e documentos', obrigatorio: true, slaMinutos: 45 },
      { nome: 'Atualizar cadastro do cliente no sistema interno do escritório', obrigatorio: true, slaMinutos: 30 },
      { nome: 'Reunião de onboarding com cliente — apresentação dos contatos e calendário', obrigatorio: true, slaMinutos: 60 },
      { nome: 'Definir SLA mensal de envio de XMLs, extratos e variáveis', obrigatorio: true, slaMinutos: 20 },
      { nome: 'Disparar Onboarding Fiscal (rotina mensal)', obrigatorio: true, slaMinutos: 15 },
      { nome: 'Disparar Onboarding Contábil (rotina mensal)', obrigatorio: true, slaMinutos: 15 },
      { nome: 'Disparar Onboarding Trabalhista (quando houver folha)', obrigatorio: false, permiteIgnorar: true, slaMinutos: 15 },
      { nome: 'Ativar contratos recorrentes no sistema', obrigatorio: true, slaMinutos: 20 },
      { nome: 'Checklist final assinado pelo responsável do processo', obrigatorio: true, slaMinutos: 15 },
    ],
  },
]

async function main() {
  console.log('🏗️  Populando "Constituição de Empresa" (ES)\n')

  const servico = await prisma.servico.findUnique({
    where: { id: SERVICO_ID },
    include: { etapas: { select: { id: true } } },
  })
  if (!servico) { console.error('❌ Serviço não encontrado.'); process.exit(1) }
  console.log(`✓ Serviço: ${servico.nome}`)
  console.log(`  Etapas existentes: ${servico.etapas.length}\n`)

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
      descricao: 'Constituição completa de PJ no Espírito Santo — desde a pré-análise tributária até a liberação para as rotinas mensais. Cobre JUCEES (Sigfácil), REDESIM, SEFAZ-ES, prefeituras municipais, VVS/IDAF/CBMES quando aplicável.',
      prioridadePadrao: 'ALTA',
    },
  })

  console.log(`\n✅ Concluído`)
  console.log(`   Etapas: ${ETAPAS.length}`)
  console.log(`   Passos: ${totalPassos}`)
  console.log(`   SLA total: ${(slaTotalMin / 60).toFixed(1)}h (${slaTotalMin} min)`)
}

main().catch(e => { console.error('❌', e); process.exit(1) }).finally(() => prisma.$disconnect())
