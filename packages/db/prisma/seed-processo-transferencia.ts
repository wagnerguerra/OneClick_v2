// Seed: macro-processo "Transferência de Contabilidade"
// ================================================================
// Cria 5 templates de serviço + 4 encadeamentos formando a árvore:
//
//   1. Transferência de Contabilidade  (raiz — dispara cadeia)
//      └─> 2. Onboarding do Cliente               (obrigatório, auto)
//           ├─> 3. Análise Inicial Tributária     (obrigatório, auto)
//           │    └─> 5. Pesquisa Pós-Onboard      (obrigatório, auto)
//           └─> 4. Capacitação Inicial            (opcional, manual)
//
// Uso típico: cliente vindo de outra contabilidade aprova um orçamento
// com o item "Transferência de Contabilidade". O sistema cria o Processo,
// roda a transferência (formal), depois Onboarding, depois análise tributária
// em paralelo com capacitação opcional, fechando com pesquisa de satisfação.
//
// Executar:
//   pnpm --filter @saas/db exec tsx prisma/seed-processo-transferencia.ts
//
// Idempotente: usa upsert por nome do serviço; encadeamentos por (origem, destino).

import { PrismaClient } from '../src/generated/client'

const prisma = new PrismaClient()

type SeedPasso = {
  nome: string
  slaHoras?: number
  obrigatorio?: boolean
  textoOrientativo?: string
}
type SeedEtapa = { nome: string; slaHoras?: number; passos: SeedPasso[] }
type SeedServico = {
  nome: string
  categoria: string
  descricao: string
  slaHoras: number
  valorPadrao?: number
  prioridadePadrao?: 'BAIXA' | 'MEDIA' | 'ALTA' | 'URGENTE'
  disponivelOrcamento?: boolean
  recorrenteMensal?: boolean
  etapas: SeedEtapa[]
}

