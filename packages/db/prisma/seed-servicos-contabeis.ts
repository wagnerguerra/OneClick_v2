// Seed: catalogo de servicos tipicos de escritorios contabeis no ES.
// Baseado em SESCON-ES, ASSCON, CFC, e praticas correntes.
// SLAs em horas (uteis), valores padrao em R$ (sugestao — ajuste conforme tabela
// de honorarios do escritorio).
//
// Executar:
//   pnpm --filter @saas/db exec tsx prisma/seed-servicos-contabeis.ts
//
// Usa upsert por nome+empresa para ser idempotente.

import { PrismaClient } from '../src/generated/client'

const prisma = new PrismaClient()

type SeedPasso = {
  nome: string
  slaHoras?: number
  obrigatorio?: boolean
  textoOrientativo?: string
  recorrente?: boolean
  recorrenciaTipo?: 'MENSAL' | 'TRIMESTRAL' | 'SEMESTRAL' | 'ANUAL'
}

type SeedEtapa = {
  nome: string
  slaHoras?: number
  passos: SeedPasso[]
}

type SeedServico = {
  nome: string
  categoria: string
  descricao: string
  slaHoras: number
  valorPadrao?: number
  prioridadePadrao?: 'BAIXA' | 'MEDIA' | 'ALTA' | 'URGENTE'
  disponivelOrcamento?: boolean
  recorrenteMensal?: boolean   // entra em contratos mensais (default: false → pontual/extra)
  etapas: SeedEtapa[]
}

