// Seed: Indústria — Lucro Real (com Bloco K)
// ============================================================
// Cria 14 templates + 11 encadeamentos. Estrutura:
//   1) Onboarding Indústria LR (raiz) → Setup Tributário Industrial → Plano de Contas Industrial
//   2) Mensal Indústria LR (recorrente) → Coleta → Lançamentos → Apuração ICMS+IPI → PIS/COFINS → IRPJ/CSLL → Folha → EFD-ICMS/IPI (com Bloco K) → EFD-Contrib → Conciliação
//   3) Anual Indústria LR → Encerramento → ECD → ECF
//
// Particularidade chave: Bloco K (controle de produção/estoque) — IN RFB 2.052/2021
// Compete Industrial-ES (Lei 10.567/2016) — opcional, condicional ao porte
//
// Fontes: vide docs/fontes-templates-segmentos.md
// Executar: pnpm --filter @saas/db exec tsx prisma/seed-segmento-industria-lucro-real.ts

import { PrismaClient } from '../src/generated/client'

const prisma = new PrismaClient()

type SeedPasso = { nome: string; slaHoras?: number; obrigatorio?: boolean; textoOrientativo?: string; permiteIgnorar?: boolean; recorrente?: boolean; recorrenciaTipo?: 'MENSAL' | 'TRIMESTRAL' | 'SEMESTRAL' | 'ANUAL' }
type SeedEtapa = { nome: string; slaHoras?: number; passos: SeedPasso[] }
type SeedServico = { nome: string; categoria: string; descricao: string; slaHoras: number; valorPadrao?: number; prioridadePadrao?: 'BAIXA' | 'MEDIA' | 'ALTA' | 'URGENTE'; disponivelOrcamento?: boolean; recorrenteMensal?: boolean; etapas: SeedEtapa[] }
type SeedEnc = { origem: string; destino: string; ordem?: number; iniciaAuto?: boolean; obrigatorio?: boolean; herdaResponsavel?: boolean; observacao?: string }