const servicos: SeedServico[] = [
  // ════════════════════════════════════════════════════════════════════
  // 1. TRANSFERÊNCIA DE CONTABILIDADE — raiz
  // ════════════════════════════════════════════════════════════════════
  {
    nome: 'Transferência de Contabilidade',
    categoria: 'Legalização',
    descricao: 'Formalização da transferência de cliente vindo de outra contabilidade — comunicação, documentação e atualização cadastral.',
    slaHoras: 120,
    valorPadrao: 850,
    prioridadePadrao: 'ALTA',
    disponivelOrcamento: true,
    etapas: [
      {
        nome: 'Documentação inicial',
        slaHoras: 24,
        passos: [
          { nome: 'Solicitar carta de transferência ao cliente', slaHoras: 4, obrigatorio: true },
          { nome: 'Receber e arquivar procuração para representação', slaHoras: 8, obrigatorio: true },
          { nome: 'Verificar pendências fiscais (CND federal, estadual, municipal, FGTS)', slaHoras: 8 },
          { nome: 'Conferir Caixa Postal e-CAC e DT-e do cliente', slaHoras: 4 },
        ],
      },
      {
        nome: 'Comunicação com contabilidade anterior',
        slaHoras: 48,
        passos: [
          { nome: 'Enviar ofício formal solicitando transferência', slaHoras: 4, obrigatorio: true },
          { nome: 'Solicitar última declaração entregue (ECD/ECF/DCTFWeb)', slaHoras: 8, obrigatorio: true },
          { nome: 'Solicitar planilhas e balancetes dos últimos 5 anos', slaHoras: 16 },
          { nome: 'Solicitar arquivos da folha de pagamento (eSocial, holerites)', slaHoras: 16 },
          { nome: 'Receber e validar integridade dos arquivos', slaHoras: 24, obrigatorio: true },
        ],
      },
      {
        nome: 'Atualização cadastral',
        slaHoras: 48,
        passos: [
          { nome: 'Atualizar contador responsável na Receita Federal (e-CAC)', slaHoras: 16, obrigatorio: true },
          { nome: 'Atualizar contador na Junta Comercial (JUCEES)', slaHoras: 16, obrigatorio: true },
          { nome: 'Atualizar contador na SEFAZ-ES', slaHoras: 16 },
          { nome: 'Atualizar contador na prefeitura (ISS)', slaHoras: 16 },
          { nome: 'Confirmar com o cliente que recebimentos chegaram nos novos canais', slaHoras: 8, obrigatorio: true },
        ],
      },
    ],
  },

  // ════════════════════════════════════════════════════════════════════
  // 2. ONBOARDING DO CLIENTE — sucessor obrigatório auto
  // ════════════════════════════════════════════════════════════════════
  {
    nome: 'Onboarding do Cliente',
    categoria: 'Atendimento',
    descricao: 'Acolhimento de novo cliente — apresentação da equipe, cadastro nos sistemas e integração técnica.',
    slaHoras: 72,
    valorPadrao: 0,
    prioridadePadrao: 'MEDIA',
    disponivelOrcamento: true,
    etapas: [
      {
        nome: 'Acolhimento',
        slaHoras: 16,
        passos: [
          { nome: 'Agendar reunião de boas-vindas', slaHoras: 4, obrigatorio: true },
          { nome: 'Apresentar equipe e responsáveis por área (Contábil, Fiscal, Trabalhista)', slaHoras: 4, obrigatorio: true },
          { nome: 'Explicar fluxo de comunicação (canais, prazos, SLAs)', slaHoras: 4 },
          { nome: 'Entregar manual de relacionamento ao cliente', slaHoras: 4 },
        ],
      },
      {
        nome: 'Cadastro nos sistemas internos',
        slaHoras: 24,
        passos: [
          { nome: 'Cadastrar cliente no sistema interno (este SaaS)', slaHoras: 4, obrigatorio: true },
          { nome: 'Cadastrar nos sistemas fiscais (Receita, SEFAZ, prefeitura)', slaHoras: 8 },
          { nome: 'Configurar acesso ao portal do cliente (login + permissões)', slaHoras: 4, obrigatorio: true },
          { nome: 'Configurar área contratada e responsáveis', slaHoras: 8 },
        ],
      },
      {
        nome: 'Integração técnica',
        slaHoras: 32,
        passos: [
          { nome: 'Configurar integração contábil (SCI / Omie / outro ERP)', slaHoras: 16 },
          { nome: 'Configurar acesso e-CAC com certificado digital', slaHoras: 8, obrigatorio: true },
          { nome: 'Habilitar consulta automática de Caixa Postal e-CAC', slaHoras: 4 },
          { nome: 'Configurar DT-e SEFAZ-ES (se contribuinte ICMS)', slaHoras: 4 },
        ],
      },
    ],
  },

  // ════════════════════════════════════════════════════════════════════
  // 3. ANÁLISE INICIAL TRIBUTÁRIA — sucessor obrigatório auto
  // ════════════════════════════════════════════════════════════════════
  {
    nome: 'Análise Inicial Tributária',
    categoria: 'Fiscal',
    descricao: 'Diagnóstico tributário do novo cliente e plano de ação para os primeiros 90 dias.',
    slaHoras: 80,
    valorPadrao: 0,
    prioridadePadrao: 'MEDIA',
    disponivelOrcamento: true,
    etapas: [
      {
        nome: 'Diagnóstico',
        slaHoras: 40,
        passos: [
          { nome: 'Verificar regime tributário atual e adequação ao porte', slaHoras: 8, obrigatorio: true },
          { nome: 'Análise dos CNAEs ativos e secundários', slaHoras: 8 },
          { nome: 'Identificar benefícios fiscais aplicáveis (Simples, presunção, etc)', slaHoras: 8 },
          { nome: 'Verificar obrigações acessórias pendentes', slaHoras: 8, obrigatorio: true },
          { nome: 'Levantar débitos fiscais (CND federal, estadual, municipal)', slaHoras: 8 },
        ],
      },
      {
        nome: 'Plano de ação',
        slaHoras: 40,
        passos: [
          { nome: 'Elaborar relatório do diagnóstico', slaHoras: 16, obrigatorio: true },
          { nome: 'Apresentar plano de ação ao cliente em reunião', slaHoras: 8, obrigatorio: true },
          { nome: 'Definir cronograma de revisões e regularizações', slaHoras: 8 },
          { nome: 'Documentar decisões e arquivar no histórico do cliente', slaHoras: 8, obrigatorio: true },
        ],
      },
    ],
  },

  // ════════════════════════════════════════════════════════════════════
  // 4. CAPACITAÇÃO INICIAL — sucessor opcional manual
  // ════════════════════════════════════════════════════════════════════
  {
    nome: 'Capacitação Inicial do Cliente',
    categoria: 'Atendimento',
    descricao: 'Treinamento operacional para o cliente usar o portal e enviar documentos corretamente.',
    slaHoras: 48,
    valorPadrao: 0,
    prioridadePadrao: 'BAIXA',
    disponivelOrcamento: true,
    etapas: [
      {
        nome: 'Treinamento',
        slaHoras: 48,
        passos: [
          { nome: 'Treinar envio de documentos pelo portal', slaHoras: 8, obrigatorio: true },
          { nome: 'Treinar consulta de notas, guias e holerites', slaHoras: 8 },
          { nome: 'Explicar prazos fiscais (DAS, DCTFWeb, eSocial)', slaHoras: 8, obrigatorio: true },
          { nome: 'Demonstrar área de comunicação (mensagens, helpdesk)', slaHoras: 8 },
          { nome: 'Confirmar com o cliente que se sente confortável com as ferramentas', slaHoras: 8 },
          { nome: 'Registrar pontos de dúvida para acompanhamento', slaHoras: 8 },
        ],
      },
    ],
  },

  // ════════════════════════════════════════════════════════════════════
  // 5. PESQUISA DE SATISFAÇÃO PÓS-ONBOARD — sucessor obrigatório auto
  // ════════════════════════════════════════════════════════════════════
  {
    nome: 'Pesquisa de Satisfação Pós-Onboard',
    categoria: 'Atendimento',
    descricao: 'Coleta de feedback NPS após onboarding completo e análise inicial — fecha o ciclo de boas-vindas.',
    slaHoras: 72,
    valorPadrao: 0,
    prioridadePadrao: 'BAIXA',
    disponivelOrcamento: true,
    etapas: [
      {
        nome: 'Pesquisa',
        slaHoras: 72,
        passos: [
          { nome: 'Enviar pesquisa NPS ao cliente', slaHoras: 4, obrigatorio: true },
          { nome: 'Acompanhar prazo de resposta (até 7 dias)', slaHoras: 24 },
          { nome: 'Registrar nota e comentários no histórico do cliente', slaHoras: 4, obrigatorio: true },
          { nome: 'Encaminhar feedback negativo para gestão (se NPS <= 6)', slaHoras: 8 },
          { nome: 'Agradecer pelo feedback e marcar acompanhamento de 30 dias', slaHoras: 8 },
        ],
      },
    ],
  },
]

