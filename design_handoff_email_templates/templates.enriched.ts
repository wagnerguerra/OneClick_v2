/**
 * templates.enriched — parâmetros dos 9 e-mails transacionais gerais (auth,
 * billing, agenda, helpdesk, newsletter). Alimentam `renderEmailShell`
 * (email-shell.enriched.ts). Espelha/estende o `EmailTemplate` de
 * apps/web/src/app/(dashboard)/admin/email-templates/_lib/templates.ts.
 *
 * `corpoHtml` é EMAIL-SAFE (prosa em <p>). Blocos dinâmicos (código, card de
 * detalhe, alerta) são montados no envio com os helpers do shell
 * (codeBox / detailCard / alertBox) e concatenados ao corpoHtml.
 *
 * `icon` = nome do ícone lucide → exporte 1 PNG (~26px, na cor de destaque) e
 * hospede; a URL vai em `iconUrl` no envio.
 */
import type { EmailAccent } from './email-shell.enriched'

export interface EmailTemplateCfg {
  id: string
  nome: string
  assunto: string
  preheader: string
  accent: EmailAccent
  icon: string
  heroTitle: string
  heroSubtitle?: string
  ctaLabel?: string
  ctaUrl?: string
  corpoHtml: string
  footerLinks?: Array<{ label: string; url: string }>
  footerExtra?: string
}

const LINKS_APP = [
  { label: 'Acessar painel', url: '{{appUrl}}' },
  { label: 'Central de ajuda', url: '{{appUrl}}/faq' },
  { label: 'Suporte', url: '{{appUrl}}/suporte' },
]

