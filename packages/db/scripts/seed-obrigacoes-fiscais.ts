/**
 * Seed: cadastra as principais obrigações fiscais/trabalhistas/contábeis
 * brasileiras como templates globais de Serviço (empresaId = null), com
 * regra de recorrência configurada conforme o calendário oficial.
 *
 * Fontes consultadas (validação manual em mai/2026):
 *   - Receita Federal — gov.br/receitafederal/pt-br/assuntos/agenda-tributaria
 *   - Portal Simples Nacional — receita.fazenda.gov.br/SimplesNacional
 *   - SEFAZ-ES — sefaz.es.gov.br
 *   - Prefeitura de Vitória/ES — vitoria.es.gov.br
 *   - CLT art. 459, Lei 4.090/62 (13º), LC 123/2006 (Simples)
 *
 * Idempotente: pode rodar várias vezes — atualiza se já existir o template
 * (matching por nome + empresaId = null).
 *
 * Execução:
 *   cd packages/db
 *   pnpm exec tsx scripts/seed-obrigacoes-fiscais.ts
 */

import { prisma } from '../src/client'

type Recorrencia = {
  frequencia: 'MENSAL' | 'TRIMESTRAL' | 'SEMESTRAL' | 'ANUAL' | 'DIARIA' | 'SEMANAL'
  ancoragem: 'DIA_DO_MES' | 'DIA_UTIL' | 'DIAS_APOS_COMPETENCIA'
  valorAncoragem: number
  competenciaOffset: number
  // Composto (opcional): quando preenchidos, scheduler usa estes em vez da regra simples
  modoPersonalizado?: boolean
  diasDoMes?: number[]
  mesesDoAno?: number[]
}

type Obrigacao = {
  nome: string
  descricao: string
  categoria: 'Fiscal' | 'Trabalhista' | 'Contábil'
  prioridadePadrao: 'BAIXA' | 'MEDIA' | 'ALTA' | 'URGENTE'
  /** Página oficial onde o vencimento foi confirmado (agenda fiscal, IN, lei). */
  fonteUrl?: string
  /** Documentação oficial: manual, guia ou perguntas frequentes. */
  documentacaoUrl?: string
  recorrencia: Recorrencia
}

