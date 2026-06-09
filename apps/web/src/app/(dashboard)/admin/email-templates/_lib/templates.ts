/**
 * Modelos de e-mail (sandbox) — tipos, seeds e variáveis.
 *
 * Sem backend: os modelos vivem no estado da página + localStorage. Os seeds
 * abaixo são pontos de partida reais do sistema (orçamento, helpdesk, agenda,
 * recuperação de senha), para compor/aprovar antes de replicar no código.
 */

export interface EmailTemplate {
  id: string
  nome: string
  assunto: string
  preheader: string
  /** cor de destaque (hex) — mapeia para heroAccent do shell */
  accent: string
  heroTitle: string
  heroSubtitle: string
  ctaLabel?: string
  ctaUrl?: string
  corpoHtml: string
}

/** Variável dinâmica inserível no corpo/assunto (placeholder `{{chave}}`). */
export interface EmailVariable {
  chave: string
  label: string
  /** valor de exemplo usado APENAS no preview */
  exemplo: string
}

export const EMAIL_VARIABLES: EmailVariable[] = [
  { chave: 'cliente', label: 'Cliente', exemplo: 'Comercial Atlântico Ltda' },
  { chave: 'numero', label: 'Número', exemplo: 'ORC-2026-0142' },
  { chave: 'empresa', label: 'Empresa', exemplo: 'Central Contábil' },
  { chave: 'data', label: 'Data', exemplo: '09/06/2026' },
  { chave: 'link', label: 'Link', exemplo: 'https://app.oneclick.com.br/orcamentos/0142' },
  { chave: 'usuario', label: 'Usuário', exemplo: 'Wagner Guerra' },
  { chave: 'valor', label: 'Valor', exemplo: 'R$ 2.480,00' },
]

export const STORAGE_KEY = 'oneclick:email-templates:v1'

/** Substitui `{{var}}` pelos exemplos — usado SÓ no preview. */
export function aplicarExemplos(texto: string): string {
  return texto.replace(/\{\{\s*(\w+)\s*\}\}/g, (match, chave: string) => {
    const v = EMAIL_VARIABLES.find((x) => x.chave === chave)
    return v ? v.exemplo : match
  })
}

export const SEED_TEMPLATES: EmailTemplate[] = [
  {
    id: 'orcamento-enviado',
    nome: 'Orçamento enviado ao cliente',
    assunto: 'Orçamento {{numero}} — {{empresa}}',
    preheader: 'Segue o orçamento solicitado para sua avaliação.',
    accent: '#10b981',
    heroTitle: 'Seu orçamento está pronto',
    heroSubtitle: 'Preparamos uma proposta sob medida para {{cliente}}.',
    ctaLabel: 'Visualizar orçamento',
    ctaUrl: '{{link}}',
    corpoHtml:
      '<p>Olá, <strong>{{cliente}}</strong>!</p>' +
      '<p>Conforme conversamos, segue o orçamento <strong>{{numero}}</strong> emitido em {{data}}. ' +
      'Você pode visualizar todos os detalhes, itens e valores clicando no botão abaixo.</p>' +
      '<p>Qualquer dúvida, estamos à disposição.</p>',
  },
  {
    id: 'orcamento-aprovado',
    nome: 'Orçamento aprovado',
    assunto: 'Orçamento {{numero}} aprovado — vamos começar!',
    preheader: 'Recebemos sua aprovação. Próximos passos a seguir.',
    accent: '#10b981',
    heroTitle: 'Orçamento aprovado',
    heroSubtitle: 'Obrigado pela confiança, {{cliente}}.',
    ctaLabel: 'Acompanhar processo',
    ctaUrl: '{{link}}',
    corpoHtml:
      '<p>Olá, <strong>{{cliente}}</strong>!</p>' +
      '<p>Confirmamos a aprovação do orçamento <strong>{{numero}}</strong> no valor de {{valor}}. ' +
      'Nossa equipe já iniciou os trâmites e você poderá acompanhar cada etapa pelo painel.</p>' +
      '<p>Em breve entraremos em contato com os próximos passos.</p>',
  },
  {
    id: 'helpdesk-csat',
    nome: 'Helpdesk — ticket resolvido (CSAT)',
    assunto: 'Seu chamado {{numero}} foi resolvido',
    preheader: 'Conte pra gente como foi seu atendimento.',
    accent: '#22d3ee',
    heroTitle: 'Chamado resolvido',
    heroSubtitle: 'Como avalia o atendimento, {{cliente}}?',
    ctaLabel: 'Avaliar atendimento',
    ctaUrl: '{{link}}',
    corpoHtml:
      '<p>Olá, <strong>{{cliente}}</strong>!</p>' +
      '<p>O chamado <strong>{{numero}}</strong> foi marcado como resolvido por {{usuario}} em {{data}}. ' +
      'Sua opinião é muito importante: leva menos de 1 minuto para avaliar.</p>' +
      '<p>Se o problema persistir, basta responder reabrindo o ticket.</p>',
  },
  {
    id: 'agenda-lembrete',
    nome: 'Agenda — lembrete de evento',
    assunto: 'Lembrete: compromisso em {{data}}',
    preheader: 'Você tem um compromisso agendado em breve.',
    accent: '#818cf8',
    heroTitle: 'Lembrete de compromisso',
    heroSubtitle: 'Não esqueça do seu evento, {{usuario}}.',
    ctaLabel: 'Ver na agenda',
    ctaUrl: '{{link}}',
    corpoHtml:
      '<p>Olá, <strong>{{usuario}}</strong>!</p>' +
      '<p>Este é um lembrete do compromisso agendado para <strong>{{data}}</strong> com {{cliente}}. ' +
      'Clique no botão abaixo para ver os detalhes na sua agenda.</p>',
  },
  {
    id: 'recuperacao-senha',
    nome: 'Recuperação de senha',
    assunto: 'Redefinição de senha — {{empresa}}',
    preheader: 'Link para criar uma nova senha de acesso.',
    accent: '#fb923c',
    heroTitle: 'Redefinição de senha',
    heroSubtitle: 'Recebemos uma solicitação para sua conta.',
    ctaLabel: 'Criar nova senha',
    ctaUrl: '{{link}}',
    corpoHtml:
      '<p>Olá, <strong>{{usuario}}</strong>!</p>' +
      '<p>Recebemos uma solicitação para redefinir a senha da sua conta em {{empresa}}. ' +
      'Clique no botão abaixo para criar uma nova senha. O link expira em 1 hora.</p>' +
      '<p>Se você não fez essa solicitação, ignore este e-mail com segurança.</p>',
  },
]
