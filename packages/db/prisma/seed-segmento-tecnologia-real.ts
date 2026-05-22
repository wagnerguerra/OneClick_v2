// Seed: Tecnologia/SaaS — Lucro Real
// 9 templates + 7 encadeamentos. PIS/COFINS não-cumulativo + EFD-Contribuições com créditos.
import { PrismaClient } from '../src/generated/client'
const prisma = new PrismaClient()
type SeedPasso = { nome: string; slaHoras?: number; obrigatorio?: boolean; textoOrientativo?: string; permiteIgnorar?: boolean; recorrente?: boolean; recorrenciaTipo?: 'MENSAL' | 'TRIMESTRAL' | 'SEMESTRAL' | 'ANUAL' }
type SeedServico = { nome: string; categoria: string; descricao: string; slaHoras: number; valorPadrao?: number; prioridadePadrao?: 'BAIXA' | 'MEDIA' | 'ALTA' | 'URGENTE'; disponivelOrcamento?: boolean; recorrenteMensal?: boolean; etapas: { nome: string; slaHoras?: number; passos: SeedPasso[] }[] }
type SeedEnc = { origem: string; destino: string; ordem?: number; iniciaAuto?: boolean; obrigatorio?: boolean; herdaResponsavel?: boolean; observacao?: string }

