/**
 * Cria 6 serviços de rotina mensal diferenciados por regime tributário:
 *
 *   Fiscal:
 *     1. Fiscal Mensal — Simples Nacional
 *     2. Fiscal Mensal — Lucro Presumido
 *     3. Fiscal Mensal — Lucro Real
 *
 *   Contábil:
 *     4. Contábil Mensal — Simples Nacional
 *     5. Contábil Mensal — Presumido/Real
 *
 *   Trabalhista:
 *     6. Trabalhista Mensal (genérico, vale pra qualquer regime)
 *
 * Todos: categoriaServico=MENSAL, prioridade=ALTA, disponivelOrcamento=true.
 * Passos com `permiteIgnorar=true` pra cobrir casos de borda (IPI, ICMS-ST,
 * EFD-Reinf sem prestadores, etc).
 */
import { prisma } from '../src/client'

type PassoDef = { nome: string; obrigatorio?: boolean; permiteIgnorar?: boolean; slaMinutos?: number }
type EtapaDef = { nome: string; passos: PassoDef[] }
type ServicoDef = { nome: string; descricao: string; etapas: EtapaDef[] }

// ── 1. FISCAL — SIMPLES NACIONAL ─────────────────────────────────────
const FISCAL_SIMPLES: ServicoDef = {
  nome: 'Fiscal Mensal — Simples Nacional',
  descricao: 'Rotina fiscal mensal para optantes do Simples Nacional — apuração PGDAS-D, emissão do DAS, conferência e arquivamento. Inclui passos opcionais pra DEFIS (anual), ICMS-ST e DeSTDA quando aplicáveis.',
  etapas: [
    {
      nome: 'Coleta e conferência de notas',
      passos: [
        { nome: 'Importar XMLs de NF-e emitidas e recebidas do mês', obrigatorio: true, slaMinutos: 45 },
        { nome: 'Importar XMLs de NFS-e (serviços) emitidas e tomadas', obrigatorio: true, slaMinutos: 30 },
        { nome: 'Importar / lançar NFC-e (cupons) quando aplicável', obrigatorio: false, permiteIgnorar: true, slaMinutos: 30 },
        { nome: 'Importar CT-e (transporte) quando aplicável', obrigatorio: false, permiteIgnorar: true, slaMinutos: 20 },
        { nome: 'Manifestar destinatário NF-e (aceite/desconhecimento)', obrigatorio: true, slaMinutos: 30 },
        { nome: 'Conferir notas canceladas e ajustar receitas', obrigatorio: true, slaMinutos: 20 },
        { nome: 'Solicitar variáveis ao cliente (vendas no balcão, etc) quando faltarem', obrigatorio: false, permiteIgnorar: true, slaMinutos: 30 },
      ],
    },
    {
      nome: 'Apuração e segregação',
      passos: [
        { nome: 'Conferir CNAE principal e secundárias atualizados', obrigatorio: true, slaMinutos: 15 },
        { nome: 'Identificar e segregar receitas por anexo (I, II, III, IV, V)', obrigatorio: true, slaMinutos: 30 },
        { nome: 'Separar receitas com substituição tributária / monofásicas', obrigatorio: false, permiteIgnorar: true, slaMinutos: 30 },
        { nome: 'Identificar receitas isentas, imunes ou com redução', obrigatorio: false, permiteIgnorar: true, slaMinutos: 20 },
        { nome: 'Aplicar fator R (anexo V → III) quando aplicável', obrigatorio: false, permiteIgnorar: true, slaMinutos: 30 },
        { nome: 'Calcular receita bruta acumulada 12 meses (RBT12) e validar limite', obrigatorio: true, slaMinutos: 20 },
        { nome: 'Verificar pendências de sublimite estadual (R$ 3,6mi de ICMS/ISS)', obrigatorio: false, permiteIgnorar: true, slaMinutos: 15 },
      ],
    },
    {
      nome: 'PGDAS-D e DAS',
      passos: [
        { nome: 'Acessar PGDAS-D e selecionar período de apuração', obrigatorio: true, slaMinutos: 10 },
        { nome: 'Lançar receitas por anexo e estabelecimento', obrigatorio: true, slaMinutos: 30 },
        { nome: 'Lançar reduções (ST, monofásicos, imunes)', obrigatorio: false, permiteIgnorar: true, slaMinutos: 20 },
        { nome: 'Conferir alíquota efetiva calculada', obrigatorio: true, slaMinutos: 10 },
        { nome: 'Transmitir declaração PGDAS-D', obrigatorio: true, slaMinutos: 10 },
        { nome: 'Emitir guia DAS', obrigatorio: true, slaMinutos: 10 },
        { nome: 'Conferir vencimento (dia 20 do mês subsequente)', obrigatorio: true, slaMinutos: 5 },
      ],
    },
    {
      nome: 'Obrigações estaduais (quando aplicável)',
      passos: [
        { nome: 'Apurar ICMS-ST a recolher (substituição tributária)', obrigatorio: false, permiteIgnorar: true, slaMinutos: 45 },
        { nome: 'Apurar e emitir GNRE de ICMS-ST interestadual', obrigatorio: false, permiteIgnorar: true, slaMinutos: 30 },
        { nome: 'Transmitir DeSTDA (Declaração Substituição Tributária)', obrigatorio: false, permiteIgnorar: true, slaMinutos: 30 },
        { nome: 'Apurar diferencial de alíquota (DIFAL) em compras interestaduais', obrigatorio: false, permiteIgnorar: true, slaMinutos: 30 },
      ],
    },
    {
      nome: 'Obrigações municipais (quando aplicável)',
      passos: [
        { nome: 'Apurar ISS retido (tomador) e a recolher (prestador)', obrigatorio: false, permiteIgnorar: true, slaMinutos: 30 },
        { nome: 'Emitir DAM / guia municipal de ISS', obrigatorio: false, permiteIgnorar: true, slaMinutos: 20 },
        { nome: 'Transmitir declaração municipal eletrônica (DEISS/DMS)', obrigatorio: false, permiteIgnorar: true, slaMinutos: 30 },
      ],
    },
    {
      nome: 'Conferência e envio ao cliente',
      passos: [
        { nome: 'Conferir guias com cliente antes do envio', obrigatorio: true, slaMinutos: 20 },
        { nome: 'Enviar DAS + demais guias por e-mail / WhatsApp', obrigatorio: true, slaMinutos: 10 },
        { nome: 'Anexar comprovante de transmissão PGDAS-D ao dossiê', obrigatorio: true, slaMinutos: 5 },
        { nome: 'Arquivar declarações no dossiê do cliente', obrigatorio: true, slaMinutos: 10 },
      ],
    },
    {
      nome: 'Encerramento da competência',
      passos: [
        { nome: 'Fechar competência fiscal no sistema (bloquear edição)', obrigatorio: true, slaMinutos: 5 },
        { nome: 'Atualizar painel de status do cliente', obrigatorio: true, slaMinutos: 5 },
        { nome: 'Registrar pendências/follow-ups pro mês seguinte', obrigatorio: false, permiteIgnorar: true, slaMinutos: 15 },
        { nome: 'DEFIS anual (transmitir em março) — quando for o caso', obrigatorio: false, permiteIgnorar: true, slaMinutos: 90 },
      ],
    },
  ],
}

