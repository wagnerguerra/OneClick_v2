'use client'

/**
 * /admin/assinatura-template — editor visual + HTML do template de assinatura
 * de email, POR EMPRESA. Restrito a isMaster.
 */

import { useEffect, useState, useCallback, useRef } from 'react'
import dynamic from 'next/dynamic'
import { useRouter } from 'next/navigation'
import {
  Mail, Save, Loader2, Palette, ImageIcon, Code2, RefreshCcw,
  Upload, X, Eye, AlertTriangle,
} from 'lucide-react'
import {
  Button, Input, Label, Card, CardHeader, CardContent,
  Select, SelectTrigger, SelectContent, SelectItem, SelectValue,
} from '@saas/ui'
import { useSession } from '@/lib/auth-client'
import { trpc } from '@/lib/trpc'
import { alerts } from '@/lib/alerts'
import { getApiUrl, resolveAssetUrl } from '@/lib/api-url'
import { BackButton } from '@/components/ui/back-button'
import { PageHeaderIcon } from '@/components/ui/page-header-icon'
import {
  buildSignatureHtml,
  SIGNATURE_TEMPLATE_DEFAULTS,
  SIGNATURE_PLACEHOLDERS,
  type SignatureTemplate,
  type SignatureData,
} from '@/lib/signature-html'

// Monaco é pesado (~3MB) — lazy load. Sem SSR.
const MonacoEditor = dynamic(() => import('@monaco-editor/react'), {
  ssr: false,
  loading: () => <div className="h-[400px] flex items-center justify-center text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /></div>,
})

interface EmpresaOption { id: string; name: string }

const FONT_OPTIONS = [
  { label: 'Arial', value: 'Arial, Helvetica, sans-serif' },
  { label: 'Helvetica', value: 'Helvetica, Arial, sans-serif' },
  { label: 'Verdana', value: 'Verdana, Geneva, sans-serif' },
  { label: 'Tahoma', value: 'Tahoma, Geneva, sans-serif' },
  { label: 'Georgia (serif)', value: 'Georgia, "Times New Roman", serif' },
  { label: 'Times New Roman (serif)', value: '"Times New Roman", Times, serif' },
  { label: 'Courier New (mono)', value: '"Courier New", monospace' },
]

