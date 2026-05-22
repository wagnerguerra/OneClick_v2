// Seed: Tecnologia / SaaS — Lucro Presumido
// ============================================================
// 9 templates + 7 encadeamentos. Sem ICMS, com ISS, PIS/COFINS cumulativo,
// IRPJ trimestral baseado em presunção (32% para serviços), Lei do Bem opcional.
//
// Fontes: vide docs/fontes-templates-segmentos.md
// Executar: pnpm --filter @saas/db exec tsx prisma/seed-segmento-tecnologia-presumido.ts

import { PrismaClient } from '../src/generated/client'

const prisma = new PrismaClient()

type SeedPasso = { nome: string; slaHoras?: number; obrigatorio?: boolean; textoOrientativo?: string; permiteIgnorar?: boolean; recorrente?: boolean; recorrenciaTipo?: 'MENSAL' | 'TRIMESTRAL' | 'SEMESTRAL' | 'ANUAL' }
type SeedEtapa = { nome: string; slaHoras?: number; passos: SeedPasso[] }
type SeedServico = { nome: string; categoria: string; descricao: string; slaHoras: number; valorPadrao?: number; prioridadePadrao?: 'BAIXA' | 'MEDIA' | 'ALTA' | 'URGENTE'; disponivelOrcamento?: boolean; recorrenteMensal?: boolean; etapas: SeedEtapa[] }
type SeedEnc = { origem: string; destino: string; ordem?: number; iniciaAuto?: boolean; obrigatorio?: boolean; herdaResponsavel?: boolean; observacao?: string }

