/**
 * Reconstrói o serviço "Constituição de Novo Cliente" no novo sistema:
 *  - Limpa os 11 itens antigos (passos → etapas → encadeamentos → servicos FLUXO)
 *  - Recria com nomes limpos (sem prefixo "N."), tipos corretos e cadeia ordenada
 *  - Mantém o ID do top-level (cmp1j4t2x00009ge037k8z0gc)
 *
 * Estrutura final:
 *   Constituição de Novo Cliente (EXTRA)
 *     ├─ Coleta de informações iniciais         [ATIVIDADE]
 *     ├─ Análise técnica da atividade           [ATIVIDADE]
 *     ├─ Definição do caminho do processo       [DECISAO]
 *     ├─ Reunião / Checklist técnico            [ATIVIDADE]
 *     ├─ Coleta documental                       [DOCUMENTACAO]
 *     ├─ Consulta de viabilidade                 [ATIVIDADE]
 *     ├─ Elaboração do ato constitutivo          [DOCUMENTACAO]
 *     ├─ Registro na Junta Comercial             [ATIVIDADE]
 *     ├─ Pós-registro — documentos e inscrições  [DOCUMENTACAO]
 *     ├─ Procurações e acessos                   [ATIVIDADE]
 *     └─ Encerramento e liberação                [FIM]
 */
import { prisma } from '../src/client'

const TOP_LEVEL_ID = 'cmp1j4t2x00009ge037k8z0gc'

type PassoDef = { nome: string; obrigatorio?: boolean; permiteIgnorar?: boolean; slaMinutos?: number }
type EtapaDef = { nome: string; passos: PassoDef[] }
type ItemDef = {
  nome: string
  descricao: string
  tipo: 'ATIVIDADE' | 'DECISAO' | 'DOCUMENTACAO' | 'INICIO' | 'FIM'
  prioridade?: 'BAIXA' | 'MEDIA' | 'ALTA' | 'URGENTE'
  etapas: EtapaDef[]
}

