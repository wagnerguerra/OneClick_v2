/**
 * Cria 3 serviços de onboarding pra novo cliente do escritório contábil:
 *  - Onboarding Fiscal (DAS/DCTF/EFD/SPED, calendário fiscal, NF-e/NFS-e)
 *  - Onboarding Trabalhista (eSocial, folha, FGTS, admissões, benefícios)
 *  - Onboarding Contábil (plano de contas, saldos, ERP, balancetes)
 *
 * Os 3 são pontuais (EXTRA), prioridade ALTA, e formam o trio de transição
 * quando uma empresa entra na carteira. Cobertura brasileira genérica
 * (não depende de UF).
 */
import { prisma } from '../src/client'

type PassoDef = { nome: string; obrigatorio?: boolean; permiteIgnorar?: boolean; slaMinutos?: number }
type EtapaDef = { nome: string; passos: PassoDef[] }
type ServicoDef = { nome: string; descricao: string; etapas: EtapaDef[] }

const ONBOARDING_FISCAL: ServicoDef = {
  nome: 'Onboarding Fiscal',
  descricao: 'Integração de cliente novo na rotina fiscal — levanta enquadramento, acessos, calendário de obrigações e prepara o sistema pra primeira apuração.',
  etapas: [
    {
      nome: 'Diagnóstico fiscal inicial',
      passos: [
        { nome: 'Confirmar regime tributário atual (Simples/Presumido/Real)', obrigatorio: true, slaMinutos: 15 },
        { nome: 'Listar atividades (CNAEs) e o anexo aplicável quando Simples', obrigatorio: true, slaMinutos: 30 },
        { nome: 'Identificar IE, IM e demais inscrições ativas', obrigatorio: true, slaMinutos: 20 },
        { nome: 'Apurar volume médio mensal de NF emitidas e recebidas', obrigatorio: true, slaMinutos: 20 },
        { nome: 'Identificar obrigações acessórias do regime (DCTF, EFD-Contrib, EFD-ICMS/IPI, SPED Fiscal, GIA, DeSTDA, DEFIS)', obrigatorio: true, slaMinutos: 30 },
        { nome: 'Verificar pendências fiscais (CNDs federais, estaduais, municipais)', obrigatorio: true, slaMinutos: 30 },
        { nome: 'Avaliar benefícios fiscais ativos (Reintegra, MEI, ZFM, isenções)', obrigatorio: false, permiteIgnorar: true, slaMinutos: 30 },
      ],
    },
    {
      nome: 'Coleta de acessos e procurações',
      passos: [
        { nome: 'Procuração e-CAC (RFB) com perfil contábil completo', obrigatorio: true, slaMinutos: 30 },
        { nome: 'Procuração SEFAZ Estadual', obrigatorio: false, permiteIgnorar: true, slaMinutos: 30 },
        { nome: 'Procuração / acesso Prefeitura (NFS-e, ISS, alvará)', obrigatorio: false, permiteIgnorar: true, slaMinutos: 30 },
        { nome: 'Certificado digital A1/A3 vigente da PJ (validade > 30 dias)', obrigatorio: true, slaMinutos: 30 },
        { nome: 'Cadastrar empresa no DT-e estadual e Caixa Postal e-CAC', obrigatorio: true, slaMinutos: 30 },
        { nome: 'Acessos ao emissor de NF-e/NFC-e/NFS-e (login/senha ou integração)', obrigatorio: true, slaMinutos: 30 },
        { nome: 'Acesso ao portal de ECF do município (quando NFS-e municipal)', obrigatorio: false, permiteIgnorar: true, slaMinutos: 20 },
      ],
    },
    {
      nome: 'Documentação e histórico',
      passos: [
        { nome: 'Última declaração entregue (DASN-SIMEI, DEFIS, ECF, ECD) — receber arquivo', obrigatorio: true, slaMinutos: 20 },
        { nome: 'Saldos de tributos a recuperar / a pagar com data-base', obrigatorio: true, slaMinutos: 30 },
        { nome: 'Parcelamentos ativos (Pertsalud, PGFN, RFB, SEFAZ) — relação de DCG', obrigatorio: false, permiteIgnorar: true, slaMinutos: 30 },
        { nome: 'Últimas 3 apurações fiscais do contador anterior (DAS/DCTF/EFD)', obrigatorio: true, slaMinutos: 30 },
        { nome: 'Notas emitidas/recebidas em aberto no período de transição', obrigatorio: true, slaMinutos: 30 },
      ],
    },
    {
      nome: 'Configuração no sistema interno',
      passos: [
        { nome: 'Cadastrar empresa no sistema fiscal interno com todos os parâmetros', obrigatorio: true, slaMinutos: 30 },
        { nome: 'Vincular CNAEs e configurar alíquotas/anexos', obrigatorio: true, slaMinutos: 30 },
        { nome: 'Importar XMLs (notas emitidas e recebidas) do mês corrente', obrigatorio: true, slaMinutos: 60 },
        { nome: 'Conferir manifestação do destinatário (NF-e pendentes de aceite)', obrigatorio: false, permiteIgnorar: true, slaMinutos: 30 },
        { nome: 'Vincular contas contábeis às naturezas fiscais (link com Contábil)', obrigatorio: false, permiteIgnorar: true, slaMinutos: 45 },
        { nome: 'Configurar calendário de obrigações do regime no sistema', obrigatorio: true, slaMinutos: 30 },
      ],
    },
    {
      nome: 'Primeira apuração e entrega',
      passos: [
        { nome: 'Realizar apuração do primeiro mês com o cliente', obrigatorio: true, slaMinutos: 90 },
        { nome: 'Emitir guias de pagamento (DAS / DARF / GNRE / DARE)', obrigatorio: true, slaMinutos: 30 },
        { nome: 'Conferir com cliente antes do envio definitivo', obrigatorio: true, slaMinutos: 30 },
        { nome: 'Transmitir obrigações acessórias do mês (EFD/DCTF/etc.)', obrigatorio: true, slaMinutos: 60 },
        { nome: 'Enviar comprovantes de transmissão + guias ao cliente', obrigatorio: true, slaMinutos: 15 },
      ],
    },
    {
      nome: 'Comunicação e encerramento',
      passos: [
        { nome: 'Reunião com cliente apresentando calendário fiscal e responsáveis', obrigatorio: true, slaMinutos: 60 },
        { nome: 'Definir SLA mensal pra envio de XMLs e prazos de apuração', obrigatorio: true, slaMinutos: 20 },
        { nome: 'Configurar lembretes/notificações automáticas pro cliente', obrigatorio: false, permiteIgnorar: true, slaMinutos: 20 },
        { nome: 'Atualizar dossiê fiscal do cliente no escritório', obrigatorio: true, slaMinutos: 30 },
        { nome: 'Liberar serviço pra rotina mensal (recorrente Fiscal)', obrigatorio: true, slaMinutos: 15 },
      ],
    },
  ],
}