// ── Encadeamentos: arestas do DAG ────────────────────────────────
type SeedEnc = {
  origem: string
  destino: string
  ordem?: number
  iniciaAuto?: boolean
  obrigatorio?: boolean
  herdaResponsavel?: boolean
  observacao?: string
}

const encadeamentos: SeedEnc[] = [
  {
    origem: 'Transferência de Contabilidade',
    destino: 'Onboarding do Cliente',
    ordem: 0,
    iniciaAuto: true,
    obrigatorio: true,
    herdaResponsavel: true,
    observacao: 'Concluída a transferência formal, dispara onboarding automaticamente.',
  },
  {
    origem: 'Onboarding do Cliente',
    destino: 'Análise Inicial Tributária',
    ordem: 0,
    iniciaAuto: true,
    obrigatorio: true,
    herdaResponsavel: true,
    observacao: 'Após onboarding, equipe fiscal faz diagnóstico tributário inicial.',
  },
  {
    origem: 'Onboarding do Cliente',
    destino: 'Capacitação Inicial do Cliente',
    ordem: 1,
    iniciaAuto: false,
    obrigatorio: false,
    herdaResponsavel: true,
    observacao: 'Capacitação é opcional — gestor decide se cliente quer/precisa do treinamento.',
  },
  {
    origem: 'Análise Inicial Tributária',
    destino: 'Pesquisa de Satisfação Pós-Onboard',
    ordem: 0,
    iniciaAuto: true,
    obrigatorio: true,
    herdaResponsavel: false, // pesquisa é feita por outra equipe (atendimento)
    observacao: 'Fecha o ciclo de boas-vindas com pesquisa de satisfação NPS.',
  },
]

