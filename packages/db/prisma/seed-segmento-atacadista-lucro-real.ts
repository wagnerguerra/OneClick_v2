// Seed: Atacadista / Distribuidor / Importador — Lucro Real
// ============================================================
// Cria 17 templates de Servico + 13 encadeamentos formando 3 cadeias:
//
//   1) Onboarding Atacadista LR (raiz)
//        ├─> Setup Tributário Atacadista LR
//        ├─> Avaliação COMPETE-ES (opcional, condicional ao porte)
//        └─> Plano de Contas Atacadista (modelo)
//
//   2) Mensal Atacadista LR (recorrente — disparo manual mensal por gestor)
//        ├─> Coleta Documentos Mensal Atacadista
//        ├─> Lançamentos Contábeis Mensais Atacadista
//        ├─> Apuração ICMS Próprio + ICMS-ST Atacadista LR
//        ├─> Apuração PIS/COFINS Não-cumulativo
//        ├─> Apuração IRPJ/CSLL Estimativa Mensal
//        ├─> Folha + eSocial + DCTFWeb
//        ├─> EFD-ICMS/IPI (SPED Fiscal)
//        ├─> EFD-Contribuições
//        ├─> GIA-ST e GIA-ICMS (SEFAZ-ES)
//        └─> Conciliação e Balancete Mensal
//
//   3) Anual Atacadista LR (1×/ano)
//        ├─> Encerramento do Exercício
//        ├─> ECD (Escrituração Contábil Digital)
//        ├─> ECF (Escrituração Contábil Fiscal)
//        └─> Distribuição de Lucros + IRPF dos Sócios
//
// Fontes consultadas (vide docs/fontes-templates-segmentos.md):
//   - Receita Federal: IN RFB 2.005/2021 (DCTFWeb), 1.252/2012 (EFD-Contrib),
//     2.003/2021 (ECD), 2.004/2021 (ECF), 2.052/2021 (Bloco K)
//   - SEFAZ-ES: Decreto 1.090-R/2002 (RICMS), Lei 10.568/2016 (COMPETE-ES)
//   - Convênio ICMS 143/2006 (EFD-ICMS/IPI)
//   - Lei 10.637/2002 + 10.833/2003 (PIS/COFINS não-cumulativo)
//
// Executar:
//   pnpm --filter @saas/db exec tsx prisma/seed-segmento-atacadista-lucro-real.ts
//
// Idempotente: usa findFirst por nome + update; encadeamentos por @@unique.

import { PrismaClient } from '../src/generated/client'

const prisma = new PrismaClient()

// ────────────────────────────────────────────────────────────
// Tipos
// ────────────────────────────────────────────────────────────
type SeedPasso = {
  nome: string
  slaHoras?: number
  obrigatorio?: boolean
  textoOrientativo?: string
  permiteIgnorar?: boolean
  recorrente?: boolean
  recorrenciaTipo?: 'MENSAL' | 'TRIMESTRAL' | 'SEMESTRAL' | 'ANUAL'
}
type SeedEtapa = { nome: string; slaHoras?: number; passos: SeedPasso[] }
type SeedServico = {
  nome: string
  categoria: string
  descricao: string
  slaHoras: number
  valorPadrao?: number
  prioridadePadrao?: 'BAIXA' | 'MEDIA' | 'ALTA' | 'URGENTE'
  disponivelOrcamento?: boolean
  recorrenteMensal?: boolean
  etapas: SeedEtapa[]
}
type SeedEnc = {
  origem: string
  destino: string
  ordem?: number
  iniciaAuto?: boolean
  obrigatorio?: boolean
  herdaResponsavel?: boolean
  observacao?: string
}