const servicos: SeedServico[] = [
  {
    nome: 'Onboarding Tecnologia Presumido',
    categoria: 'Legalização', descricao: 'Acolhimento de cliente Tecnologia/SaaS Presumido — diagnóstico ISS, avaliação Lei do Bem, configuração.',
    slaHoras: 64, prioridadePadrao: 'ALTA', disponivelOrcamento: false,
    etapas: [
      { nome: 'Diagnóstico', slaHoras: 32, passos: [
        { nome: 'Levantar CNAEs (geralmente 62xx-63xx)', slaHoras: 4, obrigatorio: true },
        { nome: 'Verificar ISS no município sede (alíquota e código de serviço)', slaHoras: 4, obrigatorio: true },
        { nome: 'Avaliar elegibilidade Lei do Bem (Lei 11.196/2005) — incentivo P&D', slaHoras: 8, permiteIgnorar: true },
        { nome: 'Identificar serviços exportados (imunidade ISS)', slaHoras: 4 },
        { nome: 'Definir periodicidade IRPJ trimestral', slaHoras: 4 },
        { nome: '[CONFIRMAR ESCRITÓRIO] Reunião de boas-vindas', slaHoras: 8 },
      ]},
      { nome: 'Configuração no sistema', slaHoras: 32, passos: [
        { nome: 'Cadastrar cliente', slaHoras: 4, obrigatorio: true },
        { nome: 'Vincular áreas (Fiscal, Contábil, Trabalhista)', slaHoras: 4, obrigatorio: true },
        { nome: 'Importar plano de contas para tecnologia', slaHoras: 8 },
        { nome: 'Cadastrar certificado A1', slaHoras: 8, obrigatorio: true },
        { nome: 'Habilitar Caixa Postal e-CAC', slaHoras: 4 },
        { nome: '[CONFIRMAR CLIENTE] Configurar acesso ao portal NFS-e municipal', slaHoras: 4 },
      ]},
    ],
  },
  {
    nome: 'Mensal Tecnologia Presumido',
    categoria: 'Fiscal', descricao: 'Cadeia mensal — coleta NFS-e, lançamentos, ISS, PIS/COFINS, folha + eSocial.',
    slaHoras: 160, prioridadePadrao: 'ALTA', recorrenteMensal: true, disponivelOrcamento: false,
    etapas: [
      { nome: 'Coordenação mensal', slaHoras: 160, passos: [
        { nome: 'Confirmar coleta', slaHoras: 16 },
        { nome: 'Confirmar apurações', slaHoras: 16 },
        { nome: 'Confirmar obrigações transmitidas', slaHoras: 16 },
        { nome: 'Encerrar competência', slaHoras: 8, obrigatorio: true },
      ]},
    ],
  },
  {
    nome: 'Coleta e Lançamentos Mensal Tech',
    categoria: 'Contábil', descricao: 'Recebimento de NFS-e emitidas, despesas, extratos. Lançamentos contábeis.',
    slaHoras: 32, prioridadePadrao: 'ALTA', recorrenteMensal: true, disponivelOrcamento: false,
    etapas: [
      { nome: 'Coleta', slaHoras: 16, passos: [
        { nome: '[CONFIRMAR ESCRITÓRIO] Solicitar NFS-e e documentos até dia X', slaHoras: 4, obrigatorio: true, recorrente: true, recorrenciaTipo: 'MENSAL' },
        { nome: 'Receber relatório de NFS-e emitidas no portal municipal', slaHoras: 4, obrigatorio: true },
        { nome: 'Receber extratos bancários', slaHoras: 4, obrigatorio: true },
        { nome: 'Receber NFs de despesas (quando aplicável)', slaHoras: 4 },
      ]},
      { nome: 'Lançamentos', slaHoras: 16, passos: [
        { nome: 'Lançar receitas de serviços (NFS-e)', slaHoras: 8, obrigatorio: true },
        { nome: 'Lançar despesas operacionais', slaHoras: 4 },
        { nome: 'Conciliar caixa/banco', slaHoras: 4, obrigatorio: true },
      ]},
    ],
  },
  {
    nome: 'Apuração ISS Mensal Tech',
    categoria: 'Fiscal', descricao: 'Apuração mensal do ISS — alíquotas variam por município (Vitória 2-5% para serviços tech).',
    slaHoras: 16, prioridadePadrao: 'ALTA', recorrenteMensal: true, disponivelOrcamento: false,
    etapas: [
      { nome: 'Apuração', slaHoras: 16, passos: [
        { nome: 'Apurar receita bruta de serviços do mês', slaHoras: 4, obrigatorio: true },
        { nome: 'Identificar serviços com ISS retido em fonte (deduzir)', slaHoras: 4 },
        { nome: 'Calcular ISS devido (alíquota municipal × base)', slaHoras: 4, obrigatorio: true },
        { nome: 'Gerar guia ISS no portal NFS-e da prefeitura', slaHoras: 4, obrigatorio: true, textoOrientativo: 'Vitória: dia 10 do mês seguinte; outros: variável' },
      ]},
    ],
  },
  {
    nome: 'Apuração PIS/COFINS Cumulativo Tech',
    categoria: 'Fiscal', descricao: 'PIS (0,65%) + COFINS (3%) cumulativos sobre receita bruta. Sem créditos.',
    slaHoras: 16, prioridadePadrao: 'ALTA', recorrenteMensal: true, disponivelOrcamento: false,
    etapas: [
      { nome: 'Cálculo e recolhimento', slaHoras: 16, passos: [
        { nome: 'Apurar receita bruta tributável', slaHoras: 4, obrigatorio: true },
        { nome: 'Calcular PIS (0,65%) e COFINS (3%)', slaHoras: 4, obrigatorio: true, textoOrientativo: 'Lei 9.715/1998 + 9.718/1998' },
        { nome: 'Gerar DARFs (8109 PIS / 2172 COFINS)', slaHoras: 4, obrigatorio: true, textoOrientativo: 'Vencimento dia 25 do mês seguinte' },
        { nome: 'Encaminhar guias ao cliente', slaHoras: 4 },
      ]},
    ],
  },
  {
    nome: 'Folha + eSocial + DCTFWeb Tech',
    categoria: 'Trabalhista', descricao: 'Folha mensal, eSocial e DCTFWeb consolidando débitos federais.',
    slaHoras: 32, prioridadePadrao: 'ALTA', recorrenteMensal: true, disponivelOrcamento: false,
    etapas: [
      { nome: 'Folha + eSocial', slaHoras: 24, passos: [
        { nome: '[CONFIRMAR CLIENTE] Receber variáveis até dia 25', slaHoras: 4, obrigatorio: true, recorrente: true, recorrenciaTipo: 'MENSAL' },
        { nome: 'Calcular folha + holerites', slaHoras: 8, obrigatorio: true },
        { nome: 'Transmitir eSocial S-1200/1210', slaHoras: 4, obrigatorio: true },
        { nome: 'Fechar período no eSocial', slaHoras: 4, obrigatorio: true },
        { nome: '[CONFIRMAR ESCRITÓRIO] Enviar holerites', slaHoras: 4 },
      ]},
      { nome: 'DCTFWeb e guias', slaHoras: 8, passos: [
        { nome: 'Transmitir DCTFWeb dia 15', slaHoras: 4, obrigatorio: true, textoOrientativo: 'IN RFB 2.005/2021' },
        { nome: 'Gerar DARF INSS + FGTS', slaHoras: 4, obrigatorio: true },
      ]},
    ],
  },
  {
    nome: 'EFD-Contribuições Tech',
    categoria: 'Fiscal', descricao: 'EFD-Contribuições mesmo no Presumido (cumulativo), com receita bruta consolidada.',
    slaHoras: 24, prioridadePadrao: 'ALTA', recorrenteMensal: true, disponivelOrcamento: false,
    etapas: [
      { nome: 'Geração e transmissão', slaHoras: 24, passos: [
        { nome: 'Gerar blocos com receitas consolidadas', slaHoras: 8, obrigatorio: true },
        { nome: 'Validar com PVA-Contribuições', slaHoras: 8 },
        { nome: 'Transmitir até dia 10 do 2º mês subsequente', slaHoras: 4, obrigatorio: true, textoOrientativo: 'IN RFB 1.252/2012' },
        { nome: 'Arquivar recibo', slaHoras: 4 },
      ]},
    ],
  },
  {
    nome: 'IRPJ/CSLL Trimestral Tech Presumido',
    categoria: 'Fiscal', descricao: 'Apuração trimestral pelo Lucro Presumido (32% para serviços).',
    slaHoras: 24, prioridadePadrao: 'ALTA', disponivelOrcamento: false,
    etapas: [
      { nome: 'Apuração trimestral', slaHoras: 24, passos: [
        { nome: 'Apurar receita bruta acumulada do trimestre', slaHoras: 4, obrigatorio: true },
        { nome: 'Aplicar presunção 32% (IRPJ) e 32% (CSLL para serviços)', slaHoras: 4, obrigatorio: true, textoOrientativo: 'Lei 9.249/1995' },
        { nome: 'Calcular IRPJ (15% + adicional 10% sobre excedente R$ 60k/trim)', slaHoras: 4, obrigatorio: true },
        { nome: 'Calcular CSLL (9%)', slaHoras: 4, obrigatorio: true },
        { nome: 'Gerar DARFs (2089 IRPJ Tri / 2372 CSLL Tri)', slaHoras: 4, obrigatorio: true, textoOrientativo: 'Vencimento último dia útil do mês seguinte ao trimestre' },
        { nome: 'Encaminhar ao cliente', slaHoras: 4 },
      ]},
    ],
  },
  {
    nome: 'Anual Tech Presumido',
    categoria: 'Contábil', descricao: 'Cadeia anual — encerramento, ECD, ECF, distribuição de lucros.',
    slaHoras: 240, prioridadePadrao: 'ALTA', disponivelOrcamento: false,
    etapas: [
      { nome: 'Coordenação', slaHoras: 240, passos: [
        { nome: 'Confirmar encerramento, ECD, ECF', slaHoras: 24, obrigatorio: true },
        { nome: 'Avaliar distribuição de lucros isenta', slaHoras: 8 },
        { nome: 'Encerrar ciclo', slaHoras: 8, obrigatorio: true },
      ]},
    ],
  },
  {
    nome: 'Encerramento + ECD + ECF Tech',
    categoria: 'Fiscal', descricao: 'Encerramento contábil + ECD + ECF do exercício Presumido.',
    slaHoras: 160, prioridadePadrao: 'ALTA', disponivelOrcamento: false,
    etapas: [
      { nome: 'Encerramento', slaHoras: 32, passos: [
        { nome: 'Conferir provisões e ajustes', slaHoras: 8, obrigatorio: true },
        { nome: 'Apurar resultado do exercício', slaHoras: 8, obrigatorio: true },
        { nome: 'Lançar IRPJ + CSLL anuais', slaHoras: 8, obrigatorio: true },
        { nome: 'Gerar Balanço + DRE', slaHoras: 8, obrigatorio: true },
      ]},
      { nome: 'ECD', slaHoras: 64, passos: [
        { nome: 'Gerar ECD', slaHoras: 24, obrigatorio: true },
        { nome: 'Validar com PVA-ECD', slaHoras: 8 },
        { nome: '[CONFIRMAR CLIENTE] Coletar assinaturas digitais', slaHoras: 8, obrigatorio: true },
        { nome: 'Transmitir até último dia útil de junho', slaHoras: 8, obrigatorio: true, textoOrientativo: 'IN RFB 2.003/2021' },
        { nome: 'Registrar livros na Junta Comercial', slaHoras: 8 },
        { nome: 'Arquivar recibo', slaHoras: 8 },
      ]},
      { nome: 'ECF', slaHoras: 64, passos: [
        { nome: 'Importar dados da ECD', slaHoras: 8, obrigatorio: true },
        { nome: 'Apurar e-LALUR (presumido tem LALUR simplificado)', slaHoras: 16 },
        { nome: 'Validar com PVA-ECF', slaHoras: 8 },
        { nome: '[CONFIRMAR CLIENTE] Assinaturas + transmissão até último dia útil de julho', slaHoras: 16, obrigatorio: true, textoOrientativo: 'IN RFB 2.004/2021' },
        { nome: 'Arquivar recibo', slaHoras: 8 },
        { nome: '[CONFIRMAR ESCRITÓRIO] Encaminhar resumo ao cliente', slaHoras: 8 },
      ]},
    ],
  },
  {
    nome: 'Avaliação Lei do Bem (Tech)',
    categoria: 'Fiscal', descricao: 'Avaliação anual de elegibilidade ao incentivo Lei do Bem (Lei 11.196/2005) para empresas Tech com investimento em P&D.',
    slaHoras: 40, prioridadePadrao: 'BAIXA', disponivelOrcamento: false,
    etapas: [
      { nome: 'Avaliação e formalização', slaHoras: 40, passos: [
        { nome: 'Verificar regularidade fiscal (CND federal e CADIN)', slaHoras: 4, obrigatorio: true },
        { nome: '[CONFIRMAR CLIENTE] Levantar gastos com P&D do exercício', slaHoras: 16, obrigatorio: true },
        { nome: 'Validar elegibilidade dos gastos (consultoria técnica MCTI)', slaHoras: 8 },
        { nome: 'Calcular benefício IRPJ/CSLL (dedução adicional 20%-100%)', slaHoras: 4 },
        { nome: '[CONFIRMAR ESCRITÓRIO] Apresentar economia ao cliente', slaHoras: 4 },
        { nome: 'Submeter formulário FORMP&D ao MCTI até 31 julho', slaHoras: 4, obrigatorio: true },
      ]},
    ],
  },
]