const servicos: SeedServico[] = [
  { nome: 'Onboarding Tecnologia Real', categoria: 'Legalização', descricao: 'Acolhimento Tech Lucro Real — diagnóstico ISS, PIS/COFINS não-cumulativo, Lei do Bem.', slaHoras: 80, prioridadePadrao: 'ALTA', disponivelOrcamento: false,
    etapas: [
      { nome: 'Diagnóstico', slaHoras: 40, passos: [
        { nome: 'Levantar CNAEs (62xx-63xx)', slaHoras: 4, obrigatorio: true },
        { nome: 'Confirmar opção Lucro Real (anual ou trimestral)', slaHoras: 8, obrigatorio: true },
        { nome: 'Verificar ISS no município (alíquota e código)', slaHoras: 4, obrigatorio: true },
        { nome: 'Mapear créditos PIS/COFINS sobre insumos tech (cloud, licenças, etc)', slaHoras: 8 },
        { nome: 'Avaliar Lei do Bem (P&D)', slaHoras: 8, permiteIgnorar: true },
        { nome: 'Mapear receitas de exportação (imunidade ISS + PIS/COFINS)', slaHoras: 8 },
      ]},
      { nome: 'Configuração no sistema', slaHoras: 40, passos: [
        { nome: 'Cadastrar cliente + áreas', slaHoras: 8, obrigatorio: true },
        { nome: 'Importar plano de contas tech (com contas detalhadas para PIS/COFINS recuperável)', slaHoras: 16 },
        { nome: 'Cadastrar certificado A1', slaHoras: 8, obrigatorio: true },
        { nome: 'Habilitar Caixa Postal e-CAC', slaHoras: 8 },
      ]},
    ]},
  { nome: 'Mensal Tecnologia Real', categoria: 'Fiscal', descricao: 'Cadeia mensal Tech Real.', slaHoras: 200, prioridadePadrao: 'ALTA', recorrenteMensal: true, disponivelOrcamento: false,
    etapas: [{ nome: 'Coordenação', slaHoras: 200, passos: [
      { nome: 'Confirmar coleta', slaHoras: 16 },
      { nome: 'Confirmar apurações', slaHoras: 16 },
      { nome: 'Encerrar competência', slaHoras: 8, obrigatorio: true },
    ]}]},
  { nome: 'Coleta + Lançamentos Mensal Tech Real', categoria: 'Contábil', descricao: 'Coleta NFS-e, despesas, créditos PIS/COFINS.', slaHoras: 40, prioridadePadrao: 'ALTA', recorrenteMensal: true, disponivelOrcamento: false,
    etapas: [{ nome: 'Coleta + lançamentos', slaHoras: 40, passos: [
      { nome: '[CONFIRMAR ESCRITÓRIO] Solicitar NFS-e e despesas até dia X', slaHoras: 4, obrigatorio: true, recorrente: true, recorrenciaTipo: 'MENSAL' },
      { nome: 'Receber NFS-e emitidas', slaHoras: 4, obrigatorio: true },
      { nome: 'Receber NFs de entrada (insumos com crédito)', slaHoras: 8, obrigatorio: true },
      { nome: 'Receber extratos bancários', slaHoras: 4, obrigatorio: true },
      { nome: 'Lançar receitas e despesas', slaHoras: 16 },
      { nome: 'Conciliar caixa/banco', slaHoras: 4, obrigatorio: true },
    ]}]},
  { nome: 'Apuração ISS + PIS/COFINS Não-cumulativo Tech', categoria: 'Fiscal', descricao: 'ISS + PIS (1,65%) + COFINS (7,6%) não-cumulativos com créditos.', slaHoras: 32, prioridadePadrao: 'ALTA', recorrenteMensal: true, disponivelOrcamento: false,
    etapas: [
      { nome: 'ISS', slaHoras: 8, passos: [
        { nome: 'Apurar receita de serviços', slaHoras: 2, obrigatorio: true },
        { nome: 'Calcular ISS (alíquota municipal)', slaHoras: 2, obrigatorio: true },
        { nome: 'Gerar guia ISS', slaHoras: 4, obrigatorio: true },
      ]},
      { nome: 'PIS/COFINS', slaHoras: 24, passos: [
        { nome: 'Apurar receitas tributadas + monofásicas', slaHoras: 4, obrigatorio: true },
        { nome: 'Apurar créditos sobre cloud, licenças, energia, ativo imobilizado', slaHoras: 8, obrigatorio: true, textoOrientativo: 'Lei 10.637/2002 art. 3º' },
        { nome: 'Calcular saldo devedor', slaHoras: 4, obrigatorio: true },
        { nome: 'Gerar DARFs PIS (6912) + COFINS (5856)', slaHoras: 4, obrigatorio: true, textoOrientativo: 'Vencimento dia 25' },
        { nome: 'Encaminhar guias', slaHoras: 4 },
      ]},
    ]},
  { nome: 'IRPJ/CSLL e Folha Tech Real', categoria: 'Fiscal', descricao: 'IRPJ/CSLL Real + folha + eSocial + DCTFWeb.', slaHoras: 56, prioridadePadrao: 'ALTA', recorrenteMensal: true, disponivelOrcamento: false,
    etapas: [
      { nome: 'IRPJ/CSLL mensal', slaHoras: 16, passos: [
        { nome: 'Apurar lucro real estimado', slaHoras: 8, obrigatorio: true },
        { nome: 'Gerar DARFs IRPJ + CSLL', slaHoras: 4, obrigatorio: true },
        { nome: 'Encaminhar', slaHoras: 4 },
      ]},
      { nome: 'Folha + eSocial + DCTFWeb', slaHoras: 40, passos: [
        { nome: '[CONFIRMAR CLIENTE] Receber variáveis até dia 25', slaHoras: 4, obrigatorio: true, recorrente: true, recorrenciaTipo: 'MENSAL' },
        { nome: 'Folha + holerites', slaHoras: 8, obrigatorio: true },
        { nome: 'Transmitir eSocial S-1200/1210', slaHoras: 8, obrigatorio: true },
        { nome: 'Transmitir DCTFWeb dia 15', slaHoras: 4, obrigatorio: true },
        { nome: 'Gerar DARF INSS + FGTS', slaHoras: 8, obrigatorio: true },
        { nome: '[CONFIRMAR ESCRITÓRIO] Enviar holerites', slaHoras: 8 },
      ]},
    ]},
  { nome: 'EFD-Contribuições Tech Real', categoria: 'Fiscal', descricao: 'EFD-Contrib com créditos sobre insumos tech.', slaHoras: 32, prioridadePadrao: 'ALTA', recorrenteMensal: true, disponivelOrcamento: false,
    etapas: [{ nome: 'Geração e transmissão', slaHoras: 32, passos: [
      { nome: 'Gerar blocos A (créditos), C (saídas), M (consolidação)', slaHoras: 16, obrigatorio: true },
      { nome: 'Validar com PVA-Contribuições', slaHoras: 8 },
      { nome: 'Transmitir até dia 10 do 2º mês subsequente', slaHoras: 4, obrigatorio: true, textoOrientativo: 'IN RFB 1.252/2012' },
      { nome: 'Arquivar recibo', slaHoras: 4 },
    ]}]},
  { nome: 'Conciliação e Balancete Tech Real', categoria: 'Contábil', descricao: 'Conciliação e balancete mensal Tech Real.', slaHoras: 24, prioridadePadrao: 'MEDIA', recorrenteMensal: true, disponivelOrcamento: false,
    etapas: [{ nome: 'Conciliação + balancete', slaHoras: 24, passos: [
      { nome: 'Conciliar bancos', slaHoras: 4, obrigatorio: true },
      { nome: 'Conciliar PIS/COFINS recuperáveis', slaHoras: 8 },
      { nome: 'Gerar balancete + DRE', slaHoras: 8, obrigatorio: true },
      { nome: '[CONFIRMAR ESCRITÓRIO] Enviar ao cliente', slaHoras: 4 },
    ]}]},
  { nome: 'Anual Tech Real', categoria: 'Contábil', descricao: 'Cadeia anual.', slaHoras: 320, prioridadePadrao: 'ALTA', disponivelOrcamento: false,
    etapas: [{ nome: 'Coordenação', slaHoras: 320, passos: [
      { nome: 'Confirmar encerramento, ECD, ECF', slaHoras: 24, obrigatorio: true },
      { nome: 'Encerrar ciclo', slaHoras: 8, obrigatorio: true },
    ]}]},
  { nome: 'Encerramento + ECD + ECF Tech Real', categoria: 'Fiscal', descricao: 'Fechamento exercício + ECD + ECF Tech Real.', slaHoras: 200, prioridadePadrao: 'ALTA', disponivelOrcamento: false,
    etapas: [
      { nome: 'Encerramento', slaHoras: 40, passos: [
        { nome: 'Provisões e ajustes', slaHoras: 8, obrigatorio: true },
        { nome: 'Resultado e IRPJ/CSLL anuais', slaHoras: 16, obrigatorio: true },
        { nome: 'Balanço + DRE + DMPL + DFC', slaHoras: 16 },
      ]},
      { nome: 'ECD', slaHoras: 80, passos: [
        { nome: 'Gerar e validar ECD', slaHoras: 32, obrigatorio: true },
        { nome: '[CONFIRMAR CLIENTE] Assinaturas digitais', slaHoras: 16, obrigatorio: true },
        { nome: 'Transmitir até último dia útil de junho', slaHoras: 16, obrigatorio: true, textoOrientativo: 'IN RFB 2.003/2021' },
        { nome: 'Registrar livros na Junta Comercial', slaHoras: 16 },
      ]},
      { nome: 'ECF', slaHoras: 80, passos: [
        { nome: 'Importar dados ECD + apurar e-LALUR/e-LACS', slaHoras: 32, obrigatorio: true },
        { nome: 'Validar com PVA-ECF + assinaturas', slaHoras: 16, obrigatorio: true },
        { nome: 'Transmitir até último dia útil de julho', slaHoras: 16, obrigatorio: true, textoOrientativo: 'IN RFB 2.004/2021' },
        { nome: 'Gerar DARF saldo + encaminhar resumo', slaHoras: 16 },
      ]},
    ]},
]