// ────────────────────────────────────────────────────────────
// 1) ONBOARDING — 1× ao entrar como cliente
// ────────────────────────────────────────────────────────────
const servicosOnboarding: SeedServico[] = [
  {
    nome: 'Onboarding Atacadista LR',
    categoria: 'Legalização',
    descricao: 'Acolhimento e configuração inicial específicos para atacadistas/importadores no regime Lucro Real. Sucessor da Transferência de Contabilidade quando aplicável.',
    slaHoras: 96,
    prioridadePadrao: 'ALTA',
    disponivelOrcamento: false,
    etapas: [
      {
        nome: 'Diagnóstico fiscal inicial',
        slaHoras: 24,
        passos: [
          { nome: 'Levantar CNAEs principais e secundários', slaHoras: 4, obrigatorio: true },
          { nome: 'Verificar inscrição estadual ativa (SEFAZ-ES)', slaHoras: 4, obrigatorio: true },
          { nome: 'Identificar NCMs típicos do mix de produtos', slaHoras: 8 },
          { nome: 'Avaliar histórico de faturamento (definir periodicidade IRPJ trimestral vs estimativa mensal)', slaHoras: 8 },
        ],
      },
      {
        nome: 'Acolhimento operacional',
        slaHoras: 24,
        passos: [
          { nome: 'Agendar reunião de boas-vindas com sócios e financeiro (1ª semana após assinatura)', slaHoras: 8 },
          { nome: 'Apresentar equipe Fiscal e Contábil responsáveis ao cliente', slaHoras: 4 },
          { nome: 'Definir cronograma mensal: NFs e extratos até dia 5; folha (variáveis) até dia 25', slaHoras: 4, obrigatorio: true },
          { nome: 'Solicitar acesso ao e-CAC (procuração) e SEFAZ-ES (certificado digital)', slaHoras: 8, obrigatorio: true },
        ],
      },
      {
        nome: 'Configuração no sistema',
        slaHoras: 48,
        passos: [
          { nome: 'Cadastrar cliente com dados completos (sócios, endereço, contatos)', slaHoras: 8, obrigatorio: true },
          { nome: 'Vincular áreas contratadas (Fiscal, Contábil, Trabalhista, Societário)', slaHoras: 4, obrigatorio: true },
          { nome: 'Importar plano de contas modelo (vide serviço Plano de Contas Atacadista)', slaHoras: 16 },
          { nome: 'Configurar integração SCI/Omie (idSistema, idOmie)', slaHoras: 8 },
          { nome: 'Cadastrar certificado digital A1 e validar acesso e-CAC', slaHoras: 8, obrigatorio: true },
          { nome: 'Habilitar consulta automática de Caixa Postal e-CAC', slaHoras: 4 },
        ],
      },
    ],
  },
  {
    nome: 'Setup Tributário Atacadista LR',
    categoria: 'Fiscal',
    descricao: 'Configuração tributária inicial: regime Lucro Real, periodicidade IRPJ, mapeamento de PIS/COFINS não-cumulativo, identificação de NCMs sujeitos a ICMS-ST.',
    slaHoras: 48,
    prioridadePadrao: 'ALTA',
    disponivelOrcamento: false,
    etapas: [
      {
        nome: 'Definição do regime',
        slaHoras: 16,
        passos: [
          { nome: 'Confirmar opção por Lucro Real (anual ou trimestral) — formalizar', slaHoras: 4, obrigatorio: true },
          { nome: 'Avaliar se compensa estimativa mensal (Lucro Real anual com base estimada)', slaHoras: 4 },
          { nome: 'Documentar opção do regime tributário em ata interna do escritório', slaHoras: 8 },
        ],
      },
      {
        nome: 'PIS/COFINS não-cumulativo',
        slaHoras: 16,
        passos: [
          { nome: 'Mapear créditos sobre insumos (energia, frete, embalagem)', slaHoras: 8, obrigatorio: true, textoOrientativo: 'Lei 10.637/2002 + 10.833/2003' },
          { nome: 'Identificar receitas com tributação monofásica/diferenciada', slaHoras: 4 },
          { nome: 'Configurar planilha base de apuração mensal', slaHoras: 4 },
        ],
      },
      {
        nome: 'ICMS-ST',
        slaHoras: 16,
        passos: [
          { nome: 'Cruzar NCMs do estoque com Anexo do Convênio ICMS', slaHoras: 8, obrigatorio: true },
          { nome: 'Identificar protocolos ST entre ES e estados de origem dos fornecedores', slaHoras: 4 },
          { nome: 'Configurar tabelas MVA (Margem de Valor Agregado) por NCM', slaHoras: 4 },
        ],
      },
    ],
  },
  {
    nome: 'Avaliação COMPETE-ES',
    categoria: 'Fiscal',
    descricao: 'Avaliação de elegibilidade e simulação do benefício COMPETE-ES (Lei 10.568/2016) para atacadistas e centros de distribuição instalados no ES.',
    slaHoras: 32,
    prioridadePadrao: 'MEDIA',
    disponivelOrcamento: false,
    etapas: [
      {
        nome: 'Análise de elegibilidade',
        slaHoras: 16,
        passos: [
          { nome: 'Verificar atividade principal (CNAE) e enquadramento legal', slaHoras: 4, obrigatorio: true, textoOrientativo: 'Lei 10.568/2016 — art. 1º' },
          { nome: 'Confirmar inscrição estadual ativa há > 12 meses', slaHoras: 2 },
          { nome: 'Verificar regularidade fiscal estadual (CND-SEFAZ)', slaHoras: 4 },
          { nome: 'Conferir faturamento mínimo da modalidade pretendida', slaHoras: 6 },
        ],
      },
      {
        nome: 'Simulação e formalização',
        slaHoras: 16,
        passos: [
          { nome: 'Simular impacto no fluxo de caixa (diferimento parcial ICMS)', slaHoras: 8 },
          { nome: 'Apresentar simulação COMPETE-ES ao cliente em reunião', slaHoras: 4, permiteIgnorar: true },
          { nome: 'Protocolar Termo de Acordo na SEFAZ-ES (se cliente aceitar)', slaHoras: 4 },
          { nome: 'Acompanhar publicação no DOE-ES', slaHoras: 0 },
        ],
      },
    ],
  },
  {
    nome: 'Plano de Contas Atacadista',
    categoria: 'Contábil',
    descricao: 'Importação de plano de contas modelo para atacadista — estoque, CMV, ICMS recuperável, créditos PIS/COFINS, contas de receita por filial.',
    slaHoras: 24,
    prioridadePadrao: 'MEDIA',
    disponivelOrcamento: false,
    etapas: [
      {
        nome: 'Importação',
        slaHoras: 24,
        passos: [
          { nome: 'Importar plano de contas referencial (NBC TG)', slaHoras: 8, textoOrientativo: 'Estrutura: Ativo > Estoques > Mercadorias para Revenda' },
          { nome: 'Configurar contas de impostos a recuperar (ICMS, PIS, COFINS)', slaHoras: 4, obrigatorio: true },
          { nome: 'Configurar contas de receita por filial/centro de custo', slaHoras: 4 },
          { nome: 'Ajustar contas específicas do cliente conforme particularidades operacionais', slaHoras: 4 },
          { nome: 'Sincronizar com sistema contábil (SCI/Omie)', slaHoras: 4 },
        ],
      },
    ],
  },
]

