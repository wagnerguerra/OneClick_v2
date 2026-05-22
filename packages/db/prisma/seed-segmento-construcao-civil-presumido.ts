// Seed: Construção Civil — Lucro Presumido
// 7 templates + 5 encadeamentos. Particularidades: presunção 8%, RET, retenção INSS 3,5%, ISS por obra.
import { PrismaClient } from '../src/generated/client'
const prisma = new PrismaClient()
type SeedPasso = { nome: string; slaHoras?: number; obrigatorio?: boolean; textoOrientativo?: string; permiteIgnorar?: boolean; recorrente?: boolean; recorrenciaTipo?: 'MENSAL' | 'TRIMESTRAL' | 'SEMESTRAL' | 'ANUAL' }
type SeedServico = { nome: string; categoria: string; descricao: string; slaHoras: number; valorPadrao?: number; prioridadePadrao?: 'BAIXA' | 'MEDIA' | 'ALTA' | 'URGENTE'; disponivelOrcamento?: boolean; recorrenteMensal?: boolean; etapas: { nome: string; slaHoras?: number; passos: SeedPasso[] }[] }
type SeedEnc = { origem: string; destino: string; ordem?: number; iniciaAuto?: boolean; obrigatorio?: boolean; herdaResponsavel?: boolean; observacao?: string }