const servicos: SeedServico[] = [
  {
    nome: 'Onboarding Indústria LR',
    categoria: 'Legalização',
    descricao: 'Acolhimento de cliente industrial Lucro Real — diagnóstico de processos produtivos, IPI, regime de apuração.',
    slaHoras: 96, prioridadePadrao: 'ALTA', disponivelOrcamento: false,
    etapas: [
      { nome: 'Diagnóstico fiscal-industrial', slaHoras: 48, passos: [
        { nome: 'Levantar CNAEs (CNAE indústria geralmente 10xxx-32xxx)', slaHoras: 4, obrigatorio: true },
        { nome: 'Identificar produtos fabricados e classificação fiscal (NCM)', slaHoras: 8, obrigatorio: true },
        { nome: 'Avaliar elegibilidade IPI (alíquota por TIPI)', slaHoras: 4 },
        { nome: 'Verificar inscrição estadual ativa (SEFAZ-ES)', slaHoras: 4, obrigatorio: true },
        { nome: 'Mapear estrutura fabril (filiais, centros de custo, linhas de produção)', slaHoras: 8 },
        { nome: '[CONFIRMAR ESCRITÓRIO] Reunião com produção/PCP do cliente', slaHoras: 8 },
        { nome: 'Avaliar elegibilidade Compete Industrial-ES (Lei 10.567/2016)', slaHoras: 8, permiteIgnorar: true, textoOrientativo: 'Benefício fiscal estadual para indústrias instaladas no ES.' },
        { nome: 'Definir periodicidade IRPJ/CSLL (anual estimativa vs trimestral)', slaHoras: 4, obrigatorio: true },
      ]},
      { nome: 'Configuração no sistema', slaHoras: 48, passos: [
        { nome: 'Cadastrar cliente com filiais', slaHoras: 8, obrigatorio: true },
        { nome: 'Vincular áreas (Fiscal, Contábil, Trabalhista)', slaHoras: 4, obrigatorio: true },
        { nome: 'Importar plano de contas industrial', slaHoras: 8 },
        { nome: 'Configurar SCI/Omie para indústria (estoques múltiplos)', slaHoras: 8 },
        { nome: 'Cadastrar certificado A1 e validar e-CAC', slaHoras: 8, obrigatorio: true },
        { nome: 'Habilitar consulta automática Caixa Postal e-CAC', slaHoras: 4 },
        { nome: 'Configurar acesso SEFAZ-ES (DT-e ou similar)', slaHoras: 8 },
      ]},
    ],
  },
  {
    nome: 'Setup Tributário Industrial LR',
    categoria: 'Fiscal',
    descricao: 'Configuração tributária inicial para indústria — IPI, ICMS-IPI integrado, PIS/COFINS não-cumulativo, Bloco K.',
    slaHoras: 48, prioridadePadrao: 'ALTA', disponivelOrcamento: false,
    etapas: [
      { nome: 'IPI', slaHoras: 16, passos: [
        { nome: 'Mapear NCMs e alíquotas IPI por produto', slaHoras: 8, obrigatorio: true, textoOrientativo: 'Decreto 7.660/2011 (TIPI)' },
        { nome: 'Identificar produtos com isenção/redução de IPI', slaHoras: 4 },
        { nome: 'Configurar livro de apuração de IPI', slaHoras: 4 },
      ]},
      { nome: 'PIS/COFINS', slaHoras: 16, passos: [
        { nome: 'Mapear créditos sobre matéria-prima, energia, fretes', slaHoras: 8, obrigatorio: true },
        { nome: 'Identificar produção monofásica (se houver)', slaHoras: 4 },
        { nome: 'Configurar planilha base de apuração', slaHoras: 4 },
      ]},
      { nome: 'Bloco K', slaHoras: 16, passos: [
        { nome: 'Verificar obrigatoriedade do Bloco K (faturamento e CNAE)', slaHoras: 4, obrigatorio: true, textoOrientativo: 'IN RFB 2.052/2021' },
        { nome: '[CONFIRMAR CLIENTE] Levantar fichas técnicas dos produtos (BOM — Bill of Materials)', slaHoras: 8, obrigatorio: true },
        { nome: 'Configurar mapeamento estoque-produção no sistema do cliente', slaHoras: 4 },
      ]},
    ],
  },
  {
    nome: 'Plano de Contas Industrial',
    categoria: 'Contábil',
    descricao: 'Plano de contas para indústria — estoques (matéria-prima, em elaboração, acabados), CPV, custos diretos/indiretos.',
    slaHoras: 24, prioridadePadrao: 'MEDIA', disponivelOrcamento: false,
    etapas: [
      { nome: 'Importação', slaHoras: 24, passos: [
        { nome: 'Importar plano de contas referencial industrial (NBC TG)', slaHoras: 8 },
        { nome: 'Configurar contas de estoque (matéria-prima, em elaboração, produtos acabados)', slaHoras: 4, obrigatorio: true },
        { nome: 'Configurar contas de CPV (custo dos produtos vendidos)', slaHoras: 4, obrigatorio: true },
        { nome: 'Configurar contas de IPI/ICMS recuperável', slaHoras: 4 },
        { nome: '[CONFIRMAR ESCRITÓRIO] Ajustar centros de custo (linhas de produção)', slaHoras: 4 },
      ]},
    ],
  },
  {
    nome: 'Mensal Indústria LR',
    categoria: 'Fiscal',
    descricao: 'Cadeia mensal completa de fechamento industrial Lucro Real.',
    slaHoras: 280, prioridadePadrao: 'ALTA', recorrenteMensal: true, disponivelOrcamento: false,
    etapas: [
      { nome: 'Coordenação mensal', slaHoras: 280, passos: [
        { nome: 'Confirmar coleta completa', slaHoras: 24 },
        { nome: 'Confirmar apurações concluídas', slaHoras: 24 },
        { nome: 'Confirmar obrigações transmitidas', slaHoras: 24 },
        { nome: 'Encerrar competência', slaHoras: 8, obrigatorio: true },
      ]},
    ],
  },
  {
    nome: 'Coleta e Lançamentos Mensal Indústria',
    categoria: 'Contábil',
    descricao: 'Recebimento de NFs, extratos, relatórios de produção e lançamentos contábeis.',
    slaHoras: 80, prioridadePadrao: 'ALTA', recorrenteMensal: true, disponivelOrcamento: false,
    etapas: [
      { nome: 'Coleta', slaHoras: 24, passos: [
        { nome: '[CONFIRMAR ESCRITÓRIO] Solicitar NFs entrada/saída até dia X', slaHoras: 4, obrigatorio: true, recorrente: true, recorrenciaTipo: 'MENSAL' },
        { nome: '[CONFIRMAR CLIENTE] Receber relatório de produção do mês (PCP)', slaHoras: 8, obrigatorio: true },
        { nome: 'Receber extratos bancários', slaHoras: 4, obrigatorio: true },
        { nome: 'Validar integridade dos documentos', slaHoras: 8 },
      ]},
      { nome: 'Lançamentos', slaHoras: 56, passos: [
        { nome: 'Importar XMLs entrada (matérias-primas, insumos, ativo)', slaHoras: 16, obrigatorio: true },
        { nome: 'Importar XMLs saída (produtos acabados)', slaHoras: 12, obrigatorio: true },
        { nome: 'Lançar movimentação de estoque (produção e baixa)', slaHoras: 16 },
        { nome: 'Lançar despesas administrativas e comerciais', slaHoras: 8 },
        { nome: 'Conciliar caixa/banco', slaHoras: 4, obrigatorio: true },
      ]},
    ],
  },
  {
    nome: 'Apuração ICMS + IPI Industrial',
    categoria: 'Fiscal',
    descricao: 'Apuração mensal integrada de ICMS e IPI — créditos sobre matéria-prima, débitos sobre produção, ICMS-ST se aplicável.',
    slaHoras: 56, prioridadePadrao: 'ALTA', recorrenteMensal: true, disponivelOrcamento: false,
    etapas: [
      { nome: 'ICMS', slaHoras: 24, passos: [
        { nome: 'Apurar saldo credor/devedor de ICMS', slaHoras: 8, obrigatorio: true },
        { nome: 'Aplicar reduções/diferimentos (Compete Industrial se elegível)', slaHoras: 4 },
        { nome: 'Apurar ICMS-ST (se houver vendas a contribuintes finais)', slaHoras: 4, permiteIgnorar: true },
        { nome: 'Gerar DUA-e', slaHoras: 4, obrigatorio: true },
        { nome: 'Encaminhar guia ao cliente', slaHoras: 4 },
      ]},
      { nome: 'IPI', slaHoras: 32, passos: [
        { nome: 'Apurar livro de IPI (entradas vs saídas)', slaHoras: 8, obrigatorio: true },
        { nome: 'Calcular IPI devido por NCM', slaHoras: 8, obrigatorio: true },
        { nome: 'Considerar isenções/reduções aplicáveis', slaHoras: 4 },
        { nome: 'Gerar DARF de IPI (código de receita por NCM)', slaHoras: 8, obrigatorio: true, textoOrientativo: 'Vencimento dia 25 do mês seguinte' },
        { nome: 'Encaminhar DARFs ao cliente', slaHoras: 4 },
      ]},
    ],
  },
  {
    nome: 'Apuração PIS/COFINS Não-cumulativo Industrial',
    categoria: 'Fiscal',
    descricao: 'Apuração com créditos amplos sobre insumos industriais (matéria-prima, energia elétrica, depreciação de máquinas).',
    slaHoras: 32, prioridadePadrao: 'ALTA', recorrenteMensal: true, disponivelOrcamento: false,
    etapas: [
      { nome: 'Cálculo', slaHoras: 24, passos: [
        { nome: 'Apurar receitas de venda de produtos', slaHoras: 4, obrigatorio: true },
        { nome: 'Identificar receitas monofásicas (se aplicável)', slaHoras: 4, permiteIgnorar: true },
        { nome: 'Apurar créditos sobre matéria-prima', slaHoras: 8, obrigatorio: true },
        { nome: 'Apurar créditos sobre energia elétrica industrial', slaHoras: 4 },
        { nome: 'Apurar créditos sobre depreciação de máquinas (ativo imobilizado)', slaHoras: 4 },
      ]},
      { nome: 'Recolhimento', slaHoras: 8, passos: [
        { nome: 'Gerar DARFs PIS/COFINS', slaHoras: 4, obrigatorio: true, textoOrientativo: 'Vencimento dia 25 do mês seguinte' },
        { nome: 'Encaminhar ao cliente', slaHoras: 4 },
      ]},
    ],
  },
  {
    nome: 'EFD-ICMS/IPI Industrial (com Bloco K)',
    categoria: 'Fiscal',
    descricao: 'EFD-ICMS/IPI mensal — inclui Bloco K obrigatório para indústrias acima de R$ 78mi (anual) ou conforme cronograma SEFAZ.',
    slaHoras: 48, prioridadePadrao: 'ALTA', recorrenteMensal: true, disponivelOrcamento: false,
    etapas: [
      { nome: 'Geração', slaHoras: 32, passos: [
        { nome: 'Gerar bloco C (NFs entrada/saída)', slaHoras: 4, obrigatorio: true },
        { nome: 'Gerar bloco E (apuração ICMS e IPI)', slaHoras: 4, obrigatorio: true },
        { nome: 'Gerar bloco H (inventário — anual ou mensal)', slaHoras: 4 },
        { nome: '[CONFIRMAR CLIENTE] Gerar Bloco K (controle de produção e estoque)', slaHoras: 16, obrigatorio: true, textoOrientativo: 'IN RFB 2.052/2021 — fichas técnicas e movimentação produção/consumo' },
        { nome: 'Validar com PVA-Fiscal', slaHoras: 4 },
      ]},
      { nome: 'Transmissão', slaHoras: 16, passos: [
        { nome: 'Transmitir EFD-ICMS/IPI até dia 15', slaHoras: 8, obrigatorio: true },
        { nome: 'Arquivar recibo', slaHoras: 8 },
      ]},
    ],
  },
  {
    nome: 'EFD-Contribuições Industrial',
    categoria: 'Fiscal',
    descricao: 'EFD-Contribuições com créditos amplos do regime industrial.',
    slaHoras: 32, prioridadePadrao: 'ALTA', recorrenteMensal: true, disponivelOrcamento: false,
    etapas: [
      { nome: 'Geração e transmissão', slaHoras: 32, passos: [
        { nome: 'Gerar blocos A (créditos), C (saídas), M (consolidação)', slaHoras: 16, obrigatorio: true },
        { nome: 'Validar com PVA-Contribuições', slaHoras: 8 },
        { nome: 'Transmitir até dia 10 do 2º mês subsequente', slaHoras: 4, obrigatorio: true, textoOrientativo: 'IN RFB 1.252/2012' },
        { nome: 'Arquivar recibo', slaHoras: 4 },
      ]},
    ],
  },
  {
    nome: 'IRPJ/CSLL e Folha Industrial',
    categoria: 'Fiscal',
    descricao: 'IRPJ/CSLL estimativa mensal + folha + eSocial + DCTFWeb (mesmo padrão do atacadista, sem mudanças).',
    slaHoras: 56, prioridadePadrao: 'ALTA', recorrenteMensal: true, disponivelOrcamento: false,
    etapas: [
      { nome: 'IRPJ/CSLL mensal', slaHoras: 16, passos: [
        { nome: 'Apurar lucro real estimado (ou trimestral)', slaHoras: 8, obrigatorio: true },
        { nome: 'Gerar DARFs IRPJ + CSLL', slaHoras: 4, obrigatorio: true },
        { nome: 'Encaminhar guias', slaHoras: 4 },
      ]},
      { nome: 'Folha + eSocial + DCTFWeb', slaHoras: 40, passos: [
        { nome: '[CONFIRMAR CLIENTE] Receber variáveis (horas, faltas, comissões)', slaHoras: 4, obrigatorio: true, recorrente: true, recorrenciaTipo: 'MENSAL' },
        { nome: 'Calcular folha + holerites', slaHoras: 8, obrigatorio: true },
        { nome: 'Transmitir eSocial S-1200/1210', slaHoras: 8, obrigatorio: true },
        { nome: 'Transmitir DCTFWeb dia 15', slaHoras: 4, obrigatorio: true },
        { nome: 'Gerar DARF INSS + FGTS', slaHoras: 8, obrigatorio: true },
        { nome: '[CONFIRMAR ESCRITÓRIO] Enviar holerites a funcionários', slaHoras: 8 },
      ]},
    ],
  },
  {
    nome: 'Conciliação e Balancete Industrial',
    categoria: 'Contábil',
    descricao: 'Conciliações finais (banco, estoque, ICMS, IPI, PIS/COFINS) e balancete mensal.',
    slaHoras: 32, prioridadePadrao: 'MEDIA', recorrenteMensal: true, disponivelOrcamento: false,
    etapas: [
      { nome: 'Conciliações', slaHoras: 24, passos: [
        { nome: 'Conciliar saldos bancários', slaHoras: 4, obrigatorio: true },
        { nome: 'Conciliar estoque com Bloco K (saldos físicos vs contábeis)', slaHoras: 8, obrigatorio: true },
        { nome: 'Conciliar ICMS, IPI, PIS, COFINS recuperáveis', slaHoras: 8 },
        { nome: 'Apurar CPV do mês', slaHoras: 4 },
      ]},
      { nome: 'Balancete', slaHoras: 8, passos: [
        { nome: 'Gerar balancete + DRE', slaHoras: 4, obrigatorio: true },
        { nome: '[CONFIRMAR ESCRITÓRIO] Enviar ao cliente', slaHoras: 4 },
      ]},
    ],
  },
  {
    nome: 'Anual Indústria LR',
    categoria: 'Contábil',
    descricao: 'Cadeia anual de fechamento industrial.',
    slaHoras: 480, prioridadePadrao: 'ALTA', disponivelOrcamento: false,
    etapas: [
      { nome: 'Coordenação', slaHoras: 480, passos: [
        { nome: 'Confirmar encerramento, ECD, ECF', slaHoras: 24, obrigatorio: true },
        { nome: 'Encerrar ciclo anual', slaHoras: 8, obrigatorio: true },
      ]},
    ],
  },
  {
    nome: 'Encerramento Anual Industrial',
    categoria: 'Contábil',
    descricao: 'Apuração definitiva e demonstrações do exercício industrial.',
    slaHoras: 80, prioridadePadrao: 'ALTA', disponivelOrcamento: false,
    etapas: [
      { nome: 'Ajustes', slaHoras: 40, passos: [
        { nome: 'Apurar provisões (férias, 13º, IR, IPI a recuperar)', slaHoras: 8, obrigatorio: true },
        { nome: 'Avaliar estoque a custo médio (incluindo produtos em elaboração)', slaHoras: 8 },
        { nome: 'Ajustar depreciações de máquinas industriais', slaHoras: 8 },
        { nome: 'Apurar resultado do exercício', slaHoras: 8, obrigatorio: true },
        { nome: 'Lançar IRPJ + CSLL definitivos', slaHoras: 8, obrigatorio: true },
      ]},
      { nome: 'Demonstrativos', slaHoras: 40, passos: [
        { nome: 'Gerar Balanço Patrimonial', slaHoras: 8, obrigatorio: true },
        { nome: 'Gerar DRE + DMPL + DFC', slaHoras: 16 },
        { nome: 'Elaborar notas explicativas industriais (ex: avaliação de estoque)', slaHoras: 8 },
        { nome: '[CONFIRMAR ESCRITÓRIO] Apresentar ao cliente', slaHoras: 8 },
      ]},
    ],
  },
  {
    nome: 'ECD + ECF Industrial',
    categoria: 'Fiscal',
    descricao: 'Geração e transmissão da ECD e ECF (sequencial — ECF depende de ECD transmitida).',
    slaHoras: 200, prioridadePadrao: 'ALTA', disponivelOrcamento: false,
    etapas: [
      { nome: 'ECD', slaHoras: 80, passos: [
        { nome: 'Gerar ECD a partir do balanço fechado', slaHoras: 32, obrigatorio: true },
        { nome: 'Validar com PVA-ECD', slaHoras: 16 },
        { nome: '[CONFIRMAR CLIENTE] Coletar assinaturas digitais', slaHoras: 16, obrigatorio: true },
        { nome: 'Transmitir até último dia útil de junho', slaHoras: 8, obrigatorio: true, textoOrientativo: 'IN RFB 2.003/2021' },
        { nome: 'Registrar livros na Junta Comercial', slaHoras: 8 },
      ]},
      { nome: 'ECF', slaHoras: 120, passos: [
        { nome: 'Importar dados da ECD', slaHoras: 8, obrigatorio: true },
        { nome: 'Apurar e-LALUR e e-LACS', slaHoras: 32, obrigatorio: true },
        { nome: 'Calcular IRPJ + CSLL definitivos', slaHoras: 16, obrigatorio: true },
        { nome: 'Validar com PVA-ECF', slaHoras: 16 },
        { nome: '[CONFIRMAR CLIENTE] Coletar assinaturas', slaHoras: 16, obrigatorio: true },
        { nome: 'Transmitir até último dia útil de julho', slaHoras: 8, obrigatorio: true, textoOrientativo: 'IN RFB 2.004/2021' },
        { nome: 'Gerar DARF saldo a pagar (se houver)', slaHoras: 8 },
        { nome: '[CONFIRMAR ESCRITÓRIO] Encaminhar resumo ao cliente', slaHoras: 16 },
      ]},
    ],
  },
]