// ────────────────────────────────────────────────────────────────────
async function main() {
  console.log('Seed: macro-processo "Transferência de Contabilidade"\n')

  // 1) Upsert dos servicos
  const servicoIdByName = new Map<string, string>()
  let criados = 0, atualizados = 0
  for (const s of servicos) {
    const existing = await prisma.servico.findFirst({ where: { nome: s.nome, empresaId: null } })
    const data = {
      nome: s.nome,
      categoria: s.categoria,
      descricao: s.descricao,
      slaHoras: s.slaHoras,
      prioridadePadrao: (s.prioridadePadrao ?? 'MEDIA') as any,
      ativo: true,
      empresaId: null,
    }
    let servico
    if (existing) {
      servico = await prisma.servico.update({ where: { id: existing.id }, data })
      await prisma.servicoEtapa.deleteMany({ where: { servicoId: servico.id } })
      atualizados++
    } else {
      servico = await prisma.servico.create({ data })
      criados++
    }
    await prisma.$executeRawUnsafe(
      `UPDATE servicos SET valor_padrao = $1, disponivel_orcamento = $2, recorrente_mensal = $3 WHERE id = $4`,
      s.valorPadrao ?? null,
      s.disponivelOrcamento ?? true,
      s.recorrenteMensal ?? false,
      servico.id,
    )
    for (let ei = 0; ei < s.etapas.length; ei++) {
      const et = s.etapas[ei]!
      const etapa = await prisma.servicoEtapa.create({
        data: { servicoId: servico.id, nome: et.nome, ordem: ei, slaHoras: et.slaHoras ?? null },
      })
      for (let pi = 0; pi < et.passos.length; pi++) {
        const p = et.passos[pi]!
        await prisma.servicoPasso.create({
          data: {
            etapaId: etapa.id,
            nome: p.nome,
            ordem: pi,
            obrigatorio: p.obrigatorio ?? true,
            slaHoras: p.slaHoras ?? null,
            textoOrientativo: p.textoOrientativo ?? null,
          },
        })
      }
    }
    servicoIdByName.set(s.nome, servico.id)
    const totalPassos = s.etapas.reduce((acc, e) => acc + e.passos.length, 0)
    console.log(
      `  ${existing ? 'UPD' : 'NEW'}  ${s.nome.padEnd(48)}  SLA ${String(s.slaHoras).padStart(4)}h  ` +
      `${s.etapas.length} etapas / ${totalPassos} passos`,
    )
  }

  // 2) Upsert dos encadeamentos (DAG)
  console.log('\nEncadeamentos:')
  let encNovos = 0, encAtualizados = 0
  for (const e of encadeamentos) {
    const origemId = servicoIdByName.get(e.origem)
    const destinoId = servicoIdByName.get(e.destino)
    if (!origemId || !destinoId) {
      console.warn(`  SKIP  ${e.origem} → ${e.destino} (template não encontrado)`)
      continue
    }
    const existing = await prisma.servicoEncadeamento.findUnique({
      where: { servicoOrigemId_servicoDestinoId: { servicoOrigemId: origemId, servicoDestinoId: destinoId } },
    })
    const data = {
      servicoOrigemId: origemId,
      servicoDestinoId: destinoId,
      ordem: e.ordem ?? 0,
      iniciaAuto: e.iniciaAuto ?? true,
      obrigatorio: e.obrigatorio ?? true,
      herdaResponsavel: e.herdaResponsavel ?? true,
      observacao: e.observacao ?? null,
    }
    if (existing) {
      await prisma.servicoEncadeamento.update({ where: { id: existing.id }, data })
      encAtualizados++
    } else {
      await prisma.servicoEncadeamento.create({ data })
      encNovos++
    }
    const flags = [
      e.obrigatorio === false ? 'opcional' : 'obrigatório',
      e.iniciaAuto === false ? 'manual' : 'auto',
    ].join('+')
    console.log(`  ${existing ? 'UPD' : 'NEW'}  ${e.origem.padEnd(38)} → ${e.destino.padEnd(38)} (${flags})`)
  }

  console.log(
    `\nResumo:\n` +
    `  Templates: ${criados} criados, ${atualizados} atualizados, ${servicos.length} total\n` +
    `  Encadeamentos: ${encNovos} novos, ${encAtualizados} atualizados, ${encadeamentos.length} total\n`,
  )
  console.log('Pronto. Vá em /servicos para ver os templates e em /faq/processos para o passo-a-passo.')

  await prisma.$disconnect()
}

main().catch(e => {
  console.error(e)
  process.exit(1)
})