const ONBOARDING_TRABALHISTA: ServicoDef = {
  nome: 'Onboarding Trabalhista',
  descricao: 'Integração de cliente novo na rotina trabalhista — eSocial, folha, FGTS, admissões, benefícios e calendário de obrigações. Prepara pra primeira folha.',
  etapas: [
    {
      nome: 'Diagnóstico inicial da folha',
      passos: [
        { nome: 'Levantar quantidade de colaboradores ativos (CLT / estagiários / jovem aprendiz)', obrigatorio: true, slaMinutos: 20 },
        { nome: 'Confirmar existência de pró-labore e quantos sócios o recebem', obrigatorio: true, slaMinutos: 15 },
        { nome: 'Identificar sindicatos vinculados e convenções coletivas aplicáveis', obrigatorio: true, slaMinutos: 30 },
        { nome: 'Verificar enquadramento do CNAE no FAP/RAT/Terceiros', obrigatorio: true, slaMinutos: 20 },
        { nome: 'Levantar benefícios oferecidos (VR, VA, VT, plano de saúde, odonto)', obrigatorio: true, slaMinutos: 30 },
        { nome: 'Identificar empregadas gestantes, afastados, estabilidades e PCD', obrigatorio: false, permiteIgnorar: true, slaMinutos: 30 },
        { nome: 'Verificar pendências (TST, MTE, ações trabalhistas em curso)', obrigatorio: false, permiteIgnorar: true, slaMinutos: 30 },
      ],
    },
    {
      nome: 'Acessos e procurações trabalhistas',
      passos: [
        { nome: 'Procuração eletrônica eSocial (perfil contábil)', obrigatorio: true, slaMinutos: 30 },
        { nome: 'Procuração Conectividade Social ICP (Caixa / FGTS)', obrigatorio: true, slaMinutos: 30 },
        { nome: 'Cadastrar empresa no FGTS Digital', obrigatorio: true, slaMinutos: 30 },
        { nome: 'Procuração Domicílio Eletrônico Trabalhista (DET / MTE)', obrigatorio: true, slaMinutos: 20 },
        { nome: 'Acessos ao convênio médico/odontológico (se houver gestão pelo escritório)', obrigatorio: false, permiteIgnorar: true, slaMinutos: 20 },
        { nome: 'Acesso ao portal do sindicato pra emissão de contribuições', obrigatorio: false, permiteIgnorar: true, slaMinutos: 15 },
      ],
    },
    {
      nome: 'Coleta documental dos colaboradores',
      passos: [
        { nome: 'Relação completa de colaboradores com CPF, data de admissão e cargo', obrigatorio: true, slaMinutos: 30 },
        { nome: 'CTPS digital, RG/CPF, comprovante de residência, dados bancários de cada colaborador', obrigatorio: true, slaMinutos: 60 },
        { nome: 'Contratos de trabalho assinados (CLT) com cláusulas especiais', obrigatorio: true, slaMinutos: 45 },
        { nome: 'ASOs admissionais e periódicos vigentes', obrigatorio: true, slaMinutos: 30 },
        { nome: 'Último holerite, último cálculo de férias, últimos 3 RPAs', obrigatorio: true, slaMinutos: 30 },
        { nome: 'Histórico de afastamentos (INSS, acidentes, licença maternidade)', obrigatorio: false, permiteIgnorar: true, slaMinutos: 30 },
        { nome: 'Arquivos eSocial transmitidos pelo contador anterior (eventos S-1000+, S-2200, S-2300)', obrigatorio: true, slaMinutos: 30 },
      ],
    },
    {
      nome: 'Configuração no sistema de folha',
      passos: [
        { nome: 'Cadastrar empresa no sistema de folha + parâmetros trabalhistas', obrigatorio: true, slaMinutos: 30 },
        { nome: 'Cadastrar cada colaborador com vínculos, salários e dependentes', obrigatorio: true, slaMinutos: 120 },
        { nome: 'Configurar rubricas customizadas (adicionais, descontos, benefícios)', obrigatorio: true, slaMinutos: 60 },
        { nome: 'Configurar tabela de descontos (IRRF, INSS, sindical, vale-transporte)', obrigatorio: true, slaMinutos: 30 },
        { nome: 'Vincular contas contábeis às rubricas (provisões 13º/férias, encargos)', obrigatorio: false, permiteIgnorar: true, slaMinutos: 30 },
        { nome: 'Importar saldos de férias, 13º e horas a compensar', obrigatorio: true, slaMinutos: 60 },
      ],
    },
    {
      nome: 'eSocial e regularização',
      passos: [
        { nome: 'Verificar eventos S-1000 (empregador) e S-1005 (estabelecimento) atualizados', obrigatorio: true, slaMinutos: 30 },
        { nome: 'Conferir S-1010 (rubricas) e S-1020 (lotações) — atualizar se necessário', obrigatorio: true, slaMinutos: 45 },
        { nome: 'Validar admissões pendentes (S-2200) e reintegrações (S-2299)', obrigatorio: false, permiteIgnorar: true, slaMinutos: 45 },
        { nome: 'Regularizar eventos rejeitados/pendentes no portal eSocial', obrigatorio: false, permiteIgnorar: true, slaMinutos: 90 },
        { nome: 'Configurar perfil ambiental (LTCAT/PPRA/PCMSO) para S-2240', obrigatorio: false, permiteIgnorar: true, slaMinutos: 60 },
      ],
    },
    {
      nome: 'Primeira folha e DCTFWeb',
      passos: [
        { nome: 'Rodar primeira folha de pagamento no sistema', obrigatorio: true, slaMinutos: 90 },
        { nome: 'Conferir com cliente os valores líquidos antes de fechar', obrigatorio: true, slaMinutos: 45 },
        { nome: 'Gerar recibos de pagamento e enviar aos colaboradores', obrigatorio: true, slaMinutos: 30 },
        { nome: 'Calcular e emitir guia DARF DCTFWeb (INSS e IRRF)', obrigatorio: true, slaMinutos: 30 },
        { nome: 'Calcular e emitir guia GFIP / FGTS Digital', obrigatorio: true, slaMinutos: 30 },
        { nome: 'Enviar arquivo de pagamento (banco) e guias ao financeiro do cliente', obrigatorio: true, slaMinutos: 20 },
      ],
    },
    {
      nome: 'Comunicação e encerramento',
      passos: [
        { nome: 'Reunião com cliente apresentando calendário (folha, encargos, 13º, férias)', obrigatorio: true, slaMinutos: 60 },
        { nome: 'Definir prazo mensal pra envio de variáveis (horas extras, comissões, faltas)', obrigatorio: true, slaMinutos: 20 },
        { nome: 'Configurar lembretes automáticos de eventos não-mensais (13º, férias, RAIS)', obrigatorio: false, permiteIgnorar: true, slaMinutos: 20 },
        { nome: 'Atualizar dossiê trabalhista do cliente', obrigatorio: true, slaMinutos: 30 },
        { nome: 'Liberar serviço pra rotina mensal (recorrente Trabalhista)', obrigatorio: true, slaMinutos: 15 },
      ],
    },
  ],
}

