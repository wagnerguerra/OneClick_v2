// Seed: Educação (escolas/idiomas) — Lucro Presumido
// 6 templates + 4 encadeamentos. Particularidades: ISS reduzido (Vitória 2%), avaliar imunidade tributária, sem ICMS.
import { PrismaClient } from '../src/generated/client'
const prisma = new PrismaClient()
type SeedPasso = { nome: string; slaHoras?: number; obrigatorio?: boolean; textoOrientativo?: string; permiteIgnorar?: boolean; recorrente?: boolean; recorrenciaTipo?: 'MENSAL' | 'TRIMESTRAL' | 'SEMESTRAL' | 'ANUAL' }
type SeedServico = { nome: string; categoria: string; descricao: string; slaHoras: number; valorPadrao?: number; prioridadePadrao?: 'BAIXA' | 'MEDIA' | 'ALTA' | 'URGENTE'; disponivelOrcamento?: boolean; recorrenteMensal?: boolean; etapas: { nome: string; slaHoras?: number; passos: SeedPasso[] }[] }
type SeedEnc = { origem: string; destino: string; ordem?: number; iniciaAuto?: boolean; obrigatorio?: boolean; herdaResponsavel?: boolean; observacao?: string }

const servicos: SeedServico[] = [
  { nome: 'Onboarding Educação Presumido', categoria: 'Legalização', descricao: 'Acolhimento de instituição educacional Presumido — escolas, cursos, idiomas. Avaliar imunidade tributária quando aplicável.', slaHoras: 56, prioridadePadrao: 'MEDIA', disponivelOrcamento: false,
    etapas: [
      { nome: 'Diagnóstico educacional', slaHoras: 32, passos: [
        { nome: 'Identificar atividade (ensino regular, idiomas, profissionalizante)', slaHoras: 4, obrigatorio: true },
        { nome: 'Avaliar imunidade tributária (Art. 150 VI "c" CF — entidades sem fins lucrativos)', slaHoras: 8, permiteIgnorar: true, textoOrientativo: 'Se atender requisitos, isenta de IRPJ/CSLL/COFINS' },
        { nome: 'Verificar autorização MEC/Conselho de Educação (se aplicável)', slaHoras: 4 },
        { nome: 'Confirmar inscrição municipal e CNAE de educação', slaHoras: 4, obrigatorio: true },
        { nome: 'Identificar receitas de mensalidades vs taxas extras', slaHoras: 4 },
        { nome: '[CONFIRMAR ESCRITÓRIO] Reunião de boas-vindas', slaHoras: 8 },
      ]},
      { nome: 'Configuração no sistema', slaHoras: 24, passos: [
        { nome: 'Cadastrar cliente + áreas', slaHoras: 4, obrigatorio: true },
        { nome: 'Importar plano de contas educacional (mensalidades, taxas, bolsas)', slaHoras: 8 },
        { nome: 'Cadastrar certificado A1', slaHoras: 8, obrigatorio: true },
        { nome: 'Habilitar Caixa Postal e-CAC', slaHoras: 4 },
      ]},
    ]},
  { nome: 'Mensal Educação Presumido', categoria: 'Fiscal', descricao: 'Cadeia mensal Educação — coleta, ISS, federais, folha (alta — muitos professores).', slaHoras: 120, prioridadePadrao: 'MEDIA', recorrenteMensal: true, disponivelOrcamento: false,
    etapas: [{ nome: 'Coordenação', slaHoras: 120, passos: [
      { nome: 'Confirmar coleta', slaHoras: 16 },
      { nome: 'Confirmar apurações', slaHoras: 16 },
      { nome: 'Encerrar competência', slaHoras: 8, obrigatorio: true },
    ]}]},
  { nome: 'Coleta + ISS Educação', categoria: 'Fiscal', descricao: 'Coleta de receitas de mensalidades + ISS reduzido para educação (Vitória: 2%).', slaHoras: 32, prioridadePadrao: 'ALTA', recorrenteMensal: true, disponivelOrcamento: false,
    etapas: [
      { nome: 'Coleta', slaHoras: 16, passos: [
        { nome: '[CONFIRMAR ESCRITÓRIO] Solicitar relatório de mensalidades', slaHoras: 4, obrigatorio: true, recorrente: true, recorrenciaTipo: 'MENSAL' },
        { nome: 'Receber NFS-e emitidas', slaHoras: 4, obrigatorio: true },
        { nome: 'Receber relatório de bolsas/descontos', slaHoras: 4 },
        { nome: 'Receber extratos bancários', slaHoras: 4, obrigatorio: true },
      ]},
      { nome: 'ISS', slaHoras: 16, passos: [
        { nome: 'Apurar receita de serviços educacionais', slaHoras: 4, obrigatorio: true },
        { nome: 'Calcular ISS (Vitória: 2% para ensino)', slaHoras: 4, obrigatorio: true, textoOrientativo: 'Lei municipal de ISS de cada município' },
        { nome: 'Gerar guia ISS', slaHoras: 4, obrigatorio: true },
        { nome: 'Encaminhar guia ao cliente', slaHoras: 4 },
      ]},
    ]},
  { nome: 'Federais e Folha Educação', categoria: 'Fiscal', descricao: 'PIS/COFINS Cumulativo + IRPJ/CSLL Trimestral + Folha (alta — corpo docente) + eSocial + DCTFWeb.', slaHoras: 64, prioridadePadrao: 'ALTA', recorrenteMensal: true, disponivelOrcamento: false,
    etapas: [
      { nome: 'PIS/COFINS', slaHoras: 16, passos: [
        { nome: 'Apurar PIS (0,65%) + COFINS (3%) cumulativos', slaHoras: 4, obrigatorio: true },
        { nome: 'Avaliar isenção (entidades imunes/sem fins lucrativos)', slaHoras: 4, permiteIgnorar: true },
        { nome: 'Gerar DARFs', slaHoras: 4, obrigatorio: true },
        { nome: 'Encaminhar guias', slaHoras: 4 },
      ]},
      { nome: 'Folha (alta para educação)', slaHoras: 40, passos: [
        { nome: '[CONFIRMAR CLIENTE] Receber variáveis até dia 25', slaHoras: 4, obrigatorio: true, recorrente: true, recorrenciaTipo: 'MENSAL' },
        { nome: 'Calcular folha de professores e administrativo', slaHoras: 16, obrigatorio: true },
        { nome: 'Considerar regime CLT vs autônomo (RPA)', slaHoras: 4 },
        { nome: 'Transmitir eSocial S-1200/1210', slaHoras: 8, obrigatorio: true },
        { nome: 'Transmitir DCTFWeb dia 15', slaHoras: 4, obrigatorio: true },
        { nome: 'Gerar DARF INSS + FGTS', slaHoras: 4, obrigatorio: true },
      ]},
      { nome: 'IRPJ/CSLL Trimestral', slaHoras: 8, passos: [
        { nome: 'Apurar Presumido 32% trimestral', slaHoras: 4, obrigatorio: true },
        { nome: 'Gerar DARFs IRPJ + CSLL', slaHoras: 4, obrigatorio: true },
      ]},
    ]},
  { nome: 'Anual Educação Presumido', categoria: 'Contábil', descricao: 'Cadeia anual Educação — encerramento, ECD, ECF + se imune, demonstrações específicas.', slaHoras: 200, prioridadePadrao: 'ALTA', disponivelOrcamento: false,
    etapas: [{ nome: 'Coordenação', slaHoras: 200, passos: [
      { nome: 'Confirmar encerramento, ECD, ECF', slaHoras: 24, obrigatorio: true },
      { nome: '[CONFIRMAR CLIENTE] Avaliar manutenção da imunidade (se aplicável)', slaHoras: 16 },
      { nome: 'Encerrar ciclo', slaHoras: 8, obrigatorio: true },
    ]}]},
  { nome: 'Encerramento + ECD + ECF Educação', categoria: 'Fiscal', descricao: 'Fechamento + ECD + ECF Educação (Presumido).', slaHoras: 120, prioridadePadrao: 'ALTA', disponivelOrcamento: false,
    etapas: [
      { nome: 'Encerramento', slaHoras: 24, passos: [
        { nome: 'Apurar resultado anual', slaHoras: 8, obrigatorio: true },
        { nome: 'Verificar superávit (se entidade imune)', slaHoras: 4, permiteIgnorar: true },
        { nome: 'Lançar IRPJ + CSLL anuais', slaHoras: 8, obrigatorio: true },
        { nome: 'Gerar Balanço + DRE + DMPL (se associação)', slaHoras: 4 },
      ]},
      { nome: 'ECD + ECF', slaHoras: 96, passos: [
        { nome: 'Gerar e validar ECD', slaHoras: 24, obrigatorio: true },
        { nome: '[CONFIRMAR CLIENTE] Assinaturas + transmitir ECD até último dia útil de junho', slaHoras: 16, obrigatorio: true, textoOrientativo: 'IN RFB 2.003/2021' },
        { nome: 'Apurar e-LALUR Presumido na ECF', slaHoras: 24, obrigatorio: true },
        { nome: 'Validar + transmitir ECF até último dia útil de julho', slaHoras: 16, obrigatorio: true, textoOrientativo: 'IN RFB 2.004/2021' },
        { nome: 'Encaminhar resumo ao cliente', slaHoras: 16 },
      ]},
    ]},
]

const encadeamentos: SeedEnc[] = [
  { origem: 'Mensal Educação Presumido', destino: 'Coleta + ISS Educação', ordem: 0, iniciaAuto: true, obrigatorio: true },
  { origem: 'Coleta + ISS Educação', destino: 'Federais e Folha Educação', ordem: 0, iniciaAuto: true, obrigatorio: true, herdaResponsavel: false },
  { origem: 'Anual Educação Presumido', destino: 'Encerramento + ECD + ECF Educação', ordem: 0, iniciaAuto: true, obrigatorio: true },
]

async function main() {
  console.log('Seed: Educação — Lucro Presumido\n')
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