// ── 2. FISCAL — LUCRO PRESUMIDO ──────────────────────────────────────
const FISCAL_PRESUMIDO: ServicoDef = {
  nome: 'Fiscal Mensal — Lucro Presumido',
  descricao: 'Rotina fiscal mensal para Lucro Presumido — PIS/COFINS cumulativo, ICMS, ISS, EFD-Contrib mensal, DCTFWeb. Apurações trimestrais de IRPJ/CSLL. Inclui obrigações anuais (ECF/ECD).',
  etapas: [
    {
      nome: 'Coleta e conferência de documentos',
      passos: [
        { nome: 'Importar XMLs de NF-e emitidas e recebidas do mês', obrigatorio: true, slaMinutos: 45 },
        { nome: 'Importar XMLs de NFS-e (serviços) emitidas e tomadas', obrigatorio: true, slaMinutos: 30 },
        { nome: 'Importar CT-e (transporte) quando aplicável', obrigatorio: false, permiteIgnorar: true, slaMinutos: 20 },
        { nome: 'Conferir manifestação do destinatário das NF-e', obrigatorio: true, slaMinutos: 30 },
        { nome: 'Solicitar e conferir extratos bancários / movimento financeiro', obrigatorio: true, slaMinutos: 20 },
        { nome: 'Conferir notas canceladas e cartas de correção', obrigatorio: true, slaMinutos: 15 },
      ],
    },
    {
      nome: 'Apuração mensal — ICMS / ISS',
      passos: [
        { nome: 'Apurar ICMS débito × crédito do mês', obrigatorio: false, permiteIgnorar: true, slaMinutos: 60 },
        { nome: 'Aplicar ajustes (ICMS-ST, antecipação, isenções, reduções)', obrigatorio: false, permiteIgnorar: true, slaMinutos: 45 },
        { nome: 'Apurar DIFAL em compras/vendas interestaduais', obrigatorio: false, permiteIgnorar: true, slaMinutos: 30 },
        { nome: 'Emitir GIA ou equivalente estadual e GARE/DARE de ICMS', obrigatorio: false, permiteIgnorar: true, slaMinutos: 30 },
        { nome: 'Apurar ISS retido (tomador) e a recolher (prestador)', obrigatorio: false, permiteIgnorar: true, slaMinutos: 30 },
        { nome: 'Emitir DAM / guia municipal de ISS', obrigatorio: false, permiteIgnorar: true, slaMinutos: 15 },
      ],
    },
    {
      nome: 'Apuração mensal — PIS/COFINS cumulativo',
      passos: [
        { nome: 'Apurar base de cálculo PIS/COFINS (regime cumulativo)', obrigatorio: true, slaMinutos: 45 },
        { nome: 'Aplicar exclusões da base (descontos incondicionais, vendas canceladas)', obrigatorio: true, slaMinutos: 30 },
        { nome: 'Calcular PIS (0,65%) e COFINS (3,0%)', obrigatorio: true, slaMinutos: 15 },
        { nome: 'Emitir DARF de PIS (código 8109) e COFINS (código 2172)', obrigatorio: true, slaMinutos: 15 },
      ],
    },
    {
      nome: 'IRPJ/CSLL (trimestral)',
      passos: [
        { nome: 'Validar se o mês fecha trimestre (mar, jun, set, dez)', obrigatorio: true, slaMinutos: 5 },
        { nome: 'Apurar receita bruta trimestral e aplicar percentuais de presunção', obrigatorio: false, permiteIgnorar: true, slaMinutos: 45 },
        { nome: 'Apurar IRPJ (15%) + adicional (10% sobre excedente de R$ 60mil)', obrigatorio: false, permiteIgnorar: true, slaMinutos: 20 },
        { nome: 'Apurar CSLL (9% sobre base presumida)', obrigatorio: false, permiteIgnorar: true, slaMinutos: 15 },
        { nome: 'Emitir DARF IRPJ e CSLL com possibilidade de parcelamento em 3 quotas', obrigatorio: false, permiteIgnorar: true, slaMinutos: 20 },
      ],
    },
    {
      nome: 'EFD-Contribuições e DCTFWeb',
      passos: [
        { nome: 'Gerar EFD-Contribuições do mês (Bloco A/F/M/etc.)', obrigatorio: true, slaMinutos: 60 },
        { nome: 'Validar EFD-Contribuições no PVA antes do envio', obrigatorio: true, slaMinutos: 20 },
        { nome: 'Transmitir EFD-Contribuições no portal SPED', obrigatorio: true, slaMinutos: 15 },
        { nome: 'Conferir DCTFWeb gerada automaticamente da EFD-Contrib + folha', obrigatorio: true, slaMinutos: 30 },
        { nome: 'Transmitir DCTFWeb e emitir DARF resultante', obrigatorio: true, slaMinutos: 15 },
      ],
    },
    {
      nome: 'EFD-Reinf (quando aplicável)',
      passos: [
        { nome: 'Identificar pagamentos a prestadores PJ com retenções (R-2010)', obrigatorio: false, permiteIgnorar: true, slaMinutos: 30 },
        { nome: 'Gerar e transmitir eventos R-2010, R-2020, R-2030 conforme aplicável', obrigatorio: false, permiteIgnorar: true, slaMinutos: 60 },
        { nome: 'Fechar competência R-2099 e validar geração da DCTFWeb', obrigatorio: false, permiteIgnorar: true, slaMinutos: 15 },
      ],
    },
    {
      nome: 'Conferência e envio ao cliente',
      passos: [
        { nome: 'Conferir todas as guias com cliente antes do pagamento', obrigatorio: true, slaMinutos: 30 },
        { nome: 'Enviar guias por e-mail e arquivar comprovantes de transmissão', obrigatorio: true, slaMinutos: 15 },
        { nome: 'Atualizar painel de status do cliente', obrigatorio: true, slaMinutos: 5 },
        { nome: 'Fechar competência fiscal no sistema', obrigatorio: true, slaMinutos: 5 },
      ],
    },
    {
      nome: 'Obrigações anuais (passo no mês de fechamento)',
      passos: [
        { nome: 'ECD anual — escrituração contábil digital (até maio)', obrigatorio: false, permiteIgnorar: true, slaMinutos: 240 },
        { nome: 'ECF anual — escrituração contábil fiscal (até julho)', obrigatorio: false, permiteIgnorar: true, slaMinutos: 240 },
        { nome: 'DIRF anual (até fevereiro)', obrigatorio: false, permiteIgnorar: true, slaMinutos: 120 },
      ],
    },
  ],
}

