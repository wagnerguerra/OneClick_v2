// Seed: Telecomunicações — Lucro Real
// 7 templates + 5 encadeamentos. Particularidades: ICMS-Comunicação 25-30%, FUST/FUNTTEL/CFRP, Convênio 126/1998.
import { PrismaClient } from '../src/generated/client'
const prisma = new PrismaClient()
type SeedPasso = { nome: string; slaHoras?: number; obrigatorio?: boolean; textoOrientativo?: string; permiteIgnorar?: boolean; recorrente?: boolean; recorrenciaTipo?: 'MENSAL' | 'TRIMESTRAL' | 'SEMESTRAL' | 'ANUAL' }
type SeedServico = { nome: string; categoria: string; descricao: string; slaHoras: number; valorPadrao?: number; prioridadePadrao?: 'BAIXA' | 'MEDIA' | 'ALTA' | 'URGENTE'; disponivelOrcamento?: boolean; recorrenteMensal?: boolean; etapas: { nome: string; slaHoras?: number; passos: SeedPasso[] }[] }
type SeedEnc = { origem: string; destino: string; ordem?: number; iniciaAuto?: boolean; obrigatorio?: boolean; herdaResponsavel?: boolean; observacao?: string }

const servicos: SeedServico[] = [
  { nome: 'Onboarding Telecomunicações Real', categoria: 'Legalização', descricao: 'Acolhimento de operadora de telecomunicações Lucro Real — ANATEL, FUST/FUNTTEL, ICMS-Comunicação.', slaHoras: 96, prioridadePadrao: 'ALTA', disponivelOrcamento: false,
    etapas: [
      { nome: 'Diagnóstico telecom', slaHoras: 56, passos: [
        { nome: 'Levantar serviços prestados (SCM, STFC, SVA, SeAC, etc)', slaHoras: 8, obrigatorio: true, textoOrientativo: 'Lei Geral de Telecomunicações 9.472/1997' },
        { nome: 'Verificar autorização ANATEL ativa', slaHoras: 4, obrigatorio: true },
        { nome: 'Identificar Convênio ICMS 126/1998 (regime especial telecom)', slaHoras: 4, obrigatorio: true },
        { nome: 'Confirmar inscrição estadual ativa em ES', slaHoras: 4, obrigatorio: true },
        { nome: 'Mapear contribuições especiais (FUST 1%, FUNTTEL 0,5%, CFRP 1%)', slaHoras: 8, obrigatorio: true },
        { nome: 'Avaliar isenção FISTEL e CONDECINE (se aplicável)', slaHoras: 4, permiteIgnorar: true },
        { nome: 'Definir periodicidade IRPJ Lucro Real (anual estimativa preferida pra setor)', slaHoras: 8 },
        { nome: '[CONFIRMAR ESCRITÓRIO] Reunião com financeiro/regulatório do cliente', slaHoras: 16 },
      ]},
      { nome: 'Configuração no sistema', slaHoras: 40, passos: [
        { nome: 'Cadastrar cliente + áreas (Fiscal, Contábil, Trabalhista, Regulatório)', slaHoras: 8, obrigatorio: true },
        { nome: 'Importar plano de contas Telecom (receitas por serviço, contribuições especiais)', slaHoras: 16 },
        { nome: 'Cadastrar certificado A1', slaHoras: 8, obrigatorio: true },
        { nome: 'Habilitar Caixa Postal e-CAC', slaHoras: 8 },
      ]},
    ]},
  { nome: 'Mensal Telecomunicações Real', categoria: 'Fiscal', descricao: 'Cadeia mensal Telecom — coleta, ICMS-Comunicação, FUST/FUNTTEL/CFRP, federais.', slaHoras: 240, prioridadePadrao: 'ALTA', recorrenteMensal: true, disponivelOrcamento: false,
    etapas: [{ nome: 'Coordenação', slaHoras: 240, passos: [
      { nome: 'Confirmar coleta', slaHoras: 16 },
      { nome: 'Confirmar apurações telecom', slaHoras: 24 },
      { nome: 'Confirmar pagamentos ANATEL', slaHoras: 8 },
      { nome: 'Encerrar competência', slaHoras: 8, obrigatorio: true },
    ]}]},
  { nome: 'Coleta + Lançamentos Mensal Telecom', categoria: 'Contábil', descricao: 'Coleta de NFs de comunicação (modelo 21), faturamento, lançamentos.', slaHoras: 56, prioridadePadrao: 'ALTA', recorrenteMensal: true, disponivelOrcamento: false,
    etapas: [{ nome: 'Coleta + lançamentos', slaHoras: 56, passos: [
      { nome: '[CONFIRMAR ESCRITÓRIO] Solicitar relatórios de faturamento até dia X', slaHoras: 4, obrigatorio: true, recorrente: true, recorrenciaTipo: 'MENSAL' },
      { nome: 'Receber arquivo de Faturas/NFs de Comunicação (modelo 21)', slaHoras: 8, obrigatorio: true },
      { nome: 'Receber relatórios por serviço (SCM, STFC, etc)', slaHoras: 8 },
      { nome: 'Receber extratos bancários', slaHoras: 4, obrigatorio: true },
      { nome: 'Lançar receitas de comunicação por serviço', slaHoras: 16, obrigatorio: true },
      { nome: 'Lançar despesas operacionais', slaHoras: 8 },
      { nome: 'Conciliar caixa/banco', slaHoras: 8, obrigatorio: true },
    ]}]},
  { nome: 'Apuração ICMS-Comunicação Telecom', categoria: 'Fiscal', descricao: 'ICMS-Comunicação 25-30% (ES: 25%) sobre faturamento telecom — Convênio ICMS 126/1998.', slaHoras: 40, prioridadePadrao: 'ALTA', recorrenteMensal: true, disponivelOrcamento: false,
    etapas: [{ nome: 'Apuração e recolhimento', slaHoras: 40, passos: [
      { nome: 'Apurar receita tributável de comunicação', slaHoras: 8, obrigatorio: true },
      { nome: 'Aplicar isenções específicas (Internet, MEs, etc)', slaHoras: 8 },
      { nome: 'Calcular ICMS-Comunicação (alíquota interna ES = 25%)', slaHoras: 4, obrigatorio: true, textoOrientativo: 'RICMS-ES + Convênio 126/1998' },
      { nome: 'Apurar diferimentos do Convênio 126', slaHoras: 4 },
      { nome: 'Gerar DUA-e', slaHoras: 4, obrigatorio: true },
      { nome: 'Gerar EFD-ICMS/IPI Comunicação', slaHoras: 8, obrigatorio: true },
      { nome: 'Encaminhar guias e arquivos', slaHoras: 4 },
    ]}]},
  { nome: 'Contribuições ANATEL (FUST, FUNTTEL, CFRP) Telecom', categoria: 'Fiscal', descricao: 'Apuração e recolhimento das contribuições obrigatórias do setor de telecomunicações.', slaHoras: 32, prioridadePadrao: 'ALTA', recorrenteMensal: true, disponivelOrcamento: false,
    etapas: [
      { nome: 'FUST', slaHoras: 8, passos: [
        { nome: 'Apurar receita líquida (1% FUST)', slaHoras: 2, obrigatorio: true, textoOrientativo: 'Lei 9.998/2000' },
        { nome: 'Gerar GRU FUST e recolher', slaHoras: 4, obrigatorio: true, textoOrientativo: 'Vencimento dia 10 do mês seguinte' },
        { nome: 'Encaminhar guia ao financeiro', slaHoras: 2 },
      ]},
      { nome: 'FUNTTEL', slaHoras: 8, passos: [
        { nome: 'Apurar receita líquida (0,5% FUNTTEL)', slaHoras: 2, obrigatorio: true, textoOrientativo: 'Lei 10.052/2000' },
        { nome: 'Gerar GRU FUNTTEL', slaHoras: 4, obrigatorio: true },
        { nome: 'Encaminhar', slaHoras: 2 },
      ]},
      { nome: 'CFRP / Outras', slaHoras: 16, passos: [
        { nome: 'Apurar Contribuição para Fomento da Radiodifusão Pública (1%)', slaHoras: 4, obrigatorio: true, textoOrientativo: 'Lei 11.652/2008' },
        { nome: 'Gerar GRU CFRP', slaHoras: 4, obrigatorio: true },
        { nome: 'Avaliar CONDECINE/FISTEL (se aplicável)', slaHoras: 4, permiteIgnorar: true },
        { nome: 'Encaminhar guias ao cliente', slaHoras: 4 },
      ]},
    ]},
  { nome: 'Federais e Folha Telecom', categoria: 'Fiscal', descricao: 'PIS/COFINS Não-cumulativo + IRPJ/CSLL + Folha + eSocial + DCTFWeb.', slaHoras: 80, prioridadePadrao: 'ALTA', recorrenteMensal: true, disponivelOrcamento: false,
    etapas: [
      { nome: 'PIS/COFINS', slaHoras: 24, passos: [
        { nome: 'Apurar PIS (1,65%) + COFINS (7,6%) não-cumulativos', slaHoras: 8, obrigatorio: true },
        { nome: 'Apurar créditos sobre insumos telecom (interconexão, links, energia)', slaHoras: 8, obrigatorio: true },
        { nome: 'Gerar DARFs + EFD-Contribuições', slaHoras: 8, obrigatorio: true },
      ]},
      { nome: 'IRPJ/CSLL', slaHoras: 16, passos: [
        { nome: 'Apurar Lucro Real estimado mensal', slaHoras: 8, obrigatorio: true },
        { nome: 'Gerar DARFs IRPJ + CSLL', slaHoras: 8, obrigatorio: true },
      ]},
      { nome: 'Folha + eSocial + DCTFWeb', slaHoras: 40, passos: [
        { nome: '[CONFIRMAR CLIENTE] Receber variáveis até dia 25', slaHoras: 4, obrigatorio: true, recorrente: true, recorrenciaTipo: 'MENSAL' },
        { nome: 'Folha + holerites', slaHoras: 16, obrigatorio: true },
        { nome: 'Transmitir eSocial S-1200/1210', slaHoras: 8, obrigatorio: true },
        { nome: 'Transmitir DCTFWeb dia 15', slaHoras: 4, obrigatorio: true },
        { nome: 'Gerar DARF INSS + FGTS', slaHoras: 8, obrigatorio: true },
      ]},
    ]},
  { nome: 'Anual Telecomunicações Real', categoria: 'Contábil', descricao: 'Cadeia anual Telecom — encerramento, ECD, ECF + entregas regulatórias ANATEL.', slaHoras: 320, prioridadePadrao: 'ALTA', disponivelOrcamento: false,
    etapas: [{ nome: 'Coordenação', slaHoras: 320, passos: [
      { nome: 'Confirmar encerramento, ECD, ECF', slaHoras: 24, obrigatorio: true },
      { nome: 'Confirmar Demonstrações Financeiras Anuais à ANATEL', slaHoras: 16, obrigatorio: true },
      { nome: 'Encerrar ciclo', slaHoras: 8, obrigatorio: true },
    ]}]},
]