const encadeamentos: SeedEnc[] = [
  { origem: 'Mensal Tecnologia Real', destino: 'Coleta + Lançamentos Mensal Tech Real', ordem: 0, iniciaAuto: true, obrigatorio: true },
  { origem: 'Coleta + Lançamentos Mensal Tech Real', destino: 'Apuração ISS + PIS/COFINS Não-cumulativo Tech', ordem: 0, iniciaAuto: true, obrigatorio: true, herdaResponsavel: false },
  { origem: 'Coleta + Lançamentos Mensal Tech Real', destino: 'IRPJ/CSLL e Folha Tech Real', ordem: 1, iniciaAuto: true, obrigatorio: true, herdaResponsavel: false },
  { origem: 'Apuração ISS + PIS/COFINS Não-cumulativo Tech', destino: 'EFD-Contribuições Tech Real', ordem: 0, iniciaAuto: true, obrigatorio: true },
  { origem: 'EFD-Contribuições Tech Real', destino: 'Conciliação e Balancete Tech Real', ordem: 0, iniciaAuto: true, obrigatorio: true, herdaResponsavel: false },
  { origem: 'Anual Tech Real', destino: 'Encerramento + ECD + ECF Tech Real', ordem: 0, iniciaAuto: true, obrigatorio: true },
]

async function main() {
  console.log('Seed: Tecnologia/SaaS — Lucro Real\n')
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
