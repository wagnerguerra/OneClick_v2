'use client'

import type { ReactNode } from 'react'
import { HelpCircle } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger, cn } from '@saas/ui'

/**
 * O "(?)" dos indicadores do Painel Comercial: explica de onde vem o número e
 * o que entra nele. Radix (portal), para não ser cortado dentro de cartões e
 * tabelas com overflow.
 */
export function Ajuda({ texto, className }: { texto: ReactNode; className?: string }) {
  return (
    <TooltipProvider delayDuration={120}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label="Como este número é calculado"
            onClick={(e) => e.stopPropagation()}
            className={cn('inline-flex shrink-0 items-center text-muted-foreground/60 hover:text-foreground transition-colors', className)}
          >
            <HelpCircle className="h-3.5 w-3.5" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-[340px] whitespace-normal text-left text-[11.5px] font-normal normal-case tracking-normal leading-relaxed">
          {texto}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

/**
 * Textos do "(?)". Um lugar só, para a mesma explicação servir ao cartão e à
 * coluna da tabela. Mudou a regra no backend (indicadores-comerciais.ts,
 * contratos-de-orcamento.ts, carteira-gestao.ts)? Mude aqui também.
 */
export const AJUDA = {
  // ── Funil comercial ──
  leadsRecebidos: 'Cards criados no CRM dentro do período, de qualquer origem (cadastro manual, importação ou captação). Conta também os que já foram arquivados. Na tabela por pessoa, o card conta para o responsável atual dele.',
  qualifLigacao: 'Leads cujo ÚLTIMO resultado registrado na aba Interações, dentro do período, foi "Qualificado" numa interação do tipo Ligação. Cada lead conta uma vez: se ficou "Sem resposta" na segunda e foi qualificado na quarta, conta só como qualificado. Conta para quem registrou a interação.',
  qualifWhatsapp: 'Mesma regra da ligação, para interações do tipo WhatsApp. Leads qualificados por e-mail, reunião, visita ou outro canal aparecem abaixo do número como "outros canais".',
  semResposta: 'Leads cujo ÚLTIMO resultado registrado nas Interações, dentro do período, foi "Sem resposta". Se o lead depois for qualificado ou desqualificado no mesmo período, sai daqui. Conta para quem registrou a interação.',
  desqualificados: 'Leads cujo ÚLTIMO resultado registrado nas Interações, dentro do período, foi "Desqualificado". Mover o card para Declínio NÃO conta aqui — vale o resultado da interação. Conta para quem registrou.',
  reunioesAgendadas: 'Eventos da Agenda vinculados a um card do CRM e CRIADOS no período — só os tipos de reunião ou visita (Reunião Interna, Reunião Externa, Visita ao Cliente). Lembretes, tarefas e compromissos não contam. Conta para quem criou o evento.',
  reunioesRealizadas: 'Os mesmos eventos de reunião/visita vinculados a um card, cuja DATA caiu no período e cujo horário já passou. Evento de hoje sem horário ainda não conta. Conta para o responsável do card (quem conduz o fechamento).',
  propostasEnviadas: 'Orçamentos ENVIADOS no período (pela data de envio) de cliente novo: vindos de um card do CRM ou com serviço de entrada de novo cliente. Orçamento de serviço extra para cliente da casa fica de fora; cancelados não contam. Conta para o responsável do orçamento.',
  contratosAssinados: 'Orçamentos que viraram contrato no período: os marcados como "contrato fechado" na lista (vale a data informada) e, sem a marca, os APROVADOS de cliente novo — vindos de um card do CRM ou com serviço de entrada de novo cliente (pela data de aprovação). Cancelados não contam. Conta para o responsável do orçamento.',

  // ── Pipeline & Orçamentos ──
  oportunidadesAtivas: 'Cards CRIADOS no período que continuam no funil: ativos (não arquivados), fora da etapa Declínio e de etapas de ganho ou perda. Difere de "Leads recebidos" por tirar os que já saíram do funil ou foram ganhos.',
  valorPipeline: 'Soma do campo "Valor" desses cards (criados no período e ainda no funil). Só aparece quando o valor é preenchido no card do CRM — hoje a maioria está sem valor.',
  taxaConversao: 'Dos cards CRIADOS no período, a parte que já foi ganha: o orçamento do card virou contrato (aprovado ou marcado como contrato fechado) ou o card está numa etapa de ganho. Um card criado no período e fechado depois continua contando para o período em que foi criado.',
  emAberto: 'Orçamentos CRIADOS no período que ainda estão em Novo, A enviar ou Enviado (não arquivados).',
  valorPendente: 'Soma do total dos orçamentos criados no período e ainda em aberto (Novo, A enviar, Enviado). Visível só para gestor, coordenador, diretor e administradores.',
  taxaAprovacao: 'Orçamentos APROVADOS no período ÷ orçamentos ENVIADOS no período (pelas datas de aprovação e de envio; cancelados e arquivados ficam de fora). São grupos diferentes: um aprovado agora pode ter sido enviado no mês anterior.',
  atrasados: 'Dos orçamentos criados no período, os parados além do prazo configurado em Orçamentos → Configurações: em Novo/A enviar sem envio há mais dias que o prazo de envio, ou Enviados sem aprovação há mais dias que o prazo de aprovação (contados até hoje).',
  mixReceita: 'Orçamentos aprovados no período (cancelados e arquivados fora), separados pela natureza do serviço: recorrente (serviço marcado como mensal — entra como honorário) ou avulso (cobrança pontual).',
  funilCrm: 'Cards CRIADOS no período, agrupados pela etapa em que estão hoje. Inclui os arquivados (na etapa em que pararam).',
  orcPorStatus: 'Orçamentos CRIADOS no período (não arquivados), pela situação em que estão hoje.',
  desempenho: 'Cards criados no período por responsável: total, ganhos (card com contrato ou em etapa de ganho) e perdidos (etapa de perda, Declínio ou arquivado). O que não é ganho nem perdido segue em andamento.',

  // ── Contratos (carteira da Gestão de Contratos) ──
  clientesCarteira: 'Clientes com honorário mensal na Gestão de Contratos (/comercial/gestao-contratos) na DATA FINAL do período: já tinham entrado (data de entrada) e ainda não tinham saído (data de saída). Fora os "ignorados" da Gestão de Contratos.',
  mrr: 'Soma dos honorários mensais da carteira na data final do período. Atenção: o honorário usado é o valor cadastrado HOJE — a Gestão de Contratos não guarda o histórico de valores. Cliente sem honorário preenchido lá não entra.',
  aVencer: 'Contratos da carteira com data de fim DENTRO do período. Contratos permanentes ou sem data de fim informada não entram.',
  carteiraVigencia: 'Clientes da carteira (na data final do período) pela vigência do contrato na Gestão de Contratos: vigente (permanente ou com fim depois da data final), vencido (fim antes dela) ou sem vigência informada.',
  entradasSaidas: 'Clientes que entraram no escritório (data de entrada) e que saíram (data de saída) em cada mês do período, pelo cadastro do cliente. Períodos longos mostram os 24 meses mais recentes.',
  tabelaAVencer: 'Contratos da carteira com data de fim dentro do período, do mais próximo ao mais distante (até 20). Dias negativos = já venceu.',

  // ── Relatórios ──
  funilUnificado: {
    'Leads (captação)': 'Conversas iniciadas no funil de captação por IA (chat do site) no período. Não são os cards do CRM — por isso a conversão para Oportunidades pode passar de 100%.',
    'Oportunidades': 'Cards do CRM criados no período, de qualquer origem.',
    'Orçamentos enviados': 'Todos os orçamentos enviados no período (clientes novos e da casa), exceto cancelados e arquivados.',
    'Orçamentos aprovados': 'Todos os orçamentos aprovados no período, exceto cancelados e arquivados.',
    'Contratos efetivados': 'Orçamentos que viraram contrato no período — a mesma regra de "Contratos assinados" do Funil comercial.',
  } as Record<string, string>,
  mrrAtual: 'Soma dos honorários mensais da carteira na Gestão de Contratos, na data final do período (honorário cadastrado hoje — não há histórico de valores).',
  receitaAnualizada: 'MRR atual × 12.',
  contratosRecorrentes: 'Clientes com honorário mensal na Gestão de Contratos na data final do período.',
  ticketMedioMrr: 'MRR atual ÷ número de clientes da carteira.',
  serie12m: 'Valor aprovado por mês (data de aprovação) em cada mês do período, separado em recorrente e avulso pela natureza do serviço. Cancelados e arquivados fora. Períodos longos mostram os 24 meses mais recentes.',
  rankEnviados: 'Orçamentos enviados no período (data de envio), de todos os tipos. Cancelados e arquivados fora.',
  rankAprovados: 'Orçamentos aprovados no período (data de aprovação). A taxa é aprovados ÷ enviados no período.',
  rankValor: 'Soma do total dos orçamentos aprovados no período.',
  rankContratos: 'Orçamentos que viraram contrato no período (mesma regra de "Contratos assinados"), por responsável do orçamento.',
  descBruto: 'Serviços + taxas + despesas dos orçamentos aprovados no período, antes do desconto.',
  descConcedido: 'Desconto total dado nesses orçamentos: desconto por item + desconto geral.',
  descMedio: 'Desconto concedido ÷ valor bruto dos orçamentos aprovados no período.',
  descComDesconto: 'Parte dos orçamentos aprovados no período que teve algum desconto.',
} as const
