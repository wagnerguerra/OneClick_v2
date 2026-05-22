// Seed: Holding/Participações — Lucro Presumido
// 6 templates + 4 encadeamentos. Rotina enxuta — sem ICMS/IPI, foco patrimonial e MEP.
import { PrismaClient } from '../src/generated/client'
const prisma = new PrismaClient()
type SeedPasso = { nome: string; slaHoras?: number; obrigatorio?: boolean; textoOrientativo?: string; permiteIgnorar?: boolean; recorrente?: boolean; recorrenciaTipo?: 'MENSAL' | 'TRIMESTRAL' | 'SEMESTRAL' | 'ANUAL' }
type SeedServico = { nome: string; categoria: string; descricao: string; slaHoras: number; valorPadrao?: number; prioridadePadrao?: 'BAIXA' | 'MEDIA' | 'ALTA' | 'URGENTE'; disponivelOrcamento?: boolean; recorrenteMensal?: boolean; etapas: { nome: string; slaHoras?: number; passos: SeedPasso[] }[] }
type SeedEnc = { origem: string; destino: string; ordem?: number; iniciaAuto?: boolean; obrigatorio?: boolean; herdaResponsavel?: boolean; observacao?: string }

const servicos: SeedServico[] = [
  { nome: 'Onboarding Holding Presumido', categoria: 'Legalização', descricao: 'Acolhimento de Holding/Participações Lucro Presumido — patrimonial, sem operação comercial.', slaHoras: 48, prioridadePadrao: 'MEDIA', disponivelOrcamento: false,
    etapas: [
      { nome: 'Diagnóstico patrimonial', slaHoras: 24, passos: [
        { nome: 'Levantar coligadas/controladas (participações societárias)', slaHoras: 8, obrigatorio: true },
        { nome: 'Identificar imóveis no patrimônio (se aplicável)', slaHoras: 4 },
        { nome: 'Verificar atividade preponderante (Holding pura vs mista)', slaHoras: 4 },
        { nome: '[CONFIRMAR ESCRITÓRIO] Reunião com sócios', slaHoras: 8 },
      ]},
      { nome: 'Configuração no sistema', slaHoras: 24, passos: [
        { nome: 'Cadastrar cliente + áreas', slaHoras: 4, obrigatorio: true },
        { nome: 'Importar plano de contas Holding (foco em investimentos e MEP)', slaHoras: 8 },
        { nome: 'Cadastrar certificado A1', slaHoras: 8, obrigatorio: true },
        { nome: 'Habilitar Caixa Postal e-CAC', slaHoras: 4 },
      ]},
    ]},
  { nome: 'Mensal Holding Presumido', categoria: 'Contábil', descricao: 'Cadeia mensal enxuta para Holding — sem ICMS/IPI/folha (geralmente).', slaHoras: 64, prioridadePadrao: 'MEDIA', recorrenteMensal: true, disponivelOrcamento: false,
    etapas: [{ nome: 'Coordenação', slaHoras: 64, passos: [
      { nome: 'Confirmar lançamentos do mês', slaHoras: 8 },
      { nome: 'Encerrar competência', slaHoras: 8, obrigatorio: true },
    ]}]},
  { nome: 'Lançamentos e Acompanhamento Mensal Holding', categoria: 'Contábil', descricao: 'Lançamentos mensais — receitas financeiras, despesas administrativas, equivalência patrimonial.', slaHoras: 32, prioridadePadrao: 'MEDIA', recorrenteMensal: true, disponivelOrcamento: false,
    etapas: [
      { nome: 'Lançamentos', slaHoras: 24, passos: [
        { nome: 'Receber extratos bancários e relatórios de aplicações', slaHoras: 4, obrigatorio: true },
        { nome: 'Lançar receitas financeiras (juros, rendimentos)', slaHoras: 4 },
        { nome: 'Lançar despesas administrativas', slaHoras: 4 },
        { nome: '[CONFIRMAR CLIENTE] Receber balancetes das coligadas/controladas', slaHoras: 8, permiteIgnorar: true },
        { nome: 'Aplicar Equivalência Patrimonial (se Holding com investimentos relevantes)', slaHoras: 4, permiteIgnorar: true, textoOrientativo: 'NBC TG 18' },
      ]},
      { nome: 'Conciliação', slaHoras: 8, passos: [
        { nome: 'Conciliar saldos bancários e aplicações', slaHoras: 4, obrigatorio: true },
        { nome: 'Gerar balancete mensal', slaHoras: 4 },
      ]},
    ]},
  { nome: 'Apuração Mensal Holding (PIS/COFINS Cumulativo)', categoria: 'Fiscal', descricao: 'PIS/COFINS cumulativos sobre receitas financeiras + DCTFWeb mesmo sem folha.', slaHoras: 16, prioridadePadrao: 'MEDIA', recorrenteMensal: true, disponivelOrcamento: false,
    etapas: [{ nome: 'Apuração', slaHoras: 16, passos: [
      { nome: 'Apurar PIS (0,65%) + COFINS (3%) sobre receitas tributáveis', slaHoras: 4, obrigatorio: true },
      { nome: 'Gerar DARFs', slaHoras: 4, obrigatorio: true, textoOrientativo: 'Vencimento dia 25' },
      { nome: 'Transmitir DCTFWeb (consolidação federal)', slaHoras: 4, obrigatorio: true },
      { nome: 'Encaminhar guias', slaHoras: 4 },
    ]}]},
  { nome: 'Anual Holding Presumido', categoria: 'Contábil', descricao: 'Cadeia anual Holding — encerramento, ECD, ECF, distribuição de lucros isenta.', slaHoras: 200, prioridadePadrao: 'ALTA', disponivelOrcamento: false,
    etapas: [{ nome: 'Coordenação', slaHoras: 200, passos: [
      { nome: 'Confirmar encerramento, ECD, ECF', slaHoras: 24, obrigatorio: true },
      { nome: '[CONFIRMAR CLIENTE] Avaliar distribuição de lucros aos sócios PF (isenta)', slaHoras: 16 },
      { nome: 'Encerrar ciclo', slaHoras: 8, obrigatorio: true },
    ]}]},
  { nome: 'Encerramento + ECD + ECF Holding', categoria: 'Fiscal', descricao: 'Encerramento contábil + ECD + ECF Holding (Lucro Presumido).', slaHoras: 120, prioridadePadrao: 'ALTA', disponivelOrcamento: false,
    etapas: [
      { nome: 'Encerramento', slaHoras: 24, passos: [
        { nome: 'Aplicar MEP no fechamento (resultado de coligadas/controladas)', slaHoras: 8 },
        { nome: 'Apurar resultado do exercício', slaHoras: 4, obrigatorio: true },
        { nome: 'Calcular IRPJ Trimestral consolidado (32% receitas administrativas, 8% venda imóveis)', slaHoras: 8, obrigatorio: true, textoOrientativo: 'Lei 9.249/1995' },
        { nome: 'Gerar Balanço + DRE', slaHoras: 4, obrigatorio: true },
      ]},
      { nome: 'ECD + ECF', slaHoras: 96, passos: [
        { nome: 'Gerar e validar ECD', slaHoras: 24, obrigatorio: true },
        { nome: '[CONFIRMAR CLIENTE] Coletar assinaturas + transmitir ECD até último dia útil de junho', slaHoras: 16, obrigatorio: true, textoOrientativo: 'IN RFB 2.003/2021' },
        { nome: 'Importar dados na ECF + apurar e-LALUR/e-LACS simplificado', slaHoras: 24, obrigatorio: true },
        { nome: 'Validar com PVA-ECF + transmitir até último dia útil de julho', slaHoras: 16, obrigatorio: true, textoOrientativo: 'IN RFB 2.004/2021' },
        { nome: 'Encaminhar resumo ao cliente', slaHoras: 16 },
      ]},
    ]},
]

const encadeamentos: SeedEnc[] = [
  { origem: 'Mensal Holding Presumido', destino: 'Lançamentos e Acompanhamento Mensal Holding', ordem: 0, iniciaAuto: true, obrigatorio: true },
  { origem: 'Lançamentos e Acompanhamento Mensal Holding', destino: 'Apuração Mensal Holding (PIS/COFINS Cumulativo)', ordem: 0, iniciaAuto: true, obrigatorio: true },
  { origem: 'Anual Holding Presumido', destino: 'Encerramento + ECD + ECF Holding', ordem: 0, iniciaAuto: true, obrigatorio: true },
]

async function main() {
  console.log('Seed: Holding/Participações — Lucro Presumido\n')
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