// ── 3. FISCAL — LUCRO REAL ────────────────────────────────────────────
const FISCAL_REAL: ServicoDef = {
  nome: 'Fiscal Mensal — Lucro Real',
  descricao: 'Rotina fiscal mensal para Lucro Real — PIS/COFINS não-cumulativo, ICMS/IPI, SPED Fiscal, EFD-Contribuições, EFD-Reinf, DCTFWeb. IRPJ/CSLL mensal por estimativa ou trimestral. Inclui anuais ECD/ECF.',
  etapas: [
    {
      nome: 'Coleta e conferência ampla',
      passos: [
        { nome: 'Importar XMLs de NF-e emitidas e recebidas do mês', obrigatorio: true, slaMinutos: 60 },
        { nome: 'Importar XMLs de NFS-e (serviços) emitidas e tomadas', obrigatorio: true, slaMinutos: 30 },
        { nome: 'Importar CT-e (transporte) e MDF-e', obrigatorio: false, permiteIgnorar: true, slaMinutos: 30 },
        { nome: 'Conferir manifestação do destinatário das NF-e', obrigatorio: true, slaMinutos: 30 },
        { nome: 'Solicitar e conferir extratos bancários / movimento financeiro', obrigatorio: true, slaMinutos: 30 },
        { nome: 'Solicitar inventário do mês anterior (estoque) quando aplicável', obrigatorio: false, permiteIgnorar: true, slaMinutos: 30 },
        { nome: 'Conferir notas canceladas, cartas de correção e cancelamento extemporâneo', obrigatorio: true, slaMinutos: 20 },
      ],
    },
    {
      nome: 'Apuração ICMS / IPI',
      passos: [
        { nome: 'Apurar ICMS débito × crédito (incluindo crédito presumido se houver)', obrigatorio: false, permiteIgnorar: true, slaMinutos: 90 },
        { nome: 'Aplicar ajustes (ICMS-ST, antecipação, FECOEP, isenções, reduções)', obrigatorio: false, permiteIgnorar: true, slaMinutos: 60 },
        { nome: 'Apurar IPI mensal (indústrias e equiparados)', obrigatorio: false, permiteIgnorar: true, slaMinutos: 60 },
        { nome: 'Apurar DIFAL interestadual', obrigatorio: false, permiteIgnorar: true, slaMinutos: 30 },
        { nome: 'Emitir GIA estadual e GARE/DARE de ICMS', obrigatorio: false, permiteIgnorar: true, slaMinutos: 30 },
        { nome: 'Emitir DARF de IPI', obrigatorio: false, permiteIgnorar: true, slaMinutos: 15 },
      ],
    },
    {
      nome: 'Apuração PIS/COFINS não-cumulativo',
      passos: [
        { nome: 'Levantar base de cálculo de receitas tributáveis', obrigatorio: true, slaMinutos: 60 },
        { nome: 'Apurar créditos (insumos, energia, aluguel, depreciação, etc)', obrigatorio: true, slaMinutos: 90 },
        { nome: 'Calcular PIS (1,65%) e COFINS (7,6%) líquidos', obrigatorio: true, slaMinutos: 30 },
        { nome: 'Conferir saldo credor a transportar (se houver)', obrigatorio: false, permiteIgnorar: true, slaMinutos: 30 },
        { nome: 'Emitir DARFs de PIS (6912) e COFINS (5856)', obrigatorio: true, slaMinutos: 15 },
      ],
    },
    {
      nome: 'IRPJ/CSLL (estimativa mensal ou trimestral)',
      passos: [
        { nome: 'Identificar regime de apuração — mensal por estimativa ou trimestral', obrigatorio: true, slaMinutos: 10 },
        { nome: 'Apurar base e calcular IRPJ + adicional + CSLL conforme regime', obrigatorio: true, slaMinutos: 90 },
        { nome: 'Compensar antecipações pagas no ano em curso', obrigatorio: false, permiteIgnorar: true, slaMinutos: 30 },
        { nome: 'Emitir DARF IRPJ e CSLL', obrigatorio: true, slaMinutos: 15 },
      ],
    },
    {
      nome: 'SPED Fiscal + EFD-Contribuições',
      passos: [
        { nome: 'Gerar SPED Fiscal (EFD-ICMS/IPI)', obrigatorio: true, slaMinutos: 90 },
        { nome: 'Validar SPED Fiscal no PVA e corrigir inconsistências', obrigatorio: true, slaMinutos: 60 },
        { nome: 'Transmitir SPED Fiscal no portal SPED', obrigatorio: true, slaMinutos: 15 },
        { nome: 'Gerar EFD-Contribuições do mês', obrigatorio: true, slaMinutos: 90 },
        { nome: 'Validar EFD-Contribuições e ajustar', obrigatorio: true, slaMinutos: 30 },
        { nome: 'Transmitir EFD-Contribuições', obrigatorio: true, slaMinutos: 15 },
      ],
    },
    {
      nome: 'EFD-Reinf',
      passos: [
        { nome: 'Identificar pagamentos a prestadores PJ com retenções (R-2010)', obrigatorio: true, slaMinutos: 30 },
        { nome: 'Gerar e transmitir R-2010, R-2020, R-2030, R-2050, R-2060 conforme aplicável', obrigatorio: true, slaMinutos: 90 },
        { nome: 'Fechar competência R-2099 e validar', obrigatorio: true, slaMinutos: 20 },
      ],
    },
    {
      nome: 'DCTFWeb e envio',
      passos: [
        { nome: 'Conferir DCTFWeb gerada (EFD-Reinf + folha + EFD-Contrib)', obrigatorio: true, slaMinutos: 45 },
        { nome: 'Transmitir DCTFWeb e emitir DARF consolidado', obrigatorio: true, slaMinutos: 15 },
        { nome: 'Conferir todas as guias com cliente antes do pagamento', obrigatorio: true, slaMinutos: 45 },
        { nome: 'Enviar guias + comprovantes ao cliente', obrigatorio: true, slaMinutos: 15 },
        { nome: 'Arquivar SPEDs e declarações no dossiê', obrigatorio: true, slaMinutos: 15 },
        { nome: 'Fechar competência fiscal no sistema', obrigatorio: true, slaMinutos: 5 },
      ],
    },
    {
      nome: 'Obrigações anuais (passo no mês de fechamento)',
      passos: [
        { nome: 'ECD anual — escrituração contábil digital (até maio)', obrigatorio: false, permiteIgnorar: true, slaMinutos: 480 },
        { nome: 'ECF anual — escrituração contábil fiscal (até julho)', obrigatorio: false, permiteIgnorar: true, slaMinutos: 480 },
        { nome: 'DIRF anual (até fevereiro)', obrigatorio: false, permiteIgnorar: true, slaMinutos: 180 },
      ],
    },
  ],
}

