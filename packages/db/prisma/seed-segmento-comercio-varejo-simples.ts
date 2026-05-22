// Seed: Comércio Varejo — Simples Nacional
// 7 templates + 5 encadeamentos. DAS unificado, DEFIS anual, NFC-e, DeSTDA mensal.
import { PrismaClient } from '../src/generated/client'
const prisma = new PrismaClient()
type SeedPasso = { nome: string; slaHoras?: number; obrigatorio?: boolean; textoOrientativo?: string; permiteIgnorar?: boolean; recorrente?: boolean; recorrenciaTipo?: 'MENSAL' | 'TRIMESTRAL' | 'SEMESTRAL' | 'ANUAL' }
type SeedServico = { nome: string; categoria: string; descricao: string; slaHoras: number; valorPadrao?: number; prioridadePadrao?: 'BAIXA' | 'MEDIA' | 'ALTA' | 'URGENTE'; disponivelOrcamento?: boolean; recorrenteMensal?: boolean; etapas: { nome: string; slaHoras?: number; passos: SeedPasso[] }[] }
type SeedEnc = { origem: string; destino: string; ordem?: number; iniciaAuto?: boolean; obrigatorio?: boolean; herdaResponsavel?: boolean; observacao?: string }

const servicos: SeedServico[] = [
  { nome: 'Onboarding Comércio Simples', categoria: 'Legalização', descricao: 'Acolhimento de cliente Simples Nacional — comércio varejo.', slaHoras: 48, prioridadePadrao: 'MEDIA', disponivelOrcamento: false,
    etapas: [
      { nome: 'Diagnóstico', slaHoras: 24, passos: [
        { nome: 'Confirmar opção pelo Simples Nacional (verificação no portal)', slaHoras: 4, obrigatorio: true },
        { nome: 'Identificar Anexo do Simples (I-Comércio, II-Indústria, III-V Serviços)', slaHoras: 4, obrigatorio: true, textoOrientativo: 'LC 123/2006' },
        { nome: 'Verificar inscrição estadual ativa (NFC-e em ES exige IE)', slaHoras: 4, obrigatorio: true },
        { nome: 'Verificar Sublimites estaduais (R$ 3,6 mi vs R$ 4,8 mi)', slaHoras: 4 },
        { nome: '[CONFIRMAR ESCRITÓRIO] Reunião de boas-vindas', slaHoras: 8 },
      ]},
      { nome: 'Configuração no sistema', slaHoras: 24, passos: [
        { nome: 'Cadastrar cliente + áreas', slaHoras: 8, obrigatorio: true },
        { nome: 'Cadastrar certificado A1', slaHoras: 8 },
        { nome: '[CONFIRMAR CLIENTE] Configurar emissor de NFC-e (PAF-NFCe ou similar)', slaHoras: 8 },
      ]},
    ]},
  { nome: 'Mensal Comércio Simples', categoria: 'Fiscal', descricao: 'Cadeia mensal Simples — coleta, lançamentos, DAS, DeSTDA, folha.', slaHoras: 80, prioridadePadrao: 'MEDIA', recorrenteMensal: true, disponivelOrcamento: false,
    etapas: [{ nome: 'Coordenação', slaHoras: 80, passos: [
      { nome: 'Confirmar coleta', slaHoras: 8 },
      { nome: 'Confirmar DAS gerado', slaHoras: 8 },
      { nome: 'Encerrar competência', slaHoras: 8, obrigatorio: true },
    ]}]},
  { nome: 'Coleta + DAS Simples', categoria: 'Fiscal', descricao: 'Coleta de NFC-e/NFs, apuração da receita bruta e geração do DAS unificado.', slaHoras: 24, prioridadePadrao: 'ALTA', recorrenteMensal: true, disponivelOrcamento: false,
    etapas: [
      { nome: 'Coleta', slaHoras: 8, passos: [
        { nome: '[CONFIRMAR ESCRITÓRIO] Solicitar movimento mensal até dia X', slaHoras: 4, obrigatorio: true, recorrente: true, recorrenciaTipo: 'MENSAL' },
        { nome: 'Receber relatório de NFC-e e NF-e do mês', slaHoras: 4, obrigatorio: true },
      ]},
      { nome: 'DAS', slaHoras: 16, passos: [
        { nome: 'Apurar receita bruta acumulada (12 meses) e do mês', slaHoras: 4, obrigatorio: true },
        { nome: 'Calcular alíquota efetiva conforme tabela do Anexo', slaHoras: 4, obrigatorio: true, textoOrientativo: 'LC 123/2006 + tabelas anexas atualizadas anualmente' },
        { nome: 'Gerar DAS no portal Simples Nacional', slaHoras: 4, obrigatorio: true, textoOrientativo: 'Vencimento dia 20 do mês seguinte' },
        { nome: 'Encaminhar DAS ao cliente', slaHoras: 4 },
      ]},
    ]},
  { nome: 'DeSTDA Simples', categoria: 'Fiscal', descricao: 'Declaração Mensal de Substituição Tributária e DIFAL — para Simples com inscrição estadual.', slaHoras: 16, prioridadePadrao: 'MEDIA', recorrenteMensal: true, disponivelOrcamento: false,
    etapas: [{ nome: 'Geração e transmissão', slaHoras: 16, passos: [
      { nome: 'Levantar operações sujeitas a ICMS-ST e DIFAL', slaHoras: 4 },
      { nome: 'Gerar arquivo DeSTDA via SEDIF-SN', slaHoras: 4, obrigatorio: true },
      { nome: 'Transmitir até dia 20 do mês seguinte', slaHoras: 4, obrigatorio: true },
      { nome: 'Arquivar recibo', slaHoras: 4 },
    ]}]},
  { nome: 'Folha Simples + eSocial Simplificado', categoria: 'Trabalhista', descricao: 'Folha do Simples — INSS-patronal incluído no DAS, somente IRRF e FGTS separados.', slaHoras: 24, prioridadePadrao: 'ALTA', recorrenteMensal: true, disponivelOrcamento: false,
    etapas: [{ nome: 'Folha + eSocial', slaHoras: 24, passos: [
      { nome: '[CONFIRMAR CLIENTE] Receber variáveis até dia 25', slaHoras: 4, obrigatorio: true, recorrente: true, recorrenciaTipo: 'MENSAL' },
      { nome: 'Calcular folha + holerites', slaHoras: 8, obrigatorio: true },
      { nome: 'Transmitir eSocial Simplificado S-1200/1210', slaHoras: 4, obrigatorio: true },
      { nome: 'Gerar DARF FGTS', slaHoras: 4, obrigatorio: true },
      { nome: '[CONFIRMAR ESCRITÓRIO] Enviar holerites', slaHoras: 4 },
    ]}]},
  { nome: 'Anual Simples', categoria: 'Fiscal', descricao: 'Cadeia anual Simples — DEFIS, encerramento contábil simplificado.', slaHoras: 80, prioridadePadrao: 'ALTA', disponivelOrcamento: false,
    etapas: [{ nome: 'Coordenação', slaHoras: 80, passos: [
      { nome: 'Confirmar DEFIS transmitida', slaHoras: 8, obrigatorio: true },
      { nome: 'Encerrar ciclo', slaHoras: 8, obrigatorio: true },
    ]}]},
  { nome: 'DEFIS Simples', categoria: 'Fiscal', descricao: 'Declaração de Informações Socioeconômicas e Fiscais (DEFIS) — anual obrigatória.', slaHoras: 56, prioridadePadrao: 'ALTA', disponivelOrcamento: false,
    etapas: [{ nome: 'Geração e transmissão', slaHoras: 56, passos: [
      { nome: 'Apurar receita bruta total do exercício', slaHoras: 8, obrigatorio: true },
      { nome: 'Levantar despesas e investimentos do ano', slaHoras: 16 },
      { nome: 'Levantar quadro societário e empregados', slaHoras: 8 },
      { nome: 'Preencher DEFIS no portal Simples Nacional', slaHoras: 16, obrigatorio: true },
      { nome: 'Transmitir até 31/03 do ano seguinte', slaHoras: 4, obrigatorio: true, textoOrientativo: 'LC 123/2006 + Resolução CGSN 140/2018' },
      { nome: 'Arquivar recibo', slaHoras: 4 },
    ]}]},
]

const encadeamentos: SeedEnc[] = [
  { origem: 'Mensal Comércio Simples', destino: 'Coleta + DAS Simples', ordem: 0, iniciaAuto: true, obrigatorio: true },
  { origem: 'Mensal Comércio Simples', destino: 'DeSTDA Simples', ordem: 1, iniciaAuto: true, obrigatorio: false, herdaResponsavel: false, observacao: 'Opcional — só se cliente tem inscrição estadual ativa.' },
  { origem: 'Mensal Comércio Simples', destino: 'Folha Simples + eSocial Simplificado', ordem: 2, iniciaAuto: true, obrigatorio: false, herdaResponsavel: false, observacao: 'Opcional — só se cliente tem empregados.' },
  { origem: 'Anual Simples', destino: 'DEFIS Simples', ordem: 0, iniciaAuto: true, obrigatorio: true },
]

async function main() {
  console.log('Seed: Comércio Varejo — Simples Nacional\n')
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