const encadeamentos: SeedEnc[] = [
  { origem: 'Mensal Telecomunicações Real', destino: 'Coleta + Lançamentos Mensal Telecom', ordem: 0, iniciaAuto: true, obrigatorio: true },
  { origem: 'Coleta + Lançamentos Mensal Telecom', destino: 'Apuração ICMS-Comunicação Telecom', ordem: 0, iniciaAuto: true, obrigatorio: true, herdaResponsavel: false },
  { origem: 'Coleta + Lançamentos Mensal Telecom', destino: 'Contribuições ANATEL (FUST, FUNTTEL, CFRP) Telecom', ordem: 1, iniciaAuto: true, obrigatorio: true, herdaResponsavel: false },
  { origem: 'Coleta + Lançamentos Mensal Telecom', destino: 'Federais e Folha Telecom', ordem: 2, iniciaAuto: true, obrigatorio: true, herdaResponsavel: false },
]

async function main() {
  console.log('Seed: Telecomunicações — Lucro Real\n')
  const idByName = new Map<string, string>(); let criados = 0, atualizados = 0
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
  }
  let encNovos = 0, encAtualizados = 0
  for (const e of encadeamentos) {
    const oId = idByName.get(e.origem); const dId = idByName.get(e.destino)
    if (!oId || !dId) continue
    const existing = await prisma.servicoEncadeamento.findUnique({ where: { servicoOrigemId_servicoDestinoId: { servicoOrigemId: oId, servicoDestinoId: dId } } })
    const data = { servicoOrigemId: oId, servicoDestinoId: dId, ordem: e.ordem ?? 0, iniciaAuto: e.iniciaAuto ?? true, obrigatorio: e.obrigatorio ?? true, herdaResponsavel: e.herdaResponsavel ?? true, observacao: e.observacao ?? null }
    if (existing) { await prisma.servicoEncadeamento.update({ where: { id: existing.id }, data }); encAtualizados++ } else { await prisma.servicoEncadeamento.create({ data }); encNovos++ }
  }
  console.log(`Resumo: ${criados} criados, ${atualizados} atualizados | Encadeamentos: ${encNovos} novos, ${encAtualizados} atualizados\n`)
  await prisma.$disconnect()
}
main().catch(e => { console.error(e); process.exit(1) })