const encadeamentos: SeedEnc[] = [
  { origem: 'Mensal Tecnologia Presumido', destino: 'Coleta e Lançamentos Mensal Tech', ordem: 0, iniciaAuto: true, obrigatorio: true, herdaResponsavel: true },
  { origem: 'Coleta e Lançamentos Mensal Tech', destino: 'Apuração ISS Mensal Tech', ordem: 0, iniciaAuto: true, obrigatorio: true, herdaResponsavel: false },
  { origem: 'Coleta e Lançamentos Mensal Tech', destino: 'Apuração PIS/COFINS Cumulativo Tech', ordem: 1, iniciaAuto: true, obrigatorio: true, herdaResponsavel: false },
  { origem: 'Coleta e Lançamentos Mensal Tech', destino: 'Folha + eSocial + DCTFWeb Tech', ordem: 2, iniciaAuto: true, obrigatorio: true, herdaResponsavel: false },
  { origem: 'Apuração PIS/COFINS Cumulativo Tech', destino: 'EFD-Contribuições Tech', ordem: 0, iniciaAuto: true, obrigatorio: true, herdaResponsavel: true },
  { origem: 'Anual Tech Presumido', destino: 'Encerramento + ECD + ECF Tech', ordem: 0, iniciaAuto: true, obrigatorio: true, herdaResponsavel: true },
  { origem: 'Anual Tech Presumido', destino: 'Avaliação Lei do Bem (Tech)', ordem: 1, iniciaAuto: false, obrigatorio: false, herdaResponsavel: true, observacao: 'Avaliar anualmente — opcional, depende de gastos com P&D do exercício.' },
]