const servicos: SeedServico[] = [
  // ════════════════════════════════════════════════════════════════════
  // LEGALIZAÇÃO / SOCIETÁRIO
  // ════════════════════════════════════════════════════════════════════
  {
    nome: 'Abertura de Empresa',
    categoria: 'Legalização',
    descricao: 'Constituição de pessoa jurídica — Junta Comercial ES, Receita Federal, Sefaz, Prefeitura.',
    slaHoras: 240, // ~10 dias úteis
    valorPadrao: 950,
    prioridadePadrao: 'MEDIA',
    etapas: [
      {
        nome: 'Coleta e análise',
        slaHoras: 24,
        passos: [
          { nome: 'Reunir documentos dos sócios (RG, CPF, comprovante de residência)', slaHoras: 8 },
          { nome: 'Definir nome empresarial (consulta de viabilidade)', slaHoras: 4 },
          { nome: 'Definir CNAE principal e secundários', slaHoras: 2 },
          { nome: 'Definir capital social e quadro societário', slaHoras: 2 },
          { nome: 'Definir regime tributário (Simples / Presumido / Real)', slaHoras: 4, obrigatorio: true },
        ],
      },
      {
        nome: 'Registro JUCEES',
        slaHoras: 72,
        passos: [
          { nome: 'Elaborar contrato social', slaHoras: 16 },
          { nome: 'Protocolo na Junta Comercial do ES (JUCEES)', slaHoras: 8 },
          { nome: 'Acompanhar deferimento e retirar NIRE', slaHoras: 48 },
        ],
      },
      {
        nome: 'Inscrições federais e estaduais',
        slaHoras: 96,
        passos: [
          { nome: 'Inscrição CNPJ (Receita Federal)', slaHoras: 24 },
          { nome: 'Inscrição estadual SEFAZ-ES (se aplicável)', slaHoras: 48 },
          { nome: 'Inscrição municipal e alvará de funcionamento', slaHoras: 72 },
          { nome: 'Cadastro de Contribuinte ICMS / ISS', slaHoras: 24 },
        ],
      },
      {
        nome: 'Habilitações finais',
        slaHoras: 48,
        passos: [
          { nome: 'Solicitar certificado digital e-CNPJ A1', slaHoras: 8 },
          { nome: 'Habilitar emissão de notas fiscais (NFe / NFSe)', slaHoras: 24 },
          { nome: 'Cadastro no e-CAC e procurações', slaHoras: 8 },
          { nome: 'Cadastro inicial no eSocial e EFD-Reinf', slaHoras: 8 },
          { nome: 'Entregar documentação final ao cliente', slaHoras: 4, obrigatorio: true },
        ],
      },
    ],
  },
  {
    nome: 'Alteração Contratual',
    categoria: 'Legalização',
    descricao: 'Mudança de cláusulas: endereço, capital social, sócios, atividades (CNAE), administração.',
    slaHoras: 96,
    valorPadrao: 550,
    etapas: [
      {
        nome: 'Análise prévia',
        slaHoras: 16,
        passos: [
          { nome: 'Receber solicitação e identificar tipo de alteração', slaHoras: 4 },
          { nome: 'Conferir contrato social vigente', slaHoras: 4 },
          { nome: 'Listar documentos necessários ao cliente', slaHoras: 4 },
        ],
      },
      {
        nome: 'Redação e assinatura',
        slaHoras: 24,
        passos: [
          { nome: 'Elaborar minuta de alteração contratual', slaHoras: 16 },
          { nome: 'Coletar assinatura digital dos sócios', slaHoras: 8 },
        ],
      },
      {
        nome: 'Registro e atualizações',
        slaHoras: 56,
        passos: [
          { nome: 'Protocolo na JUCEES', slaHoras: 24 },
          { nome: 'Atualizar cadastro CNPJ na Receita', slaHoras: 16 },
          { nome: 'Atualizar inscrição estadual / municipal (se aplicável)', slaHoras: 16 },
          { nome: 'Entregar comprovantes ao cliente', slaHoras: 4 },
        ],
      },
    ],
  },
  {
    nome: 'Baixa / Encerramento de Empresa',
    categoria: 'Legalização',
    descricao: 'Distrato e baixa nos órgãos federais, estaduais e municipais.',
    slaHoras: 480, // ~20 dias úteis
    valorPadrao: 1450,
    prioridadePadrao: 'BAIXA',
    etapas: [
      {
        nome: 'Encerramento contábil',
        slaHoras: 80,
        passos: [
          { nome: 'Apurar e quitar tributos pendentes', slaHoras: 40, obrigatorio: true },
          { nome: 'Levantar balanço de encerramento', slaHoras: 24 },
          { nome: 'Distribuir saldo aos sócios', slaHoras: 16 },
        ],
      },
      {
        nome: 'Obrigações finais',
        slaHoras: 96,
        passos: [
          { nome: 'Entregar DEFIS / ECF de encerramento', slaHoras: 32 },
          { nome: 'Encerrar eSocial e EFD-Reinf', slaHoras: 24 },
          { nome: 'Quitar débitos trabalhistas (rescisões)', slaHoras: 40 },
        ],
      },
      {
        nome: 'Distrato e baixa',
        slaHoras: 200,
        passos: [
          { nome: 'Elaborar distrato social', slaHoras: 16 },
          { nome: 'Protocolo de baixa JUCEES', slaHoras: 80 },
          { nome: 'Baixa CNPJ Receita Federal', slaHoras: 40 },
          { nome: 'Baixa inscrição estadual SEFAZ-ES', slaHoras: 40 },
          { nome: 'Baixa inscrição municipal e alvará', slaHoras: 24 },
        ],
      },
      {
        nome: 'Obtenção de certidões finais',
        slaHoras: 104,
        passos: [
          { nome: 'CND federal de encerramento', slaHoras: 24 },
          { nome: 'CND estadual SEFAZ-ES', slaHoras: 24 },
          { nome: 'CND municipal', slaHoras: 24 },
          { nome: 'CRF FGTS', slaHoras: 16 },
          { nome: 'Entregar dossiê de baixa ao cliente', slaHoras: 16, obrigatorio: true },
        ],
      },
    ],
  },
  {
    nome: 'Transferência / Inclusão / Exclusão de Sócios',
    categoria: 'Legalização',
    descricao: 'Cessão de quotas, entrada ou saída de sócios.',
    slaHoras: 120,
    valorPadrao: 650,
    etapas: [
      {
        nome: 'Negociação',
        slaHoras: 24,
        passos: [
          { nome: 'Levantar valor de quotas e ágio', slaHoras: 8 },
          { nome: 'Coletar documentos do novo sócio', slaHoras: 16 },
        ],
      },
      {
        nome: 'Formalização',
        slaHoras: 48,
        passos: [
          { nome: 'Elaborar instrumento de cessão', slaHoras: 16 },
          { nome: 'Atualizar cláusulas societárias', slaHoras: 16 },
          { nome: 'Coletar assinaturas digitais', slaHoras: 16 },
        ],
      },
      {
        nome: 'Registro',
        slaHoras: 48,
        passos: [
          { nome: 'Protocolo JUCEES', slaHoras: 32 },
          { nome: 'Atualizar QSA na Receita Federal', slaHoras: 16 },
        ],
      },
    ],
  },

  // ════════════════════════════════════════════════════════════════════
  // FISCAL — Apurações e Obrigações Acessórias
  // ════════════════════════════════════════════════════════════════════
  {
    nome: 'Apuração Mensal Simples Nacional',
    categoria: 'Fiscal',
    descricao: 'Cálculo e geração do DAS mensal — Simples Nacional.',
    slaHoras: 96,
    valorPadrao: 280,
    recorrenteMensal: true,
    etapas: [
      {
        nome: 'Recebimento de documentos',
        slaHoras: 24,
        passos: [
          { nome: 'Receber notas fiscais de entrada e saída', slaHoras: 16, recorrente: true, recorrenciaTipo: 'MENSAL' },
          { nome: 'Conferir extratos bancários do mês', slaHoras: 8 },
        ],
      },
      {
        nome: 'Apuração',
        slaHoras: 48,
        passos: [
          { nome: 'Lançar receita bruta mensal', slaHoras: 16 },
          { nome: 'Calcular alíquota efetiva (anexos I a V)', slaHoras: 16 },
          { nome: 'Gerar PGDAS-D', slaHoras: 16 },
        ],
      },
      {
        nome: 'Entrega',
        slaHoras: 24,
        passos: [
          { nome: 'Emitir DAS', slaHoras: 8 },
          { nome: 'Enviar guia ao cliente', slaHoras: 8, obrigatorio: true },
          { nome: 'Confirmar pagamento até o dia 20', slaHoras: 8 },
        ],
      },
    ],
  },
  {
    nome: 'Apuração Mensal Lucro Presumido',
    categoria: 'Fiscal',
    descricao: 'Apuração de PIS, COFINS, IRPJ, CSLL e ICMS — regime Lucro Presumido.',
    slaHoras: 168,
    valorPadrao: 580,
    recorrenteMensal: true,
    etapas: [
      {
        nome: 'Documentos',
        slaHoras: 32,
        passos: [
          { nome: 'Coletar notas fiscais e extratos', slaHoras: 16, recorrente: true, recorrenciaTipo: 'MENSAL' },
          { nome: 'Conferir CFOPs e CSTs', slaHoras: 16 },
        ],
      },
      {
        nome: 'Apurações',
        slaHoras: 80,
        passos: [
          { nome: 'Apurar PIS e COFINS (regime cumulativo)', slaHoras: 16 },
          { nome: 'Apurar ICMS (sistema próprio + Sefaz)', slaHoras: 24 },
          { nome: 'Apurar ISS (notas de serviço)', slaHoras: 16 },
          { nome: 'Apurar IRPJ trimestral', slaHoras: 12 },
          { nome: 'Apurar CSLL trimestral', slaHoras: 12 },
        ],
      },
      {
        nome: 'Guias e SPED',
        slaHoras: 56,
        passos: [
          { nome: 'Emitir DARFs federais', slaHoras: 16 },
          { nome: 'Emitir GIA/EFD ICMS-IPI', slaHoras: 24 },
          { nome: 'Enviar EFD Contribuições', slaHoras: 16 },
        ],
      },
    ],
  },
  {
    nome: 'Apuração Mensal Lucro Real',
    categoria: 'Fiscal',
    descricao: 'Apuração mensal de tributos no regime Lucro Real (PIS/COFINS não cumulativos, IRPJ, CSLL, ICMS).',
    slaHoras: 200,
    valorPadrao: 980,
    prioridadePadrao: 'ALTA',
    recorrenteMensal: true,
    etapas: [
      {
        nome: 'Conciliação contábil',
        slaHoras: 48,
        passos: [
          { nome: 'Conciliar receitas e despesas do mês', slaHoras: 24 },
          { nome: 'Validar lançamentos de estoque (CMV)', slaHoras: 24 },
        ],
      },
      {
        nome: 'Apurações fiscais',
        slaHoras: 96,
        passos: [
          { nome: 'Apurar PIS/COFINS não cumulativos com créditos', slaHoras: 24 },
          { nome: 'Apurar ICMS com créditos e ST', slaHoras: 24 },
          { nome: 'Apurar IRPJ mensal por estimativa ou balancete de redução', slaHoras: 24 },
          { nome: 'Apurar CSLL mensal', slaHoras: 16 },
          { nome: 'Apurar adições/exclusões LALUR/LACS', slaHoras: 8 },
        ],
      },
      {
        nome: 'SPED e guias',
        slaHoras: 56,
        passos: [
          { nome: 'EFD ICMS/IPI', slaHoras: 16 },
          { nome: 'EFD Contribuições', slaHoras: 16 },
          { nome: 'Emitir DARFs federais e GNRE', slaHoras: 16 },
          { nome: 'Comunicar tributos a recolher ao cliente', slaHoras: 8, obrigatorio: true },
        ],
      },
    ],
  },
  {
    nome: 'DCTFWeb Mensal',
    categoria: 'Fiscal',
    descricao: 'Confissão mensal de débitos previdenciários e demais tributos federais (eSocial → EFD-Reinf → DCTFWeb).',
    slaHoras: 48,
    valorPadrao: 180,
    recorrenteMensal: true,
    etapas: [
      {
        nome: 'Pré-requisitos',
        slaHoras: 16,
        passos: [
          { nome: 'Confirmar fechamento do eSocial do mês', slaHoras: 8, obrigatorio: true },
          { nome: 'Confirmar transmissão da EFD-Reinf', slaHoras: 8, obrigatorio: true },
        ],
      },
      {
        nome: 'Geração e transmissão',
        slaHoras: 32,
        passos: [
          { nome: 'Acessar DCTFWeb no e-CAC', slaHoras: 4 },
          { nome: 'Validar débitos consolidados (INSS, IRRF, contribuições)', slaHoras: 16 },
          { nome: 'Transmitir DCTFWeb', slaHoras: 8 },
          { nome: 'Emitir DARF unificado e enviar ao cliente', slaHoras: 4, obrigatorio: true },
        ],
      },
    ],
  },
  {
    nome: 'EFD-Reinf Mensal',
    categoria: 'Fiscal',
    descricao: 'Escrituração fiscal digital de retenções e outras informações fiscais — pré-requisito da DCTFWeb.',
    slaHoras: 48,
    valorPadrao: 150,
    recorrenteMensal: true,
    etapas: [
      {
        nome: 'Coleta',
        slaHoras: 24,
        passos: [
          { nome: 'Receber notas com retenções (INSS, IRRF, PIS/COFINS/CSLL)', slaHoras: 16 },
          { nome: 'Conferir tomados e prestadores', slaHoras: 8 },
        ],
      },
      {
        nome: 'Transmissão',
        slaHoras: 24,
        passos: [
          { nome: 'Lançar eventos R-2010 / R-2020 / R-4010 etc.', slaHoras: 16 },
          { nome: 'Enviar e fechar período', slaHoras: 8, obrigatorio: true },
        ],
      },
    ],
  },
  {
    nome: 'DEFIS — Declaração Anual Simples Nacional',
    categoria: 'Fiscal',
    descricao: 'Declaração anual de informações socioeconômicas e fiscais do Simples Nacional.',
    slaHoras: 240,
    valorPadrao: 480,
    etapas: [
      {
        nome: 'Coleta de dados',
        slaHoras: 80,
        passos: [
          { nome: 'Consolidar receita bruta anual', slaHoras: 24 },
          { nome: 'Levantar saldos contábeis (caixa, estoque, ativo imob)', slaHoras: 32 },
          { nome: 'Coletar dados de funcionários e folha', slaHoras: 24 },
        ],
      },
      {
        nome: 'Preenchimento',
        slaHoras: 120,
        passos: [
          { nome: 'Preencher DEFIS no PGDAS-D', slaHoras: 40 },
          { nome: 'Conferir com balanço e DRE', slaHoras: 40 },
          { nome: 'Validar com cliente', slaHoras: 40 },
        ],
      },
      {
        nome: 'Transmissão',
        slaHoras: 40,
        passos: [
          { nome: 'Transmitir DEFIS', slaHoras: 24 },
          { nome: 'Arquivar recibo e enviar ao cliente', slaHoras: 16, obrigatorio: true },
        ],
      },
    ],
  },
  {
    nome: 'ECD — Escrituração Contábil Digital',
    categoria: 'Fiscal',
    descricao: 'SPED Contábil — entrega anual até 31 de maio. Lucro Real e Presumido com distribuição de lucros isentos.',
    slaHoras: 720, // ~30 dias úteis
    valorPadrao: 2200,
    prioridadePadrao: 'ALTA',
    etapas: [
      {
        nome: 'Encerramento contábil',
        slaHoras: 240,
        passos: [
          { nome: 'Conciliar todas as contas patrimoniais', slaHoras: 80 },
          { nome: 'Validar partidas de estoque, depreciação, provisões', slaHoras: 80 },
          { nome: 'Encerrar contas de resultado', slaHoras: 40 },
          { nome: 'Apurar LAIR e demonstrações finais', slaHoras: 40 },
        ],
      },
      {
        nome: 'Geração do arquivo',
        slaHoras: 240,
        passos: [
          { nome: 'Gerar layout 9 ou 10 conforme regime', slaHoras: 80 },
          { nome: 'Validar com PVA do SPED', slaHoras: 80 },
          { nome: 'Corrigir críticas/erros', slaHoras: 80 },
        ],
      },
      {
        nome: 'Assinatura e transmissão',
        slaHoras: 240,
        passos: [
          { nome: 'Assinar com certificado digital do contador', slaHoras: 24 },
          { nome: 'Assinar com certificado digital do representante legal', slaHoras: 24 },
          { nome: 'Transmitir ao SPED', slaHoras: 24 },
          { nome: 'Aguardar e arquivar recibo de transmissão', slaHoras: 24, obrigatorio: true },
          { nome: 'Entregar dossiê ao cliente', slaHoras: 144 },
        ],
      },
    ],
  },
  {
    nome: 'ECF — Escrituração Contábil Fiscal',
    categoria: 'Fiscal',
    descricao: 'SPED ECF — entrega até 31 de julho, com base na ECD. Apura IRPJ e CSLL.',
    slaHoras: 720,
    valorPadrao: 2400,
    prioridadePadrao: 'ALTA',
    etapas: [
      {
        nome: 'Importação ECD',
        slaHoras: 80,
        passos: [
          { nome: 'Importar ECD validada do ano anterior', slaHoras: 40, obrigatorio: true },
          { nome: 'Conferir saldos importados', slaHoras: 40 },
        ],
      },
      {
        nome: 'Apuração',
        slaHoras: 320,
        passos: [
          { nome: 'Preencher LALUR (parte A e B)', slaHoras: 80 },
          { nome: 'Preencher LACS', slaHoras: 80 },
          { nome: 'Apurar IRPJ e CSLL anuais', slaHoras: 80 },
          { nome: 'Calcular adicional de IR e prejuízos compensáveis', slaHoras: 80 },
        ],
      },
      {
        nome: 'Validação e transmissão',
        slaHoras: 320,
        passos: [
          { nome: 'Validar com PVA ECF', slaHoras: 120 },
          { nome: 'Corrigir críticas', slaHoras: 80 },
          { nome: 'Transmitir e arquivar recibo', slaHoras: 120, obrigatorio: true },
        ],
      },
    ],
  },
  {
    nome: 'DIRF Anual',
    categoria: 'Fiscal',
    descricao: 'Declaração de Imposto sobre a Renda Retido na Fonte — entrega anual até último dia útil de fevereiro.',
    slaHoras: 240,
    valorPadrao: 380,
    etapas: [
      {
        nome: 'Coleta',
        slaHoras: 96,
        passos: [
          { nome: 'Levantar retenções de IR de funcionários e PJ', slaHoras: 48 },
          { nome: 'Levantar retenções de PIS/COFINS/CSLL', slaHoras: 48 },
        ],
      },
      {
        nome: 'Geração',
        slaHoras: 96,
        passos: [
          { nome: 'Preencher beneficiários e valores', slaHoras: 48 },
          { nome: 'Validar com PGD DIRF', slaHoras: 48 },
        ],
      },
      {
        nome: 'Entrega',
        slaHoras: 48,
        passos: [
          { nome: 'Transmitir DIRF', slaHoras: 24 },
          { nome: 'Distribuir comprovantes de rendimento aos beneficiários', slaHoras: 24, obrigatorio: true },
        ],
      },
    ],
  },

  // ════════════════════════════════════════════════════════════════════
  // CONTÁBIL
  // ════════════════════════════════════════════════════════════════════
  {
    nome: 'Escrituração Contábil Mensal',
    categoria: 'Contábil',
    descricao: 'Lançamentos contábeis, conciliação bancária e fechamento de balancete mensal.',
    slaHoras: 120,
    valorPadrao: 750,
    recorrenteMensal: true,
    etapas: [
      {
        nome: 'Coleta documental',
        slaHoras: 24,
        passos: [
          { nome: 'Receber NFs entrada/saída', slaHoras: 8, recorrente: true, recorrenciaTipo: 'MENSAL' },
          { nome: 'Receber extratos bancários', slaHoras: 8 },
          { nome: 'Receber relatórios de folha', slaHoras: 8 },
        ],
      },
      {
        nome: 'Lançamentos',
        slaHoras: 56,
        passos: [
          { nome: 'Lançar receitas', slaHoras: 16 },
          { nome: 'Lançar despesas e custos', slaHoras: 16 },
          { nome: 'Lançar folha de pagamento', slaHoras: 8 },
          { nome: 'Lançar movimento bancário', slaHoras: 16 },
        ],
      },
      {
        nome: 'Conciliação e fechamento',
        slaHoras: 40,
        passos: [
          { nome: 'Conciliar contas bancárias', slaHoras: 16 },
          { nome: 'Conciliar contas a receber/pagar', slaHoras: 8 },
          { nome: 'Emitir balancete e DRE do mês', slaHoras: 16, obrigatorio: true },
        ],
      },
    ],
  },
  {
    nome: 'Balanço Patrimonial Anual',
    categoria: 'Contábil',
    descricao: 'Encerramento contábil anual com balanço, DRE, DMPL e notas explicativas.',
    slaHoras: 480,
    valorPadrao: 1800,
    prioridadePadrao: 'ALTA',
    etapas: [
      {
        nome: 'Conciliações finais',
        slaHoras: 160,
        passos: [
          { nome: 'Conciliar todo o patrimônio', slaHoras: 80 },
          { nome: 'Apurar inventário físico vs contábil', slaHoras: 40 },
          { nome: 'Calcular depreciação acumulada', slaHoras: 40 },
        ],
      },
      {
        nome: 'Demonstrações',
        slaHoras: 200,
        passos: [
          { nome: 'Elaborar Balanço Patrimonial', slaHoras: 64 },
          { nome: 'Elaborar DRE do exercício', slaHoras: 48 },
          { nome: 'Elaborar DMPL', slaHoras: 48 },
          { nome: 'Elaborar notas explicativas', slaHoras: 40 },
        ],
      },
      {
        nome: 'Aprovação',
        slaHoras: 120,
        passos: [
          { nome: 'Encerrar contas de resultado', slaHoras: 24 },
          { nome: 'Aprovar com sócios em ata (se aplicável)', slaHoras: 24 },
          { nome: 'Arquivar livros e disponibilizar ao cliente', slaHoras: 72, obrigatorio: true },
        ],
      },
    ],
  },
  {
    nome: 'Conciliação Bancária',
    categoria: 'Contábil',
    descricao: 'Conferência e ajuste mensal de extratos vs lançamentos contábeis.',
    slaHoras: 48,
    valorPadrao: 220,
    recorrenteMensal: true,
    etapas: [
      {
        nome: 'Conciliação',
        slaHoras: 48,
        passos: [
          { nome: 'Importar OFX/extrato', slaHoras: 8, recorrente: true, recorrenciaTipo: 'MENSAL' },
          { nome: 'Identificar lançamentos pendentes', slaHoras: 16 },
          { nome: 'Ajustar diferenças e provisionar', slaHoras: 16 },
          { nome: 'Emitir conciliação assinada', slaHoras: 8 },
        ],
      },
    ],
  },

  // ════════════════════════════════════════════════════════════════════
  // TRABALHISTA / DEPARTAMENTO PESSOAL
  // ════════════════════════════════════════════════════════════════════
  {
    nome: 'Folha de Pagamento Mensal',
    categoria: 'Trabalhista',
    descricao: 'Cálculo de salários, encargos, eSocial e geração de guias.',
    slaHoras: 72,
    valorPadrao: 28, // por funcionário/mês — sugestão
    prioridadePadrao: 'ALTA',
    recorrenteMensal: true,
    etapas: [
      {
        nome: 'Coleta de variáveis',
        slaHoras: 16,
        passos: [
          { nome: 'Receber horas, faltas, adicionais até dia 25', slaHoras: 8, obrigatorio: true, recorrente: true, recorrenciaTipo: 'MENSAL' },
          { nome: 'Receber comissões e bonificações', slaHoras: 8 },
        ],
      },
      {
        nome: 'Cálculo',
        slaHoras: 32,
        passos: [
          { nome: 'Calcular salários, INSS, IRRF, FGTS', slaHoras: 16 },
          { nome: 'Gerar holerites', slaHoras: 8 },
          { nome: 'Validar líquidos com cliente', slaHoras: 8 },
        ],
      },
      {
        nome: 'Encargos e eSocial',
        slaHoras: 24,
        passos: [
          { nome: 'Transmitir folha no eSocial', slaHoras: 8 },
          { nome: 'Gerar DARF FGTS e DAE', slaHoras: 8 },
          { nome: 'Enviar holerites ao cliente / funcionários', slaHoras: 8, obrigatorio: true },
        ],
      },
    ],
  },
  {
    nome: 'Admissão de Funcionário',
    categoria: 'Trabalhista',
    descricao: 'Registro completo: contrato, eSocial S-2200, exames, documentação.',
    slaHoras: 24,
    valorPadrao: 95,
    prioridadePadrao: 'ALTA',
    etapas: [
      {
        nome: 'Documentação',
        slaHoras: 8,
        passos: [
          { nome: 'Coletar documentos pessoais (RG, CPF, CTPS)', slaHoras: 4, obrigatorio: true },
          { nome: 'Solicitar exame admissional', slaHoras: 4 },
        ],
      },
      {
        nome: 'Registro',
        slaHoras: 16,
        passos: [
          { nome: 'Elaborar contrato de trabalho', slaHoras: 4 },
          { nome: 'Enviar S-2200 ao eSocial (até 1 dia antes do início)', slaHoras: 4, obrigatorio: true },
          { nome: 'Registrar em CTPS digital', slaHoras: 4 },
          { nome: 'Cadastrar em vale-transporte / benefícios', slaHoras: 4 },
        ],
      },
    ],
  },
  {
    nome: 'Rescisão de Contrato de Trabalho',
    categoria: 'Trabalhista',
    descricao: 'Cálculo, homologação e baixa no eSocial.',
    slaHoras: 48,
    valorPadrao: 180,
    prioridadePadrao: 'URGENTE',
    etapas: [
      {
        nome: 'Cálculo',
        slaHoras: 16,
        passos: [
          { nome: 'Calcular saldo de salário, férias, 13º, multa FGTS', slaHoras: 8, obrigatorio: true },
          { nome: 'Validar com cliente', slaHoras: 8 },
        ],
      },
      {
        nome: 'Documentos',
        slaHoras: 16,
        passos: [
          { nome: 'Emitir TRCT', slaHoras: 4 },
          { nome: 'Emitir guia GRRF (FGTS rescisório)', slaHoras: 4 },
          { nome: 'Emitir chave do CD para seguro-desemprego', slaHoras: 4 },
          { nome: 'Emitir extrato analítico FGTS', slaHoras: 4 },
        ],
      },
      {
        nome: 'eSocial e prazo legal',
        slaHoras: 16,
        passos: [
          { nome: 'Enviar S-2299 ao eSocial', slaHoras: 4 },
          { nome: 'Pagar verbas em até 10 dias da rescisão', slaHoras: 4, obrigatorio: true },
          { nome: 'Entregar documentos ao funcionário', slaHoras: 8, obrigatorio: true },
        ],
      },
    ],
  },
  {
    nome: 'Cálculo de 13º Salário',
    categoria: 'Trabalhista',
    descricao: 'Apuração das parcelas de 13º (novembro e dezembro).',
    slaHoras: 96,
    valorPadrao: 220,
    etapas: [
      {
        nome: '1ª parcela (novembro)',
        slaHoras: 48,
        passos: [
          { nome: 'Calcular 50% do 13º', slaHoras: 16, recorrente: true, recorrenciaTipo: 'ANUAL' },
          { nome: 'Emitir folha e holerites', slaHoras: 16 },
          { nome: 'Pagar até 30/nov', slaHoras: 16, obrigatorio: true },
        ],
      },
      {
        nome: '2ª parcela (dezembro)',
        slaHoras: 48,
        passos: [
          { nome: 'Calcular saldo com encargos (INSS/IRRF)', slaHoras: 16 },
          { nome: 'Emitir DARF e DAE', slaHoras: 16 },
          { nome: 'Pagar até 20/dez', slaHoras: 16, obrigatorio: true },
        ],
      },
    ],
  },
  {
    nome: 'Cálculo e Lançamento de Férias',
    categoria: 'Trabalhista',
    descricao: 'Aviso, cálculo, recibo e eSocial S-2230.',
    slaHoras: 48,
    valorPadrao: 90,
    etapas: [
      {
        nome: 'Programação',
        slaHoras: 16,
        passos: [
          { nome: 'Receber aviso prévio (mínimo 30 dias)', slaHoras: 8, obrigatorio: true },
          { nome: 'Conferir período aquisitivo e dias', slaHoras: 8 },
        ],
      },
      {
        nome: 'Cálculo e pagamento',
        slaHoras: 32,
        passos: [
          { nome: 'Calcular férias + 1/3 + médias', slaHoras: 16 },
          { nome: 'Emitir recibo', slaHoras: 8 },
          { nome: 'Enviar evento S-2230 (eSocial)', slaHoras: 4 },
          { nome: 'Pagar em até 2 dias antes do início', slaHoras: 4, obrigatorio: true },
        ],
      },
    ],
  },

  // ════════════════════════════════════════════════════════════════════
  // CERTIDÕES E REGULARIZAÇÃO
  // ════════════════════════════════════════════════════════════════════
  {
    nome: 'Emissão de Certidão Negativa Federal (CND/CPEN)',
    categoria: 'Certidões',
    descricao: 'CND ou CPEN unificada de tributos federais e dívida ativa da União.',
    slaHoras: 24,
    valorPadrao: 80,
    etapas: [
      {
        nome: 'Emissão',
        slaHoras: 24,
        passos: [
          { nome: 'Acessar e-CAC e solicitar certidão', slaHoras: 4 },
          { nome: 'Se positiva, levantar pendências', slaHoras: 16 },
          { nome: 'Entregar PDF ao cliente', slaHoras: 4, obrigatorio: true },
        ],
      },
    ],
  },
  {
    nome: 'Emissão de CND Estadual SEFAZ-ES',
    categoria: 'Certidões',
    descricao: 'Certidão de regularidade fiscal estadual no ES.',
    slaHoras: 24,
    valorPadrao: 70,
    etapas: [
      {
        nome: 'Emissão',
        slaHoras: 24,
        passos: [
          { nome: 'Acessar portal SEFAZ-ES e solicitar', slaHoras: 4 },
          { nome: 'Se pendência de ICMS, regularizar', slaHoras: 16 },
          { nome: 'Entregar certidão ao cliente', slaHoras: 4, obrigatorio: true },
        ],
      },
    ],
  },
  {
    nome: 'Emissão de CND Municipal',
    categoria: 'Certidões',
    descricao: 'Certidão de tributos municipais (ISS, IPTU, taxas).',
    slaHoras: 48,
    valorPadrao: 70,
    etapas: [
      {
        nome: 'Emissão',
        slaHoras: 48,
        passos: [
          { nome: 'Acessar portal da prefeitura', slaHoras: 4 },
          { nome: 'Solicitar certidão', slaHoras: 4 },
          { nome: 'Resolver pendências de ISS/IPTU', slaHoras: 32 },
          { nome: 'Entregar certidão', slaHoras: 8, obrigatorio: true },
        ],
      },
    ],
  },
  {
    nome: 'Emissão de CRF FGTS',
    categoria: 'Certidões',
    descricao: 'Certificado de Regularidade do FGTS — Caixa Econômica.',
    slaHoras: 24,
    valorPadrao: 60,
    etapas: [
      {
        nome: 'Emissão',
        slaHoras: 24,
        passos: [
          { nome: 'Consultar regularidade no Conectividade Social', slaHoras: 4 },
          { nome: 'Se irregular, regularizar GRFs em atraso', slaHoras: 16 },
          { nome: 'Emitir e entregar CRF', slaHoras: 4, obrigatorio: true },
        ],
      },
    ],
  },
  {
    nome: 'Emissão de CNDT (Trabalhista)',
    categoria: 'Certidões',
    descricao: 'Certidão Negativa de Débitos Trabalhistas — TST.',
    slaHoras: 24,
    valorPadrao: 60,
    etapas: [
      {
        nome: 'Emissão',
        slaHoras: 24,
        passos: [
          { nome: 'Consultar no TST', slaHoras: 4 },
          { nome: 'Se positiva, levantar processos', slaHoras: 16 },
          { nome: 'Entregar CNDT ao cliente', slaHoras: 4, obrigatorio: true },
        ],
      },
    ],
  },
  {
    nome: 'Parcelamento de Débitos Federais',
    categoria: 'Certidões',
    descricao: 'Adesão a parcelamento de tributos federais (ordinário ou especial).',
    slaHoras: 168,
    valorPadrao: 480,
    etapas: [
      {
        nome: 'Diagnóstico',
        slaHoras: 48,
        passos: [
          { nome: 'Levantar débitos no e-CAC', slaHoras: 16 },
          { nome: 'Simular cenários de parcelamento', slaHoras: 16 },
          { nome: 'Definir nº de parcelas com cliente', slaHoras: 16 },
        ],
      },
      {
        nome: 'Adesão',
        slaHoras: 96,
        passos: [
          { nome: 'Solicitar parcelamento no e-CAC', slaHoras: 24 },
          { nome: 'Acompanhar deferimento', slaHoras: 48 },
          { nome: 'Emitir 1ª parcela e enviar ao cliente', slaHoras: 24, obrigatorio: true },
        ],
      },
      {
        nome: 'Acompanhamento',
        slaHoras: 24,
        passos: [
          { nome: 'Cadastrar lembrete mensal das parcelas', slaHoras: 8 },
          { nome: 'Conferir reativação anual da CND', slaHoras: 16 },
        ],
      },
    ],
  },

  // ════════════════════════════════════════════════════════════════════
  // CONSULTORIA
  // ════════════════════════════════════════════════════════════════════
  {
    nome: 'Planejamento Tributário Anual',
    categoria: 'Consultoria',
    descricao: 'Análise comparativa entre Simples / Presumido / Real e definição do regime mais vantajoso.',
    slaHoras: 240,
    valorPadrao: 2400,
    prioridadePadrao: 'ALTA',
    etapas: [
      {
        nome: 'Diagnóstico',
        slaHoras: 80,
        passos: [
          { nome: 'Reunir 12 meses de receita, custos e folha', slaHoras: 32 },
          { nome: 'Levantar margem bruta e CMV', slaHoras: 24 },
          { nome: 'Analisar perfil de clientes (PF/PJ, ICMS/ISS)', slaHoras: 24 },
        ],
      },
      {
        nome: 'Simulações',
        slaHoras: 96,
        passos: [
          { nome: 'Simular Simples Nacional', slaHoras: 24 },
          { nome: 'Simular Lucro Presumido', slaHoras: 32 },
          { nome: 'Simular Lucro Real', slaHoras: 40 },
        ],
      },
      {
        nome: 'Apresentação',
        slaHoras: 64,
        passos: [
          { nome: 'Elaborar relatório executivo', slaHoras: 32 },
          { nome: 'Apresentar ao cliente e formalizar opção', slaHoras: 32, obrigatorio: true },
        ],
      },
    ],
  },
  {
    nome: 'Consultoria Reforma Tributária (IBS / CBS)',
    categoria: 'Consultoria',
    descricao: 'Diagnóstico de impacto e adequação à transição IBS/CBS (EC 132/2023).',
    slaHoras: 320,
    valorPadrao: 4800,
    prioridadePadrao: 'ALTA',
    etapas: [
      {
        nome: 'Mapeamento',
        slaHoras: 120,
        passos: [
          { nome: 'Mapear fluxo atual de tributos indiretos', slaHoras: 40 },
          { nome: 'Identificar créditos e operações sensíveis', slaHoras: 40 },
          { nome: 'Avaliar regime de transição aplicável', slaHoras: 40 },
        ],
      },
      {
        nome: 'Plano de adequação',
        slaHoras: 120,
        passos: [
          { nome: 'Adequar cadastro de produtos / NCM / CFOP', slaHoras: 40 },
          { nome: 'Treinar equipe fiscal interna', slaHoras: 40 },
          { nome: 'Adequar ERP do cliente', slaHoras: 40 },
        ],
      },
      {
        nome: 'Acompanhamento',
        slaHoras: 80,
        passos: [
          { nome: 'Monitorar boletins e regulamentações', slaHoras: 40, recorrente: true, recorrenciaTipo: 'MENSAL' },
          { nome: 'Reunião trimestral de status', slaHoras: 40, obrigatorio: true },
        ],
      },
    ],
  },
]