const ONBOARDING_CONTABIL: ServicoDef = {
  nome: 'Onboarding Contábil',
  descricao: 'Integração de cliente novo na rotina contábil — saldos iniciais, plano de contas, importação do ERP, conciliações e preparação pra primeira escrituração.',
  etapas: [
    {
      nome: 'Diagnóstico contábil inicial',
      passos: [
        { nome: 'Identificar regime contábil (Lucro Real / Presumido / Simples) e implicações', obrigatorio: true, slaMinutos: 20 },
        { nome: 'Identificar exigência de ECD e ECF (com base no faturamento e regime)', obrigatorio: true, slaMinutos: 20 },
        { nome: 'Identificar uso de ERP, sistema financeiro ou planilhas pelo cliente', obrigatorio: true, slaMinutos: 20 },
        { nome: 'Levantar volume de contas bancárias, cartões e meios de recebimento', obrigatorio: true, slaMinutos: 20 },
        { nome: 'Apurar existência de bens em ativo imobilizado e necessidade de depreciação', obrigatorio: true, slaMinutos: 30 },
        { nome: 'Levantar contratos relevantes (locações, financiamentos, leasings)', obrigatorio: false, permiteIgnorar: true, slaMinutos: 30 },
        { nome: 'Verificar passivos relevantes (empréstimos, parcelamentos)', obrigatorio: false, permiteIgnorar: true, slaMinutos: 30 },
      ],
    },
    {
      nome: 'Coleta de saldos e balancetes anteriores',
      passos: [
        { nome: 'Balanço Patrimonial do último encerramento (com data-base)', obrigatorio: true, slaMinutos: 20 },
        { nome: 'Balancete do mês anterior à transição (saldos atualizados)', obrigatorio: true, slaMinutos: 20 },
        { nome: 'Razão analítico das contas patrimoniais do ano corrente', obrigatorio: true, slaMinutos: 30 },
        { nome: 'Última ECD e ECF transmitidas (recibo + arquivo)', obrigatorio: false, permiteIgnorar: true, slaMinutos: 20 },
        { nome: 'Demonstração de Resultados (DRE) do ano corrente', obrigatorio: true, slaMinutos: 20 },
        { nome: 'Posição de bancos com extratos do mês de transição', obrigatorio: true, slaMinutos: 30 },
        { nome: 'Posição de contas a pagar e a receber em aberto', obrigatorio: true, slaMinutos: 30 },
      ],
    },
    {
      nome: 'Acessos e integrações',
      passos: [
        { nome: 'Acesso ao ERP do cliente (consulta e export)', obrigatorio: false, permiteIgnorar: true, slaMinutos: 30 },
        { nome: 'Acesso aos internet bankings do cliente (consulta)', obrigatorio: true, slaMinutos: 30 },
        { nome: 'Acesso aos extratos de cartão corporativo / maquininhas', obrigatorio: false, permiteIgnorar: true, slaMinutos: 30 },
        { nome: 'Configurar integração automática extratos OFX (quando possível)', obrigatorio: false, permiteIgnorar: true, slaMinutos: 60 },
        { nome: 'Vincular conta gerencial com plano de contas contábil', obrigatorio: false, permiteIgnorar: true, slaMinutos: 45 },
      ],
    },
    {
      nome: 'Configuração no sistema contábil',
      passos: [
        { nome: 'Cadastrar empresa no sistema contábil com parâmetros corretos', obrigatorio: true, slaMinutos: 30 },
        { nome: 'Importar/configurar plano de contas (padrão escritório vs cliente)', obrigatorio: true, slaMinutos: 60 },
        { nome: 'Cadastrar centros de custo e departamentos quando aplicável', obrigatorio: false, permiteIgnorar: true, slaMinutos: 30 },
        { nome: 'Lançar saldos iniciais nas contas patrimoniais', obrigatorio: true, slaMinutos: 90 },
        { nome: 'Conciliar saldos iniciais com Balanço/Balancete do contador anterior', obrigatorio: true, slaMinutos: 60 },
        { nome: 'Cadastrar bens do ativo imobilizado com data, valor e taxa de depreciação', obrigatorio: false, permiteIgnorar: true, slaMinutos: 60 },
      ],
    },
    {
      nome: 'Importação e primeiros lançamentos',
      passos: [
        { nome: 'Importar movimentação bancária do mês corrente (OFX/extrato)', obrigatorio: true, slaMinutos: 60 },
        { nome: 'Classificar lançamentos bancários em contas contábeis', obrigatorio: true, slaMinutos: 120 },
        { nome: 'Importar/lançar notas fiscais emitidas e recebidas do mês', obrigatorio: true, slaMinutos: 60 },
        { nome: 'Lançar folha de pagamento e encargos (integração com Trabalhista)', obrigatorio: true, slaMinutos: 30 },
        { nome: 'Lançar impostos apurados pelo Fiscal (integração com Fiscal)', obrigatorio: true, slaMinutos: 30 },
        { nome: 'Realizar conciliação bancária do mês', obrigatorio: true, slaMinutos: 60 },
      ],
    },
    {
      nome: 'Primeiro fechamento',
      passos: [
        { nome: 'Conferir balancete do primeiro mês com cliente', obrigatorio: true, slaMinutos: 45 },
        { nome: 'Conferir DRE e indicadores básicos (margem, EBITDA)', obrigatorio: true, slaMinutos: 30 },
        { nome: 'Ajustar lançamentos divergentes e refechar', obrigatorio: false, permiteIgnorar: true, slaMinutos: 60 },
        { nome: 'Fechar competência mensal no sistema (bloquear edição)', obrigatorio: true, slaMinutos: 15 },
        { nome: 'Gerar relatórios mensais (Balancete, DRE, Razão) e enviar ao cliente', obrigatorio: true, slaMinutos: 30 },
      ],
    },
    {
      nome: 'Comunicação e encerramento',
      passos: [
        { nome: 'Reunião com cliente apresentando cronograma de fechamento e relatórios', obrigatorio: true, slaMinutos: 60 },
        { nome: 'Definir SLA mensal pra envio de extratos, NF e variáveis', obrigatorio: true, slaMinutos: 20 },
        { nome: 'Acordar formato e frequência dos relatórios gerenciais ao cliente', obrigatorio: false, permiteIgnorar: true, slaMinutos: 20 },
        { nome: 'Atualizar dossiê contábil do cliente no escritório', obrigatorio: true, slaMinutos: 30 },
        { nome: 'Liberar serviço pra rotina mensal (recorrente Contábil)', obrigatorio: true, slaMinutos: 15 },
      ],
    },
  ],
}

