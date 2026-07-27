'use client'

import { useState, useEffect, useRef } from 'react'
import {
  Button, Input, Label,
  Dialog, DialogContent, DialogBody, DialogTitle, DialogDescription,
} from '@saas/ui'
import { DialogHeaderIcon } from '@/components/ui/dialog-header-icon'
import { KeyRound, Download, Eye, EyeOff, Copy, Check, Loader2, ShieldCheck } from 'lucide-react'
import { trpc } from '@/lib/trpc'
import { alerts } from '@/lib/alerts'
import { useCurrentUserProfile } from '@/hooks/use-current-user-profile'

const MOD = 'var(--mod-legalizacao, #7c3aed)'

/**
 * Painel de acesso ao certificado (#HLP0301) — a lógica + UI das fases
 * reauth/painel SEM o chrome de modal. Usado:
 *  - inline dentro do CertDetalhesModal (substitui o botão "Baixar PFX / Ver
 *    senha", pra evitar abrir um segundo modal), e
 *  - dentro do CertAcessoModal (kebab da gestão, onde o botão não está num modal).
 *
 * `active` liga o carregamento (equivale a "aberto"). `autoDownload` (padrão true)
 * inicia o download assim que chega no painel — menos cliques.
 * `reauthMode` decide onde a solicitação de credencial aparece: 'modal' (Dialog
 * próprio — padrão, usado quando o painel de arquivo/senha é inline num modal de
 * detalhes, aí só o painel expande) ou 'inline' (form no próprio container, ex.:
 * kebab, onde este componente já vive dentro de um modal).
 */
