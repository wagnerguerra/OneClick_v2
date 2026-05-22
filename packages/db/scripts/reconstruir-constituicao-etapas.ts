/**
 * Refatora "Constituição de Novo Cliente": 11 fases passam de Servicos FLUXO
 * pra Etapas diretas do top-level. Passos ficam flat dentro de cada Etapa.
 *
 * Modelo final:
 *   Servico "Constituição de Novo Cliente"  (EXTRA)
 *     ├─ Etapa 1: Coleta de informações iniciais
 *     │    ├─ Passo: Dados básicos · Nome empresarial...
 *     │    ├─ Passo: Dados básicos · Atividade principal...
 *     │    └─ ...
 *     ├─ Etapa 2: Análise técnica da atividade
 *     │    └─ Passos...
 *     └─ ... (11 etapas no total)
 *
 * Cada passo é prefixado com o nome da sub-seção original (separado por " · ")
 * pra preservar a hierarquia visual em lista flat.
 */
import { prisma } from '../src/client'

const TOP_LEVEL_ID = 'cmp1j4t2x00009ge037k8z0gc'

type PassoDef = { nome: string; obrigatorio?: boolean; permiteIgnorar?: boolean; slaMinutos?: number }
type SubEtapaDef = { nome: string; passos: PassoDef[] }
type FaseDef = { nome: string; descricao: string; subetapas: SubEtapaDef[] }