const OBRIGACOES: Obrigacao[] = [
  // ──────────────────────────────────────────────────────────────────
  // FEDERAIS — SIMPLES NACIONAL
  // ──────────────────────────────────────────────────────────────────
  {
    nome: 'DAS — Simples Nacional',
    descricao:
      'Documento de Arrecadação do Simples Nacional. Recolhe IRPJ, CSLL, PIS, COFINS, IPI, ICMS, ISS e INSS num único documento. ' +
      'Vencimento: dia 20 do mês seguinte à competência. Base legal: LC 123/2006 e Resolução CGSN 140/2018.',
    categoria: 'Fiscal',
    prioridadePadrao: 'ALTA',
    fonteUrl: 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp123.htm',
    documentacaoUrl: 'https://www8.receita.fazenda.gov.br/SimplesNacional/CanaisAtendimento/Perguntas.aspx',
    recorrencia: { frequencia: 'MENSAL', ancoragem: 'DIA_DO_MES', valorAncoragem: 20, competenciaOffset: 1 },
  },
  {
    nome: 'DEFIS — Declaração de Informações Socioeconômicas e Fiscais',
    descricao:
      'Declaração anual obrigatória para optantes do Simples Nacional, referente ao ano-calendário anterior. ' +
      'Transmitida pelo PGDAS-D. Vencimento: 31 de março. Base legal: LC 123/2006 art. 25 e Res. CGSN 140/2018 art. 72.',
    categoria: 'Fiscal',
    prioridadePadrao: 'ALTA',
    fonteUrl: 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp123.htm',
    documentacaoUrl: 'https://www8.receita.fazenda.gov.br/SimplesNacional/CanaisAtendimento/Perguntas.aspx',
    recorrencia: { frequencia: 'ANUAL', ancoragem: 'DIA_DO_MES', valorAncoragem: 31, competenciaOffset: 3 },
  },
  {
    nome: 'DASN-SIMEI — Declaração Anual do MEI',
    descricao:
      'Declaração Anual Simplificada para o Microempreendedor Individual (DASN-SIMEI), referente ao ano-calendário anterior. ' +
      'Obrigatória mesmo sem faturamento. Vencimento: 31 de maio. Base legal: LC 123/2006 e Res. CGSN 140/2018 art. 109.',
    categoria: 'Fiscal',
    prioridadePadrao: 'ALTA',
    fonteUrl: 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp123.htm',
    documentacaoUrl: 'https://www8.receita.fazenda.gov.br/simplesnacional/arquivos/manual/manual_dasn-simei.pdf',
    recorrencia: { frequencia: 'ANUAL', ancoragem: 'DIA_DO_MES', valorAncoragem: 31, competenciaOffset: 5 },
  },

  // ──────────────────────────────────────────────────────────────────
  // FEDERAIS — TRIBUTOS RECORRENTES (Lucro Real / Presumido)
  // ──────────────────────────────────────────────────────────────────
  {
    nome: 'DCTFWeb — Declaração de Débitos e Créditos Tributários Federais',
    descricao:
      'Declaração que confessa débitos previdenciários e fazendários (INSS, IRRF folha, PIS-Folha) consolidados a partir do eSocial e EFD-Reinf. ' +
      'Vencimento: até o dia 15 do mês seguinte à competência. Substituiu DCTF e GFIP. ' +
      'Base legal: IN RFB 2.005/2021 e alterações pela IN RFB 2.237/2024.',
    categoria: 'Fiscal',
    prioridadePadrao: 'ALTA',
    fonteUrl: 'http://normas.receita.fazenda.gov.br/sijut2consulta/link.action?idAto=115131',
    documentacaoUrl: 'https://www.gov.br/receitafederal/pt-br/assuntos/orientacao-tributaria/declaracoes-e-demonstrativos/DCTFWeb',
    recorrencia: { frequencia: 'MENSAL', ancoragem: 'DIA_DO_MES', valorAncoragem: 15, competenciaOffset: 1 },
  },
  {
    nome: 'EFD-Contribuições (PIS/COFINS)',
    descricao:
      'Escrituração Fiscal Digital das Contribuições para o PIS/Pasep, COFINS e CPRB. Obrigatória para Lucro Real, Presumido e Arbitrado. ' +
      'Vencimento: até o 10º dia útil do 2º mês subsequente à competência. Base legal: IN RFB 1.252/2012.',
    categoria: 'Fiscal',
    prioridadePadrao: 'ALTA',
    fonteUrl: 'http://sped.rfb.gov.br/projeto/show/268',
    documentacaoUrl: 'http://sped.rfb.gov.br/pasta/show/1573',
    recorrencia: { frequencia: 'MENSAL', ancoragem: 'DIA_UTIL', valorAncoragem: 10, competenciaOffset: 2 },
  },
  {
    nome: 'EFD-Reinf — Retenções e Outras Informações Fiscais',
    descricao:
      'Escrituração Fiscal Digital de Retenções e Outras Informações Fiscais. Engloba R-2000 (previdenciária) e R-4000 (retenções federais — substituiu DIRF a partir de 2024). ' +
      'Vencimento: até o dia 15 do mês seguinte à competência. Base legal: IN RFB 2.043/2021.',
    categoria: 'Fiscal',
    prioridadePadrao: 'ALTA',
    fonteUrl: 'https://www.gov.br/receitafederal/pt-br/portais-relacionados/sped/migracao/efd-reinf',
    documentacaoUrl: 'https://www.gov.br/receitafederal/pt-br/portais-relacionados/sped/migracao/perguntas-frequentes/efd-reinf-perguntas-e-respostas',
    recorrencia: { frequencia: 'MENSAL', ancoragem: 'DIA_DO_MES', valorAncoragem: 15, competenciaOffset: 1 },
  },
  {
    nome: 'PIS/COFINS — Apuração Mensal (Lucro Real/Presumido)',
    descricao:
      'Recolhimento mensal de PIS e COFINS via DARF. Alíquotas: 0,65%/3% (cumulativo — Presumido) ou 1,65%/7,6% (não-cumulativo — Real). ' +
      'Vencimento: dia 25 do mês seguinte à competência (antecipado se não houver expediente bancário). Base legal: Lei 10.637/2002 e Lei 10.833/2003.',
    categoria: 'Fiscal',
    prioridadePadrao: 'ALTA',
    fonteUrl: 'https://www.planalto.gov.br/ccivil_03/leis/2002/l10637.htm',
    documentacaoUrl: 'https://www.gov.br/receitafederal/pt-br/assuntos/agenda-tributaria/2026',
    recorrencia: { frequencia: 'MENSAL', ancoragem: 'DIA_DO_MES', valorAncoragem: 25, competenciaOffset: 1 },
  },
  {
    nome: 'IRPJ/CSLL — Lucro Presumido (Trimestral)',
    descricao:
      'Recolhimento trimestral de IRPJ e CSLL no regime do Lucro Presumido. Apuração nos trimestres civis (31/mar, 30/jun, 30/set, 31/dez). ' +
      'Vencimento: último dia útil do mês subsequente ao encerramento do trimestre (abr/jul/out/jan). ' +
      'Pode ser parcelado em 3 quotas mensais quando superior a R$ 2.000. Base legal: Lei 9.430/96 art. 5º.',
    categoria: 'Fiscal',
    prioridadePadrao: 'ALTA',
    fonteUrl: 'https://www.planalto.gov.br/ccivil_03/leis/l9430.htm',
    documentacaoUrl: 'https://www.gov.br/receitafederal/pt-br/assuntos/agenda-tributaria/2026',
    recorrencia: {
      frequencia: 'TRIMESTRAL',
      ancoragem: 'DIA_DO_MES',
      valorAncoragem: 30,
      competenciaOffset: 1,
      modoPersonalizado: true,
      diasDoMes: [30],
      mesesDoAno: [1, 4, 7, 10],
    },
  },
  {
    nome: 'IRPJ/CSLL — Lucro Real (Estimativa Mensal)',
    descricao:
      'Recolhimento mensal por estimativa de IRPJ e CSLL para empresas optantes do Lucro Real Anual. ' +
      'Vencimento: último dia útil do mês subsequente ao da competência. Base legal: Lei 9.430/96 arts. 2º e 30, IN RFB 1.700/2017.',
    categoria: 'Fiscal',
    prioridadePadrao: 'ALTA',
    fonteUrl: 'https://www.planalto.gov.br/ccivil_03/leis/l9430.htm',
    documentacaoUrl: 'https://www.gov.br/receitafederal/pt-br/assuntos/agenda-tributaria/2026',
    recorrencia: { frequencia: 'MENSAL', ancoragem: 'DIA_DO_MES', valorAncoragem: 30, competenciaOffset: 1 },
  },

  // ──────────────────────────────────────────────────────────────────
  // FEDERAIS — ESCRITURAÇÕES ANUAIS
  // ──────────────────────────────────────────────────────────────────
  {
    nome: 'ECD — Escrituração Contábil Digital',
    descricao:
      'Transmissão anual da escrituração contábil ao SPED. Obrigatória para empresas do Lucro Real, Presumido com distribuição de lucros acima do limite e imunes/isentas acima da receita-limite. ' +
      'Vencimento: último dia útil do mês de junho do ano subsequente (IN RFB 2.142/2023). Base legal: IN RFB 2.003/2021.',
    categoria: 'Contábil',
    prioridadePadrao: 'ALTA',
    fonteUrl: 'http://sped.rfb.gov.br/pagina/show/499',
    documentacaoUrl: 'http://sped.rfb.gov.br/pasta/show/1569',
    recorrencia: { frequencia: 'ANUAL', ancoragem: 'DIA_DO_MES', valorAncoragem: 30, competenciaOffset: 6 },
  },
  {
    nome: 'ECF — Escrituração Contábil Fiscal',
    descricao:
      'Transmissão anual da escrituração contábil fiscal ao SPED (inclui LALUR e LACS). Obrigatória para todas as PJ tributadas pelo Lucro Real, Presumido e Arbitrado (exceto Simples Nacional e inativas). ' +
      'Vencimento: último dia útil do mês de julho do ano subsequente. Base legal: IN RFB 2.004/2021.',
    categoria: 'Fiscal',
    prioridadePadrao: 'ALTA',
    fonteUrl: 'http://sped.rfb.gov.br/pagina/show/1285',
    documentacaoUrl: 'http://sped.rfb.gov.br/pasta/show/1644',
    recorrencia: { frequencia: 'ANUAL', ancoragem: 'DIA_DO_MES', valorAncoragem: 31, competenciaOffset: 7 },
  },
  {
    nome: 'EFD ICMS/IPI (SPED Fiscal)',
    descricao:
      'Escrituração Fiscal Digital — registra apuração de ICMS e IPI. Obrigatória para todos os contribuintes do ICMS (exceto Simples Nacional). ' +
      'Vencimento no Espírito Santo: dia 20 do mês subsequente à apuração (não prorroga para feriado/fim de semana). ' +
      'Base legal: Convênio ICMS 143/2006 e legislação estadual (SEFAZ-ES).',
    categoria: 'Fiscal',
    prioridadePadrao: 'ALTA',
    fonteUrl: 'https://sefaz.es.gov.br/informacoes-efd-2',
    documentacaoUrl: 'http://sped.rfb.gov.br/pasta/show/1573',
    recorrencia: { frequencia: 'MENSAL', ancoragem: 'DIA_DO_MES', valorAncoragem: 20, competenciaOffset: 1 },
  },

  // ──────────────────────────────────────────────────────────────────
  // FEDERAIS — DECLARAÇÕES ANUAIS DIVERSAS
  // ──────────────────────────────────────────────────────────────────
  {
    nome: 'IRPF — Declaração Anual do Imposto de Renda Pessoa Física',
    descricao:
      'Declaração de Ajuste Anual do IRPF. Período típico de entrega: 15/mar a último dia útil de maio (calendário 2026: até 29/05). ' +
      'Base legal: Lei 9.250/95 e IN RFB anual.',
    categoria: 'Fiscal',
    prioridadePadrao: 'ALTA',
    fonteUrl: 'https://www.gov.br/receitafederal/pt-br/assuntos/meu-imposto-de-renda',
    documentacaoUrl: 'https://www.gov.br/receitafederal/pt-br/centrais-de-conteudo/publicacoes/perguntas-e-respostas/dirpf',
    recorrencia: { frequencia: 'ANUAL', ancoragem: 'DIA_DO_MES', valorAncoragem: 31, competenciaOffset: 5 },
  },
  {
    nome: 'DIMOB — Declaração de Informações sobre Atividades Imobiliárias',
    descricao:
      'Declaração anual obrigatória para PJ que comercializam, intermediam ou administram imóveis (incorporadoras, imobiliárias, construtoras com vendas próprias). ' +
      'Vencimento: último dia útil de fevereiro do ano subsequente. Base legal: IN RFB 1.115/2010.',
    categoria: 'Fiscal',
    prioridadePadrao: 'MEDIA',
    fonteUrl: 'http://normas.receita.fazenda.gov.br/sijut2consulta/link.action?idAto=16087',
    documentacaoUrl: 'https://www.gov.br/receitafederal/pt-br/assuntos/orientacao-tributaria/declaracoes-e-demonstrativos/dimob/perguntas-e-respostas',
    recorrencia: { frequencia: 'ANUAL', ancoragem: 'DIA_DO_MES', valorAncoragem: 28, competenciaOffset: 2 },
  },
  {
    nome: 'DITR — Declaração do Imposto Territorial Rural',
    descricao:
      'Declaração anual sobre imóveis rurais. Período de entrega: meados de agosto até 30 de setembro do exercício. ' +
      'Pode ser parcelada em até 4 quotas mensais. Base legal: Lei 9.393/96 e IN RFB anual.',
    categoria: 'Fiscal',
    prioridadePadrao: 'MEDIA',
    fonteUrl: 'https://www.planalto.gov.br/ccivil_03/leis/l9393.htm',
    documentacaoUrl: 'https://www.gov.br/pt-br/servicos/declarar-imposto-sobre-a-propriedade-territorial-rural',
    recorrencia: { frequencia: 'ANUAL', ancoragem: 'DIA_DO_MES', valorAncoragem: 30, competenciaOffset: 9 },
  },
  {
    nome: 'Informe de Rendimentos (PJ → PF/PJ)',
    descricao:
      'Comprovante anual de rendimentos pagos e retenções (IRRF, INSS) aos colaboradores e prestadores PJ. ' +
      'Substituiu o papel da DIRF a partir de 2026 (DIRF extinta — dados agora extraídos do eSocial/EFD-Reinf). ' +
      'Vencimento de entrega ao beneficiário: último dia útil de fevereiro do ano subsequente. Base legal: IN RFB 2.060/2021.',
    categoria: 'Fiscal',
    prioridadePadrao: 'ALTA',
    fonteUrl: 'http://normas.receita.fazenda.gov.br/sijut2consulta/link.action?idAto=122177',
    documentacaoUrl: 'https://www.gov.br/receitafederal/pt-br/assuntos/noticias/2021/dezembro/aprovado-o-novo-modelo-de-comprovante-de-rendimentos-pagos-e-de-imposto-sobre-a-renda-retido-na-fonte',
    recorrencia: { frequencia: 'ANUAL', ancoragem: 'DIA_DO_MES', valorAncoragem: 28, competenciaOffset: 2 },
  },

  // ──────────────────────────────────────────────────────────────────
  // TRABALHISTAS
  // ──────────────────────────────────────────────────────────────────
  {
    nome: 'eSocial — Folha de Pagamento (S-1200/S-1210/S-1299)',
    descricao:
      'Transmissão mensal dos eventos periódicos do eSocial: S-1200 (remuneração), S-1210 (pagamentos), S-1299 (fechamento). ' +
      'Vencimento: dia 15 do mês seguinte à competência (postergado para o próximo dia útil se cair em feriado/fim de semana). ' +
      'Base legal: Decreto 8.373/2014 e Manual de Orientação do eSocial.',
    categoria: 'Trabalhista',
    prioridadePadrao: 'ALTA',
    fonteUrl: 'https://www.gov.br/esocial/pt-br',
    documentacaoUrl: 'https://www.gov.br/esocial/pt-br/documentacao-tecnica/manuais/mos-s-1-3-consolidada-ate-a-no-s-1-3-05-2025.pdf',
    recorrencia: { frequencia: 'MENSAL', ancoragem: 'DIA_DO_MES', valorAncoragem: 15, competenciaOffset: 1 },
  },
  {
    nome: 'FGTS Digital — Guia Mensal',
    descricao:
      'Recolhimento mensal do FGTS via FGTS Digital (sucessor da GFIP/SEFIP a partir de mar/2024). ' +
      'Vencimento: dia 20 do mês seguinte ao da competência (antecipado para o dia útil anterior se cair em dia não útil). ' +
      'Base legal: Lei 8.036/90 e Portaria MTE 1.422/2023.',
    categoria: 'Trabalhista',
    prioridadePadrao: 'ALTA',
    fonteUrl: 'https://www.planalto.gov.br/ccivil_03/leis/l8036consol.htm',
    documentacaoUrl: 'https://www.gov.br/trabalho-e-emprego/pt-br/servicos/empregador/fgtsdigital',
    recorrencia: { frequencia: 'MENSAL', ancoragem: 'DIA_DO_MES', valorAncoragem: 20, competenciaOffset: 1 },
  },
  {
    nome: 'INSS — Contribuição Previdenciária (via DCTFWeb)',
    descricao:
      'Recolhimento mensal do INSS patronal e descontado dos segurados, consolidado na DCTFWeb a partir do eSocial. ' +
      'Vencimento: dia 20 do mês seguinte à competência (antecipado se não houver expediente bancário). ' +
      'Base legal: Lei 8.212/91 art. 30.',
    categoria: 'Trabalhista',
    prioridadePadrao: 'ALTA',
    fonteUrl: 'https://www.planalto.gov.br/ccivil_03/leis/l8212cons.htm',
    documentacaoUrl: 'https://www.gov.br/receitafederal/pt-br/assuntos/orientacao-tributaria/declaracoes-e-demonstrativos/DCTFWeb',
    recorrencia: { frequencia: 'MENSAL', ancoragem: 'DIA_DO_MES', valorAncoragem: 20, competenciaOffset: 1 },
  },
  {
    nome: 'IRRF — Folha de Pagamento',
    descricao:
      'Imposto de Renda Retido na Fonte sobre rendimentos do trabalho assalariado. Recolhido via DARF (código 0561) ou consolidado em DCTFWeb. ' +
      'Vencimento: dia 20 do mês seguinte ao do pagamento. Base legal: Lei 7.713/88, RIR/2018 art. 776.',
    categoria: 'Trabalhista',
    prioridadePadrao: 'ALTA',
    fonteUrl: 'https://www.planalto.gov.br/ccivil_03/leis/l7713.htm',
    documentacaoUrl: 'https://www.gov.br/receitafederal/pt-br/assuntos/agenda-tributaria/2026',
    recorrencia: { frequencia: 'MENSAL', ancoragem: 'DIA_DO_MES', valorAncoragem: 20, competenciaOffset: 1 },
  },
  {
    nome: 'Pagamento de Salários (Folha Mensal)',
    descricao:
      'Pagamento da remuneração mensal aos empregados. Prazo máximo: até o 5º dia útil do mês subsequente ao trabalhado. ' +
      'Sábado é considerado dia útil para esse fim (IN MTb 01/1989). Base legal: CLT art. 459 §1º.',
    categoria: 'Trabalhista',
    prioridadePadrao: 'ALTA',
    fonteUrl: 'https://www.planalto.gov.br/ccivil_03/decreto-lei/del5452.htm',
    documentacaoUrl: 'https://www.gov.br/trabalho-e-emprego/pt-br',
    recorrencia: { frequencia: 'MENSAL', ancoragem: 'DIA_UTIL', valorAncoragem: 5, competenciaOffset: 1 },
  },
  {
    nome: '13º Salário — 1ª Parcela',
    descricao:
      'Primeira parcela do 13º salário (50% bruto sem deduções de INSS/IRRF). Pode ser antecipada nas férias a pedido do empregado em janeiro. ' +
      'Vencimento: até 30 de novembro. Base legal: Lei 4.090/62 e Lei 4.749/65.',
    categoria: 'Trabalhista',
    prioridadePadrao: 'ALTA',
    fonteUrl: 'https://www.planalto.gov.br/ccivil_03/leis/l4090.htm',
    documentacaoUrl: 'https://www.gov.br/trabalho-e-emprego/pt-br/noticias-e-conteudo/2025/novembro/decimo-terceiro-salario-entenda-o-direito-regras-e-prazos-de-pagamento',
    recorrencia: {
      frequencia: 'ANUAL',
      ancoragem: 'DIA_DO_MES',
      valorAncoragem: 30,
      competenciaOffset: 0,
      modoPersonalizado: true,
      diasDoMes: [30],
      mesesDoAno: [11],
    },
  },
  {
    nome: '13º Salário — 2ª Parcela',
    descricao:
      'Segunda parcela do 13º salário (50% restante com descontos de INSS e IRRF sobre o total). ' +
      'Vencimento: até 20 de dezembro. Base legal: Lei 4.090/62 e Lei 4.749/65.',
    categoria: 'Trabalhista',
    prioridadePadrao: 'ALTA',
    fonteUrl: 'https://www.planalto.gov.br/ccivil_03/leis/l4090.htm',
    documentacaoUrl: 'https://www.gov.br/trabalho-e-emprego/pt-br/noticias-e-conteudo/2025/novembro/decimo-terceiro-salario-entenda-o-direito-regras-e-prazos-de-pagamento',
    recorrencia: {
      frequencia: 'ANUAL',
      ancoragem: 'DIA_DO_MES',
      valorAncoragem: 20,
      competenciaOffset: 0,
      modoPersonalizado: true,
      diasDoMes: [20],
      mesesDoAno: [12],
    },
  },

  // ──────────────────────────────────────────────────────────────────
  // ESTADUAIS — ESPÍRITO SANTO
  // ──────────────────────────────────────────────────────────────────
  {
    nome: 'ICMS — Apuração Mensal (Regime Ordinário)',
    descricao:
      'Apuração e recolhimento mensal do ICMS via DUA-e. Aplicável a contribuintes do regime ordinário (Lucro Real/Presumido). ' +
      'Vencimento no Espírito Santo: regra geral até o dia 15 do mês subsequente (verificar legislação estadual e CNAE — RICMS-ES). ' +
      'Base legal: LC 87/96 e RICMS-ES (Decreto 1.090-R/2002).',
    categoria: 'Fiscal',
    prioridadePadrao: 'ALTA',
    fonteUrl: 'https://internet.sefaz.es.gov.br/informacoes/agendaFiscal/index.php',
    documentacaoUrl: 'https://sefaz.es.gov.br/Media/Sefaz/Receita%20Estadual/Legislacao/RICMS%20Consolidado%20-%20Texto.pdf',
    recorrencia: { frequencia: 'MENSAL', ancoragem: 'DIA_DO_MES', valorAncoragem: 15, competenciaOffset: 1 },
  },
  {
    nome: 'DeSTDA — Declaração de Substituição Tributária, Diferencial de Alíquota e Antecipação',
    descricao:
      'Declaração mensal obrigatória para optantes do Simples Nacional (ME/EPP) contribuintes do ICMS que operam com ST, DIFAL ou antecipação. MEI não está sujeito. ' +
      'Vencimento: dia 20 do mês subsequente (próximo dia útil quando cair em dia não útil). Pode variar por UF — em SP é dia 28. ' +
      'Base legal: Ajuste SINIEF 12/2015.',
    categoria: 'Fiscal',
    prioridadePadrao: 'MEDIA',
    fonteUrl: 'https://www.confaz.fazenda.gov.br/legislacao/ajustes/2015/AJ_012_15',
    documentacaoUrl: 'https://atendimento.receita.rs.gov.br/upload/arquivos/202507/14100447-manual-destda-2023-v15.pdf',
    recorrencia: { frequencia: 'MENSAL', ancoragem: 'DIA_DO_MES', valorAncoragem: 20, competenciaOffset: 1 },
  },

  // ──────────────────────────────────────────────────────────────────
  // MUNICIPAIS — VITÓRIA/ES
  // ──────────────────────────────────────────────────────────────────
  {
    nome: 'ISSQN — Apuração Mensal (Vitória/ES)',
    descricao:
      'Apuração e recolhimento mensal do ISSQN sobre serviços prestados. Em Vitória/ES, o Módulo de Apuração Mensal do ISSQN deve ser transmitido ' +
      'e o imposto pago até o dia 10 do mês subsequente à competência (relativo às NFS-e emitidas no mês anterior). ' +
      'Base legal: LC 116/2003 e Lei Municipal 4.476/97 (Código Tributário de Vitória).',
    categoria: 'Fiscal',
    prioridadePadrao: 'ALTA',
    fonteUrl: 'https://m.vitoria.es.gov.br/prefeitura/issqn',
    documentacaoUrl: 'https://cartadeservicos.vitoria.es.gov.br/areas/16-Fazenda/servicos/537-Internet-Sistema-de-Imposto-Sobre-Servicos-ISISS/',
    recorrencia: { frequencia: 'MENSAL', ancoragem: 'DIA_DO_MES', valorAncoragem: 10, competenciaOffset: 1 },
  },

  // ──────────────────────────────────────────────────────────────────
  // CONTÁBEIS — RELATÓRIOS GERENCIAIS
  // ──────────────────────────────────────────────────────────────────
  {
    nome: 'Balancete Mensal',
    descricao:
      'Demonstrativo contábil mensal — saldos das contas patrimoniais e de resultado fechados na competência. ' +
      'Prazo interno sugerido: até o dia 25 do mês subsequente. Base: NBC TG 26 (R5) e Resolução CFC.',
    categoria: 'Contábil',
    prioridadePadrao: 'MEDIA',
    fonteUrl: 'https://cfc.org.br/tecnica/normas-brasileiras-de-contabilidade/normas-completas/',
    documentacaoUrl: 'https://cfc.org.br/wp-content/uploads/2018/04/Publicacao_NBC_TG_COMPLETAS.pdf',
    recorrencia: { frequencia: 'MENSAL', ancoragem: 'DIA_DO_MES', valorAncoragem: 25, competenciaOffset: 1 },
  },
  {
    nome: 'Balanço Patrimonial Anual + DRE',
    descricao:
      'Demonstrações contábeis anuais: Balanço Patrimonial, DRE, DLPA/DMPL e DFC. Encerramento do exercício social em 31/dez. ' +
      'Elaboração e disponibilização para sócios e auditoria geralmente até 31 de março do ano subsequente (alinhado com prazo da ECD). ' +
      'Base legal: Lei 6.404/76 art. 176, NBC TG 26 (R5).',
    categoria: 'Contábil',
    prioridadePadrao: 'ALTA',
    fonteUrl: 'https://www.planalto.gov.br/ccivil_03/leis/l6404consol.htm',
    documentacaoUrl: 'https://cfc.org.br/tecnica/normas-brasileiras-de-contabilidade/normas-completas/',
    recorrencia: { frequencia: 'ANUAL', ancoragem: 'DIA_DO_MES', valorAncoragem: 31, competenciaOffset: 3 },
  },
]