export function CertAcessoPanel({ certId, titular, active, autoDownload = true, reauthMode = 'modal', origem = 'gestao', onCancel }: {
  certId: string | null
  titular: string
  active: boolean
  autoDownload?: boolean
  reauthMode?: 'inline' | 'modal'
  /** 'cliente' = acesso pelo cadastro do cliente (não exige a sub-permissão). */
  origem?: 'gestao' | 'cliente'
  onCancel?: () => void
}) {
  const { profile } = useCurrentUserProfile()
  const [fase, setFase] = useState<'carregando' | 'reauth' | 'painel'>('carregando')
  const [reautExigida, setReautExigida] = useState(true)
  const [senhaUser, setSenhaUser] = useState('')
  const [motivo, setMotivo] = useState('')
  const [autenticando, setAutenticando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  // painel
  const [senhaCert, setSenhaCert] = useState<string | null>(null)
  const [mostrar, setMostrar] = useState(false)
  const [revelando, setRevelando] = useState(false)
  const [baixando, setBaixando] = useState(false)
  const [copiado, setCopiado] = useState(false)
  const autoBaixouRef = useRef(false)
  const painelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!active || !certId) return
    setFase('carregando'); setSenhaUser(''); setMotivo(''); setErro(null)
    setSenhaCert(null); setMostrar(false); setCopiado(false)
    autoBaixouRef.current = false
    ;(trpc.certificadoDigital as any).getReautConfig.query()
      .then((c: { reautObrigatoria: boolean }) => {
        setReautExigida(c.reautObrigatoria)
        if (c.reautObrigatoria) {
          setFase('reauth')
        } else {
          // Sem reautenticação: já registra o acesso (arquivo + senha) e abre o
          // painel. Best-effort — falha no log não bloqueia o acesso. #HLP0301
          ;(trpc.certificadoDigital as any).acessar.mutate({ id: certId, origem }).catch(() => {})
          setFase('painel')
        }
      })
      .catch(() => { setReautExigida(true); setFase('reauth') })
  }, [active, certId])

  // Credenciais enviadas às ações reais. Quando o tenant não exige reaut, vão
  // vazias e o backend libera — mas SEMPRE audita.
  const creds = reautExigida ? { senhaUser, motivo: motivo.trim() } : {}

  async function autenticar() {
    setErro(null)
    if (!certId) return
    if (!senhaUser) { setErro('Informe sua senha.'); return }
    if (motivo.trim().length < 3) { setErro('Informe a justificativa (mínimo 3 caracteres).'); return }
    setAutenticando(true)
    try {
      // Valida senha+justificativa (bloqueia se incorreta) e JÁ registra o
      // acesso ao arquivo + senha na trilha, num único evento. #HLP0301
      await (trpc.certificadoDigital as any).acessar.mutate({ id: certId, senhaUser, motivo: motivo.trim(), origem })
      setFase('painel')
    } catch (e) {
      setErro((e as Error).message || 'Senha incorreta.')
    } finally { setAutenticando(false) }
  }

  async function revelarSenha(): Promise<string | null> {
    if (senhaCert != null) return senhaCert
    setRevelando(true)
    try {
      const r = await (trpc.certificadoDigital as any).getSenha.mutate({ id: certId, origem, ...creds })
      setSenhaCert(r.senha)
      return r.senha
    } catch (e) {
      alerts.error('Erro ao exibir senha', (e as Error).message)
      return null
    } finally { setRevelando(false) }
  }

  async function toggleMostrar() {
    if (!mostrar) { const s = await revelarSenha(); if (s == null) return }
    setMostrar(m => !m)
  }

  // Cópia robusta: a Clipboard API só existe em contexto seguro (HTTPS, como em
  // prod). Acessando via http://IP (dev) ela é undefined, então caímos no
  // fallback com textarea + execCommand('copy'). A textarea é anexada DENTRO do
  // painel (dentro do Dialog) — se fosse no document.body, o focus-trap do Radix
  // roubaria o foco/seleção e o copy sairia vazio.
  async function copyText(text: string): Promise<boolean> {
    if (typeof navigator !== 'undefined' && navigator.clipboard && window.isSecureContext) {
      try { await navigator.clipboard.writeText(text); return true } catch { /* cai no fallback */ }
    }
    const host = painelRef.current ?? document.body
    const ta = document.createElement('textarea')
    ta.value = text
    ta.setAttribute('readonly', '')
    ta.style.position = 'absolute'
    ta.style.left = '-9999px'
    ta.style.top = '0'
    host.appendChild(ta)
    try {
      ta.focus(); ta.select(); ta.setSelectionRange(0, ta.value.length)
      return document.execCommand('copy')
    } catch {
      return false
    } finally {
      host.removeChild(ta)
    }
  }

  async function copiar() {
    const s = senhaCert ?? await revelarSenha()
    if (s == null) return
    if (await copyText(s)) {
      setCopiado(true); setTimeout(() => setCopiado(false), 1500)
    } else {
      alerts.error('Não foi possível copiar', 'Selecione o texto e copie manualmente.')
    }
  }

  async function baixar() {
    if (!certId) return
    setBaixando(true)
    try {
      const r = await (trpc.certificadoDigital as any).downloadPfx.mutate({ id: certId, origem, ...creds })
      const blob = new Blob([Uint8Array.from(atob(r.pfxBase64), c => c.charCodeAt(0))], { type: 'application/x-pkcs12' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${(titular || 'certificado').replace(/\s+/g, '_')}.pfx`
      document.body.appendChild(a); a.click(); document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (e) {
      alerts.error('Erro no download', (e as Error).message)
    } finally { setBaixando(false) }
  }

  // QoL (#HLP0301): com autoDownload, um único clique já baixa o PFX E copia a
  // senha pra área de transferência, com um toast confirmando os dois.
  async function autoBaixarECopiar() {
    const dl = baixar()
    const senha = await revelarSenha()
    const copiou = senha != null ? await copyText(senha) : false
    if (copiou) { setCopiado(true); setTimeout(() => setCopiado(false), 1500) }
    await dl
    if (copiou) {
      alerts.success('Download iniciado', 'A senha foi copiada para a área de transferência.', { timer: 5000 })
    } else {
      alerts.success('Download iniciado', 'Não foi possível copiar a senha automaticamente — use o botão Copiar.', { timer: 5000 })
    }
  }

  // Auto-ação ao chegar no painel (quando expandido inline). Uma vez só.
  useEffect(() => {
    if (autoDownload && fase === 'painel' && !autoBaixouRef.current) {
      autoBaixouRef.current = true
      void autoBaixarECopiar()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoDownload, fase])

  if (!active) return null

  if (fase === 'carregando') {
    return (
      <div className="flex justify-center py-6">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (fase === 'reauth') {
    const form = (
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Para ver a senha e baixar o PFX, confirme sua senha e informe a justificativa. O acesso é registrado na trilha de auditoria.
        </p>
        {/* Campo de usuário OCULTO (e-mail do logado): existe só pro Chrome
            parear a senha aqui dentro (autofill), fora da barra de busca. */}
        <input
          type="text"
          autoComplete="username"
          readOnly
          tabIndex={-1}
          aria-hidden="true"
          value={profile?.email ?? ''}
          style={{ position: 'absolute', width: 1, height: 1, opacity: 0, pointerEvents: 'none' }}
        />
        <div className="space-y-1.5">
          <Label className="text-[13px] font-semibold">Sua senha</Label>
          <Input
            type="password"
            autoComplete="current-password"
            autoFocus
            value={senhaUser}
            onChange={e => setSenhaUser(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') autenticar() }}
            placeholder="••••••••"
            className="h-9 text-sm"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-[13px] font-semibold">Justificativa</Label>
          <textarea
            value={motivo}
            onChange={e => setMotivo(e.target.value)}
            rows={2}
            placeholder="Motivo do acesso"
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none"
          />
        </div>
        {erro && <p className="text-xs text-rose-600">{erro}</p>}
        <div className="flex justify-end gap-2">
          {onCancel && <Button type="button" variant="outline" onClick={onCancel}>Cancelar</Button>}
          <Button type="button" onClick={autenticar} disabled={autenticando} className="text-white gap-1.5" style={{ backgroundColor: MOD }}>
            {autenticando ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Continuar
          </Button>
        </div>
      </div>
    )

    // 'modal': a credencial vira um Dialog próprio (só o painel de arquivo/senha
    // expande inline). 'inline': o form aparece no próprio container.
    if (reauthMode === 'modal') {
      return (
        <Dialog open onOpenChange={(o) => { if (!o) onCancel?.() }}>
          <DialogContent className="sm:max-w-[440px]">
            <DialogHeaderIcon icon={ShieldCheck} color="violet">
              <DialogTitle>Confirme seu acesso</DialogTitle>
              <DialogDescription>{titular}</DialogDescription>
            </DialogHeaderIcon>
            <DialogBody>{form}</DialogBody>
          </DialogContent>
        </Dialog>
      )
    }
    return form
  }

  // fase === 'painel'
  return (
    <div ref={painelRef} className="rounded-md border border-border bg-muted/30 p-3 space-y-3">
      {/* Senha */}
      <div className="space-y-1.5">
        <p className="text-[13px] font-semibold flex items-center gap-1.5">
          <KeyRound className="h-3.5 w-3.5" /> Senha do certificado
        </p>
        <div className="flex items-center gap-2">
          <div className="flex-1 min-w-0 h-9 rounded-md border border-input bg-background px-3 flex items-center font-mono text-sm select-text overflow-x-auto whitespace-nowrap">
            {mostrar && senhaCert != null ? senhaCert : '••••••••••••'}
          </div>
          <Button type="button" variant="outline" size="sm" onClick={toggleMostrar} disabled={revelando} title={mostrar ? 'Ocultar' : 'Exibir'}>
            {revelando ? <Loader2 className="h-4 w-4 animate-spin" /> : mostrar ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={copiar} title="Copiar senha">
            {copiado ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
          </Button>
        </div>
        <p className="text-[11px] text-muted-foreground">Exibir ou copiar a senha é registrado na auditoria.</p>
      </div>
      {/* Download */}
      <div className="space-y-1.5">
        <p className="text-[13px] font-semibold flex items-center gap-1.5">
          <Download className="h-3.5 w-3.5" /> Baixar certificado (.pfx)
        </p>
        <Button type="button" onClick={baixar} disabled={baixando} className="w-full gap-1.5 bg-emerald-500 hover:bg-emerald-600 text-white">
          {baixando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} {autoDownload ? 'Baixar .pfx novamente' : 'Baixar .pfx'}
        </Button>
      </div>
    </div>
  )
}
