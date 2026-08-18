/** Os cinco campos clássicos do controle de registros da ISO — mesma ordem do v1. */
export const CAMPOS_CONTROLE = [
  { key: 'armazenamento', label: 'Armazenamento', hint: 'Onde e como o registro é guardado' },
  { key: 'protecao', label: 'Proteção', hint: 'Como se evita perda, dano ou acesso indevido' },
  { key: 'recuperacao', label: 'Recuperação', hint: 'Como localizar e acessar o registro' },
  { key: 'retencao', label: 'Retenção', hint: 'Por quanto tempo o registro é mantido' },
  { key: 'disposicao', label: 'Disposição', hint: 'O que se faz ao fim da retenção (descarte)' },
] as const

export type CampoControle = (typeof CAMPOS_CONTROLE)[number]['key']