export const TEMPLATES: EmailTemplateCfg[] = [
  {
    id: 'boas-vindas', nome: 'Boas-vindas / confirmação de cadastro',
    assunto: 'Sua conta na {{empresa}} está pronta',
    preheader: 'Bem-vindo ao OneClick — confirme seu acesso.',
    accent: 'green', icon: 'user-round-check',
    heroTitle: 'Bem-vindo ao OneClick',
    heroSubtitle: 'Sua conta foi criada com sucesso, {{usuario}}.',
    ctaLabel: 'Acessar o painel', ctaUrl: '{{link}}',
    corpoHtml:
      '<p>Olá, <strong>{{usuario}}</strong>! Sua conta em <strong>{{empresa}}</strong> está pronta. ' +
      'O OneClick reúne Cadastros, Corporativo, Fiscal e Qualidade em um só lugar.</p>' +
      '<p>Para começar, confirme seu acesso pelo botão abaixo.</p>',
    footerLinks: LINKS_APP,
    footerExtra: '{{empresa}} · Vitória/ES · {{empresaTelefone}} · {{empresaEmail}}',
  },
  {
    id: 'verificacao-codigo', nome: 'Verificação de e-mail / código',
    assunto: 'Seu código de confirmação: {{codigo}}',
    preheader: 'Use o código para ativar sua conta.',
    accent: 'green', icon: 'mail-check',
    heroTitle: 'Confirme seu e-mail',
    heroSubtitle: 'Falta só um passo para ativar sua conta.',
    ctaLabel: 'Confirmar e-mail', ctaUrl: '{{link}}',
    // No envio: corpoHtml + codeBox('{{codigo}}') + prosa de expiração.
    corpoHtml:
      '<p>Olá, <strong>{{usuario}}</strong>! Use o código abaixo para confirmar seu endereço de e-mail:</p>',
    footerLinks: LINKS_APP,
  },
  {
    id: 'recuperacao-senha', nome: 'Redefinição de senha',
    assunto: 'Redefinição de senha — {{empresa}}',
    preheader: 'Link para criar uma nova senha de acesso.',
    accent: 'orange', icon: 'key-round',
    heroTitle: 'Redefinição de senha',
    heroSubtitle: 'Recebemos uma solicitação para sua conta.',
    ctaLabel: 'Criar nova senha', ctaUrl: '{{link}}',
    // No envio: corpoHtml + alertBox('Por segurança, o link expira em 1 hora.', 'warn').
    corpoHtml:
      '<p>Olá, <strong>{{usuario}}</strong>!</p>' +
      '<p>Recebemos uma solicitação para redefinir a senha da sua conta em <strong>{{empresa}}</strong>. ' +
      'Clique no botão abaixo para criar uma nova senha.</p>' +
      '<p>Se você não fez essa solicitação, ignore este e-mail — sua senha continua a mesma.</p>',
    footerLinks: LINKS_APP,
  },
  {
    id: 'orcamento-proposta', nome: 'Orçamento enviado ao cliente (proposta)',
    assunto: 'Orçamento {{numero}} — {{empresa}}',
    preheader: 'Segue o orçamento solicitado para sua avaliação.',
    accent: 'green', icon: 'file-text',
    heroTitle: 'Seu orçamento está pronto',
    heroSubtitle: 'Preparamos uma proposta sob medida para {{cliente}}.',
    ctaLabel: 'Visualizar orçamento', ctaUrl: '{{link}}',
    // No envio: corpoHtml + detailCard([['Número','{{numero}}'],['Emitido em','{{data}}'],['Valor total','{{valor}}',true]]).
    corpoHtml:
      '<p>Olá, <strong>{{cliente}}</strong>! Conforme conversamos, segue o orçamento <strong>{{numero}}</strong> ' +
      'emitido em {{data}}. Você pode visualizar todos os detalhes e valores no botão abaixo.</p>',
    footerLinks: [{ label: 'Ver proposta', url: '{{link}}' }, { label: 'Falar com consultor', url: '{{appUrl}}/suporte' }],
    footerExtra: '{{empresa}} · Vitória/ES · {{empresaTelefone}} · {{empresaEmail}}',
  },
  {
    id: 'helpdesk-csat', nome: 'Helpdesk — chamado resolvido (CSAT)',
    assunto: 'Seu chamado {{numero}} foi resolvido',
    preheader: 'Conte pra gente como foi seu atendimento.',
    accent: 'cyan', icon: 'message-square-heart',
    heroTitle: 'Chamado resolvido',
    heroSubtitle: 'Como avalia o atendimento, {{cliente}}?',
    ctaLabel: 'Avaliar atendimento', ctaUrl: '{{link}}',
    // No envio: corpoHtml + bloco de estrelas (5 imgs PNG clicáveis com deep-link da nota).
    corpoHtml:
      '<p>Olá, <strong>{{cliente}}</strong>! O chamado <strong>{{numero}}</strong> foi marcado como resolvido ' +
      'por {{usuario}} em {{data}}. Sua opinião leva menos de 1 minuto.</p>' +
      '<p>Se o problema persistir, basta responder reabrindo o ticket.</p>',
    footerLinks: [{ label: 'Ver chamado', url: '{{link}}' }, { label: 'Central de ajuda', url: '{{appUrl}}/faq' }],
  },
  {
    id: 'agenda-lembrete', nome: 'Agenda — lembrete de compromisso',
    assunto: 'Lembrete: compromisso em {{data}}',
    preheader: 'Você tem um compromisso agendado em breve.',
    accent: 'indigo', icon: 'calendar-clock',
    heroTitle: 'Lembrete de compromisso',
    heroSubtitle: 'Não esqueça do seu evento, {{usuario}}.',
    ctaLabel: 'Ver na agenda', ctaUrl: '{{link}}',
    // No envio: corpoHtml + detailCard([['Data e hora','...'],['Com','{{cliente}}'],['Assunto','...']]).
    corpoHtml:
      '<p>Olá, <strong>{{usuario}}</strong>! Este é um lembrete do compromisso agendado na sua agenda.</p>',
    footerLinks: [{ label: 'Abrir agenda', url: '{{appUrl}}/agenda' }, { label: 'Reagendar', url: '{{link}}' }],
  },
  {
    id: 'fatura', nome: 'Cobrança / fatura da assinatura',
    assunto: 'Fatura do plano {{plano}} disponível',
    preheader: 'Sua assinatura OneClick foi renovada.',
    accent: 'green', icon: 'credit-card',
    heroTitle: 'Fatura disponível',
    heroSubtitle: 'Sua assinatura OneClick foi renovada.',
    ctaLabel: 'Ver fatura', ctaUrl: '{{link}}',
    // No envio: corpoHtml + detailCard([['Plano','{{plano}}'],['Período','...'],['Pago em','{{data}}'],['Valor','{{valor}}',true]]).
    corpoHtml:
      '<p>Olá, <strong>{{usuario}}</strong>! A fatura da sua assinatura já está disponível. Confira o resumo:</p>' +
      '<p>O pagamento é renovado automaticamente. Gerencie a assinatura no painel.</p>',
    footerLinks: [{ label: 'Baixar comprovante', url: '{{link}}' }, { label: 'Gerenciar assinatura', url: '{{appUrl}}/assinatura' }],
    footerExtra: '{{empresa}} · Vitória/ES · CNPJ {{empresaCnpj}}',
  },
  {
    id: 'pagamento-recusado', nome: 'Pagamento recusado (falha)',
    assunto: 'Não conseguimos processar seu pagamento',
    preheader: 'Sua assinatura precisa de atenção.',
    accent: 'rose', icon: 'triangle-alert',
    heroTitle: 'Não conseguimos processar seu pagamento',
    heroSubtitle: 'Sua assinatura precisa de atenção.',
    ctaLabel: 'Atualizar pagamento', ctaUrl: '{{link}}',
    // No envio: corpoHtml + alertBox('Cartão recusado ... Fatura de {{valor}} ...', 'error').
    corpoHtml:
      '<p>Olá, <strong>{{usuario}}</strong>! A cobrança da sua assinatura <strong>{{plano}}</strong> não pôde ser concluída.</p>' +
      '<p>Atualize seu método de pagamento em até <strong>7 dias</strong> para manter o acesso sem interrupção.</p>',
    footerLinks: [{ label: 'Atualizar cartão', url: '{{link}}' }, { label: 'Falar com suporte', url: '{{appUrl}}/suporte' }],
  },
  {
    id: 'newsletter', nome: 'Newsletter / novidades do produto',
    assunto: 'Novidades do OneClick — {{mes}}',
    preheader: 'As melhorias deste mês para o seu escritório.',
    accent: 'green', icon: 'megaphone',
    heroTitle: 'Novidades do OneClick — {{mes}}',
    heroSubtitle: 'As melhorias deste mês para o seu escritório.',
    ctaLabel: 'Explorar novidades', ctaUrl: '{{link}}',
    // No envio: corpoHtml + lista de updates (cada um: ícone + título + texto + "Saiba mais").
    corpoHtml:
      '<p>Olá, <strong>{{usuario}}</strong>! Trabalhamos para deixar a gestão do seu escritório ainda mais descomplicada. Veja o que chegou:</p>',
    // Newsletter é marketing: descadastro obrigatório + LGPD.
    footerLinks: [{ label: 'Ver todas as novidades', url: '{{link}}' }, { label: 'Cancelar inscrição', url: '{{unsubscribeUrl}}' }],
    footerExtra: 'Tratamos seus dados conforme a LGPD (Lei nº 13.709/2018).',
  },
]