const FASES: FaseDef[] = [
  {
    nome: 'Coleta de informações iniciais',
    descricao: 'Captura inicial dos dados do empreendedor, sócios, atividade pretendida e regime tributário desejado.',
    subetapas: [
      {
        nome: 'Dados básicos',
        passos: [
          { nome: 'Nome empresarial (3 opções por ordem de preferência)', obrigatorio: true, slaMinutos: 15 },
          { nome: 'Atividade principal pretendida (descrever em texto livre)', obrigatorio: true, slaMinutos: 15 },
          { nome: 'Atividades secundárias previstas', obrigatorio: false, slaMinutos: 10 },
          { nome: 'Regime tributário desejado (Simples/Presumido/Real)', obrigatorio: true, slaMinutos: 10 },
          { nome: 'Forma jurídica (LTDA, SLU, SA, EIRELI, MEI)', obrigatorio: true, slaMinutos: 10 },
        ],
      },
      {
        nome: 'Sócios e capital',
        passos: [
          { nome: 'Identificação dos sócios (CPF, RG, qualificação completa)', obrigatorio: true, slaMinutos: 30 },
          { nome: 'Percentual de participação de cada sócio', obrigatorio: true, slaMinutos: 15 },
          { nome: 'Capital social proposto e forma de integralização', obrigatorio: true, slaMinutos: 20 },
          { nome: 'Definição de administrador(es)', obrigatorio: true, slaMinutos: 15 },
        ],
      },
      {
        nome: 'Endereço e contatos',
        passos: [
          { nome: 'Endereço da sede (CEP, comprovante)', obrigatorio: true, slaMinutos: 15 },
          { nome: 'E-mail e telefone para comunicações oficiais', obrigatorio: true, slaMinutos: 5 },
          { nome: 'Quem responde pelo dia-a-dia (contato operacional)', obrigatorio: false, slaMinutos: 5 },
        ],
      },
    ],
  },
  {
    nome: 'Análise técnica da atividade',
    descricao: 'Avaliação dos CNAEs, enquadramentos tributários, exigências de licenciamento e impedimentos legais.',
    subetapas: [
      {
        nome: 'Enquadramentos',
        passos: [
          { nome: 'Identificação dos CNAEs adequados à atividade', obrigatorio: true, slaMinutos: 45 },
          { nome: 'Verificação de impedimentos no Simples Nacional', obrigatorio: true, slaMinutos: 30 },
          { nome: 'Análise de anexos aplicáveis (I/II/III/IV/V)', obrigatorio: true, slaMinutos: 30 },
          { nome: 'Avaliação preliminar de carga tributária (Simples vs Presumido vs Real)', obrigatorio: true, slaMinutos: 60 },
        ],
      },
      {
        nome: 'Exigências e licenças',
        passos: [
          { nome: 'Necessidade de Inscrição Estadual', obrigatorio: true, slaMinutos: 15 },
          { nome: 'Necessidade de Inscrição Municipal específica', obrigatorio: true, slaMinutos: 15 },
          { nome: 'Licenças sanitárias / ambientais / Vigilância / Bombeiros', obrigatorio: true, slaMinutos: 30 },
          { nome: 'Conselhos profissionais (CRC, CRM, OAB, CREA etc.)', obrigatorio: false, slaMinutos: 20 },
          { nome: 'Registros de marca, patente ou software (orientação)', obrigatorio: false, slaMinutos: 15 },
        ],
      },
    ],
  },
  {
    nome: 'Definição do caminho do processo',
    descricao: 'Decisão sobre como o cadastro vai prosseguir — abertura completa via Junta, MEI ou orientação ao cliente.',
    subetapas: [
      {
        nome: 'Decisão',
        passos: [
          { nome: 'Cliente prossegue como MEI?', obrigatorio: true, slaMinutos: 10 },
          { nome: 'Cliente prossegue com abertura completa via Junta?', obrigatorio: true, slaMinutos: 10 },
          { nome: 'Caso negativo: orientar e arquivar o cadastro', obrigatorio: false, slaMinutos: 15 },
        ],
      },
    ],
  },
  {
    nome: 'Reunião / Checklist técnico de abertura',
    descricao: 'Reunião com o cliente pra alinhar contrato social, distribuição de lucros, pró-labore e governança.',
    subetapas: [
      {
        nome: 'Definições societárias',
        passos: [
          { nome: 'Cláusulas especiais do contrato (cessão de quotas, retirada)', obrigatorio: true, slaMinutos: 30 },
          { nome: 'Pró-labore dos administradores', obrigatorio: true, slaMinutos: 20 },
          { nome: 'Regras de distribuição de lucros', obrigatorio: true, slaMinutos: 20 },
          { nome: 'Quórum para decisões (alteração contratual, exclusão de sócio)', obrigatorio: false, slaMinutos: 15 },
        ],
      },
      {
        nome: 'Definições operacionais',
        passos: [
          { nome: 'Plano de contas e centros de custo iniciais', obrigatorio: false, slaMinutos: 30 },
          { nome: 'Política de faturamento (NF-e, NFS-e, série)', obrigatorio: true, slaMinutos: 15 },
          { nome: 'Definir banco principal e gateway de pagamento (se aplicável)', obrigatorio: false, slaMinutos: 15 },
          { nome: 'Confirmar honorários e escopo do contrato de prestação', obrigatorio: true, slaMinutos: 20 },
        ],
      },
    ],
  },
  {
    nome: 'Coleta documental',
    descricao: 'Reunião dos documentos pessoais dos sócios e do imóvel sede pra montagem do dossiê de abertura.',
    subetapas: [
      {
        nome: 'Documentos pessoais dos sócios',
        passos: [
          { nome: 'RG e CPF (ou CNH) de cada sócio', obrigatorio: true, slaMinutos: 15 },
          { nome: 'Comprovante de residência atualizado (até 90 dias)', obrigatorio: true, slaMinutos: 10 },
          { nome: 'Certidão de casamento / pacto antenupcial (quando casado)', obrigatorio: false, slaMinutos: 10 },
          { nome: 'Certificado digital A1 ou A3 de cada sócio', obrigatorio: true, slaMinutos: 30 },
        ],
      },
      {
        nome: 'Documentos do imóvel sede',
        passos: [
          { nome: 'IPTU ou matrícula do imóvel', obrigatorio: true, slaMinutos: 15 },
          { nome: 'Contrato de locação (se alugado) com firma reconhecida', obrigatorio: false, slaMinutos: 20 },
          { nome: 'Autorização do proprietário pra uso comercial', obrigatorio: false, slaMinutos: 15 },
        ],
      },
    ],
  },
  {
    nome: 'Consulta de viabilidade',
    descricao: 'Consulta prévia no REDESIM/Junta para validar nome empresarial, endereço e CNAEs antes do registro.',
    subetapas: [
      {
        nome: 'Submissão',
        passos: [
          { nome: 'Reservar nome empresarial no portal da Junta', obrigatorio: true, slaMinutos: 20 },
          { nome: 'Lançar viabilidade locacional (CEP + atividade)', obrigatorio: true, slaMinutos: 30 },
          { nome: 'Anexar IPTU/contrato no REDESIM', obrigatorio: true, slaMinutos: 15 },
          { nome: 'Aguardar deferimento (1 a 3 dias úteis)', obrigatorio: true, slaMinutos: 30 },
        ],
      },
      {
        nome: 'Resultado e contingência',
        passos: [
          { nome: 'Conferir parecer (deferido / exigências)', obrigatorio: true, slaMinutos: 15 },
          { nome: 'Se indeferido: ajustar nome ou endereço e ressubmeter', obrigatorio: false, permiteIgnorar: true, slaMinutos: 60 },
          { nome: 'Comunicar resultado ao cliente', obrigatorio: true, slaMinutos: 10 },
        ],
      },
    ],
  },
  {
    nome: 'Elaboração do ato constitutivo',
    descricao: 'Redação do contrato social ou ato constitutivo conforme as definições da reunião e o resultado da viabilidade.',
    subetapas: [
      {
        nome: 'Redação',
        passos: [
          { nome: 'Montar minuta do contrato social com CNAEs validados', obrigatorio: true, slaMinutos: 60 },
          { nome: 'Incluir cláusulas especiais combinadas', obrigatorio: true, slaMinutos: 30 },
          { nome: 'Revisar capital, integralização e quotas', obrigatorio: true, slaMinutos: 20 },
        ],
      },
      {
        nome: 'Validação',
        passos: [
          { nome: 'Enviar minuta para revisão dos sócios', obrigatorio: true, slaMinutos: 15 },
          { nome: 'Ajustar conforme feedback', obrigatorio: false, permiteIgnorar: true, slaMinutos: 30 },
          { nome: 'Versão final aprovada por todos os sócios', obrigatorio: true, slaMinutos: 15 },
        ],
      },
    ],
  },
  {
    nome: 'Registro na Junta Comercial',
    descricao: 'Geração do DBE, coleta de assinaturas digitais, protocolo na Junta e acompanhamento até deferimento.',
    subetapas: [
      {
        nome: 'DBE / REDESIM',
        passos: [
          { nome: 'Gerar DBE no Coletor Nacional', obrigatorio: true, slaMinutos: 30 },
          { nome: 'Lançar quadro societário e capital no REDESIM', obrigatorio: true, slaMinutos: 30 },
          { nome: 'Vincular DBE à viabilidade aprovada', obrigatorio: true, slaMinutos: 15 },
        ],
      },
      {
        nome: 'Assinaturas',
        passos: [
          { nome: 'Solicitar assinatura digital de cada sócio no processo', obrigatorio: true, slaMinutos: 30 },
          { nome: 'Conferir validade dos certificados', obrigatorio: true, slaMinutos: 10 },
        ],
      },
      {
        nome: 'Protocolo e acompanhamento',
        passos: [
          { nome: 'Protocolar contrato social na Junta', obrigatorio: true, slaMinutos: 20 },
          { nome: 'Acompanhar análise (deferido / exigências)', obrigatorio: true, slaMinutos: 60 },
          { nome: 'Cumprir exigências da Junta, se houver', obrigatorio: false, permiteIgnorar: true, slaMinutos: 120 },
          { nome: 'Receber NIRE e protocolar CNPJ', obrigatorio: true, slaMinutos: 30 },
        ],
      },
    ],
  },
  {
    nome: 'Pós-registro — documentos e inscrições',
    descricao: 'Obtenção do CNPJ, inscrições estadual/municipal, alvará de funcionamento e licenças aplicáveis.',
    subetapas: [
      {
        nome: 'Documentos federais',
        passos: [
          { nome: 'Baixar comprovante de inscrição no CNPJ', obrigatorio: true, slaMinutos: 15 },
          { nome: 'Cadastrar no e-CAC / Caixa Postal eletrônica da RFB', obrigatorio: true, slaMinutos: 30 },
          { nome: 'Solicitar certificado digital da PJ', obrigatorio: true, slaMinutos: 60 },
        ],
      },
      {
        nome: 'Inscrições estaduais e municipais',
        passos: [
          { nome: 'Inscrição Estadual (SEFAZ) — se houver atividade de mercadorias', obrigatorio: false, slaMinutos: 60 },
          { nome: 'Inscrição Municipal (Cadastro Mobiliário)', obrigatorio: true, slaMinutos: 60 },
          { nome: 'Alvará de funcionamento', obrigatorio: true, slaMinutos: 60 },
          { nome: 'Licenças sanitárias / ambientais / Bombeiros (quando aplicável)', obrigatorio: false, permiteIgnorar: true, slaMinutos: 120 },
        ],
      },
    ],
  },
  {
    nome: 'Procurações e acessos',
    descricao: 'Emissão das procurações eletrônicas e configuração dos acessos pra escritório operar em nome do cliente.',
    subetapas: [
      {
        nome: 'Procurações eletrônicas',
        passos: [
          { nome: 'Procuração e-CAC (RFB) com perfil contábil', obrigatorio: true, slaMinutos: 30 },
          { nome: 'Procuração SEFAZ Estadual', obrigatorio: false, slaMinutos: 30 },
          { nome: 'Procuração Prefeitura / portal municipal', obrigatorio: false, slaMinutos: 30 },
          { nome: 'Procuração Conectividade Social ICP (FGTS / Caixa)', obrigatorio: true, slaMinutos: 30 },
        ],
      },
      {
        nome: 'Acessos digitais',
        passos: [
          { nome: 'Cadastrar empresa no DT-e estadual', obrigatorio: false, slaMinutos: 20 },
          { nome: 'Configurar acessos no sistema interno do escritório', obrigatorio: true, slaMinutos: 30 },
          { nome: 'Confirmar caixa postal e-CAC operando', obrigatorio: true, slaMinutos: 15 },
        ],
      },
    ],
  },
  {
    nome: 'Encerramento e liberação para setores mensais',
    descricao: 'Dossiê final, transferência pra rotina mensal e onboarding do cliente nos serviços recorrentes.',
    subetapas: [
      {
        nome: 'Dossiê e checklist final',
        passos: [
          { nome: 'Montar dossiê digital com todos os documentos emitidos', obrigatorio: true, slaMinutos: 60 },
          { nome: 'Checklist final assinado pelo responsável da abertura', obrigatorio: true, slaMinutos: 20 },
          { nome: 'Arquivar cópias físicas / digitais conforme política', obrigatorio: true, slaMinutos: 20 },
        ],
      },
      {
        nome: 'Liberação pros setores mensais',
        passos: [
          { nome: 'Reunião de onboarding com cliente (apresentação dos contatos)', obrigatorio: true, slaMinutos: 60 },
          { nome: 'Transferência pra rotina Fiscal mensal', obrigatorio: true, slaMinutos: 15 },
          { nome: 'Transferência pra rotina Contábil mensal', obrigatorio: true, slaMinutos: 15 },
          { nome: 'Transferência pra rotina Pessoal/DP (se houver folha)', obrigatorio: false, slaMinutos: 15 },
          { nome: 'Ativar serviços recorrentes no contrato', obrigatorio: true, slaMinutos: 20 },
        ],
      },
    ],
  },
]

