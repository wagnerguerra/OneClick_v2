/**
 * orcamento-notificacoes.enriched — parâmetros de cada notificação do MÓDULO DE
 * ORÇAMENTOS, fiéis ao `apps/api/src/orcamento/orcamento.service.ts` (todas
 * passam pelo `buildEmailLayout`). Os campos `heroAccent`/`heroTitle`/`subject`
 * abaixo são EXATAMENTE os que o serviço já usa hoje — mantê-los preserva a
 * identidade de cada status. O que muda no handoff é só a MOLDURA (shell
 * enriquecido: badge de ícone + rodapé com links), não o roteamento nem os
 * destinatários (comercial/financeiro/cliente/responsável), que ficam como estão.
 *
 * `icon` = nome lucide → PNG hospedado (iconUrl). `{{numero}}`, `{{cliente}}`,
 * `{{empresa}}`, `{{link}}`, `{{valor}}` etc. já existem no serviço.
 */

export interface OrcNotifCfg {
  id: string
  /** destinatário conceitual (já implementado no serviço) */
  para: 'interno' | 'cliente' | 'responsavel'
  subject: string
  heroAccent: string   // hex — passado direto ao buildEmailLayout
  icon: string
  heroTitle: string
  heroSubtitle?: string
  ctaLabel: string
  ctaUrl: string
  corpoHtml: string
}

