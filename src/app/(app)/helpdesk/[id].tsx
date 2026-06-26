// Tela de DETALHE de um chamado do HelpDesk (rota /helpdesk/[id]).
//
// Espelha o detalhe do sistema web: cabeçalho com #numero + status, dados do
// ticket (título, prioridade/tipo/categoria, descrição inicial), troca rápida
// de status por chips, a conversa em bolhas (próprias à direita) e o campo de
// resposta no rodapé. Mensagens internas NÃO são exibidas (visão do solicitante).
//
// Dados via tRPC:
//   - helpdesk.getById({ id })            → ticket + relacionamentos
//   - helpdesk.listMensagens({ ticketId }) → thread da conversa
//   - helpdesk.update({ id, data:{status} }) → troca de status
//   - helpdesk.addMensagem({ ticketId, conteudo }) → responder

import { useState } from 'react'
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { Image } from 'expo-image'
import * as WebBrowser from 'expo-web-browser'

import {
  HELPDESK_STATUS,
  HELPDESK_STATUS_LABELS,
  HELPDESK_PRIORIDADE_LABELS,
  HELPDESK_TIPO_LABELS,
  type HelpdeskStatus,
  type HelpdeskPrioridade,
  type HelpdeskTipo,
} from '@saas/types'

import { trpc } from '@/lib/trpc'
import { useSession } from '@/lib/auth-client'
import { cn } from '@/lib/cn'
import { resolveAssetUrl } from '@/lib/api-url'
import { ImageViewerModal } from '@/components/image-viewer-modal'
import { HELPDESK_STATUS_CLASSES } from '@/features/helpdesk/status-colors'

import { Text } from '@/components/ui/text'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Spinner } from '@/components/ui/spinner'

// ── Helpers ─────────────────────────────────────────────────────────

/**
 * Converte o HTML do TipTap (descrição/conteúdo no web) em texto puro para
 * exibir no app. Remove tags, normaliza quebras de bloco e decodifica as
 * entidades HTML mais comuns. Não é um parser completo — só o suficiente pra
 * leitura no mobile.
 */