async function main() {
  console.log('Seed: Tecnologia/SaaS — Lucro Presumido\n')
  const idByName = new Map<string, string>()
  let criados = 0, atualizados = 0
  for (const s of servicos) {
    const existing = await prisma.servico.findFirst({ where: { nome: s.nome, empresaId: null } })
    const data = { nome: s.nome, categoria: s.categoria, descricao: s.descricao, slaHoras: s.slaHoras, prioridadePadrao: (s.prioridadePadrao ?? 'MEDIA') as any, ativo: true, empresaId: null }
    let servico
    if (existing) { servico = await prisma.servico.update({ where: { id: existing.id }, data }); await prisma.servicoEtapa.deleteMany({ where: { servicoId: servico.id } }); atualizados++ }
    else { servico = await prisma.servico.create({ data }); criados++ }
    await prisma.$executeRawUnsafe(`UPDATE servicos SET valor_padrao = $1, disponivel_orcamento = $2, recorrente_mensal = $3 WHERE id = $4`, s.valorPadrao ?? null, s.disponivelOrcamento ?? false, s.recorrenteMensal ?? false, servico.id)
    for (let ei = 0; ei < s.etapas.length; ei++) {
      const et = s.etapas[ei]!
      const etapa = await prisma.servicoEtapa.create({ data: { servicoId: servico.id, nome: et.nome, ordem: ei, slaHoras: et.slaHoras ?? null } })
      for (let pi = 0; pi < et.passos.length; pi++) {
        const p = et.passos[pi]!
        await prisma.servicoPasso.create({ data: { etapaId: etapa.id, nome: p.nome, ordem: pi, obrigatorio: p.obrigatorio ?? false, slaHoras: p.slaHoras ?? null, textoOrientativo: p.textoOrientativo ?? null, permiteIgnorar: p.permiteIgnorar ?? false, recorrente: p.recorrente ?? false, recorrenciaTipo: p.recorrenciaTipo ?? null } })
      }
    }
    idByName.set(s.nome, servico.id)
    console.log(`  ${existing ? 'UPD' : 'NEW'}  ${s.nome.padEnd(48)}  ${s.etapas.length}e/${s.etapas.reduce((a, e) => a + e.passos.length, 0)}p`)
  }
  let encNovos = 0, encAtualizados = 0
  for (const e of encadeamentos) {
    const oId = idByName.get(e.origem); const dId = idByName.get(e.destino)
    if (!oId || !dId) { console.warn(`SKIP ${e.origem}→${e.destino}`); continue }
    const existing = await prisma.servicoEncadeamento.findUnique({ where: { servicoOrigemId_servicoDestinoId: { servicoOrigemId: oId, servicoDestinoId: dId } } })
    const data = { servicoOrigemId: oId, servicoDestinoId: dId, ordem: e.ordem ?? 0, iniciaAuto: e.iniciaAuto ?? true, obrigatorio: e.obrigatorio ?? true, herdaResponsavel: e.herdaResponsavel ?? true, observacao: e.observacao ?? null }
    if (existing) { await prisma.servicoEncadeamento.update({ where: { id: existing.id }, data }); encAtualizados++ } else { await prisma.servicoEncadeamento.create({ data }); encNovos++ }
  }
  console.log(`\nResumo: ${criados} criados, ${atualizados} atualizados | Encadeamentos: ${encNovos} novos, ${encAtualizados} atualizados\n`)
  await prisma.$disconnect()
}
main().catch(e => { console.error(e); process.exit(1) })