async function main() {
  console.log(`Cadastrando ${servicos.length} servicos contabeis...\n`)
  let criados = 0
  let atualizados = 0

  for (const s of servicos) {
    // Idempotencia por nome (escopo global — sem empresaId).
    const existing = await prisma.servico.findFirst({ where: { nome: s.nome, empresaId: null } })

    // Os campos valorPadrao e disponivelOrcamento sao novos no schema. Para nao
    // depender do client Prisma regenerado (a API segura a DLL no Windows),
    // setamos eles via SQL bruto apos o create/update.
    const data = {
      nome: s.nome,
      categoria: s.categoria,
      descricao: s.descricao,
      slaHoras: s.slaHoras,
      prioridadePadrao: s.prioridadePadrao ?? 'MEDIA',
      ativo: true,
      empresaId: null,
    }

    let servico
    if (existing) {
      servico = await prisma.servico.update({ where: { id: existing.id }, data })
      await prisma.servicoEtapa.deleteMany({ where: { servicoId: servico.id } })
      atualizados++
    } else {
      servico = await prisma.servico.create({ data })
      criados++
    }

    // Atualiza colunas novas via SQL bruto (nao dependem do client regenerado)
    await prisma.$executeRawUnsafe(
      `UPDATE servicos SET valor_padrao = $1, disponivel_orcamento = $2, recorrente_mensal = $3 WHERE id = $4`,
      s.valorPadrao ?? null,
      s.disponivelOrcamento ?? true,
      s.recorrenteMensal ?? false,
      servico.id,
    )

    // Cria etapas + passos
    for (let ei = 0; ei < s.etapas.length; ei++) {
      const et = s.etapas[ei]
      const etapa = await prisma.servicoEtapa.create({
        data: {
          servicoId: servico.id,
          nome: et.nome,
          ordem: ei,
          slaHoras: et.slaHoras ?? null,
        },
      })
      for (let pi = 0; pi < et.passos.length; pi++) {
        const p = et.passos[pi]
        await prisma.servicoPasso.create({
          data: {
            etapaId: etapa.id,
            nome: p.nome,
            ordem: pi,
            obrigatorio: p.obrigatorio ?? true,
            slaHoras: p.slaHoras ?? null,
            textoOrientativo: p.textoOrientativo ?? null,
            recorrente: p.recorrente ?? false,
            recorrenciaTipo: p.recorrenciaTipo ?? null,
          },
        })
      }
    }

    const totalPassos = s.etapas.reduce((acc, e) => acc + e.passos.length, 0)
    console.log(
      `  ${existing ? 'UPD' : 'NEW'}  [${s.categoria.padEnd(13)}] ${s.nome.padEnd(48)}  SLA ${String(s.slaHoras).padStart(4)}h  ` +
      `${s.etapas.length} etapas / ${totalPassos} passos`
    )
  }

  console.log(`\nResumo: ${criados} criados, ${atualizados} atualizados, ${servicos.length} total.`)
  await prisma.$disconnect()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