async function main() {
  console.log('🔁 Refatorando "Constituição de Novo Cliente" — fases viram Etapas\n')

  const top = await prisma.servico.findUnique({
    where: { id: TOP_LEVEL_ID },
    include: {
      etapas: { select: { id: true } },
      itensDeFluxo: { select: { id: true, nome: true } },
    },
  })
  if (!top) { console.error(`❌ Top-level não encontrado.`); process.exit(1) }

  console.log(`✓ Top-level: ${top.nome}`)
  console.log(`  Etapas atuais: ${top.etapas.length}`)
  console.log(`  Itens FLUXO a remover: ${top.itensDeFluxo.length}\n`)

  const fluxoIds = top.itensDeFluxo.map(i => i.id)
  // ── Validação: nada com execuções
  const execCount = await prisma.servicoExecucao.count({
    where: { servicoId: { in: [TOP_LEVEL_ID, ...fluxoIds] } },
  })
  if (execCount > 0) {
    console.error(`❌ Existem ${execCount} execução(ões) ligadas. Finalize/desative antes de refatorar.`)
    process.exit(1)
  }

  // ── 1. Remove tudo dos itens FLUXO antigos
  if (fluxoIds.length > 0) {
    console.log('🗑️  Limpando itens FLUXO antigos...')
    await prisma.servicoEncadeamento.deleteMany({
      where: { OR: [{ servicoOrigemId: { in: fluxoIds } }, { servicoDestinoId: { in: fluxoIds } }] },
    })
    const etapasFluxo = await prisma.servicoEtapa.findMany({
      where: { servicoId: { in: fluxoIds } }, select: { id: true },
    })
    if (etapasFluxo.length > 0) {
      await prisma.servicoPasso.deleteMany({ where: { etapaId: { in: etapasFluxo.map(e => e.id) } } })
      await prisma.servicoEtapa.deleteMany({ where: { id: { in: etapasFluxo.map(e => e.id) } } })
    }
    await prisma.servicoFluxoLayout.deleteMany({ where: { OR: [{ raizId: { in: fluxoIds } }, { nodeId: { in: fluxoIds } }] } })
    await prisma.servico.deleteMany({ where: { id: { in: fluxoIds } } })
    console.log(`   ✓ ${fluxoIds.length} servicos FLUXO + encadeamentos + etapas + passos removidos\n`)
  }

  // ── 2. Remove etapas+passos antigas do top-level (caso tenha)
  if (top.etapas.length > 0) {
    console.log('🗑️  Limpando etapas/passos antigos do top-level...')
    const etapaIds = top.etapas.map(e => e.id)
    await prisma.servicoPasso.deleteMany({ where: { etapaId: { in: etapaIds } } })
    await prisma.servicoEtapa.deleteMany({ where: { id: { in: etapaIds } } })
    console.log(`   ✓ ${top.etapas.length} etapas antigas removidas\n`)
  }

  // ── 3. Cria as 11 etapas diretamente no top-level
  console.log('🏗️  Criando 11 etapas no top-level...\n')
  let slaTotalMin = 0
  let totalPassos = 0
  for (let fi = 0; fi < FASES.length; fi++) {
    const fase = FASES[fi]
    const etapa = await prisma.servicoEtapa.create({
      data: { servicoId: TOP_LEVEL_ID, nome: fase.nome, ordem: fi, slaHoras: 0 },
    })
    // Achata os passos das sub-etapas com prefixo "SubSeção · "
    // (quando há só 1 sub-etapa, o prefixo é redundante e a gente omite)
    let slaEtapaMin = 0
    let ordemPasso = 0
    const usaPrefixo = fase.subetapas.length > 1
    for (const sub of fase.subetapas) {
      for (const p of sub.passos) {
        const slaMin = p.slaMinutos ?? 0
        const nomeFinal = usaPrefixo ? `${sub.nome} · ${p.nome}` : p.nome
        await prisma.servicoPasso.create({
          data: {
            etapaId: etapa.id,
            nome: nomeFinal,
            ordem: ordemPasso++,
            obrigatorio: p.obrigatorio ?? true,
            permiteIgnorar: p.permiteIgnorar ?? false,
            slaMinutos: slaMin,
            slaHoras: slaMin > 0 ? Math.max(1, Math.round(slaMin / 60)) : null,
          },
        })
        slaEtapaMin += slaMin
        totalPassos++
      }
    }
    await prisma.servicoEtapa.update({
      where: { id: etapa.id },
      data: { slaHoras: Math.max(0, Math.round(slaEtapaMin / 60)) },
    })
    slaTotalMin += slaEtapaMin
    console.log(`   ${(fi + 1).toString().padStart(2, ' ')}. ${fase.nome.padEnd(48, ' ')}  ${ordemPasso.toString().padStart(2)} passos  SLA ${(slaEtapaMin / 60).toFixed(1)}h`)
  }

  // ── 4. Atualiza top-level
  await prisma.servico.update({
    where: { id: TOP_LEVEL_ID },
    data: {
      slaHoras: Math.max(0, Math.round(slaTotalMin / 60)),
      descricao: 'Serviço extra de constituição completa de novo cliente — abre CNPJ, valida inscrições, prepara dossiê e libera para os setores mensais. Estruturado em 11 fases (etapas) sequenciais.',
      tipo: 'ATIVIDADE',
      categoriaServico: 'EXTRA',
      prioridadePadrao: 'ALTA',
    },
  })

  console.log(`\n✅ Refatoração concluída`)
  console.log(`   Etapas:  ${FASES.length}`)
  console.log(`   Passos:  ${totalPassos}`)
  console.log(`   SLA:     ${(slaTotalMin / 60).toFixed(1)}h (${slaTotalMin} min)`)
  console.log(`\n   /servicos/${TOP_LEVEL_ID} → aba Etapas: as 11 fases agora aparecem.`)
}

main().catch(err => { console.error('❌ Erro:', err); process.exit(1) }).finally(() => prisma.$disconnect())