// ────────────────────────────────────────────────────────────
// 2) MENSAL — 12× ao ano (manual por gestor enquanto não há scheduler)
// ────────────────────────────────────────────────────────────
const servicosMensal: SeedServico[] = [
  {
    nome: 'Mensal Atacadista LR',
    categoria: 'Fiscal',
    descricao: 'Cadeia mensal completa do fechamento de atacadista Lucro Real. Dispara coleta → lançamentos → apurações → obrigações → fechamento.',
    slaHoras: 240,
    prioridadePadrao: 'ALTA',
    recorrenteMensal: true,
    disponivelOrcamento: false,
    etapas: [
      {
        nome: 'Visão geral do mês',
        slaHoras: 240,
        passos: [
          { nome: 'Confirmar entrada de documentos completa', slaHoras: 24 },
          { nome: 'Confirmar todas apurações concluídas', slaHoras: 24 },
          { nome: 'Confirmar obrigações acessórias transmitidas', slaHoras: 24 },
          { nome: 'Encerrar competência mensal', slaHoras: 8, obrigatorio: true },
        ],
      },
    ],
  },
  {
    nome: 'Coleta Documentos Mensal Atacadista',
    categoria: 'Fiscal',
    descricao: 'Recebimento e validação de documentos do cliente para o fechamento mensal: NFs entrada/saída, extratos bancários, folha, acordos comerciais.',
    slaHoras: 48,
    prioridadePadrao: 'ALTA',
    recorrenteMensal: true,
    disponivelOrcamento: false,
    etapas: [
      {
        nome: 'Solicitação',
        slaHoras: 24,
        passos: [
          { nome: 'Disparar e-mail/WhatsApp ao cliente lembrando do prazo: NFs e extratos até dia 5', slaHoras: 4, obrigatorio: true, recorrente: true, recorrenciaTipo: 'MENSAL' },
          { nome: 'Listar pendências da competência anterior se houver', slaHoras: 4 },
        ],
      },
      {
        nome: 'Recebimento e validação',
        slaHoras: 24,
        passos: [
          { nome: 'Receber e arquivar XMLs de NFs de entrada', slaHoras: 8, obrigatorio: true },
          { nome: 'Receber e arquivar XMLs de NFs de saída', slaHoras: 8, obrigatorio: true },
          { nome: 'Receber extratos bancários (OFX/PDF)', slaHoras: 4, obrigatorio: true },
          { nome: 'Receber relatórios de folha (se houver)', slaHoras: 2 },
          { nome: 'Validar integridade (sequência numérica de NFs sem lacuna)', slaHoras: 2 },
        ],
      },
    ],
  },
  {
    nome: 'Lançamentos Contábeis Mensais Atacadista',
    categoria: 'Contábil',
    descricao: 'Lançamento de NFs entrada/saída, custos, despesas, receitas financeiras e classificação por centro de custo.',
    slaHoras: 72,
    prioridadePadrao: 'ALTA',
    recorrenteMensal: true,
    disponivelOrcamento: false,
    etapas: [
      {
        nome: 'Entradas',
        slaHoras: 24,
        passos: [
          { nome: 'Importar XMLs de entrada para o ERP contábil', slaHoras: 8 },
          { nome: 'Conferir CFOPs (1xxx/2xxx) e tributação', slaHoras: 8, obrigatorio: true },
          { nome: 'Provisionar mercadorias em estoque', slaHoras: 4 },
          { nome: 'Lançar fretes, seguros e outras adições ao custo', slaHoras: 4 },
        ],
      },
      {
        nome: 'Saídas',
        slaHoras: 24,
        passos: [
          { nome: 'Importar XMLs de saída', slaHoras: 8 },
          { nome: 'Conferir CFOPs (5xxx/6xxx)', slaHoras: 8, obrigatorio: true },
          { nome: 'Lançar receitas por filial/centro de custo', slaHoras: 8 },
        ],
      },
      {
        nome: 'Despesas e financeiras',
        slaHoras: 24,
        passos: [
          { nome: 'Lançar despesas administrativas e comerciais', slaHoras: 8 },
          { nome: 'Lançar receitas financeiras (juros, rendimentos)', slaHoras: 4 },
          { nome: 'Lançar despesas financeiras (juros pagos, IOF)', slaHoras: 4 },
          { nome: 'Conciliar conta caixa/banco com extratos', slaHoras: 8, obrigatorio: true },
        ],
      },
    ],
  },
  {
    nome: 'Apuração ICMS Próprio + ICMS-ST Atacadista LR',
    categoria: 'Fiscal',
    descricao: 'Apuração mensal de ICMS próprio (livro de apuração) e ICMS-ST sobre operações com NCMs sujeitos. Geração da DUA-e e GIA-ST.',
    slaHoras: 48,
    prioridadePadrao: 'ALTA',
    recorrenteMensal: true,
    disponivelOrcamento: false,
    etapas: [
      {
        nome: 'ICMS Próprio',
        slaHoras: 24,
        passos: [
          { nome: 'Apurar saldo credor/devedor com base nas entradas e saídas', slaHoras: 8, obrigatorio: true },
          { nome: 'Considerar transferências entre filiais (se houver)', slaHoras: 4 },
          { nome: 'Aplicar reduções/diferimentos (incluindo COMPETE-ES se elegível)', slaHoras: 4 },
          { nome: 'Gerar DUA-e e validar valor', slaHoras: 4, obrigatorio: true, textoOrientativo: 'Recolhimento dia 5/9 do mês seguinte conforme calendário SEFAZ-ES' },
          { nome: 'Encaminhar DUA-e ao financeiro do cliente', slaHoras: 4 },
        ],
      },
      {
        nome: 'ICMS-ST',
        slaHoras: 24,
        passos: [
          { nome: 'Identificar NFs com NCMs em ST', slaHoras: 4, obrigatorio: true },
          { nome: 'Calcular base de ST (preço + MVA + frete + outras adições)', slaHoras: 8 },
          { nome: 'Apurar ICMS-ST devido', slaHoras: 4, obrigatorio: true },
          { nome: 'Gerar GIA-ST e DUA-ST', slaHoras: 4, textoOrientativo: 'Recolhimento dia 9 do mês seguinte' },
          { nome: 'Encaminhar guias ao cliente', slaHoras: 4 },
        ],
      },
    ],
  },
  {
    nome: 'Apuração PIS/COFINS Não-cumulativo',
    categoria: 'Fiscal',
    descricao: 'Apuração mensal de PIS (1,65%) e COFINS (7,60%) não-cumulativos com créditos sobre insumos, energia, frete e ativo imobilizado.',
    slaHoras: 32,
    prioridadePadrao: 'ALTA',
    recorrenteMensal: true,
    disponivelOrcamento: false,
    etapas: [
      {
        nome: 'Cálculo',
        slaHoras: 24,
        passos: [
          { nome: 'Apurar receitas tributadas', slaHoras: 4, obrigatorio: true },
          { nome: 'Identificar receitas monofásicas/diferenciadas (subtrair)', slaHoras: 4 },
          { nome: 'Apurar créditos sobre insumos, energia, fretes', slaHoras: 8, obrigatorio: true, textoOrientativo: 'Lei 10.637/2002 art. 3º' },
          { nome: 'Apurar créditos sobre ativo imobilizado (depreciação)', slaHoras: 4 },
          { nome: 'Calcular saldo devedor/credor', slaHoras: 4, obrigatorio: true },
        ],
      },
      {
        nome: 'Recolhimento',
        slaHoras: 8,
        passos: [
          { nome: 'Gerar DARFs (códigos 6912 PIS e 5856 COFINS)', slaHoras: 4, obrigatorio: true, textoOrientativo: 'Vencimento dia 25 do mês seguinte' },
          { nome: 'Encaminhar ao financeiro do cliente', slaHoras: 4 },
        ],
      },
    ],
  },
  {
    nome: 'Apuração IRPJ/CSLL Estimativa Mensal',
    categoria: 'Fiscal',
    descricao: 'Apuração mensal por estimativa (Lucro Real anual) ou trimestral. Recolhimento via DARF.',
    slaHoras: 32,
    prioridadePadrao: 'ALTA',
    recorrenteMensal: true,
    disponivelOrcamento: false,
    etapas: [
      {
        nome: 'Apuração',
        slaHoras: 24,
        passos: [
          { nome: 'Verificar opção do exercício (mensal vs trimestral)', slaHoras: 2, obrigatorio: true },
          { nome: 'Apurar receita bruta + adições/exclusões', slaHoras: 8, obrigatorio: true },
          { nome: 'Calcular IRPJ (15% + adicional 10%) + CSLL (9%)', slaHoras: 4, obrigatorio: true },
          { nome: 'Considerar estimativa mensal vs balanço de suspensão', slaHoras: 8 },
          { nome: 'Aplicar deduções (incentivos fiscais elegíveis)', slaHoras: 2 },
        ],
      },
      {
        nome: 'Recolhimento',
        slaHoras: 8,
        passos: [
          { nome: 'Gerar DARFs (2362 IRPJ Mensal Estim, 2484 CSLL Mensal Estim)', slaHoras: 4, obrigatorio: true, textoOrientativo: 'Vencimento último dia útil do mês seguinte' },
          { nome: 'Encaminhar ao financeiro', slaHoras: 4 },
        ],
      },
    ],
  },
  {
    nome: 'Folha + eSocial + DCTFWeb',
    categoria: 'Trabalhista',
    descricao: 'Apuração de folha, transmissão eSocial (S-1200/S-1210/S-1280), DCTFWeb e geração de guias INSS/FGTS.',
    slaHoras: 48,
    prioridadePadrao: 'ALTA',
    recorrenteMensal: true,
    disponivelOrcamento: false,
    etapas: [
      {
        nome: 'Folha',
        slaHoras: 24,
        passos: [
          { nome: 'Receber do cliente variáveis (horas extras, faltas, comissões) até dia 25', slaHoras: 4, obrigatorio: true, recorrente: true, recorrenciaTipo: 'MENSAL' },
          { nome: 'Calcular folha (salários, encargos, líquidos)', slaHoras: 8, obrigatorio: true },
          { nome: 'Validar líquidos com cliente', slaHoras: 4 },
          { nome: 'Gerar holerites', slaHoras: 4 },
          { nome: 'Enviar holerites a funcionários por e-mail até último dia útil do mês', slaHoras: 4 },
        ],
      },
      {
        nome: 'eSocial e DCTFWeb',
        slaHoras: 16,
        passos: [
          { nome: 'Transmitir eventos S-1200 (remuneração)', slaHoras: 4, obrigatorio: true },
          { nome: 'Transmitir eventos S-1210 (pagamentos)', slaHoras: 4 },
          { nome: 'Transmitir S-1280 (compensações cruzadas)', slaHoras: 2, permiteIgnorar: true },
          { nome: 'Fechar período no eSocial', slaHoras: 2, obrigatorio: true },
          { nome: 'Transmitir DCTFWeb até dia 15', slaHoras: 4, obrigatorio: true, textoOrientativo: 'IN RFB 2.005/2021 — vencimento dia 15 do mês seguinte ao fato gerador' },
        ],
      },
      {
        nome: 'Guias',
        slaHoras: 8,
        passos: [
          { nome: 'Gerar DARF de INSS via DCTFWeb', slaHoras: 4, obrigatorio: true },
          { nome: 'Gerar GFIP/SEFIP FGTS via FGTS Digital', slaHoras: 4, obrigatorio: true, textoOrientativo: 'Vencimento dia 20 do mês seguinte (FGTS Digital)' },
        ],
      },
    ],
  },
  {
    nome: 'EFD-ICMS/IPI Atacadista LR',
    categoria: 'Fiscal',
    descricao: 'Geração e transmissão da EFD-ICMS/IPI (SPED Fiscal) com blocos C, D, E, H — entradas, saídas, apuração, inventário.',
    slaHoras: 32,
    prioridadePadrao: 'ALTA',
    recorrenteMensal: true,
    disponivelOrcamento: false,
    etapas: [
      {
        nome: 'Geração',
        slaHoras: 24,
        passos: [
          { nome: 'Gerar bloco C (NFs eletrônicas — modelo 55)', slaHoras: 4, obrigatorio: true },
          { nome: 'Gerar bloco D (transporte e energia, se houver)', slaHoras: 4, permiteIgnorar: true },
          { nome: 'Gerar bloco E (apuração ICMS e IPI)', slaHoras: 4, obrigatorio: true },
          { nome: 'Gerar bloco H (inventário — anual, registrar mês 02 ou 12)', slaHoras: 4, permiteIgnorar: true },
          { nome: 'Validar com PVA-Fiscal (validador da Receita)', slaHoras: 4 },
          { nome: 'Corrigir inconsistências e regerar', slaHoras: 4 },
        ],
      },
      {
        nome: 'Transmissão',
        slaHoras: 8,
        passos: [
          { nome: 'Transmitir EFD-ICMS/IPI até dia 15', slaHoras: 4, obrigatorio: true, textoOrientativo: 'Convênio ICMS 143/2006 — ES dia 15 do mês seguinte' },
          { nome: 'Arquivar recibo de transmissão', slaHoras: 4 },
        ],
      },
    ],
  },
  {
    nome: 'EFD-Contribuições Atacadista LR',
    categoria: 'Fiscal',
    descricao: 'Geração e transmissão da EFD-Contribuições com blocos A, C, D, F, M — receitas, apuração de PIS/COFINS, créditos.',
    slaHoras: 32,
    prioridadePadrao: 'ALTA',
    recorrenteMensal: true,
    disponivelOrcamento: false,
    etapas: [
      {
        nome: 'Geração',
        slaHoras: 24,
        passos: [
          { nome: 'Gerar bloco A (operações de aquisição com créditos)', slaHoras: 8, obrigatorio: true },
          { nome: 'Gerar bloco C (NFs de saída — receitas)', slaHoras: 8, obrigatorio: true },
          { nome: 'Gerar bloco M (consolidação PIS/COFINS)', slaHoras: 4, obrigatorio: true },
          { nome: 'Validar com PVA-Contribuições', slaHoras: 4 },
        ],
      },
      {
        nome: 'Transmissão',
        slaHoras: 8,
        passos: [
          { nome: 'Transmitir EFD-Contribuições até dia 10 do 2º mês subsequente', slaHoras: 4, obrigatorio: true, textoOrientativo: 'IN RFB 1.252/2012 — vencimento dia 10 do 2º mês subsequente' },
          { nome: 'Arquivar recibo', slaHoras: 4 },
        ],
      },
    ],
  },
  {
    nome: 'Conciliação e Balancete Mensal Atacadista',
    categoria: 'Contábil',
    descricao: 'Conciliações finais (banco, estoque, ICMS recuperável, PIS/COFINS) e geração do balancete mensal.',
    slaHoras: 24,
    prioridadePadrao: 'MEDIA',
    recorrenteMensal: true,
    disponivelOrcamento: false,
    etapas: [
      {
        nome: 'Conciliações',
        slaHoras: 16,
        passos: [
          { nome: 'Conciliar saldos bancários com extratos', slaHoras: 4, obrigatorio: true },
          { nome: 'Conciliar estoque físico (se cliente faz inventário mensal)', slaHoras: 4, permiteIgnorar: true },
          { nome: 'Conciliar ICMS a recuperar (entradas vs apuração)', slaHoras: 4, obrigatorio: true },
          { nome: 'Conciliar PIS/COFINS a recuperar', slaHoras: 4 },
        ],
      },
      {
        nome: 'Balancete',
        slaHoras: 8,
        passos: [
          { nome: 'Gerar balancete de verificação', slaHoras: 4, obrigatorio: true },
          { nome: 'Enviar balancete + DRE ao cliente até dia 20 do mês seguinte', slaHoras: 4 },
        ],
      },
    ],
  },
]