// Placeholder SVG (círculo pontilhado) — representa onde a foto do user real
// vai entrar na assinatura. Aspas SIMPLES no SVG pra não conflitar com src="..."
// do <img>. encodeURIComponent é cross-runtime (funciona no SSR e client).
const PHOTO_PLACEHOLDER_SVG = `data:image/svg+xml;utf8,${encodeURIComponent(
  `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 220 180' width='220' height='180'>`
  + `<circle cx='110' cy='90' r='62' fill='none' stroke='%23d1d5db' stroke-width='2' stroke-dasharray='6 5'/>`
  + `<text x='110' y='96' text-anchor='middle' font-family='Arial,sans-serif' font-size='11' fill='%23d1d5db'>foto do usuário</text>`
  + `</svg>`,
)}`

// Sample data pra preview quando o user master não está vinculado à empresa selecionada
const SAMPLE_DATA: SignatureData = {
  name: 'Thayza Lima',
  email: 'thayza@example.com',
  telefone: null,
  celular: '99605-0879',
  whatsapp: null,
  instagramUrl: 'central.rnc',
  linkedinUrl: null,
  signatureImageUrl: PHOTO_PLACEHOLDER_SVG,
  area: { name: 'Comercial' },
  cargo: { name: 'Analista' },
  empresa: null, // será injetado em runtime
}

export default function AssinaturaTemplatePage() {
  const router = useRouter()
  const { data: session } = useSession()
  const isMaster = !!((session?.user as { isMaster?: boolean } | undefined)?.isMaster)

  const [empresas, setEmpresas] = useState<EmpresaOption[]>([])
  const [empresaId, setEmpresaId] = useState<string>('')
  const [template, setTemplate] = useState<SignatureTemplate>(SIGNATURE_TEMPLATE_DEFAULTS)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [activeTab, setActiveTab] = useState<'visual' | 'html'>('visual')
  const [empresaData, setEmpresaData] = useState<SignatureData['empresa']>(null)

  const bgImageInputRef = useRef<HTMLInputElement>(null)
  const [uploadingBgImage, setUploadingBgImage] = useState(false)

  // Guard master
  useEffect(() => {
    if (session && !isMaster) router.push('/dashboard')
  }, [session, isMaster, router])

  // Carrega lista de empresas
  useEffect(() => {
    if (!isMaster) return
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (trpc.empresa as any).listForSelect.query()
      .then((list: Array<{ id: string; razaoSocial: string; nomeFantasia: string | null }>) => {
        const opts = list.map(e => ({ id: e.id, name: e.nomeFantasia ?? e.razaoSocial }))
        setEmpresas(opts)
        if (opts.length > 0 && !empresaId) setEmpresaId(opts[0].id)
      })
      .catch(() => { /* sem permissão */ })
  }, [isMaster, empresaId])

  const loadTemplate = useCallback(async (id: string) => {
    setLoading(true)
    try {
      // REST bypass do tRPC (Chrome trava POST tRPC pra essa rota específica)
      const res = await fetch(`${getApiUrl()}/api/email-template/${id}`, { credentials: 'include' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const tpl = await res.json() as SignatureTemplate
      setTemplate(tpl)
      // Busca dados completos da empresa pro preview
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const emp = await (trpc.empresa as any).getById.query({ id }).catch(() => null)
      setEmpresaData(emp ? {
        id: emp.id,
        razaoSocial: emp.razaoSocial,
        nomeFantasia: emp.nomeFantasia,
        telefone: emp.telefone,
        email: emp.email,
        site: emp.site,
        logradouro: emp.logradouro,
        numero: emp.numero,
        bairro: emp.bairro,
        cidade: emp.cidade,
        uf: emp.uf,
        logoUrl: emp.logoUrl,
        logoDarkUrl: emp.logoDarkUrl,
      } : null)
    } catch (e) {
      alerts.error('Erro', (e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { if (empresaId) loadTemplate(empresaId) }, [empresaId, loadTemplate])

  function setField<K extends keyof SignatureTemplate>(key: K, value: SignatureTemplate[K]) {
    setTemplate(prev => ({ ...prev, [key]: value }))
  }

  async function handleSave() {
    if (!empresaId) return
    setSaving(true)
    try {
      // Strip campos não pertinentes ao Zod (id, createdAt, etc vindos do getTemplate)
      // pra evitar erros de validação silenciosos.
      const payload = {
        backgroundColor: template.backgroundColor,
        backgroundImageUrl: template.backgroundImageUrl,
        accentColor: template.accentColor,
        textColor: template.textColor,
        subtleColor: template.subtleColor,
        fontFamily: template.fontFamily,
        showPhoto: template.showPhoto,
        showName: template.showName,
        showArea: template.showArea,
        showPhone: template.showPhone,
        showAddress: template.showAddress,
        showSite: template.showSite,
        showInstagram: template.showInstagram,
        showLogo: template.showLogo,
        showPhotoBackground: template.showPhotoBackground,
        showIcons: template.showIcons,
        customHtmlEnabled: template.customHtmlEnabled,
        customHtml: template.customHtml,
      }
      console.log('[updateTemplate] payload:', payload)
      // REST bypass do tRPC (POST tRPC trava no Chrome pra essa rota específica)
      const res = await fetch(`${getApiUrl()}/api/email-template/${empresaId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        credentials: 'include',
      })
      if (!res.ok) {
        const errBody = await res.text().catch(() => '')
        throw new Error(`HTTP ${res.status}: ${errBody}`)
      }
      await alerts.success('Salvo', 'Template atualizado. Todas as assinaturas dessa empresa usam essa configuração.')
    } catch (e) {
      console.error('[updateTemplate] erro:', e)
      alerts.error('Erro', (e as Error).message || 'Falha desconhecida — veja console')
    } finally {
      setSaving(false)
    }
  }

  async function handleReset() {
    if (!empresaId) return
    const ok = await alerts.confirm({ title: 'Resetar template?', text: 'Volta pros valores padrão. Esta empresa perde a personalização.', confirmText: 'Resetar', icon: 'warning' })
    if (!ok) return
    setSaving(true)
    try {
      // REST bypass do tRPC
      const res = await fetch(`${getApiUrl()}/api/email-template/${empresaId}/reset`, {
        method: 'POST',
        credentials: 'include',
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      await loadTemplate(empresaId)
      await alerts.success('Resetado', 'Template voltou pros padrões.')
    } catch (e) {
      alerts.error('Erro', (e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  async function uploadImage(file: File, max: number): Promise<string> {
    if (file.size > max * 1024 * 1024) throw new Error(`Use até ${max}MB.`)
    const fd = new window.FormData()
    fd.append('file', file)
    const res = await fetch(`${getApiUrl()}/api/upload`, { method: 'POST', body: fd, credentials: 'include' })
    if (!res.ok) throw new Error('Falha no upload')
    const data = await res.json()
    return data.url as string
  }

  async function handleBgImageUpload(file: File) {
    setUploadingBgImage(true)
    try {
      setField('backgroundImageUrl', await uploadImage(file, 4))
    } catch (e) { alerts.error('Erro', (e as Error).message) }
    finally { setUploadingBgImage(false) }
  }

  if (!session || !isMaster) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    )
  }

  const previewData: SignatureData = empresaData
    ? { ...SAMPLE_DATA, empresa: empresaData }
    : SAMPLE_DATA

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <PageHeaderIcon module="configuracoes" icon={Mail} />
          <div>
            <h1>Template de assinatura</h1>
            <p className="text-sm text-muted-foreground">Configure cores, fonte, logo e visibilidade dos campos. Aplica a todos os usuários da empresa.</p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button variant="success" size="sm" onClick={handleSave} disabled={saving || loading}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Salvar
          </Button>
          <BackButton href="/admin" />
        </div>
      </div>

      {/* Seleção de empresa */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-3">
            <Label className="text-[13px] font-semibold shrink-0">Empresa:</Label>
            <Select value={empresaId} onValueChange={setEmpresaId}>
              <SelectTrigger className="h-9 max-w-md"><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                {empresas.map(e => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={handleReset} disabled={saving || loading} className="ml-auto gap-1.5">
              <RefreshCcw className="h-3.5 w-3.5" /> Resetar pra padrão
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Tabs Visual vs HTML */}
      <div className="flex gap-2 border-b border-border">
        <button
          type="button"
          onClick={() => setActiveTab('visual')}
          className={`px-4 py-2 text-[13px] font-semibold border-b-2 transition-colors ${activeTab === 'visual' ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
        >
          <span className="inline-flex items-center gap-1.5"><Palette className="h-3.5 w-3.5" /> Visual</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('html')}
          className={`px-4 py-2 text-[13px] font-semibold border-b-2 transition-colors ${activeTab === 'html' ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
        >
          <span className="inline-flex items-center gap-1.5"><Code2 className="h-3.5 w-3.5" /> HTML avançado</span>
        </button>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        {/* CONFIG */}
        {activeTab === 'visual' ? (
          <div className="space-y-4">
            {/* Cores */}
            <Card>
              <CardHeader className="border-b border-border/60 px-5 py-3 flex flex-row items-center gap-2">
                <Palette className="h-4 w-4 text-muted-foreground" />
                <h3 className="text-sm font-semibold">Cores e fonte</h3>
              </CardHeader>
              <CardContent className="p-5 grid grid-cols-2 gap-3">
                {([
                  ['backgroundColor', 'Fundo'],
                  ['accentColor', 'Accent (ícones)'],
                  ['textColor', 'Texto'],
                  ['subtleColor', 'Texto secundário'],
                ] as const).map(([key, label]) => (
                  <div key={key} className="space-y-1.5">
                    <Label className="text-[12px] font-semibold">{label}</Label>
                    <div className="flex gap-2">
                      <input type="color" value={template[key]} onChange={e => setField(key, e.target.value)} className="h-9 w-12 rounded border border-border cursor-pointer" />
                      <Input value={template[key]} onChange={e => setField(key, e.target.value)} className="h-9 text-sm font-mono" />
                    </div>
                  </div>
                ))}
                <div className="col-span-2 space-y-1.5">
                  <Label className="text-[12px] font-semibold">Fonte</Label>
                  <Select value={template.fontFamily} onValueChange={v => setField('fontFamily', v)}>
                    <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {FONT_OPTIONS.map(f => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>

                {/* Toggle: foto cobre a esquerda OU fundo do template cobre. */}
                <div className="col-span-2 pt-3 border-t border-border/40">
                  <label className="flex items-center justify-between gap-2 cursor-pointer">
                    <div>
                      <div className="text-[12px] font-semibold">Exibir foto do usuário</div>
                      <div className="text-[10px] text-muted-foreground">
                        Quando desligado, a foto do usuário não aparece — o fundo do template (cor + imagem) cobre toda a área, inclusive a esquerda.
                        Útil quando a imagem de fundo já tem a decoração/foto embutida.
                      </div>
                    </div>
                    <input type="checkbox" checked={template.showPhotoBackground} onChange={e => setField('showPhotoBackground', e.target.checked)} className="h-4 w-4" />
                  </label>
                </div>

                {/* Imagem de fundo (sobrescreve cor sólida quando setada) */}
                <div className="col-span-2 space-y-2 pt-3 border-t border-border/40">
                  <Label className="text-[12px] font-semibold">Imagem de fundo</Label>
                  <div className="flex items-center gap-3">
                    {template.backgroundImageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={resolveAssetUrl(template.backgroundImageUrl)} alt="Background" className="h-16 w-32 rounded border border-border object-cover" />
                    ) : (
                      <div className="h-16 w-32 rounded border-2 border-dashed border-border flex items-center justify-center text-[10px] text-muted-foreground" style={{ backgroundColor: template.backgroundColor }}>
                        Só cor sólida
                      </div>
                    )}
                    <div className="flex flex-col gap-2">
                      <Button size="sm" variant="outline" className="gap-1.5" onClick={() => bgImageInputRef.current?.click()} disabled={uploadingBgImage}>
                        {uploadingBgImage ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                        {template.backgroundImageUrl ? 'Trocar' : 'Subir imagem'}
                      </Button>
                      {template.backgroundImageUrl && (
                        <Button size="sm" variant="ghost" className="gap-1.5 text-rose-600" onClick={() => setField('backgroundImageUrl', null)}>
                          <X className="h-3.5 w-3.5" /> Remover
                        </Button>
                      )}
                      <input
                        ref={bgImageInputRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={e => { const f = e.target.files?.[0]; if (f) handleBgImageUpload(f); e.target.value = '' }}
                      />
                    </div>
                  </div>
                  <p className="text-[10px] text-muted-foreground leading-relaxed">
                    A cor de fundo continua como <strong>fallback</strong> — Outlook desktop não renderiza imagem (vai mostrar só a cor).
                    Use formato 700x180px aproximado pra cobrir todo o template.
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Visibilidade */}
            <Card>
              <CardHeader className="border-b border-border/60 px-5 py-3 flex flex-row items-center gap-2">
                <Eye className="h-4 w-4 text-muted-foreground" />
                <h3 className="text-sm font-semibold">Campos visíveis</h3>
              </CardHeader>
              <CardContent className="p-5 grid grid-cols-2 gap-2">
                {([
                  ['showPhoto', 'Foto'],
                  ['showName', 'Nome'],
                  ['showArea', 'Área'],
                  ['showPhone', 'Telefones'],
                  ['showAddress', 'Endereço'],
                  ['showSite', 'Site'],
                  ['showInstagram', 'Instagram'],
                  ['showIcons', 'Ícones (☎ ⚑ 🌐 📷)'],
                ] as const).map(([key, label]) => (
                  <label key={key} className="flex items-center gap-2 text-sm cursor-pointer">
                    <input type="checkbox" checked={template[key]} onChange={e => setField(key, e.target.checked)} className="h-4 w-4" />
                    {label}
                  </label>
                ))}
              </CardContent>
            </Card>
          </div>
        ) : (
          /* HTML AVANÇADO */
          <div className="space-y-4">
            <Card>
              <CardHeader className="border-b border-border/60 px-5 py-3 flex flex-row items-center justify-between">
                <div className="flex items-center gap-2">
                  <Code2 className="h-4 w-4 text-muted-foreground" />
                  <h3 className="text-sm font-semibold">HTML customizado</h3>
                </div>
                <label className="flex items-center gap-2 text-[12px] font-semibold cursor-pointer">
                  <input type="checkbox" checked={template.customHtmlEnabled} onChange={e => setField('customHtmlEnabled', e.target.checked)} className="h-4 w-4" />
                  Usar HTML custom
                </label>
              </CardHeader>
              <CardContent className="p-0">
                {template.customHtmlEnabled && (
                  <div className="bg-amber-50 dark:bg-amber-950/30 px-5 py-2 border-b border-amber-200 dark:border-amber-900 text-[11px] text-amber-900 dark:text-amber-200 flex items-start gap-2">
                    <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                    <span>HTML custom ATIVO. Cores, visibilidade e logo override do tab Visual são ignorados — o HTML abaixo é a fonte da verdade. Não use <code>position:absolute</code>, <code>flex</code>, <code>grid</code> ou <code>&lt;style&gt;</code> — use só inline styles + tabelas.</span>
                  </div>
                )}
                <MonacoEditor
                  height="500px"
                  defaultLanguage="html"
                  value={template.customHtml ?? ''}
                  onChange={v => setField('customHtml', v ?? null)}
                  theme="vs-dark"
                  options={{
                    minimap: { enabled: false },
                    fontSize: 13,
                    wordWrap: 'on',
                    automaticLayout: true,
                  }}
                />
              </CardContent>
            </Card>

            {/* Placeholders disponíveis */}
            <Card>
              <CardHeader className="border-b border-border/60 px-5 py-3">
                <h3 className="text-sm font-semibold">Placeholders disponíveis</h3>
                <p className="text-[11px] text-muted-foreground mt-1">Clique pra copiar. Use no HTML acima.</p>
              </CardHeader>
              <CardContent className="p-3 max-h-[260px] overflow-y-auto">
                <div className="grid grid-cols-1 gap-1">
                  {SIGNATURE_PLACEHOLDERS.map(p => (
                    <button
                      key={p.key}
                      type="button"
                      className="text-left text-[11px] px-2 py-1.5 rounded hover:bg-muted transition-colors flex justify-between gap-2"
                      onClick={() => { navigator.clipboard.writeText(`{{${p.key}}}`).then(() => alerts.success('Copiado', `{{${p.key}}}`)) }}
                    >
                      <code className="font-mono text-foreground">{`{{${p.key}}}`}</code>
                      <span className="text-muted-foreground truncate">{p.label}</span>
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* PREVIEW (sempre visível, lado direito) */}
        <Card className="xl:sticky xl:top-4 xl:self-start">
          <CardHeader className="border-b border-border/60 px-5 py-3 flex flex-row items-center gap-2">
            <Eye className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold flex-1">Preview ao vivo</h3>
            <span className="text-[10px] text-muted-foreground">com dados de exemplo</span>
          </CardHeader>
          <CardContent className="p-5">
            <iframe
              title="Preview da assinatura"
              srcDoc={`<!doctype html><html><head><meta charset="utf-8"></head><body style="margin:0;padding:16px;font-family:Arial,sans-serif;background:#f5f5f5;">${buildSignatureHtml(previewData, template, getApiUrl())}</body></html>`}
              className="w-full border border-border rounded-md bg-white"
              style={{ height: '260px' }}
            />
            <p className="text-[10px] text-muted-foreground mt-3">
              Cada colaborador da empresa vai ter a assinatura com SEUS próprios dados (foto, nome, área, celular, Instagram), mas com este template visual aplicado.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