async function criarServico(def: ServicoDef, empresaId: string | null): Promise<void> {
  const servico = await prisma.servico.create({
    data: {
      nome: def.nome,
      descricao: def.descricao,
      tipo: 'ATIVIDADE',
      categoriaServico: 'EXTRA',
      prioridadePadrao: 'ALTA',
      disponivelOrcamento: true,
      recorrenteMensal: false,
      ativo: true,
      empresaId,
    },
  })

  let slaTotalMin = 0
  let totalPassos = 0
  for (let ei = 0; ei < def.etapas.length; ei++) {
    const e = def.etapas[ei]
    const etapa = await prisma.servicoEtapa.create({
      data: { servicoId: servico.id, nome: e.nome, ordem: ei, slaHoras: 0 },
    })
    let slaEtapaMin = 0
    for (let pi = 0; pi < e.passos.length; pi++) {
      const p = e.passos[pi]
      const slaMin = p.slaMinutos ?? 0
      await prisma.servicoPasso.create({
        data: {
          etapaId: etapa.id,
          nome: p.nome,
          ordem: pi,
          obrigatorio: p.obrigatorio ?? true,
          permiteIgnorar: p.permiteIgnorar ?? false,
          slaMinutos: slaMin,
          slaHoras: slaMin > 0 ? Math.max(1, Math.round(slaMin / 60)) : null,
        },
      })
      slaEtapaMin += slaMin
      totalPassos++
    }
    await prisma.servicoEtapa.update({
      where: { id: etapa.id },
      data: { slaHoras: Math.max(0, Math.round(slaEtapaMin / 60)) },
    })
    slaTotalMin += slaEtapaMin
  }
  await prisma.servico.update({
    where: { id: servico.id },
    data: { slaHoras: Math.max(0, Math.round(slaTotalMin / 60)) },
  })

  console.log(`✓ ${def.nome}`)
  console.log(`  id=${servico.id}`)
  console.log(`  Etapas: ${def.etapas.length} · Passos: ${totalPassos} · SLA: ${(slaTotalMin / 60).toFixed(1)}h\n`)
}

async function main() {
  console.log('🏗️  Criando serviços de Onboarding\n')

  // Pega empresaId de algum serviço existente (consistência)
  const ref = await prisma.servico.findFirst({ select: { empresaId: true } })
  const empresaId = ref?.empresaId ?? null

  await criarServico(ONBOARDING_FISCAL, empresaId)
  await criarServico(ONBOARDING_TRABALHISTA, empresaId)
  await criarServico(ONBOARDING_CONTABIL, empresaId)

  console.log('✅ Concluído')
}

main().catch(e => { console.error('❌', e); process.exit(1) }).finally(() => prisma.$disconnect())