// ────────────────────────────────────────────────────────────
// 3) ANUAL — 1× ao ano
// ────────────────────────────────────────────────────────────
const servicosAnual: SeedServico[] = [
  {
    nome: 'Anual Atacadista LR',
    categoria: 'Contábil',
    descricao: 'Cadeia anual de fechamento e entregas — encerramento, ECD, ECF e distribuição de lucros.',
    slaHoras: 480,
    prioridadePadrao: 'ALTA',
    disponivelOrcamento: false,
    etapas: [
      {
        nome: 'Coordenação anual',
        slaHoras: 480,
        passos: [
          { nome: 'Confirmar encerramento de exercício pronto', slaHoras: 24, obrigatorio: true },
          { nome: 'Confirmar ECD transmitida', slaHoras: 24, obrigatorio: true },
          { nome: 'Confirmar ECF transmitida', slaHoras: 24, obrigatorio: true },
          { nome: 'Encerrar ciclo anual', slaHoras: 8, obrigatorio: true },
        ],
      },
    ],
  },
  {
    nome: 'Encerramento do Exercício Atacadista LR',
    categoria: 'Contábil',
    descricao: 'Encerramento contábil do exercício — apuração do resultado, lançamentos de zeramento, ajustes patrimoniais.',
    slaHoras: 80,
    prioridadePadrao: 'ALTA',
    disponivelOrcamento: false,
    etapas: [
      {
        nome: 'Ajustes',
        slaHoras: 40,
        passos: [
          { nome: 'Conferir provisões (férias, 13º, IR)', slaHoras: 8, obrigatorio: true },
          { nome: 'Ajustar depreciações e amortizações', slaHoras: 4 },
          { nome: 'Apurar ajustes do RTT (se aplicável)', slaHoras: 4, permiteIgnorar: true },
          { nome: 'Lançar avaliação de estoque (custo médio)', slaHoras: 8 },
          { nome: 'Apurar resultado do exercício (receitas - despesas - impostos)', slaHoras: 8, obrigatorio: true },
          { nome: 'Lançar IRPJ e CSLL anuais (Lucro Real)', slaHoras: 8, obrigatorio: true },
        ],
      },
      {
        nome: 'Demonstrativos',
        slaHoras: 40,
        passos: [
          { nome: 'Gerar Balanço Patrimonial', slaHoras: 8, obrigatorio: true },
          { nome: 'Gerar DRE', slaHoras: 4, obrigatorio: true },
          { nome: 'Gerar DMPL/DRA/DFC (Demonstrações complementares)', slaHoras: 8 },
          { nome: 'Elaborar notas explicativas', slaHoras: 16 },
          { nome: 'Apresentar demonstrações financeiras ao cliente em reunião anual', slaHoras: 4 },
        ],
      },
    ],
  },
  {
    nome: 'ECD Atacadista LR',
    categoria: 'Contábil',
    descricao: 'Geração e transmissão da Escrituração Contábil Digital. Inclui Diário, Razão, Balancetes e Balanços.',
    slaHoras: 80,
    prioridadePadrao: 'ALTA',
    disponivelOrcamento: false,
    etapas: [
      {
        nome: 'Preparação',
        slaHoras: 60,
        passos: [
          { nome: 'Validar plano de contas referencial', slaHoras: 8, obrigatorio: true },
          { nome: 'Conferir totais batem com balanço fechado', slaHoras: 8, obrigatorio: true },
          { nome: 'Gerar Bloco I (Diário)', slaHoras: 16 },
          { nome: 'Gerar Bloco J (Demonstrações)', slaHoras: 8 },
          { nome: 'Gerar Bloco K (Plano de contas)', slaHoras: 4 },
          { nome: 'Validar com PVA-ECD', slaHoras: 8 },
          { nome: 'Corrigir inconsistências', slaHoras: 8 },
        ],
      },
      {
        nome: 'Assinatura e transmissão',
        slaHoras: 20,
        passos: [
          { nome: 'Coletar assinatura digital do contador (responsável técnico) para ECD', slaHoras: 4, obrigatorio: true },
          { nome: 'Coletar assinatura digital do sócio/administrador para ECD', slaHoras: 4, obrigatorio: true },
          { nome: 'Transmitir até último dia útil de junho', slaHoras: 4, obrigatorio: true, textoOrientativo: 'IN RFB 2.003/2021 — prazo último dia útil de junho do ano seguinte' },
          { nome: 'Arquivar recibo', slaHoras: 4 },
          { nome: 'Registrar livros na Junta Comercial (autenticação)', slaHoras: 4 },
        ],
      },
    ],
  },
  {
    nome: 'ECF Atacadista LR',
    categoria: 'Fiscal',
    descricao: 'Geração e transmissão da Escrituração Contábil Fiscal — substituiu DIPJ. Apuração definitiva IRPJ/CSLL anual e LALUR.',
    slaHoras: 120,
    prioridadePadrao: 'ALTA',
    disponivelOrcamento: false,
    etapas: [
      {
        nome: 'Apuração',
        slaHoras: 80,
        passos: [
          { nome: 'Importar dados da ECD', slaHoras: 8, obrigatorio: true },
          { nome: 'Apurar e-LALUR (adições, exclusões, compensações de prejuízos)', slaHoras: 24, obrigatorio: true },
          { nome: 'Apurar e-LACS (CSLL)', slaHoras: 16, obrigatorio: true },
          { nome: 'Calcular IRPJ definitivo (Real anual ou trimestral)', slaHoras: 8, obrigatorio: true },
          { nome: 'Calcular CSLL definitiva', slaHoras: 8, obrigatorio: true },
          { nome: 'Apurar saldo a pagar ou a compensar (IRRF, estimativas mensais)', slaHoras: 8 },
          { nome: 'Validar com PVA-ECF', slaHoras: 8 },
        ],
      },
      {
        nome: 'Transmissão',
        slaHoras: 40,
        passos: [
          { nome: 'Coletar assinaturas digitais do contador e sócio para ECF', slaHoras: 8, obrigatorio: true },
          { nome: 'Transmitir até último dia útil de julho', slaHoras: 4, obrigatorio: true, textoOrientativo: 'IN RFB 2.004/2021 — prazo último dia útil de julho do ano seguinte' },
          { nome: 'Arquivar recibo', slaHoras: 4 },
          { nome: 'Gerar DARFs de saldo a pagar (se houver)', slaHoras: 8 },
          { nome: 'Encaminhar resumo executivo da ECF ao cliente', slaHoras: 16 },
        ],
      },
    ],
  },
  {
    nome: 'Distribuição de Lucros e IRPF dos Sócios',
    categoria: 'Contábil',
    descricao: 'Análise da distribuição de lucros aos sócios e suporte à declaração de IRPF — orientação sobre rendimento isento.',
    slaHoras: 40,
    prioridadePadrao: 'MEDIA',
    disponivelOrcamento: false,
    etapas: [
      {
        nome: 'Distribuição',
        slaHoras: 24,
        passos: [
          { nome: 'Apurar lucro contábil disponível para distribuição', slaHoras: 8, obrigatorio: true },
          { nome: 'Verificar limites de distribuição isenta (lucro contábil x lucro presumido)', slaHoras: 4 },
          { nome: 'Confirmar com cliente o valor de distribuição por sócio', slaHoras: 4, obrigatorio: true },
          { nome: 'Lançar contabilmente a distribuição', slaHoras: 4, obrigatorio: true },
          { nome: 'Emitir comprovante de distribuição para cada sócio', slaHoras: 4 },
        ],
      },
      {
        nome: 'IRPF dos sócios',
        slaHoras: 16,
        passos: [
          { nome: 'Receber do cliente dados patrimoniais dos sócios PF (se solicitar auxílio em IRPF)', slaHoras: 4, permiteIgnorar: true },
          { nome: 'Preparar informe de rendimentos (lucro distribuído isento)', slaHoras: 4 },
          { nome: 'Auxiliar sócio na declaração de IRPF (serviço opcional anexo)', slaHoras: 8, permiteIgnorar: true },
        ],
      },
    ],
  },
]