// ── Definição completa dos 11 itens em ordem de cadeia ───────────────────
const ITENS: ItemDef[] = [
  {
    nome: 'Coleta de informações iniciais',
    descricao: 'Captura inicial dos dados do empreendedor, sócios, atividade pretendida e regime tributário desejado. Base pra toda a análise.',
    tipo: 'ATIVIDADE',
    prioridade: 'ALTA',
    etapas: [
      {
        nome: 'Dados básicos do cliente',
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
    tipo: 'ATIVIDADE',
    prioridade: 'ALTA',
    etapas: [
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
    descricao: 'Decisão sobre como o cadastro vai prosseguir — abertura completa via Junta, MEI no portal, ou orientação ao cliente para outro caminho.',
    tipo: 'DECISAO',
    prioridade: 'ALTA',
    etapas: [
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
    descricao: 'Reunião com o cliente pra alinhar contrato social, distribuição de lucros, pró-labore, governança e expectativas.',
    tipo: 'ATIVIDADE',
    prioridade: 'ALTA',
    etapas: [
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
    tipo: 'DOCUMENTACAO',
    prioridade: 'ALTA',
    etapas: [
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
    tipo: 'ATIVIDADE',
    prioridade: 'ALTA',
    etapas: [
      {
        nome: 'Submissão da consulta',
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
    tipo: 'DOCUMENTACAO',
    prioridade: 'ALTA',
    etapas: [
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
    tipo: 'ATIVIDADE',
    prioridade: 'ALTA',
    etapas: [
      {
        nome: 'Geração do DBE / REDESIM',
        passos: [
          { nome: 'Gerar DBE no Coletor Nacional', obrigatorio: true, slaMinutos: 30 },
          { nome: 'Lançar quadro societário e capital no REDESIM', obrigatorio: true, slaMinutos: 30 },
          { nome: 'Vincular DBE à viabilidade aprovada', obrigatorio: true, slaMinutos: 15 },
        ],
      },
      {
        nome: 'Coleta de assinaturas',
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
    tipo: 'DOCUMENTACAO',
    prioridade: 'ALTA',
    etapas: [
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
    tipo: 'ATIVIDADE',
    prioridade: 'MEDIA',
    etapas: [
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
          { nome: 'Cadastrar empresa no DT-e / Domicílio Tributário Eletrônico estadual', obrigatorio: false, slaMinutos: 20 },
          { nome: 'Configurar acessos no sistema interno do escritório', obrigatorio: true, slaMinutos: 30 },
          { nome: 'Confirmar caixa postal e-CAC operando', obrigatorio: true, slaMinutos: 15 },
        ],
      },
    ],
  },
  {
    nome: 'Encerramento e liberação para setores mensais',
    descricao: 'Montagem do dossiê final, transferência pra rotina mensal e onboarding do cliente nos serviços contábeis recorrentes.',
    tipo: 'FIM',
    prioridade: 'ALTA',
    etapas: [
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
  console.log('🔁 Reconstrução do serviço "Constituição de Novo Cliente"\n')

  const top = await prisma.servico.findUnique({
    where: { id: TOP_LEVEL_ID },
    include: { itensDeFluxo: { select: { id: true, nome: true } } },
  })
  if (!top) {
    console.error(`❌ Top-level ${TOP_LEVEL_ID} não encontrado.`)
    process.exit(1)
  }
  console.log(`✓ Top-level encontrado: ${top.nome}`)
  console.log(`  Itens existentes a remover: ${top.itensDeFluxo.length}\n`)

  const idsAntigos = top.itensDeFluxo.map(i => i.id)
  if (idsAntigos.length > 0) {
    // Verifica se há execuções ativas — se sim, abortamos pra não quebrar histórico
    const execCount = await prisma.servicoExecucao.count({ where: { servicoId: { in: idsAntigos } } })
    if (execCount > 0) {
      console.error(`❌ Existem ${execCount} execução(ões) ligadas aos itens antigos. Abortando pra preservar histórico.`)
      console.error('   Pra reconstruir mesmo assim, finalize/desative as execuções primeiro.')
      process.exit(1)
    }

    console.log('🗑️  Apagando estrutura antiga (cascata controlada)...')
    // 1. Encadeamentos onde antigos são origem OU destino
    const encDel = await prisma.servicoEncadeamento.deleteMany({
      where: {
        OR: [
          { servicoOrigemId:  { in: idsAntigos } },
          { servicoDestinoId: { in: idsAntigos } },
        ],
      },
    })
    console.log(`   - encadeamentos removidos: ${encDel.count}`)

    // 2. Passos das etapas dos antigos
    const etapasAntigas = await prisma.servicoEtapa.findMany({
      where: { servicoId: { in: idsAntigos } },
      select: { id: true },
    })
    const etapaIds = etapasAntigas.map(e => e.id)
    if (etapaIds.length > 0) {
      const passoDel = await prisma.servicoPasso.deleteMany({ where: { etapaId: { in: etapaIds } } })
      console.log(`   - passos removidos: ${passoDel.count}`)
      const etapaDel = await prisma.servicoEtapa.deleteMany({ where: { id: { in: etapaIds } } })
      console.log(`   - etapas removidas: ${etapaDel.count}`)
    }

    // 3. Layouts salvos dos antigos (cada antigo poderia ter sido raiz uma vez)
    await prisma.servicoFluxoLayout.deleteMany({
      where: { OR: [{ raizId: { in: idsAntigos } }, { raizId: TOP_LEVEL_ID }, { nodeId: { in: idsAntigos } }] },
    })

    // 4. Servicos antigos (hard delete agora, sem refs)
    const servDel = await prisma.servico.deleteMany({ where: { id: { in: idsAntigos } } })
    console.log(`   - serviços FLUXO removidos: ${servDel.count}\n`)
  }

  // Garante que o top-level esteja com os campos atualizados
  await prisma.servico.update({
    where: { id: TOP_LEVEL_ID },
    data: {
      descricao: 'Serviço extra de constituição completa de novo cliente — abre CNPJ, valida inscrições, prepara dossiê e libera para os setores mensais.',
      categoriaServico: 'EXTRA',
      prioridadePadrao: 'ALTA',
      tipo: 'ATIVIDADE',
      ativo: true,
    },
  })
  console.log('✓ Top-level atualizado\n')

  // ── Cria os 11 itens em ordem ────────────────────────────────────────
  console.log('🏗️  Criando 11 itens de fluxo...\n')
  const criados: Array<{ id: string; nome: string; slaMin: number }> = []
  for (let i = 0; i < ITENS.length; i++) {
    const def = ITENS[i]
    const servico = await prisma.servico.create({
      data: {
        nome: def.nome,
        descricao: def.descricao,
        tipo: def.tipo,
        prioridadePadrao: def.prioridade ?? 'MEDIA',
        categoriaServico: 'FLUXO',
        servicoPaiId: TOP_LEVEL_ID,
        disponivelOrcamento: false,
        recorrenteMensal: false,
        empresaId: top.empresaId,
        ativo: true,
      },
    })

    let slaServicoMin = 0
    for (let ei = 0; ei < def.etapas.length; ei++) {
      const etapa = await prisma.servicoEtapa.create({
        data: {
          servicoId: servico.id,
          nome: def.etapas[ei].nome,
          ordem: ei,
          slaHoras: 0,
        },
      })
      let slaEtapaMin = 0
      for (let pi = 0; pi < def.etapas[ei].passos.length; pi++) {
        const p = def.etapas[ei].passos[pi]
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
      }
      await prisma.servicoEtapa.update({
        where: { id: etapa.id },
        data: { slaHoras: Math.max(0, Math.round(slaEtapaMin / 60)) },
      })
      slaServicoMin += slaEtapaMin
    }
    await prisma.servico.update({
      where: { id: servico.id },
      data: { slaHoras: Math.max(0, Math.round(slaServicoMin / 60)) },
    })
    criados.push({ id: servico.id, nome: servico.nome, slaMin: slaServicoMin })
    console.log(`  ${(i + 1).toString().padStart(2, ' ')}. ${def.nome.padEnd(50, ' ')} [${def.tipo}]  SLA ${(slaServicoMin / 60).toFixed(1)}h`)
  }

  // ── Encadeamentos sequenciais ────────────────────────────────────────
  console.log('\n🔗 Criando encadeamentos sequenciais...')
  for (let i = 0; i < criados.length - 1; i++) {
    await prisma.servicoEncadeamento.create({
      data: {
        servicoOrigemId: criados[i].id,
        servicoDestinoId: criados[i + 1].id,
        ordem: 0,
        obrigatorio: true,
        iniciaAuto: true,
        herdaResponsavel: true,
      },
    })
  }
  console.log(`✓ ${criados.length - 1} encadeamentos criados\n`)

  // ── SLA total do top-level ───────────────────────────────────────────
  const slaTotalMin = criados.reduce((a, c) => a + c.slaMin, 0)
  await prisma.servico.update({
    where: { id: TOP_LEVEL_ID },
    data: { slaHoras: Math.max(0, Math.round(slaTotalMin / 60)) },
  })

  console.log(`✅ Reconstrução concluída`)
  console.log(`   Itens: ${criados.length}`)
  console.log(`   Etapas: ${ITENS.reduce((a, x) => a + x.etapas.length, 0)}`)
  console.log(`   Passos: ${ITENS.reduce((a, x) => a + x.etapas.reduce((b, e) => b + e.passos.length, 0), 0)}`)
  console.log(`   SLA total: ${(slaTotalMin / 60).toFixed(1)}h (${slaTotalMin} min)`)
  console.log(`\n   Abra /servicos/${TOP_LEVEL_ID} e veja a aba Fluxo.`)
}

main().catch(err => { console.error('❌ Erro:', err); process.exit(1) }).finally(() => prisma.$disconnect())
