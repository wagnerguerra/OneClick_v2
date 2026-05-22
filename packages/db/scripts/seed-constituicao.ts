/**
 * Seed: Fluxo "Constituição de novo cliente" — FLUXO 1 (Novo CNPJ).
 *
 * Cria 11 Servicos encadeados via ServicoEncadeamento, cada um com etapas/passos.
 *  - ATIVIDADE: ações operacionais
 *  - DOCUMENTACAO: fases puramente documentais (coleta/elaboração)
 *  - DECISAO: pontos de decisão (caminho do processo)
 *  - FIM: encerramento e handoff
 *
 * Uso: pnpm --filter @saas/db exec tsx scripts/seed-constituicao.ts
 */
import { prisma } from '../src/client'

type PassoSpec = {
  nome: string
  slaMin?: number
  textoOrientativo?: string
}
type EtapaSpec = { nome: string; passos: PassoSpec[] }
type ServicoSpec = {
  nome: string
  descricao: string
  tipo: 'ATIVIDADE' | 'DOCUMENTACAO' | 'DECISAO' | 'INICIO' | 'FIM'
  etapas: EtapaSpec[]
}

const AREA = 'Legalização'
const CATEGORIA = AREA

const SERVICOS: ServicoSpec[] = [
  // 1. COLETA DE INFORMAÇÕES INICIAIS
  {
    nome: '1. Coleta de informações iniciais',
    descricao: 'Levantamento inicial dos dados do cliente para análise da viabilidade do processo de constituição.',
    tipo: 'ATIVIDADE',
    etapas: [{
      nome: 'Dados do cliente',
      passos: [
        { nome: 'Coletar dados dos sócios', slaMin: 30 },
        { nome: 'Identificar a atividade pretendida', slaMin: 15 },
        { nome: 'Levantar o endereço da sede', slaMin: 15 },
        { nome: 'Definir regime tributário previsto', slaMin: 30 },
        { nome: 'Verificar existência de funcionários', slaMin: 10 },
        { nome: 'Classificar tipo de operação (comércio / serviço / indústria etc.)', slaMin: 15 },
        { nome: 'Apurar necessidade de inscrição estadual / municipal', slaMin: 20 },
        { nome: 'Apurar necessidade de licenças', slaMin: 20 },
      ],
    }],
  },

  // 2. ANÁLISE TÉCNICA DA ATIVIDADE
  {
    nome: '2. Análise técnica da atividade',
    descricao: 'Análise dos enquadramentos legais a partir da atividade pretendida.',
    tipo: 'ATIVIDADE',
    etapas: [{
      nome: 'Enquadramentos e exigências',
      passos: [
        { nome: 'Definir CNAEs da atividade', slaMin: 30 },
        { nome: 'Verificar se há atividade impeditiva', slaMin: 30 },
        { nome: 'Analisar necessidade de Inscrição Estadual', slaMin: 20 },
        { nome: 'Analisar necessidade de Inscrição Municipal', slaMin: 20 },
        { nome: 'Analisar alvará / CBMES / Vigilância / Ambiental', slaMin: 60 },
      ],
    }],
  },

  // 3. DEFINIÇÃO DO CAMINHO DO PROCESSO (DECISÃO)
  {
    nome: '3. Definição do caminho do processo',
    descricao: 'Ponto de decisão — define qual fluxo será seguido (constituição, transferência, alteração etc.).',
    tipo: 'DECISAO',
    etapas: [{
      nome: 'Decisão',
      passos: [
        { nome: 'Confirmar fluxo: Constituição de novo CNPJ', slaMin: 15, textoOrientativo: 'Se for outro caminho (transferência, alteração), encaminhar para o fluxo correspondente.' },
      ],
    }],
  },

  // 4. REUNIÃO / CHECKLIST TÉCNICO DE ABERTURA
  {
    nome: '4. Reunião / Checklist técnico de abertura',
    descricao: 'Reunião com o cliente para fechar os parâmetros formais da constituição.',
    tipo: 'ATIVIDADE',
    etapas: [{
      nome: 'Definições contratuais',
      passos: [
        { nome: 'Definir natureza jurídica', slaMin: 20 },
        { nome: 'Definir sócios e administração', slaMin: 30 },
        { nome: 'Definir capital social', slaMin: 20 },
        { nome: 'Definir razão social', slaMin: 15 },
        { nome: 'Definir nome fantasia', slaMin: 15 },
        { nome: 'Confirmar endereço da sede', slaMin: 10 },
        { nome: 'Redigir objeto social', slaMin: 45 },
        { nome: 'Confirmar CNAEs', slaMin: 15 },
      ],
    }],
  },

  // 5. COLETA DOCUMENTAL (DOCUMENTACAO)
  {
    nome: '5. Coleta documental',
    descricao: 'Solicitação e recebimento dos documentos necessários para o protocolo.',
    tipo: 'DOCUMENTACAO',
    etapas: [{
      nome: 'Documentos do cliente',
      passos: [
        { nome: 'Coletar documentos pessoais dos sócios (RG/CPF, estado civil, profissão)', slaMin: 60 },
        { nome: 'Coletar comprovante de endereço residencial dos sócios', slaMin: 30 },
        { nome: 'Coletar IPTU / inscrição imobiliária do imóvel-sede', slaMin: 30 },
        { nome: 'Coletar contrato de locação ou autorização de uso do imóvel', slaMin: 30 },
        { nome: 'Coletar / orientar emissão de certificado digital ou gov.br (se necessário)', slaMin: 60 },
      ],
    }],
  },

  // 6. CONSULTA DE VIABILIDADE
  {
    nome: '6. Consulta de viabilidade',
    descricao: 'Consulta prévia junto à Junta Comercial / Prefeitura para validar nome, endereço e atividade.',
    tipo: 'ATIVIDADE',
    etapas: [
      {
        nome: 'Consultas',
        passos: [
          { nome: 'Consultar nome empresarial', slaMin: 30 },
          { nome: 'Consultar endereço', slaMin: 30 },
          { nome: 'Consultar atividade permitida no local (zoneamento)', slaMin: 60 },
          { nome: 'Consultar forma de atuação', slaMin: 30 },
        ],
      },
      {
        nome: 'Resultado da viabilidade',
        passos: [
          {
            nome: 'Avaliar resultado: aprovada → prosseguir; reprovada → corrigir e reenviar',
            slaMin: 20,
            textoOrientativo: 'Em caso de reprovação, retornar à etapa de definições contratuais para ajustar nome, endereço ou atividade antes de reenviar.',
          },
        ],
      },
    ],
  },

  // 7. ELABORAÇÃO DO ATO CONSTITUTIVO (DOCUMENTACAO)
  {
    nome: '7. Elaboração do ato constitutivo',
    descricao: 'Redação do contrato social / ato constitutivo conforme parâmetros aprovados.',
    tipo: 'DOCUMENTACAO',
    etapas: [{
      nome: 'Ato constitutivo',
      passos: [
        { nome: 'Redigir contrato social / ato constitutivo', slaMin: 120 },
        { nome: 'Aplicar enquadramento ME / EPP (se aplicável)', slaMin: 20 },
        { nome: 'Incluir cláusulas societárias específicas', slaMin: 45 },
        { nome: 'Validar compatibilidade do objeto social', slaMin: 30 },
      ],
    }],
  },

  // 8. REGISTRO NA JUNTA COMERCIAL (ATIVIDADE)
  {
    nome: '8. Registro na Junta Comercial',
    descricao: 'DBE/REDESIM, conferência, assinaturas, protocolo na JUCEES e acompanhamento até deferimento.',
    tipo: 'ATIVIDADE',
    etapas: [
      {
        nome: 'Geração do DBE / REDESIM',
        passos: [{ nome: 'Gerar DBE no REDESIM', slaMin: 60 }],
      },
      {
        nome: 'Conferência dos dados',
        passos: [
          { nome: 'Conferir nome empresarial', slaMin: 10 },
          { nome: 'Conferir endereço', slaMin: 10 },
          { nome: 'Conferir CNAEs', slaMin: 10 },
          { nome: 'Conferir QSA (quadro societário)', slaMin: 10 },
          { nome: 'Conferir capital social', slaMin: 10 },
          { nome: 'Conferir natureza jurídica', slaMin: 10 },
          { nome: 'Conferir porte da empresa', slaMin: 10 },
        ],
      },
      {
        nome: 'Coleta de assinaturas',
        passos: [{ nome: 'Coletar assinaturas dos sócios e do contador', slaMin: 60 }],
      },
      {
        nome: 'Protocolo',
        passos: [{ nome: 'Protocolar processo na JUCEES / SIMPLIFICA-ES', slaMin: 45 }],
      },
      {
        nome: 'Acompanhamento',
        passos: [
          {
            nome: 'Acompanhar até deferimento; em caso de exigência, corrigir e reapresentar',
            slaMin: 30,
            textoOrientativo: 'Se o processo for indeferido, registrar o motivo da exigência, corrigir e voltar ao protocolo.',
          },
        ],
      },
    ],
  },

  // 9. PÓS-REGISTRO — DOCUMENTOS E INSCRIÇÕES (DOCUMENTACAO)
  {
    nome: '9. Pós-registro — documentos e inscrições',
    descricao: 'Baixa dos documentos registrados e validação das inscrições/licenças.',
    tipo: 'DOCUMENTACAO',
    etapas: [
      {
        nome: 'Documentos registrados',
        passos: [
          { nome: 'Baixar contrato social registrado', slaMin: 15 },
          { nome: 'Emitir cartão CNPJ', slaMin: 10 },
          { nome: 'Anotar NIRE / número de registro', slaMin: 10 },
          { nome: 'Salvar comprovantes do processo', slaMin: 15 },
        ],
      },
      {
        nome: 'Inscrições e licenças',
        passos: [
          { nome: 'Validar Inscrição Estadual', slaMin: 30 },
          { nome: 'Validar Inscrição Municipal', slaMin: 30 },
          { nome: 'Validar alvará', slaMin: 45 },
          { nome: 'Validar licenças obrigatórias (CBMES / Vigilância / Ambiental)', slaMin: 60 },
        ],
      },
    ],
  },

  // 10. PROCURAÇÕES E ACESSOS (ATIVIDADE)
  {
    nome: '10. Procurações e acessos',
    descricao: 'Geração das procurações eletrônicas e configuração de acessos sob nossa custódia.',
    tipo: 'ATIVIDADE',
    etapas: [{
      nome: 'Procurações',
      passos: [
        { nome: 'Solicitar procuração e-CAC (Receita Federal)', slaMin: 30 },
        { nome: 'Solicitar procuração Sefaz/ES', slaMin: 30 },
        { nome: 'Solicitar acesso na Prefeitura', slaMin: 30 },
        { nome: 'Habilitar acesso Simples Nacional', slaMin: 20 },
        { nome: 'Habilitar DTE (Domicílio Tributário Eletrônico)', slaMin: 20 },
        { nome: 'Configurar custódia do certificado digital', slaMin: 30 },
      ],
    }],
  },

  // 11. ENCERRAMENTO E LIBERAÇÃO (FIM)
  {
    nome: '11. Encerramento e liberação para setores mensais',
    descricao: 'Montagem do dossiê final, checklist de liberação e handoff para Fiscal, Contábil, DP e Financeiro.',
    tipo: 'FIM',
    etapas: [
      {
        nome: 'Dossiê e checklist',
        passos: [
          { nome: 'Montar dossiê cadastral completo', slaMin: 60 },
          { nome: 'Emitir checklist de liberação', slaMin: 30 },
        ],
      },
      {
        nome: 'Liberação para setores mensais',
        passos: [
          { nome: 'Liberar para o setor Fiscal', slaMin: 15 },
          { nome: 'Liberar para o setor Contábil', slaMin: 15 },
          { nome: 'Liberar para o setor DP (Departamento Pessoal)', slaMin: 15 },
          { nome: 'Liberar para o setor Financeiro', slaMin: 15 },
        ],
      },
    ],
  },
]