// ────────────────────────────────────────────────────────────────────
// Execução
// ────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`Cadastrando ${OBRIGACOES.length} obrigações fiscais/trabalhistas/contábeis como templates globais (empresaId=null)\n`)

  let criadas = 0
  let atualizadas = 0
  let erros = 0
  const porCategoria: Record<string, number> = {}

  for (const obr of OBRIGACOES) {
    try {
      // Match por nome + empresaId=null (templates globais)
      const existing = await prisma.servico.findFirst({
        where: { nome: obr.nome, empresaId: null },
        select: { id: true },
      })

      const dataServico: any = {
        nome: obr.nome,
        descricao: obr.descricao,
        categoria: obr.categoria,
        prioridadePadrao: obr.prioridadePadrao,
        categoriaServico: 'MENSAL',
        recorrenteMensal: obr.recorrencia.frequencia === 'MENSAL',
        disponivelOrcamento: true,
        ativo: true,
        atribuicaoResponsavel: 'CLIENTE_AREA',
        empresaId: null,
        fonteUrl: obr.fonteUrl ?? null,
        documentacaoUrl: obr.documentacaoUrl ?? null,
        ehObrigacaoAcessoria: true,
      }

      let servicoId: string
      let acao: 'CRIADA' | 'ATUALIZADA'

      if (existing) {
        const upd = await prisma.servico.update({
          where: { id: existing.id },
          data: dataServico,
        })
        servicoId = upd.id
        acao = 'ATUALIZADA'
        atualizadas++
      } else {
        const novo = await prisma.servico.create({ data: dataServico })
        servicoId = novo.id
        acao = 'CRIADA'
        criadas++
      }

      // Recorrência (upsert via findFirst + create/update por servicoId)
      const rec = obr.recorrencia
      const dataRec: any = {
        servicoId,
        ativa: true,
        frequencia: rec.frequencia,
        ancoragem: rec.ancoragem,
        valorAncoragem: rec.valorAncoragem,
        competenciaOffset: rec.competenciaOffset,
        modoPersonalizado: rec.modoPersonalizado ?? false,
        diasDoMes: rec.diasDoMes ?? [],
        mesesDoAno: rec.mesesDoAno ?? [],
      }

      const existingRec = await prisma.servicoRecorrencia.findUnique({
        where: { servicoId },
        select: { id: true },
      })

      if (existingRec) {
        await prisma.servicoRecorrencia.update({
          where: { servicoId },
          data: dataRec,
        })
      } else {
        await prisma.servicoRecorrencia.create({ data: dataRec })
      }

      porCategoria[obr.categoria] = (porCategoria[obr.categoria] ?? 0) + 1

      const recStr = rec.modoPersonalizado
        ? `dias=[${rec.diasDoMes?.join(',')}] meses=[${rec.mesesDoAno?.join(',') || 'todos'}]`
        : `${rec.frequencia} ${rec.ancoragem}=${rec.valorAncoragem} off=${rec.competenciaOffset}`
      console.log(`${acao.padEnd(10)} ${obr.categoria.padEnd(12)} ${obr.nome.padEnd(60)} ${recStr}`)
    } catch (e: any) {
      erros++
      console.error(`ERRO em "${obr.nome}":`, e?.message ?? e)
    }
  }

  console.log('\n──────────────────────────────────────────────')
  console.log('RESUMO')
  console.log('──────────────────────────────────────────────')
  console.log(`Total processadas: ${OBRIGACOES.length}`)
  console.log(`Criadas:           ${criadas}`)
  console.log(`Atualizadas:       ${atualizadas}`)
  console.log(`Erros:             ${erros}`)
  console.log('Por categoria:')
  for (const [cat, n] of Object.entries(porCategoria)) {
    console.log(`  ${cat.padEnd(14)} ${n}`)
  }

  // Verificação final
  const totalNoBanco = await prisma.servico.count({
    where: {
      empresaId: null,
      nome: { in: OBRIGACOES.map((o) => o.nome) },
    },
  })
  console.log(`\nVerificação: ${totalNoBanco}/${OBRIGACOES.length} templates encontrados no banco (empresaId=null).`)
}

main()
  .catch((e) => {
    console.error('Erro fatal:', e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