// ── 4. CONTÁBIL — SIMPLES NACIONAL ───────────────────────────────────
const CONTABIL_SIMPLES: ServicoDef = {
  nome: 'Contábil Mensal — Simples Nacional',
  descricao: 'Rotina contábil mensal para Simples Nacional — escrituração simplificada (Caixa + Razão + Diário). Sem obrigatoriedade de ECD na maioria dos casos. Foco em controle gerencial e suporte à apuração do PGDAS.',
  etapas: [
    {
      nome: 'Coleta de movimentação',
      passos: [
        { nome: 'Coletar extratos bancários do mês (todas as contas)', obrigatorio: true, slaMinutos: 30 },
        { nome: 'Coletar extratos de cartão corporativo e maquininhas', obrigatorio: false, permiteIgnorar: true, slaMinutos: 30 },
        { nome: 'Importar arquivo OFX no sistema contábil', obrigatorio: true, slaMinutos: 30 },
        { nome: 'Receber relação de receitas (apuração PGDAS) do Fiscal', obrigatorio: true, slaMinutos: 15 },
        { nome: 'Receber relação de despesas/notas de fornecedores', obrigatorio: true, slaMinutos: 20 },
      ],
    },
    {
      nome: 'Classificação e lançamentos',
      passos: [
        { nome: 'Classificar lançamentos bancários (receitas, despesas, transferências)', obrigatorio: true, slaMinutos: 90 },
        { nome: 'Lançar DAS e demais tributos do mês', obrigatorio: true, slaMinutos: 20 },
        { nome: 'Lançar folha de pagamento e encargos (integração com Trabalhista)', obrigatorio: true, slaMinutos: 30 },
        { nome: 'Lançar pró-labore e distribuição de lucros', obrigatorio: false, permiteIgnorar: true, slaMinutos: 20 },
        { nome: 'Lançar pagamentos a fornecedores não-registrados no banco', obrigatorio: false, permiteIgnorar: true, slaMinutos: 30 },
      ],
    },
    {
      nome: 'Conciliação',
      passos: [
        { nome: 'Conciliação bancária — todas as contas do mês', obrigatorio: true, slaMinutos: 60 },
        { nome: 'Identificar e ajustar lançamentos pendentes', obrigatorio: true, slaMinutos: 30 },
        { nome: 'Conferir saldo final × extrato fechamento do mês', obrigatorio: true, slaMinutos: 15 },
      ],
    },
    {
      nome: 'Fechamento e relatórios',
      passos: [
        { nome: 'Gerar Balancete do mês', obrigatorio: true, slaMinutos: 15 },
        { nome: 'Gerar DRE simplificada', obrigatorio: true, slaMinutos: 15 },
        { nome: 'Gerar Razão analítico', obrigatorio: false, permiteIgnorar: true, slaMinutos: 15 },
        { nome: 'Conferir saldos com cliente', obrigatorio: true, slaMinutos: 30 },
        { nome: 'Ajustar divergências e refechar', obrigatorio: false, permiteIgnorar: true, slaMinutos: 45 },
        { nome: 'Fechar competência contábil (bloquear edição)', obrigatorio: true, slaMinutos: 10 },
        { nome: 'Enviar relatórios mensais ao cliente', obrigatorio: true, slaMinutos: 15 },
      ],
    },
    {
      nome: 'Obrigações anuais (no mês de fechamento)',
      passos: [
        { nome: 'Apoio ao Fiscal pra DEFIS (revisão dos saldos)', obrigatorio: false, permiteIgnorar: true, slaMinutos: 60 },
        { nome: 'Balanço Patrimonial anual + Demonstrações para sócios', obrigatorio: false, permiteIgnorar: true, slaMinutos: 240 },
      ],
    },
  ],
}