async function main() {
  console.log('🌱 Seed do fluxo "Constituição de novo cliente" (FLUXO 1 — Novo CNPJ)\n')

  // 1) Resolve empresa e categoria (área Legalização)
  const empresa = await prisma.empresa.findFirst({ select: { id: true, razaoSocial: true } })
  if (!empresa) throw new Error('Nenhuma empresa cadastrada — crie uma antes.')
  console.log(`Empresa: ${empresa.razaoSocial}`)

  const area = await prisma.area.findFirst({ where: { name: AREA }, select: { id: true } })
  if (!area) console.warn(`⚠️  Área "${AREA}" não encontrada — serviços serão criados com categoria livre.`)

  // 2) Cria cada Servico com etapas e passos
  const createdIds: string[] = []
  for (let i = 0; i < SERVICOS.length; i++) {
    const spec = SERVICOS[i]
    const svc = await prisma.servico.create({
      data: {
        nome: spec.nome,
        descricao: spec.descricao,
        categoria: CATEGORIA,
        tipo: spec.tipo,
        prioridadePadrao: 'MEDIA',
        ativo: true,
        recorrenteMensal: false,
        disponivelOrcamento: true,
        empresaId: empresa.id,
      },
    })
    createdIds.push(svc.id)
    console.log(`  ✓ [${i + 1}/${SERVICOS.length}] ${spec.nome} (${spec.tipo})`)

    // Etapas e passos
    for (let ei = 0; ei < spec.etapas.length; ei++) {
      const et = spec.etapas[ei]
      const etapa = await prisma.servicoEtapa.create({
        data: {
          servicoId: svc.id,
          nome: et.nome,
          ordem: ei,
          slaHoras: 0, // será recalculado pelo backend conforme passos
        },
      })

      for (let pi = 0; pi < et.passos.length; pi++) {
        const p = et.passos[pi]
        await prisma.servicoPasso.create({
          data: {
            etapaId: etapa.id,
            nome: p.nome,
            ordem: pi,
            obrigatorio: true,
            slaMinutos: p.slaMin ?? null,
            textoOrientativo: p.textoOrientativo ?? null,
          },
        })
      }
    }

    // Recalcula SLA persistido do serviço somando passos × etapas
    const etapasFromDb = await prisma.servicoEtapa.findMany({
      where: { servicoId: svc.id },
      include: { passos: { select: { slaMinutos: true, slaHoras: true, dependeDoPassoId: true, id: true } } },
    })
    // Critical-path por etapa (sem deps neste seed = soma simples) → soma das etapas
    const totalMin = etapasFromDb.reduce((acc, et) => {
      const m = et.passos.reduce((a, p) => a + (p.slaMinutos ?? 0), 0)
      return acc + m
    }, 0)
    await prisma.servico.update({
      where: { id: svc.id },
      data: { slaHoras: totalMin > 0 ? Math.ceil(totalMin / 60) : null },
    })
    // Atualiza slaHoras de cada etapa
    for (const et of etapasFromDb) {
      const m = et.passos.reduce((a, p) => a + (p.slaMinutos ?? 0), 0)
      await prisma.servicoEtapa.update({
        where: { id: et.id },
        data: { slaHoras: m > 0 ? Math.ceil(m / 60) : null },
      })
    }
  }

  // 3) Cria encadeamentos sequenciais entre os 11 serviços
  console.log('\n🔗 Encadeamentos sequenciais:')
  for (let i = 0; i < createdIds.length - 1; i++) {
    await prisma.servicoEncadeamento.create({
      data: {
        servicoOrigemId: createdIds[i],
        servicoDestinoId: createdIds[i + 1],
        ordem: 0,
        iniciaAuto: true,
        obrigatorio: true,
        herdaResponsavel: true,
      },
    })
    console.log(`  → ${SERVICOS[i].nome.split(' ').slice(0, 4).join(' ')}…  ⇒  ${SERVICOS[i + 1].nome.split(' ').slice(0, 4).join(' ')}…`)
  }

  console.log(`\n✅ ${createdIds.length} serviços criados e encadeados.`)
  console.log(`   Acesse /servicos para revisar e /servicos/${createdIds[0]} pra ver o fluxo completo.`)
}

main()
  .catch(err => {
    console.error('❌ Erro no seed:', err)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