export const ORC_NOTIFS: OrcNotifCfg[] = [
  {
    id: 'novo', para: 'interno',
    subject: 'Novo orçamento {{numero}} · {{cliente}}',
    heroAccent: '#fb7185', icon: 'file-plus',
    heroTitle: 'Novo orçamento',
    heroSubtitle: 'Criado por {{usuario}} · {{data}}.',
    ctaLabel: 'Abrir orçamento', ctaUrl: '{{link}}',
    // + detailCard([['Cliente','{{cliente}}'],['Número','{{numero}}'],['Solicitante','{{usuario}}'],['Valor estimado','{{valor}}',true]])
    corpoHtml: '<p>Um novo orçamento foi criado e aguarda detalhamento e envio ao cliente.</p>',
  },
  {
    id: 'proposta-cliente', para: 'cliente',
    subject: 'Proposta comercial {{numero}} · {{empresa}}',
    heroAccent: '#10b981', icon: 'file-text',
    heroTitle: 'Sua proposta comercial está pronta',
    heroSubtitle: 'Proposta {{numero}} · válida até {{validade}}.',
    ctaLabel: 'Ver e aprovar proposta', ctaUrl: '{{link}}',
    // + detailCard([['Número','{{numero}}'],['Validade','{{validade}}'],['Valor total','{{valor}}',true]]) + texto de apresentação configurado
    corpoHtml: '<p>Olá, <strong>{{cliente}}</strong>! Preparamos sua proposta comercial. Confira o resumo e aprove pelo botão abaixo.</p>',
  },
  {
    id: 'revisao-solicitada', para: 'interno',
    subject: '↻ Orçamento {{numero}} — revisão solicitada · {{cliente}}',
    heroAccent: '#f59e0b', icon: 'rotate-ccw',
    heroTitle: 'Revisão solicitada pelo cliente',
    heroSubtitle: 'O cliente pediu ajustes na proposta {{numero}}.',
    ctaLabel: 'Revisar orçamento', ctaUrl: '{{link}}',
    // + alertBox('"{{mensagemCliente}}"', 'warn')
    corpoHtml: '<p>O cliente <strong>{{cliente}}</strong> solicitou uma revisão da proposta antes de aprovar.</p><p>Ajuste os itens e reenvie a proposta atualizada.</p>',
  },
  {
    id: 'aprovado', para: 'interno',
    subject: '✓ Orçamento {{numero}} aprovado · {{cliente}}',
    heroAccent: '#10b981', icon: 'circle-check',
    heroTitle: 'Orçamento aprovado!',
    heroSubtitle: 'Boas notícias — o cliente aprovou a proposta.',
    ctaLabel: 'Abrir orçamento', ctaUrl: '{{link}}',
    // + detailCard([['Número','{{numero}}'],['Responsável','{{responsavel}}'],['Valor aprovado','{{valor}}',true]])
    corpoHtml: '<p>O orçamento foi <strong>aprovado</strong> por {{cliente}} em {{data}}.</p><p>Os serviços já podem ser criados a partir dos itens.</p>',
  },
  {
    id: 'recusado', para: 'interno',
    subject: 'Orçamento {{numero}} recusado · {{cliente}}',
    heroAccent: '#ef4444', icon: 'circle-x',
    heroTitle: 'Orçamento recusado',
    heroSubtitle: 'O cliente não seguiu com a proposta.',
    ctaLabel: 'Registrar follow-up', ctaUrl: '{{link}}',
    // + alertBox('Motivo informado: {{motivo}}', 'error')
    corpoHtml: '<p>O orçamento <strong>{{numero}}</strong> foi recusado por {{cliente}}.</p><p>Sugestão: registre um follow-up para retomar o contato mais adiante.</p>',
  },
  {
    id: 'liberado', para: 'responsavel',
    subject: '▶ Orçamento {{numero}} liberado para execução',
    heroAccent: '#059669', icon: 'circle-play',
    heroTitle: 'Liberado para execução',
    heroSubtitle: 'O orçamento entrou em execução.',
    ctaLabel: 'Ver serviços', ctaUrl: '{{link}}',
    // + detailCard([['Responsável','{{responsavel}}'],['Itens','{{qtdItens}} serviços'],['Início previsto','{{inicio}}']])
    corpoHtml: '<p>O orçamento <strong>{{numero}}</strong> foi liberado para execução.</p>',
  },
  {
    id: 'finalizado', para: 'interno',
    subject: '✓ Orçamento {{numero}} finalizado · {{cliente}}',
    heroAccent: '#0f766e', icon: 'flag',
    heroTitle: 'Orçamento finalizado',
    heroSubtitle: 'Ciclo do orçamento concluído.',
    ctaLabel: 'Ver resumo', ctaUrl: '{{link}}',
    // + detailCard([['Cliente','{{cliente}}'],['Encerrado em','{{data}}'],['Valor','{{valor}}',true]])
    corpoHtml: '<p>O orçamento <strong>{{numero}}</strong> foi finalizado. A pesquisa de satisfação foi enviada ao cliente automaticamente.</p>',
  },
  {
    id: 'nova-mensagem', para: 'interno',
    subject: 'Nova mensagem em {{numero}} — {{cliente}}',
    heroAccent: '#10b981', icon: 'message-square',
    heroTitle: 'Nova mensagem',
    heroSubtitle: 'Você foi mencionado no orçamento {{numero}}.',
    ctaLabel: 'Responder no orçamento', ctaUrl: '{{link}}',
    // + blockquote('{{mensagem}}') (borda-esquerda accent, fundo #f8fafc)
    corpoHtml: '<p><strong>{{usuario}}</strong> escreveu no orçamento <strong>{{numero}}</strong>:</p>',
  },
  {
    id: 'resposta-cliente', para: 'interno',
    subject: '↩ Resposta do cliente — Orçamento {{numero}}',
    heroAccent: '#0ea5e9', icon: 'reply',
    heroTitle: 'Resposta do cliente',
    heroSubtitle: 'O cliente respondeu por e-mail — Orçamento {{numero}}.',
    ctaLabel: 'Abrir conversa', ctaUrl: '{{link}}',
    // + blockquote('{{mensagem}}')
    corpoHtml: '<p><strong>{{cliente}}</strong> respondeu sobre a proposta:</p>',
  },
]

/* Avisos de ÁREA (passos 1 e 2 da FAQ) — hoje são e-mails simples (sem shell).
   Para padronizá-los, use o mesmo renderEmailShell com:
   - "Detalhe a área": heroAccent '#fb7185', icon 'layers', heroTitle
     'Detalhe sua área no orçamento {{numero}}', CTA 'Detalhar minha parte'.
   - "Área em atraso":  heroAccent '#f59e0b', icon 'clock-alert', heroTitle
     'Área {{area}} em atraso', CTA 'Abrir orçamento'. */
