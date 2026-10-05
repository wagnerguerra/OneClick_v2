'use client'

import { ManifestacaoConfiguracoes } from '../../_manifestacoes/manifestacao-configuracoes'
import { CONFIG } from '../config'

/** Configurações de Reclamações — quem recebe as notificações de cada evento. */
export default function ConfiguracoesReclamacoesPage() {
  return <ManifestacaoConfiguracoes config={CONFIG} />
}