const servicos: SeedServico[] = [
  { nome: 'Onboarding Construção Civil Presumido', categoria: 'Legalização', descricao: 'Acolhimento de cliente Construção Civil Presumido — RET, CEI por obra, retenções específicas.', slaHoras: 80, prioridadePadrao: 'ALTA', disponivelOrcamento: false,
    etapas: [
      { nome: 'Diagnóstico construção', slaHoras: 40, passos: [
        { nome: 'Levantar CNAEs (41xx-43xx)', slaHoras: 4, obrigatorio: true },
        { nome: 'Identificar obras em andamento (CEI por obra)', slaHoras: 8, obrigatorio: true },
        { nome: 'Avaliar elegibilidade RET — Regime Especial Tributação (Lei 10.931/2004)', slaHoras: 8, permiteIgnorar: true, textoOrientativo: 'Útil para incorporadoras' },
        { nome: 'Verificar inscrição municipal por município de obra', slaHoras: 8 },
        { nome: 'Mapear regime de cessão de mão de obra (retenção INSS 3,5%)', slaHoras: 4, textoOrientativo: 'Lei 9.711/1998' },
        { nome: '[CONFIRMAR ESCRITÓRIO] Reunião de boas-vindas', slaHoras: 8 },
      ]},
      { nome: 'Configuração no sistema', slaHoras: 40, passos: [
        { nome: 'Cadastrar cliente + áreas', slaHoras: 8, obrigatorio: true },
        { nome: 'Importar plano de contas Construção (custos por obra, faturamento POC)', slaHoras: 16 },
        { nome: 'Cadastrar certificado A1', slaHoras: 8, obrigatorio: true },
        { nome: 'Habilitar Caixa Postal e-CAC', slaHoras: 8 },
      ]},
    ]},
  { nome: 'Mensal Construção Civil Presumido', categoria: 'Fiscal', descricao: 'Cadeia mensal Construção — CEI por obra, retenções, ISS.', slaHoras: 160, prioridadePadrao: 'ALTA', recorrenteMensal: true, disponivelOrcamento: false,
    etapas: [{ nome: 'Coordenação', slaHoras: 160, passos: [
      { nome: 'Confirmar coleta', slaHoras: 16 },
      { nome: 'Confirmar apurações', slaHoras: 16 },
      { nome: 'Encerrar competência', slaHoras: 8, obrigatorio: true },
    ]}]},
  { nome: 'Coleta + Lançamentos Mensal Construção', categoria: 'Contábil', descricao: 'Coleta de NFs por obra, medições, retenções de INSS, ISS retido.', slaHoras: 40, prioridadePadrao: 'ALTA', recorrenteMensal: true, disponivelOrcamento: false,
    etapas: [{ nome: 'Coleta + lançamentos', slaHoras: 40, passos: [
      { nome: '[CONFIRMAR ESCRITÓRIO] Solicitar medições e NFs por obra', slaHoras: 4, obrigatorio: true, recorrente: true, recorrenciaTipo: 'MENSAL' },
      { nome: 'Receber medições assinadas (% conclusão de obra)', slaHoras: 4, obrigatorio: true },
      { nome: 'Receber NFs de subcontratados (com retenção INSS 3,5% e ISS)', slaHoras: 8, obrigatorio: true },
      { nome: 'Lançar receita pelo método POC (percentage of completion)', slaHoras: 8, obrigatorio: true, textoOrientativo: 'NBC TG 17 — Contratos de Construção' },
      { nome: 'Lançar custos por centro de custo (obra)', slaHoras: 8 },
      { nome: 'Conciliar caixa/banco', slaHoras: 4, obrigatorio: true },
      { nome: 'Lançar retenções recebidas (INSS, ISS)', slaHoras: 4 },
    ]}]},
  { nome: 'ISS por Obra + PIS/COFINS Construção', categoria: 'Fiscal', descricao: 'ISS apurado por obra (município) + PIS/COFINS cumulativos.', slaHoras: 32, prioridadePadrao: 'ALTA', recorrenteMensal: true, disponivelOrcamento: false,
    etapas: [
      { nome: 'ISS por obra', slaHoras: 16, passos: [
        { nome: 'Apurar receita de cada obra (POC)', slaHoras: 4, obrigatorio: true },
        { nome: 'Calcular ISS por município de prestação (geralmente 5%)', slaHoras: 4, obrigatorio: true },
        { nome: 'Compensar ISS retido em fonte (se houver)', slaHoras: 4 },
        { nome: 'Gerar guias municipais por obra', slaHoras: 4, obrigatorio: true },
      ]},
      { nome: 'PIS/COFINS', slaHoras: 16, passos: [
        { nome: 'Apurar PIS (0,65%) + COFINS (3%) cumulativos', slaHoras: 4, obrigatorio: true },
        { nome: 'Considerar receitas RET (se aplicável — 4% unificado)', slaHoras: 4, permiteIgnorar: true },
        { nome: 'Gerar DARFs', slaHoras: 4, obrigatorio: true },
        { nome: 'Encaminhar guias', slaHoras: 4 },
      ]},
    ]},
  { nome: 'IRPJ/CSLL + Folha + eSocial Construção', categoria: 'Fiscal', descricao: 'IRPJ/CSLL Trimestral (presunção 8%) + Folha + eSocial + DCTFWeb com obras.', slaHoras: 56, prioridadePadrao: 'ALTA', recorrenteMensal: true, disponivelOrcamento: false,
    etapas: [
      { nome: 'IRPJ/CSLL', slaHoras: 16, passos: [
        { nome: 'Apurar trimestralmente: presunção 8% (IRPJ) + 12% (CSLL)', slaHoras: 8, obrigatorio: true, textoOrientativo: 'Lei 9.249/1995 — alíquotas reduzidas para construção' },
        { nome: 'Gerar DARFs IRPJ + CSLL', slaHoras: 4, obrigatorio: true },
        { nome: 'Encaminhar guias', slaHoras: 4 },
      ]},
      { nome: 'Folha + eSocial + DCTFWeb', slaHoras: 40, passos: [
        { nome: '[CONFIRMAR CLIENTE] Receber variáveis até dia 25', slaHoras: 4, obrigatorio: true, recorrente: true, recorrenciaTipo: 'MENSAL' },
        { nome: 'Folha + holerites por obra (CEI)', slaHoras: 16, obrigatorio: true },
        { nome: 'Transmitir eSocial S-1200/1210 com obras', slaHoras: 8, obrigatorio: true },
        { nome: 'Transmitir DCTFWeb dia 15', slaHoras: 4, obrigatorio: true },
        { nome: 'Gerar DARF INSS + FGTS por CEI', slaHoras: 4, obrigatorio: true },
        { nome: '[CONFIRMAR ESCRITÓRIO] Enviar holerites', slaHoras: 4 },
      ]},
    ]},
  { nome: 'Anual Construção Civil Presumido', categoria: 'Contábil', descricao: 'Cadeia anual Construção — encerramento, ECD, ECF.', slaHoras: 240, prioridadePadrao: 'ALTA', disponivelOrcamento: false,
    etapas: [{ nome: 'Coordenação', slaHoras: 240, passos: [
      { nome: 'Confirmar encerramento, ECD, ECF', slaHoras: 24, obrigatorio: true },
      { nome: 'Encerrar ciclo', slaHoras: 8, obrigatorio: true },
    ]}]},
  { nome: 'Encerramento + ECD + ECF Construção', categoria: 'Fiscal', descricao: 'Fechamento + ECD + ECF Construção (Presumido) com particularidades de RET e patrimônio de afetação.', slaHoras: 160, prioridadePadrao: 'ALTA', disponivelOrcamento: false,
    etapas: [
      { nome: 'Encerramento', slaHoras: 32, passos: [
        { nome: 'Apurar resultado por obra (POC consolidado)', slaHoras: 8, obrigatorio: true },
        { nome: 'Avaliar patrimônio de afetação (incorporações)', slaHoras: 8, permiteIgnorar: true },
        { nome: 'Apurar resultado do exercício', slaHoras: 8, obrigatorio: true },
        { nome: 'Lançar IRPJ + CSLL anuais (Presumido)', slaHoras: 8, obrigatorio: true },
      ]},
      { nome: 'ECD + ECF', slaHoras: 128, passos: [
        { nome: 'Gerar ECD com livros por obra (se aplicável)', slaHoras: 32, obrigatorio: true },
        { nome: '[CONFIRMAR CLIENTE] Assinaturas + transmitir ECD até último dia útil de junho', slaHoras: 32, obrigatorio: true, textoOrientativo: 'IN RFB 2.003/2021' },
        { nome: 'Apurar e-LALUR Presumido na ECF', slaHoras: 32, obrigatorio: true },
        { nome: 'Validar + transmitir ECF até último dia útil de julho', slaHoras: 32, obrigatorio: true, textoOrientativo: 'IN RFB 2.004/2021' },
      ]},
    ]},
]

const encadeamentos: SeedEnc[] = [
  { origem: 'Mensal Construção Civil Presumido', destino: 'Coleta + Lançamentos Mensal Construção', ordem: 0, iniciaAuto: true, obrigatorio: true },
  { origem: 'Coleta + Lançamentos Mensal Construção', destino: 'ISS por Obra + PIS/COFINS Construção', ordem: 0, iniciaAuto: true, obrigatorio: true, herdaResponsavel: false },
  { origem: 'Coleta + Lançamentos Mensal Construção', destino: 'IRPJ/CSLL + Folha + eSocial Construção', ordem: 1, iniciaAuto: true, obrigatorio: true, herdaResponsavel: false },
  { origem: 'Anual Construção Civil Presumido', destino: 'Encerramento + ECD + ECF Construção', ordem: 0, iniciaAuto: true, obrigatorio: true },
]

async function main() {
  console.log('Seed: Construção Civil — Lucro Presumido\n')
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