function htmlParaTexto(html: string | null | undefined): string {
  if (!html) return ''
  return html
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<\/\s*(p|div|li|h[1-6])\s*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/** Hora curta (HH:MM) a partir de uma string ISO (sem transformer no client). */
function formatHora(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

/**
 * Extrai a rota de origem que o balão "Fale com a TI" embute na descrição
 * (`📍 Página: <code>/rota</code>`). Retorna a rota ou null.
 */
function extrairOrigem(html: string | null | undefined): string | null {
  if (!html) return null
  const m = html.match(/📍\s*P[áa]gina:\s*<code>(.*?)<\/code>/i)
  const rota = m?.[1]?.trim()
  return rota && rota.length > 0 ? rota : null
}

/** Remove o bloco "📍 Página" da descrição — já exibido em "Origem", evita duplicar. */
function removerBlocoOrigem(html: string | null | undefined): string {
  if (!html) return ''
  return html.replace(/<hr\s*\/?>(?:\s|&nbsp;)*<p>\s*<small>\s*📍[\s\S]*?<\/small>\s*<\/p>/i, '')
}

export default function HelpdeskTicketDetalheScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const router = useRouter()
  const utils = trpc.useUtils()

  // ID do usuário logado — usado pra alinhar as mensagens próprias à direita.
  const { data: session } = useSession()
  const meuId = session?.user.id

  // Texto do campo de resposta.
  const [resposta, setResposta] = useState('')
  // URL da imagem aberta no visualizador in-app (null = fechado).
  const [imagemUri, setImagemUri] = useState<string | null>(null)

  // Detalhe do ticket + thread da conversa.
  const ticketQuery = trpc.helpdesk.getById.useQuery({ id })
  const mensagensQuery = trpc.helpdesk.listMensagens.useQuery({ ticketId: id })

  // Troca de status — invalida o detalhe pra refletir o novo status.
  const updateStatus = trpc.helpdesk.update.useMutation({
    onSuccess: () => {
      void utils.helpdesk.getById.invalidate({ id })
    },
  })

  // Enviar mensagem — limpa o campo e revalida a conversa.
  const addMensagem = trpc.helpdesk.addMensagem.useMutation({
    onSuccess: () => {
      setResposta('')
      void utils.helpdesk.listMensagens.invalidate({ ticketId: id })
    },
  })

  // Carregando o ticket.
  if (ticketQuery.isPending) {
    return (
      <SafeAreaView className="flex-1 bg-background">
        <View className="flex-1 items-center justify-center p-6">
          <Spinner size="large" />
        </View>
      </SafeAreaView>
    )
  }

  // Erro ou ticket inexistente.
  if (ticketQuery.isError || !ticketQuery.data) {
    return (
      <SafeAreaView className="flex-1 bg-background">
        <View className="flex-1 items-center justify-center gap-4 p-6">
          <Text className="text-base text-muted-foreground">Chamado não encontrado</Text>
          <Button variant="outline" size="sm" onPress={() => router.back()}>
            ‹ Voltar
          </Button>
        </View>
      </SafeAreaView>
    )
  }

  const ticket = ticketQuery.data
  const ticketNum = `#HLP${String(ticket.numero).padStart(4, '0')}`
  const statusAtual = ticket.status as HelpdeskStatus
  const statusClasses = HELPDESK_STATUS_CLASSES[statusAtual]

  // Só mensagens públicas (visão do solicitante — internas ficam ocultas).
  const mensagens = (mensagensQuery.data ?? []).filter((m) => !m.interna)

  const respostaLimpa = resposta.trim()
  function enviar() {
    if (respostaLimpa.length === 0 || addMensagem.isPending) return
    addMensagem.mutate({ ticketId: id, conteudo: respostaLimpa })
  }

  // Abre um anexo no navegador (resolve a URL relativa/dev antes).
  async function abrirAnexo(fileUrl: string) {
    const url = resolveAssetUrl(fileUrl)
    if (!url) return
    try {
      await WebBrowser.openBrowserAsync(url)
    } catch {
      // silencioso — sem navegador disponível
    }
  }

  // Descrição sem o bloco "📍 Página" (exibido à parte em "Origem").
  const descricaoTexto = htmlParaTexto(removerBlocoOrigem(ticket.descricao))

  // Solicitante (interno ou externo) — quem abriu o chamado.
  const solicitante = ticket.solicitante as { name?: string | null; email?: string | null } | null
  const solicitanteNome = solicitante?.name ?? ticket.solicitanteExternoNome ?? null
  const solicitanteEmail = solicitante?.email ?? ticket.solicitanteExternoEmail ?? null

  // Origem: rota embutida pelo balão + flag da tag fab-feedback.
  const origemRota = extrairOrigem(ticket.descricao)
  const viaBalao = Array.isArray(ticket.tags) && ticket.tags.includes('fab-feedback')

  // Anexos do ticket (nível do chamado — mensagemId null). Shape raso evita TS2589.
  type AnexoView = { id: string; fileName: string; fileUrl: string; mimeType: string | null }
  const anexos = (ticket.anexos ?? []) as AnexoView[]

  // Linha de metadados (prioridade · tipo · categoria) — campos opcionais.
  const metaPartes: string[] = [
    HELPDESK_PRIORIDADE_LABELS[ticket.prioridade as HelpdeskPrioridade] ?? ticket.prioridade,
    HELPDESK_TIPO_LABELS[ticket.tipo as HelpdeskTipo] ?? ticket.tipo,
  ]
  if (ticket.categoria?.nome) metaPartes.push(ticket.categoria.nome)

  return (
    <SafeAreaView className="flex-1 bg-background">
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View className="w-full max-w-2xl mx-auto flex-1">
          {/* Topo: voltar + #numero + badge de status. */}
          <View className="flex-row items-center justify-between gap-2 px-4 pt-2 pb-3">
            <View className="flex-row items-center gap-1 flex-1">
              <Button variant="ghost" size="sm" className="px-0" onPress={() => router.back()}>
                ‹ Voltar
              </Button>
              <Text className="text-sm font-semibold text-muted-foreground">{ticketNum}</Text>
            </View>
            <Badge variant="outline" className={cn('border-0', statusClasses.bg)}>
              <Text className={cn('text-xs font-semibold', statusClasses.text)}>
                {HELPDESK_STATUS_LABELS[statusAtual]}
              </Text>
            </Badge>
          </View>

          <ScrollView
            className="flex-1"
            contentContainerStyle={{ padding: 16, paddingTop: 0, gap: 16 }}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {/* Cabeçalho do ticket. */}
            <View className="gap-1">
              <Text className="text-xl font-bold text-foreground">{ticket.titulo}</Text>
              <Text className="text-sm text-muted-foreground">{metaPartes.join(' · ')}</Text>
            </View>

            {/* Solicitante + origem (de qual módulo o chamado foi aberto). */}
            {solicitanteNome || origemRota ? (
              <Card>
                <CardContent className="p-4 gap-2.5">
                  {solicitanteNome ? (
                    <View className="flex-row items-start gap-3">
                      <Text className="w-20 text-xs text-muted-foreground">Solicitante</Text>
                      <View className="flex-1">
                        <Text className="text-sm font-medium text-foreground">{solicitanteNome}</Text>
                        {solicitanteEmail ? (
                          <Text className="text-xs text-muted-foreground">{solicitanteEmail}</Text>
                        ) : null}
                      </View>
                    </View>
                  ) : null}
                  {origemRota ? (
                    <View className="flex-row items-start gap-3">
                      <Text className="w-20 text-xs text-muted-foreground">Origem</Text>
                      <View className="flex-1">
                        <Text className="text-sm text-foreground">{origemRota}</Text>
                        {viaBalao ? (
                          <Text className="text-xs text-muted-foreground">
                            via balão “Fale com a TI”
                          </Text>
                        ) : null}
                      </View>
                    </View>
                  ) : null}
                </CardContent>
              </Card>
            ) : null}

            {/* Descrição inicial. */}
            {descricaoTexto.length > 0 ? (
              <Card>
                <CardContent className="p-4">
                  <Text className="text-sm text-foreground">{descricaoTexto}</Text>
                </CardContent>
              </Card>
            ) : null}

            {/* Anexos do chamado: imagens em miniatura, demais como arquivo. Toque abre no navegador. */}
            {anexos.length > 0 ? (
              <View className="gap-2">
                <Text className="text-[13px] font-semibold text-foreground">
                  Anexos ({anexos.length})
                </Text>
                <View className="flex-row flex-wrap gap-2">
                  {anexos.map((a) => {
                    const url = resolveAssetUrl(a.fileUrl)
                    const isImagem = (a.mimeType ?? '').startsWith('image/')
                    if (isImagem && url) {
                      return (
                        <Pressable
                          key={a.id}
                          accessibilityRole="imagebutton"
                          accessibilityLabel={a.fileName}
                          onPress={() => setImagemUri(url)}
                          className="active:opacity-70"
                        >
                          <Image
                            source={{ uri: url }}
                            style={{ width: 96, height: 96, borderRadius: 8 }}
                            contentFit="cover"
                            transition={150}
                          />
                        </Pressable>
                      )
                    }
                    return (
                      <Pressable
                        key={a.id}
                        accessibilityRole="button"
                        accessibilityLabel={a.fileName}
                        onPress={() => abrirAnexo(a.fileUrl)}
                        className="flex-row items-center gap-2 rounded-md border border-border bg-card px-3 py-2 active:opacity-70"
                      >
                        <Text className="text-base">📎</Text>
                        <Text className="max-w-[200px] text-sm text-foreground" numberOfLines={1}>
                          {a.fileName}
                        </Text>
                      </Pressable>
                    )
                  })}
                </View>
              </View>
            ) : null}

            {/* Troca de status — chips. Tocar atualiza e invalida o detalhe. */}
            <View className="gap-2">
              <Text className="text-[13px] font-semibold text-foreground">Status</Text>
              <View className="flex-row flex-wrap gap-2">
                {HELPDESK_STATUS.map((s) => {
                  const ativo = s === statusAtual
                  const c = HELPDESK_STATUS_CLASSES[s]
                  return (
                    <Pressable
                      key={s}
                      disabled={updateStatus.isPending || ativo}
                      onPress={() => updateStatus.mutate({ id, data: { status: s } })}
                      className={cn(
                        'rounded-full px-3 py-1.5 border active:opacity-70',
                        ativo
                          ? cn(c.bg, 'border-transparent')
                          : 'border-border bg-transparent',
                        updateStatus.isPending && !ativo && 'opacity-50',
                      )}
                    >
                      <Text
                        className={cn(
                          'text-xs font-semibold',
                          ativo ? c.text : 'text-muted-foreground',
                        )}
                      >
                        {HELPDESK_STATUS_LABELS[s]}
                      </Text>
                    </Pressable>
                  )
                })}
              </View>
            </View>

            {/* Conversa. */}
            <View className="gap-2">
              <Text className="text-[13px] font-semibold text-foreground">Conversa</Text>

              {mensagensQuery.isPending ? (
                <View className="items-center justify-center py-6">
                  <Spinner />
                </View>
              ) : mensagens.length === 0 ? (
                <Text className="py-4 text-center text-sm text-muted-foreground">
                  Nenhuma mensagem ainda
                </Text>
              ) : (
                <View className="gap-3">
                  {mensagens.map((msg) => {
                    const propria = msg.autorId === meuId
                    const conteudo = htmlParaTexto(msg.conteudo)
                    return (
                      <View
                        key={msg.id}
                        className={cn('max-w-[85%]', propria ? 'self-end items-end' : 'self-start items-start')}
                      >
                        {/* Autor + hora. */}
                        <Text className="mb-0.5 text-xs text-muted-foreground">
                          {`${propria ? 'Você' : msg.autor?.name ?? 'Usuário'} · ${formatHora(msg.createdAt)}`}
                        </Text>
                        {/* Bolha — própria em primary/10, demais em muted. */}
                        <View
                          className={cn(
                            'rounded-2xl px-3 py-2',
                            propria ? 'bg-primary/10' : 'bg-muted',
                          )}
                        >
                          <Text className="text-sm text-foreground">{conteudo}</Text>
                        </View>
                      </View>
                    )
                  })}
                </View>
              )}
            </View>
          </ScrollView>

          {/* Rodapé: responder. */}
          <View className="flex-row items-end gap-2 border-t border-border px-4 py-3">
            <Input
              value={resposta}
              onChangeText={setResposta}
              placeholder="Escreva uma resposta..."
              multiline
              className="flex-1 min-h-11 max-h-32 py-2"
            />
            <Button
              onPress={enviar}
              loading={addMensagem.isPending}
              disabled={respostaLimpa.length === 0}
            >
              Enviar
            </Button>
          </View>

          {/* Erro de envio. */}
          {addMensagem.isError ? (
            <Text className="px-4 pb-2 text-sm text-red-600">
              Não foi possível enviar a mensagem.
            </Text>
          ) : null}

          {/* Visualizador de imagem em tela cheia para os anexos (zoom/pan, in-app). */}
          <ImageViewerModal uri={imagemUri} onClose={() => setImagemUri(null)} />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}