// ────────────────────────────────────────────────────────────
// Encadeamentos (DAG)
// ────────────────────────────────────────────────────────────
const encadeamentos: SeedEnc[] = [
  // Onboarding
  { origem: 'Onboarding Atacadista LR', destino: 'Setup Tributário Atacadista LR', ordem: 0, iniciaAuto: true, obrigatorio: true, herdaResponsavel: true,
    observacao: 'Após acolhimento, configurar regime tributário e particularidades.' },
  { origem: 'Onboarding Atacadista LR', destino: 'Plano de Contas Atacadista', ordem: 1, iniciaAuto: true, obrigatorio: true, herdaResponsavel: true,
    observacao: 'Plano de contas configurado em paralelo ao setup tributário.' },
  { origem: 'Setup Tributário Atacadista LR', destino: 'Avaliação COMPETE-ES', ordem: 0, iniciaAuto: false, obrigatorio: false, herdaResponsavel: true,
    observacao: 'COMPETE-ES é opcional — só se cliente atende requisitos. Gestor decide ativar.' },

  // Mensal — coleta dispara as apurações
  { origem: 'Mensal Atacadista LR', destino: 'Coleta Documentos Mensal Atacadista', ordem: 0, iniciaAuto: true, obrigatorio: true, herdaResponsavel: true,
    observacao: 'Início do ciclo mensal — coleta dos documentos do cliente.' },
  { origem: 'Coleta Documentos Mensal Atacadista', destino: 'Lançamentos Contábeis Mensais Atacadista', ordem: 0, iniciaAuto: true, obrigatorio: true, herdaResponsavel: true,
    observacao: 'Após coleta, equipe contábil lança movimentações.' },
  { origem: 'Lançamentos Contábeis Mensais Atacadista', destino: 'Apuração ICMS Próprio + ICMS-ST Atacadista LR', ordem: 0, iniciaAuto: true, obrigatorio: true, herdaResponsavel: false,
    observacao: 'Equipe fiscal apura ICMS após lançamentos contábeis prontos.' },
  { origem: 'Lançamentos Contábeis Mensais Atacadista', destino: 'Apuração PIS/COFINS Não-cumulativo', ordem: 1, iniciaAuto: true, obrigatorio: true, herdaResponsavel: false,
    observacao: 'PIS/COFINS apurado em paralelo ao ICMS.' },
  { origem: 'Lançamentos Contábeis Mensais Atacadista', destino: 'Apuração IRPJ/CSLL Estimativa Mensal', ordem: 2, iniciaAuto: true, obrigatorio: true, herdaResponsavel: false,
    observacao: 'IRPJ/CSLL apurado se opção for estimativa mensal.' },
  { origem: 'Lançamentos Contábeis Mensais Atacadista', destino: 'Folha + eSocial + DCTFWeb', ordem: 3, iniciaAuto: true, obrigatorio: true, herdaResponsavel: false,
    observacao: 'Equipe trabalhista processa folha em paralelo.' },
  { origem: 'Apuração ICMS Próprio + ICMS-ST Atacadista LR', destino: 'EFD-ICMS/IPI Atacadista LR', ordem: 0, iniciaAuto: true, obrigatorio: true, herdaResponsavel: true,
    observacao: 'EFD-ICMS/IPI consolida apuração de ICMS.' },
  { origem: 'Apuração PIS/COFINS Não-cumulativo', destino: 'EFD-Contribuições Atacadista LR', ordem: 0, iniciaAuto: true, obrigatorio: true, herdaResponsavel: true,
    observacao: 'EFD-Contribuições com PIS/COFINS apurados.' },
  { origem: 'EFD-ICMS/IPI Atacadista LR', destino: 'Conciliação e Balancete Mensal Atacadista', ordem: 0, iniciaAuto: true, obrigatorio: true, herdaResponsavel: false,
    observacao: 'Após todas obrigações fiscais, fechamento contábil mensal.' },

  // Anual — encerramento dispara entregas
  { origem: 'Anual Atacadista LR', destino: 'Encerramento do Exercício Atacadista LR', ordem: 0, iniciaAuto: true, obrigatorio: true, herdaResponsavel: true,
    observacao: 'Início do ciclo anual.' },
  { origem: 'Encerramento do Exercício Atacadista LR', destino: 'ECD Atacadista LR', ordem: 0, iniciaAuto: true, obrigatorio: true, herdaResponsavel: true,
    observacao: 'ECD baseada no balanço fechado.' },
  { origem: 'ECD Atacadista LR', destino: 'ECF Atacadista LR', ordem: 0, iniciaAuto: true, obrigatorio: true, herdaResponsavel: true,
    observacao: 'ECF importa dados da ECD — depende da ECD transmitida.' },
  { origem: 'ECF Atacadista LR', destino: 'Distribuição de Lucros e IRPF dos Sócios', ordem: 0, iniciaAuto: false, obrigatorio: false, herdaResponsavel: true,
    observacao: 'Distribuição de lucros é opcional — só se cliente decide distribuir.' },
]