const encadeamentos: SeedEnc[] = [
  { origem: 'Onboarding Indústria LR', destino: 'Setup Tributário Industrial LR', ordem: 0, iniciaAuto: true, obrigatorio: true, herdaResponsavel: true },
  { origem: 'Onboarding Indústria LR', destino: 'Plano de Contas Industrial', ordem: 1, iniciaAuto: true, obrigatorio: true, herdaResponsavel: true },
  { origem: 'Mensal Indústria LR', destino: 'Coleta e Lançamentos Mensal Indústria', ordem: 0, iniciaAuto: true, obrigatorio: true, herdaResponsavel: true },
  { origem: 'Coleta e Lançamentos Mensal Indústria', destino: 'Apuração ICMS + IPI Industrial', ordem: 0, iniciaAuto: true, obrigatorio: true, herdaResponsavel: false },
  { origem: 'Coleta e Lançamentos Mensal Indústria', destino: 'Apuração PIS/COFINS Não-cumulativo Industrial', ordem: 1, iniciaAuto: true, obrigatorio: true, herdaResponsavel: false },
  { origem: 'Coleta e Lançamentos Mensal Indústria', destino: 'IRPJ/CSLL e Folha Industrial', ordem: 2, iniciaAuto: true, obrigatorio: true, herdaResponsavel: false },
  { origem: 'Apuração ICMS + IPI Industrial', destino: 'EFD-ICMS/IPI Industrial (com Bloco K)', ordem: 0, iniciaAuto: true, obrigatorio: true, herdaResponsavel: true },
  { origem: 'Apuração PIS/COFINS Não-cumulativo Industrial', destino: 'EFD-Contribuições Industrial', ordem: 0, iniciaAuto: true, obrigatorio: true, herdaResponsavel: true },
  { origem: 'EFD-ICMS/IPI Industrial (com Bloco K)', destino: 'Conciliação e Balancete Industrial', ordem: 0, iniciaAuto: true, obrigatorio: true, herdaResponsavel: false },
  { origem: 'Anual Indústria LR', destino: 'Encerramento Anual Industrial', ordem: 0, iniciaAuto: true, obrigatorio: true, herdaResponsavel: true },
  { origem: 'Encerramento Anual Industrial', destino: 'ECD + ECF Industrial', ordem: 0, iniciaAuto: true, obrigatorio: true, herdaResponsavel: true },
]