// ── 5. CONTÁBIL — PRESUMIDO/REAL ─────────────────────────────────────
const CONTABIL_PR: ServicoDef = {
  nome: 'Contábil Mensal — Presumido/Real',
  descricao: 'Rotina contábil mensal completa para Lucro Presumido ou Real — escrituração obrigatória ECD, lançamentos detalhados, provisões, depreciação, conciliações múltiplas, geração de balancete/DRE/Razão.',
  etapas: [
    {
      nome: 'Coleta ampla de documentos',
      passos: [
        { nome: 'Coletar extratos bancários (todas as contas correntes + aplicações)', obrigatorio: true, slaMinutos: 30 },
        { nome: 'Coletar extratos de cartão corporativo, maquininhas, gateway de pagamento', obrigatorio: true, slaMinutos: 30 },
        { nome: 'Importar arquivos OFX no sistema contábil', obrigatorio: true, slaMinutos: 30 },
        { nome: 'Receber relação fiscal completa (notas emitidas/recebidas, impostos)', obrigatorio: true, slaMinutos: 30 },
        { nome: 'Receber folha de pagamento e encargos do Trabalhista', obrigatorio: true, slaMinutos: 20 },
        { nome: 'Coletar contratos novos (empréstimos, leasings, locações)', obrigatorio: false, permiteIgnorar: true, slaMinutos: 30 },
        { nome: 'Receber relação de aquisições/baixas do ativo imobilizado', obrigatorio: false, permiteIgnorar: true, slaMinutos: 20 },
      ],
    },
    {
      nome: 'Lançamentos contábeis detalhados',
      passos: [
        { nome: 'Classificar lançamentos bancários (com plano de contas completo)', obrigatorio: true, slaMinutos: 180 },
        { nome: 'Lançar receitas reconhecidas com tributos destacados', obrigatorio: true, slaMinutos: 60 },
        { nome: 'Lançar custos de mercadoria/serviço vendido (CMV/CSV)', obrigatorio: true, slaMinutos: 60 },
        { nome: 'Lançar despesas com fornecedores e centro de custo', obrigatorio: true, slaMinutos: 60 },
        { nome: 'Lançar folha de pagamento integrada (rubricas → contas)', obrigatorio: true, slaMinutos: 30 },
        { nome: 'Lançar tributos apurados pelo Fiscal (DARFs e GAREs)', obrigatorio: true, slaMinutos: 30 },
        { nome: 'Lançar adições/baixas do ativo imobilizado', obrigatorio: false, permiteIgnorar: true, slaMinutos: 30 },
      ],
    },
    {
      nome: 'Provisões e ajustes',
      passos: [
        { nome: 'Provisionar férias e 13º salário do mês', obrigatorio: true, slaMinutos: 30 },
        { nome: 'Calcular e lançar depreciação do imobilizado', obrigatorio: true, slaMinutos: 30 },
        { nome: 'Lançar amortização de intangíveis quando aplicável', obrigatorio: false, permiteIgnorar: true, slaMinutos: 20 },
        { nome: 'Ajustes de competência (despesas antecipadas / a apropriar)', obrigatorio: true, slaMinutos: 30 },
        { nome: 'Atualizar empréstimos com juros e amortizações', obrigatorio: false, permiteIgnorar: true, slaMinutos: 30 },
      ],
    },
    {
      nome: 'Conciliações múltiplas',
      passos: [
        { nome: 'Conciliação bancária — todas as contas do mês', obrigatorio: true, slaMinutos: 60 },
        { nome: 'Conciliar fornecedores (contas a pagar × razão)', obrigatorio: true, slaMinutos: 45 },
        { nome: 'Conciliar clientes (contas a receber × razão)', obrigatorio: true, slaMinutos: 45 },
        { nome: 'Conciliar tributos a recolher (apuração Fiscal × razão)', obrigatorio: true, slaMinutos: 30 },
        { nome: 'Conciliar folha/encargos (Trabalhista × razão)', obrigatorio: true, slaMinutos: 30 },
        { nome: 'Conciliar caixa/saldos de adiantamentos', obrigatorio: false, permiteIgnorar: true, slaMinutos: 20 },
      ],
    },
    {
      nome: 'Fechamento e DRE',
      passos: [
        { nome: 'Apurar resultado do mês', obrigatorio: true, slaMinutos: 30 },
        { nome: 'Calcular IRPJ/CSLL diferido se Lucro Real', obrigatorio: false, permiteIgnorar: true, slaMinutos: 45 },
        { nome: 'Gerar Balancete consolidado', obrigatorio: true, slaMinutos: 15 },
        { nome: 'Gerar DRE detalhada com comparativos', obrigatorio: true, slaMinutos: 30 },
        { nome: 'Gerar Razão analítico das principais contas', obrigatorio: true, slaMinutos: 30 },
        { nome: 'Análise de indicadores básicos (margem, liquidez, EBITDA)', obrigatorio: false, permiteIgnorar: true, slaMinutos: 30 },
      ],
    },
    {
      nome: 'Conferência e relatórios',
      passos: [
        { nome: 'Reunião de fechamento com cliente (apresentar resultado)', obrigatorio: true, slaMinutos: 60 },
        { nome: 'Ajustar lançamentos divergentes apontados pelo cliente', obrigatorio: false, permiteIgnorar: true, slaMinutos: 60 },
        { nome: 'Refechar competência após ajustes', obrigatorio: false, permiteIgnorar: true, slaMinutos: 30 },
        { nome: 'Fechar competência contábil no sistema (bloquear edição)', obrigatorio: true, slaMinutos: 10 },
        { nome: 'Enviar pacote completo de relatórios ao cliente', obrigatorio: true, slaMinutos: 15 },
      ],
    },
    {
      nome: 'Obrigações anuais (no mês de fechamento)',
      passos: [
        { nome: 'Apoio à ECD anual (validação dos saldos pra escrituração digital)', obrigatorio: false, permiteIgnorar: true, slaMinutos: 480 },
        { nome: 'Apoio à ECF anual (validação dos blocos e LALUR/LACS)', obrigatorio: false, permiteIgnorar: true, slaMinutos: 480 },
        { nome: 'Balanço Patrimonial + DRE anual + DLPA + DFC para sócios', obrigatorio: false, permiteIgnorar: true, slaMinutos: 240 },
      ],
    },
  ],
}