// ────────────────────────────────────────────────────────────
// Execução
// ────────────────────────────────────────────────────────────
async function main() {
  console.log('Seed: Atacadista / Distribuidor / Importador — Lucro Real\n')

  const todos = [...servicosOnboarding, ...servicosMensal, ...servicosAnual]
  const servicoIdByName = new Map<string, string>()

  let criados = 0, atualizados = 0
  for (const s of todos) {
    const existing = await prisma.servico.findFirst({ where: { nome: s.nome, empresaId: null } })
    const data = {
      nome: s.nome,
      categoria: s.categoria,
      descricao: s.descricao,
      slaHoras: s.slaHoras,
      prioridadePadrao: (s.prioridadePadrao ?? 'MEDIA') as any,
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
    // Em criação, define disponivelOrcamento conforme seed (default false).
    // Em update, preserva o valor atual — gestor pode ter ativado manualmente
    // ou via enable-atacadista-lucro-real.ts e não queremos reverter.
    if (existing) {
      await prisma.$executeRawUnsafe(
        `UPDATE servicos SET valor_padrao = $1, recorrente_mensal = $2 WHERE id = $3`,
        s.valorPadrao ?? null,
        s.recorrenteMensal ?? false,
        servico.id,
      )
    } else {
      await prisma.$executeRawUnsafe(
        `UPDATE servicos SET valor_padrao = $1, disponivel_orcamento = $2, recorrente_mensal = $3 WHERE id = $4`,
        s.valorPadrao ?? null,
        s.disponivelOrcamento ?? false,
        s.recorrenteMensal ?? false,
        servico.id,
      )
    }
    for (let ei = 0; ei < s.etapas.length; ei++) {
      const et = s.etapas[ei]!
      const etapa = await prisma.servicoEtapa.create({
        data: { servicoId: servico.id, nome: et.nome, ordem: ei, slaHoras: et.slaHoras ?? null },
      })
      for (let pi = 0; pi < et.passos.length; pi++) {
        const p = et.passos[pi]!
        await prisma.servicoPasso.create({
          data: {
            etapaId: etapa.id,
            nome: p.nome,
            ordem: pi,
            obrigatorio: p.obrigatorio ?? false,
            slaHoras: p.slaHoras ?? null,
            textoOrientativo: p.textoOrientativo ?? null,
            permiteIgnorar: p.permiteIgnorar ?? false,
            recorrente: p.recorrente ?? false,
            recorrenciaTipo: p.recorrenciaTipo ?? null,
          },
        })
      }
    }
    servicoIdByName.set(s.nome, servico.id)
    const totalPassos = s.etapas.reduce((acc, e) => acc + e.passos.length, 0)
    console.log(`  ${existing ? 'UPD' : 'NEW'}  ${s.nome.padEnd(50)}  SLA ${String(s.slaHoras).padStart(4)}h  ${s.etapas.length}e/${totalPassos}p`)
  }

  console.log('\nEncadeamentos:')
  let encNovos = 0, encAtualizados = 0, encSkipped = 0
  for (const e of encadeamentos) {
    const origemId = servicoIdByName.get(e.origem)
    const destinoId = servicoIdByName.get(e.destino)
    if (!origemId || !destinoId) {
      console.warn(`  SKIP  ${e.origem} → ${e.destino} (template não encontrado)`)
      encSkipped++
      continue
    }
    const existing = await prisma.servicoEncadeamento.findUnique({
      where: { servicoOrigemId_servicoDestinoId: { servicoOrigemId: origemId, servicoDestinoId: destinoId } },
    })
    const data = {
      servicoOrigemId: origemId,
      servicoDestinoId: destinoId,
      ordem: e.ordem ?? 0,
      iniciaAuto: e.iniciaAuto ?? true,
      obrigatorio: e.obrigatorio ?? true,
      herdaResponsavel: e.herdaResponsavel ?? true,
      observacao: e.observacao ?? null,
    }
    if (existing) {
      await prisma.servicoEncadeamento.update({ where: { id: existing.id }, data })
      encAtualizados++
    } else {
      await prisma.servicoEncadeamento.create({ data })
      encNovos++
    }
    const flags = [
      e.obrigatorio === false ? 'opcional' : 'obrigatório',
      e.iniciaAuto === false ? 'manual' : 'auto',
    ].join('+')
    console.log(`  ${existing ? 'UPD' : 'NEW'}  ${e.origem.padEnd(40)} → ${e.destino.padEnd(48)} (${flags})`)
  }

  console.log(
    `\nResumo:\n` +
    `  Templates: ${criados} criados, ${atualizados} atualizados, ${todos.length} total\n` +
    `  Encadeamentos: ${encNovos} novos, ${encAtualizados} atualizados, ${encSkipped} pulados, ${encadeamentos.length} total\n` +
    `\nTodos com disponivelOrcamento=false. Ative manualmente em /servicos quando validar.\n`,
  )

  await prisma.$disconnect()
}

main().catch(e => { console.error(e); process.exit(1) })