async function main() {
  console.log('Seed: Indústria — Lucro Real (com Bloco K)\n')
  const servicoIdByName = new Map<string, string>()
  let criados = 0, atualizados = 0
  for (const s of servicos) {
    const existing = await prisma.servico.findFirst({ where: { nome: s.nome, empresaId: null } })
    const data = { nome: s.nome, categoria: s.categoria, descricao: s.descricao, slaHoras: s.slaHoras, prioridadePadrao: (s.prioridadePadrao ?? 'MEDIA') as any, ativo: true, empresaId: null }
    let servico
    if (existing) {
      servico = await prisma.servico.update({ where: { id: existing.id }, data })
      await prisma.servicoEtapa.deleteMany({ where: { servicoId: servico.id } })
      atualizados++
    } else {
      servico = await prisma.servico.create({ data })
      criados++
    }
    await prisma.$executeRawUnsafe(`UPDATE servicos SET valor_padrao = $1, disponivel_orcamento = $2, recorrente_mensal = $3 WHERE id = $4`, s.valorPadrao ?? null, s.disponivelOrcamento ?? false, s.recorrenteMensal ?? false, servico.id)
    for (let ei = 0; ei < s.etapas.length; ei++) {
      const et = s.etapas[ei]!
      const etapa = await prisma.servicoEtapa.create({ data: { servicoId: servico.id, nome: et.nome, ordem: ei, slaHoras: et.slaHoras ?? null } })
      for (let pi = 0; pi < et.passos.length; pi++) {
        const p = et.passos[pi]!
        await prisma.servicoPasso.create({ data: { etapaId: etapa.id, nome: p.nome, ordem: pi, obrigatorio: p.obrigatorio ?? false, slaHoras: p.slaHoras ?? null, textoOrientativo: p.textoOrientativo ?? null, permiteIgnorar: p.permiteIgnorar ?? false, recorrente: p.recorrente ?? false, recorrenciaTipo: p.recorrenciaTipo ?? null } })
      }
    }
    servicoIdByName.set(s.nome, servico.id)
    console.log(`  ${existing ? 'UPD' : 'NEW'}  ${s.nome.padEnd(50)}  SLA ${String(s.slaHoras).padStart(4)}h  ${s.etapas.length}e/${s.etapas.reduce((a, e) => a + e.passos.length, 0)}p`)
  }
  console.log('\nEncadeamentos:')
  let encNovos = 0, encAtualizados = 0
  for (const e of encadeamentos) {
    const origemId = servicoIdByName.get(e.origem); const destinoId = servicoIdByName.get(e.destino)
    if (!origemId || !destinoId) { console.warn(`  SKIP  ${e.origem} → ${e.destino}`); continue }
    const existing = await prisma.servicoEncadeamento.findUnique({ where: { servicoOrigemId_servicoDestinoId: { servicoOrigemId: origemId, servicoDestinoId: destinoId } } })
    const data = { servicoOrigemId: origemId, servicoDestinoId: destinoId, ordem: e.ordem ?? 0, iniciaAuto: e.iniciaAuto ?? true, obrigatorio: e.obrigatorio ?? true, herdaResponsavel: e.herdaResponsavel ?? true, observacao: e.observacao ?? null }
    if (existing) { await prisma.servicoEncadeamento.update({ where: { id: existing.id }, data }); encAtualizados++ } else { await prisma.servicoEncadeamento.create({ data }); encNovos++ }
    console.log(`  ${existing ? 'UPD' : 'NEW'}  ${e.origem.padEnd(50)} → ${e.destino}`)
  }
  console.log(`\nResumo: ${criados} criados, ${atualizados} atualizados | Encadeamentos: ${encNovos} novos, ${encAtualizados} atualizados\n`)
  await prisma.$disconnect()
}

main().catch(e => { console.error(e); process.exit(1) })