// ── 6. TRABALHISTA MENSAL ────────────────────────────────────────────
const TRABALHISTA_MENSAL: ServicoDef = {
  nome: 'Trabalhista Mensal',
  descricao: 'Rotina trabalhista mensal genérica — coleta de variáveis, processamento de folha, encargos, geração de guias (DCTFWeb + FGTS Digital), eventos eSocial (S-1200/S-1210/S-1299) e comunicação ao cliente.',
  etapas: [
    {
      nome: 'Coleta de variáveis do mês',
      passos: [
        { nome: 'Solicitar variáveis ao cliente (horas extras, faltas, atrasos)', obrigatorio: true, slaMinutos: 20 },
        { nome: 'Coletar atestados médicos do mês', obrigatorio: false, permiteIgnorar: true, slaMinutos: 15 },
        { nome: 'Coletar adiantamentos pagos no mês', obrigatorio: false, permiteIgnorar: true, slaMinutos: 15 },
        { nome: 'Coletar comissões / variáveis de venda', obrigatorio: false, permiteIgnorar: true, slaMinutos: 20 },
        { nome: 'Coletar feedback de eventos do mês (admissões, demissões, férias gozadas)', obrigatorio: true, slaMinutos: 30 },
      ],
    },
    {
      nome: 'Admissões e desligamentos',
      passos: [
        { nome: 'Cadastrar novos colaboradores no sistema (admissão)', obrigatorio: false, permiteIgnorar: true, slaMinutos: 60 },
        { nome: 'Enviar evento S-2200 (admissão) ao eSocial', obrigatorio: false, permiteIgnorar: true, slaMinutos: 30 },
        { nome: 'Processar rescisões do mês (TRCT, verbas, multa FGTS)', obrigatorio: false, permiteIgnorar: true, slaMinutos: 90 },
        { nome: 'Enviar evento S-2299 (desligamento) ao eSocial', obrigatorio: false, permiteIgnorar: true, slaMinutos: 30 },
        { nome: 'Emitir guia FGTS rescisória + chaves de conectividade', obrigatorio: false, permiteIgnorar: true, slaMinutos: 30 },
      ],
    },
    {
      nome: 'Processamento da folha',
      passos: [
        { nome: 'Lançar variáveis recebidas no sistema de folha', obrigatorio: true, slaMinutos: 60 },
        { nome: 'Calcular folha do mês (proventos × descontos)', obrigatorio: true, slaMinutos: 30 },
        { nome: 'Calcular benefícios (VR, VA, VT, plano saúde, odonto)', obrigatorio: true, slaMinutos: 30 },
        { nome: 'Aplicar descontos previstos (sindicato, contribuição assistencial, faltas)', obrigatorio: true, slaMinutos: 20 },
        { nome: 'Calcular adicionais (insalubridade, periculosidade, noturno, HE)', obrigatorio: false, permiteIgnorar: true, slaMinutos: 30 },
        { nome: 'Calcular pró-labore dos sócios', obrigatorio: false, permiteIgnorar: true, slaMinutos: 15 },
      ],
    },
    {
      nome: 'Encargos e guias',
      passos: [
        { nome: 'Calcular INSS (parte do empregado + patronal)', obrigatorio: true, slaMinutos: 20 },
        { nome: 'Calcular IRRF (retenção na fonte)', obrigatorio: true, slaMinutos: 20 },
        { nome: 'Calcular FGTS (8% / 2% jovem aprendiz)', obrigatorio: true, slaMinutos: 15 },
        { nome: 'Calcular contribuições a terceiros (Sistema S, INCRA)', obrigatorio: true, slaMinutos: 15 },
      ],
    },
    {
      nome: 'Conferência com cliente',
      passos: [
        { nome: 'Gerar prévia da folha (espelho) e enviar pro cliente', obrigatorio: true, slaMinutos: 15 },
        { nome: 'Aguardar conferência e aprovação do cliente', obrigatorio: true, slaMinutos: 30 },
        { nome: 'Ajustar conforme retorno do cliente', obrigatorio: false, permiteIgnorar: true, slaMinutos: 45 },
      ],
    },
    {
      nome: 'eSocial e DCTFWeb',
      passos: [
        { nome: 'Transmitir evento S-1200 (folha de pagamento)', obrigatorio: true, slaMinutos: 30 },
        { nome: 'Transmitir evento S-1210 (pagamentos)', obrigatorio: true, slaMinutos: 30 },
        { nome: 'Transmitir evento S-1299 (fechamento da competência)', obrigatorio: true, slaMinutos: 15 },
        { nome: 'Conferir DCTFWeb gerada e transmitir', obrigatorio: true, slaMinutos: 30 },
        { nome: 'Emitir DARF DCTFWeb (INSS + IRRF)', obrigatorio: true, slaMinutos: 15 },
        { nome: 'Emitir guia FGTS Digital do mês', obrigatorio: true, slaMinutos: 15 },
      ],
    },
    {
      nome: 'Pagamentos e entrega',
      passos: [
        { nome: 'Gerar holerites e enviar aos colaboradores', obrigatorio: true, slaMinutos: 30 },
        { nome: 'Gerar arquivo bancário (CNAB / PIX) pra cliente pagar a folha', obrigatorio: true, slaMinutos: 20 },
        { nome: 'Enviar guias DARF + FGTS ao cliente', obrigatorio: true, slaMinutos: 15 },
        { nome: 'Arquivar comprovantes de transmissão eSocial no dossiê', obrigatorio: true, slaMinutos: 10 },
      ],
    },
    {
      nome: 'Eventos não-mensais (passos opcionais)',
      passos: [
        { nome: 'Provisionar e processar férias gozadas no mês seguinte', obrigatorio: false, permiteIgnorar: true, slaMinutos: 60 },
        { nome: '13º salário — 1ª parcela em novembro / 2ª em dezembro', obrigatorio: false, permiteIgnorar: true, slaMinutos: 90 },
        { nome: 'RAIS anual (até março) — quando ainda exigível', obrigatorio: false, permiteIgnorar: true, slaMinutos: 90 },
        { nome: 'Informe de rendimentos anuais aos colaboradores (até fevereiro)', obrigatorio: false, permiteIgnorar: true, slaMinutos: 30 },
      ],
    },
    {
      nome: 'Encerramento',
      passos: [
        { nome: 'Fechar competência da folha no sistema', obrigatorio: true, slaMinutos: 5 },
        { nome: 'Atualizar painel de status do cliente', obrigatorio: true, slaMinutos: 5 },
        { nome: 'Registrar follow-ups pro mês seguinte', obrigatorio: false, permiteIgnorar: true, slaMinutos: 10 },
      ],
    },
  ],
}

const SERVICOS: ServicoDef[] = [
  FISCAL_SIMPLES,
  FISCAL_PRESUMIDO,
  FISCAL_REAL,
  CONTABIL_SIMPLES,
  CONTABIL_PR,
  TRABALHISTA_MENSAL,
]

async function criarServico(def: ServicoDef, empresaId: string | null): Promise<{ id: string; slaTotalMin: number; totalPassos: number }> {
  const servico = await prisma.servico.create({
    data: {
      nome: def.nome,
      descricao: def.descricao,
      tipo: 'ATIVIDADE',
      categoriaServico: 'MENSAL',
      prioridadePadrao: 'ALTA',
      disponivelOrcamento: true,
      recorrenteMensal: true,
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

  return { id: servico.id, slaTotalMin, totalPassos }
}

async function main() {
  console.log('🏗️  Criando 6 serviços de rotina MENSAL diferenciados por regime\n')

  const ref = await prisma.servico.findFirst({ select: { empresaId: true } })
  const empresaId = ref?.empresaId ?? null

  for (const def of SERVICOS) {
    // Pula se já existe com mesmo nome
    const existing = await prisma.servico.findFirst({ where: { nome: def.nome }, select: { id: true } })
    if (existing) {
      console.log(`⚠️  Já existe: ${def.nome} (${existing.id}) — pulando`)
      continue
    }
    const { id, slaTotalMin, totalPassos } = await criarServico(def, empresaId)
    console.log(`✓ ${def.nome.padEnd(48)} id=${id} · ${def.etapas.length} etapas · ${totalPassos} passos · SLA ${(slaTotalMin / 60).toFixed(1)}h`)
  }

  console.log('\n✅ Concluído')
}

main().catch(e => { console.error('❌', e); process.exit(1) }).finally(() => prisma.$disconnect())
