'use client'

import { useEffect, useRef, useState } from 'react'
import {
  User as UserIcon, MapPin, Building2, Briefcase, Mail, Phone, Calendar,
  Shield, Key, Save, Loader2, Pencil, Camera, Clock, Globe, Image as ImageIcon, Trash2,
  Smartphone, CheckCircle2, AlertTriangle, Copy as CopyIcon, Monitor,
  Users, ExternalLink, Search,
  Linkedin, Github, Instagram, Facebook, Link as LinkIcon, MessageCircle,
} from 'lucide-react'
import { USER_ROLE_LABELS } from '@saas/types'
import {
  Button, Input, Label, Card, CardHeader, CardContent,
  Tabs, TabsList, TabsTrigger, TabsContent, SlidingTabsList,
  Dialog, DialogContent, DialogBody, DialogFooter, DialogTitle, DialogDescription,
  Select, SelectTrigger, SelectContent, SelectItem, SelectValue,
} from '@saas/ui'
import { cn } from '@saas/ui'
import { DialogHeaderIcon } from '@/components/ui/dialog-header-icon'
import { trpc } from '@/lib/trpc'
import { alerts } from '@/lib/alerts'
import { getApiUrl, resolveAssetUrl } from '@/lib/api-url'
import { refreshCurrentUserProfile } from '@/hooks/use-current-user-profile'
import { authClient } from '@/lib/auth-client'
import {
  buildSignatureHtml,
  SIGNATURE_TEMPLATE_DEFAULTS,
  type SignatureData,
  type SignatureTemplate,
} from '@/lib/signature-html'

const MODULE_COLOR = 'var(--mod-perfil, #5ea3cb)' // azul primário do sistema

interface MyProfile {
  id: string
  name: string
  email: string
  role: string
  profile: string
  image: string | null
  coverImage: string | null
  isMaster: boolean
  isEmpresaMaster: boolean
  isActive: boolean
  twoFactorEnabled: boolean
  salario: number | string | null
  dataAdmissao: string | null
  idOneClick: string | null
  createdAt: string

  // Pessoal
  dataNascimento: string | null
  sexo: string | null
  estadoCivil: string | null
  nacionalidade: string | null
  naturalidade: string | null
  bio: string | null

  // Contato
  telefone: string | null
  celular: string | null
  whatsapp: string | null
  ramal: string | null

  // Endereço
  cep: string | null
  logradouro: string | null
  numero: string | null
  complemento: string | null
  bairro: string | null
  cidade: string | null
  uf: string | null
  pais: string | null

  // Sociais
  siteUrl: string | null
  linkedinUrl: string | null
  githubUrl: string | null
  instagramUrl: string | null
  facebookUrl: string | null

  empresa: { id: string; razaoSocial: string; nomeFantasia: string | null } | null
  area: { id: string; name: string } | null
  cargo: { id: string; name: string } | null
  lastLogin: { createdAt: string; ipAddress: string | null; userAgent: string | null } | null
}

interface FormData {
  name: string
  // Pessoal
  dataNascimento: string
  sexo: string
  estadoCivil: string
  nacionalidade: string
  naturalidade: string
  bio: string
  // Contato
  telefone: string
  celular: string
  whatsapp: string
  ramal: string
  // Endereço
  cep: string
  logradouro: string
  numero: string
  complemento: string
  bairro: string
  cidade: string
  uf: string
  pais: string
  // Sociais
  siteUrl: string
  linkedinUrl: string
  githubUrl: string
  instagramUrl: string
  facebookUrl: string
}

const EMPTY_FORM: FormData = {
  name: '',
  dataNascimento: '', sexo: '', estadoCivil: '', nacionalidade: '', naturalidade: '', bio: '',
  telefone: '', celular: '', whatsapp: '', ramal: '',
  cep: '', logradouro: '', numero: '', complemento: '', bairro: '', cidade: '', uf: '', pais: '',
  siteUrl: '', linkedinUrl: '', githubUrl: '', instagramUrl: '', facebookUrl: '',
}

function formatDate(d: string | null | undefined) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function formatDateTime(d: string | null | undefined) {
  if (!d) return '—'
  return new Date(d).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function browserFromUA(ua: string | null) {
  if (!ua) return '—'
  if (/Edg\//.test(ua)) return 'Edge'
  if (/Chrome\//.test(ua)) return 'Chrome'
  if (/Safari\//.test(ua) && !/Chrome/.test(ua)) return 'Safari'
  if (/Firefox\//.test(ua)) return 'Firefox'
  return 'Outro'
}

export default function MeuPerfilPage() {
  const [profile, setProfile] = useState<MyProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('overview')

  // Form Meus Dados (todos os campos editáveis pelo próprio usuário)
  const [form, setForm] = useState<FormData>(EMPTY_FORM)
  const [savingProfile, setSavingProfile] = useState(false)

  function setField<K extends keyof FormData>(key: K, value: FormData[K]) {
    setForm(prev => ({ ...prev, [key]: value }))
  }

  // Form Senha
  const [pwdCurrent, setPwdCurrent] = useState('')
  const [pwdNew, setPwdNew] = useState('')
  const [pwdConfirm, setPwdConfirm] = useState('')
  const [savingPwd, setSavingPwd] = useState(false)
  const [pwdModal, setPwdModal] = useState(false)

  // Avatar upload
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)

  // Cover (background) upload + deteccao de luminancia
  const coverInputRef = useRef<HTMLInputElement>(null)
  const [uploadingCover, setUploadingCover] = useState(false)

  // Assinatura de email — foto separada + dados pra render
  const signatureFileInputRef = useRef<HTMLInputElement>(null)
  const [uploadingSignature, setUploadingSignature] = useState(false)
  const [signatureData, setSignatureData] = useState<SignatureData | null>(null)
  const [signatureTemplate, setSignatureTemplate] = useState<SignatureTemplate>(SIGNATURE_TEMPLATE_DEFAULTS)

  // Carteira de clientes (responsabilidade direta ou substituto por área)
  interface CarteiraItem {
    clienteId: string
    razaoSocial: string
    documento: string
    areaNome: string
    role: 'Responsável' | 'Substituto(a)' | string
    encerrado: boolean
  }
  interface CarteiraCliente {
    clienteId: string
    razaoSocial: string
    documento: string
    areas: Array<{ areaNome: string; role: string; encerrado: boolean }>
  }
  const [carteira, setCarteira] = useState<CarteiraCliente[]>([])
  const [carteiraLoading, setCarteiraLoading] = useState(true)
  const [carteiraSearch, setCarteiraSearch] = useState('')
  const [carteiraFiltroRole, setCarteiraFiltroRole] = useState<'TODOS' | 'RESP' | 'SUBST'>('TODOS')

  async function fetchCarteira() {
    setCarteiraLoading(true)
    try {
      const rows: CarteiraItem[] = await (trpc.user as any).getMyAssignedClients.query()
      // Agrupa por clienteId
      const mapa = new Map<string, CarteiraCliente>()
      for (const r of rows) {
        const existing = mapa.get(r.clienteId)
        if (existing) {
          existing.areas.push({ areaNome: r.areaNome, role: r.role, encerrado: r.encerrado })
        } else {
          mapa.set(r.clienteId, {
            clienteId: r.clienteId,
            razaoSocial: r.razaoSocial,
            documento: r.documento,
            areas: [{ areaNome: r.areaNome, role: r.role, encerrado: r.encerrado }],
          })
        }
      }
      setCarteira(Array.from(mapa.values()).sort((a, b) => a.razaoSocial.localeCompare(b.razaoSocial, 'pt-BR')))
    } catch {
      setCarteira([])
    } finally {
      setCarteiraLoading(false)
    }
  }

  // Dispositivos confiaveis (trust device)
  interface TrustedDevice {
    id: string
    label: string | null
    userAgent: string | null
    ipAddress: string | null
    createdAt: string
    lastUsedAt: string
    expiresAt: string
  }
  const [trustedDevices, setTrustedDevices] = useState<TrustedDevice[]>([])
  async function fetchTrustedDevices() {
    try {
      const data = await (trpc.user as any).listMyTrustedDevices.query()
      setTrustedDevices(data || [])
    } catch { setTrustedDevices([]) }
  }
  async function handleRevokeDevice(id: string) {
    const ok = await alerts.confirm({ title: 'Revogar este dispositivo?', text: 'O próximo login deste dispositivo exigirá novamente o código MFA.', icon: 'warning' })
    if (!ok) return
    try {
      await (trpc.user as any).revokeMyTrustedDevice.mutate({ id })
      alerts.success('Revogado', 'Dispositivo revogado com sucesso')
      fetchTrustedDevices()
    } catch (e) { alerts.error('Erro', (e as Error).message) }
  }
  async function handleRevokeAllDevices() {
    if (trustedDevices.length === 0) return
    const ok = await alerts.confirm({ title: 'Revogar todos?', text: `Os ${trustedDevices.length} dispositivos confiáveis serão removidos. Em todos eles o MFA será exigido novamente no próximo login.`, icon: 'warning' })
    if (!ok) return
    try {
      await (trpc.user as any).revokeAllMyTrustedDevices.mutate()
      alerts.success('Revogados', 'Todos os dispositivos foram revogados')
      fetchTrustedDevices()
    } catch (e) { alerts.error('Erro', (e as Error).message) }
  }

  // MFA (Two-Factor Authentication)
  const [mfaEnableModal, setMfaEnableModal] = useState(false)
  const [mfaDisableModal, setMfaDisableModal] = useState(false)
  const [mfaPassword, setMfaPassword] = useState('')
  const [mfaQrUrl, setMfaQrUrl] = useState<string | null>(null)
  const [mfaSecret, setMfaSecret] = useState<string | null>(null)
  const [mfaBackupCodes, setMfaBackupCodes] = useState<string[]>([])
  const [mfaTotpCode, setMfaTotpCode] = useState('')
  const [mfaStep, setMfaStep] = useState<'password' | 'qr' | 'verify' | 'codes'>('password')
  const [mfaLoading, setMfaLoading] = useState(false)

  const fetchProfile = async () => {
    try {
      const data = await (trpc.user as any).getMyProfile.query() as MyProfile
      setProfile(data)
      setForm({
        name: data.name ?? '',
        dataNascimento: data.dataNascimento ? data.dataNascimento.slice(0, 10) : '',
        sexo: data.sexo ?? '',
        estadoCivil: data.estadoCivil ?? '',
        nacionalidade: data.nacionalidade ?? '',
        naturalidade: data.naturalidade ?? '',
        bio: data.bio ?? '',
        telefone: data.telefone ?? '',
        celular: data.celular ?? '',
        whatsapp: data.whatsapp ?? '',
        ramal: data.ramal ?? '',
        cep: data.cep ?? '',
        logradouro: data.logradouro ?? '',
        numero: data.numero ?? '',
        complemento: data.complemento ?? '',
        bairro: data.bairro ?? '',
        cidade: data.cidade ?? '',
        uf: data.uf ?? '',
        pais: data.pais ?? 'Brasil',
        siteUrl: data.siteUrl ?? '',
        linkedinUrl: data.linkedinUrl ?? '',
        githubUrl: data.githubUrl ?? '',
        instagramUrl: data.instagramUrl ?? '',
        facebookUrl: data.facebookUrl ?? '',
      })
    } catch (e) {
      alerts.error('Erro', 'Não foi possível carregar seu perfil')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchProfile(); fetchTrustedDevices(); fetchCarteira() }, [])

  function formatDocumento(doc: string): string {
    const d = (doc || '').replace(/\D/g, '')
    if (d.length === 14) return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5')
    if (d.length === 11) return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')
    return doc
  }

  const carteiraFiltrada = (() => {
    const q = carteiraSearch.trim().toLowerCase()
    return carteira.filter(c => {
      if (carteiraFiltroRole === 'RESP' && !c.areas.some(a => a.role === 'Responsável')) return false
      if (carteiraFiltroRole === 'SUBST' && !c.areas.some(a => a.role === 'Substituto(a)')) return false
      if (q) {
        const docDigits = c.documento.replace(/\D/g, '')
        if (!c.razaoSocial.toLowerCase().includes(q) && !docDigits.includes(q.replace(/\D/g, ''))) return false
      }
      return true
    })
  })()

  const carteiraStats = (() => {
    let resp = 0, subst = 0
    for (const c of carteira) {
      if (c.areas.some(a => a.role === 'Responsável')) resp++
      if (c.areas.some(a => a.role === 'Substituto(a)')) subst++
    }
    return { total: carteira.length, resp, subst }
  })()

  async function handleSaveProfile() {
    if (!form.name.trim()) {
      alerts.error('Validação', 'O nome não pode ficar em branco')
      return
    }
    setSavingProfile(true)
    try {
      await (trpc.user as any).updateMyProfile.mutate({
        name: form.name.trim(),
        // strings vazias viram null no backend pra limpar o campo
        dataNascimento: form.dataNascimento || null,
        sexo: form.sexo || null,
        estadoCivil: form.estadoCivil || null,
        nacionalidade: form.nacionalidade || null,
        naturalidade: form.naturalidade || null,
        bio: form.bio || null,
        telefone: form.telefone || null,
        celular: form.celular || null,
        whatsapp: form.whatsapp || null,
        ramal: form.ramal || null,
        cep: form.cep || null,
        logradouro: form.logradouro || null,
        numero: form.numero || null,
        complemento: form.complemento || null,
        bairro: form.bairro || null,
        cidade: form.cidade || null,
        uf: form.uf || null,
        pais: form.pais || null,
        siteUrl: form.siteUrl || null,
        linkedinUrl: form.linkedinUrl || null,
        githubUrl: form.githubUrl || null,
        instagramUrl: form.instagramUrl || null,
        facebookUrl: form.facebookUrl || null,
      })
      alerts.success('Salvo', 'Seus dados foram atualizados')
      fetchProfile()
      refreshCurrentUserProfile()
    } catch (e) {
      alerts.error('Erro', (e as Error).message)
    } finally { setSavingProfile(false) }
  }

  async function handleChangePassword() {
    if (pwdNew !== pwdConfirm) {
      alerts.error('Validação', 'A confirmação não coincide com a nova senha')
      return
    }
    if (pwdNew.length < 8) {
      alerts.error('Validação', 'A nova senha deve ter no mínimo 8 caracteres')
      return
    }
    setSavingPwd(true)
    try {
      await (trpc.user as any).changeMyPassword.mutate({
        currentPassword: pwdCurrent,
        newPassword: pwdNew,
      })
      setPwdModal(false)
      setPwdCurrent('')
      setPwdNew('')
      setPwdConfirm('')
      alerts.success('Senha alterada', 'Sua senha foi alterada com sucesso')
    } catch (e) {
      alerts.error('Erro', (e as Error).message)
    } finally { setSavingPwd(false) }
  }

  // ── Assinatura de email ──

  async function fetchSignatureData() {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data = await (trpc.user as any).getMySignatureData.query() as SignatureData
      setSignatureData(data)
      // Carrega o template da empresa do usuário (master pode editar em /admin/assinatura-template)
      // Via REST direto (tRPC POST trava no Chrome pra emailSig.*)
      if (data.empresa?.id) {
        try {
          const res = await fetch(`${getApiUrl()}/api/email-template/${data.empresa.id}`, { credentials: 'include' })
          if (res.ok) {
            const tpl = await res.json() as SignatureTemplate
            setSignatureTemplate(tpl)
          }
        } catch { /* usa defaults */ }
      }
    } catch (e) {
      alerts.error('Erro', (e as Error).message || 'Falha ao carregar dados da assinatura')
    }
  }

  async function handleSignaturePhotoUpload(file: File) {
    if (file.size > 2 * 1024 * 1024) {
      alerts.error('Arquivo muito grande', 'A foto deve ter no máximo 2MB.')
      return
    }
    const allowed = ['image/png', 'image/jpeg', 'image/webp']
    if (!allowed.includes(file.type)) {
      alerts.error('Tipo inválido', 'Use PNG, JPG ou WebP.')
      return
    }
    setUploadingSignature(true)
    try {
      // 1) Upload bruto
      const formData = new window.FormData()
      formData.append('file', file)
      const res = await fetch(`${getApiUrl()}/api/upload`, { method: 'POST', body: formData, credentials: 'include' })
      if (!res.ok) throw new Error('Falha ao enviar')
      const data = await res.json()

      // 2) Composição server-side via REST (tRPC trava no Chrome pra essa rota).
      const compRes = await fetch(`${getApiUrl()}/api/email-signature-photo/compose`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ originalUrl: data.url }),
        credentials: 'include',
      })
      if (!compRes.ok) throw new Error(`HTTP ${compRes.status}`)

      await fetchSignatureData()
      alerts.success('Foto salva', 'A foto da assinatura foi atualizada e composta.')
    } catch (e) {
      alerts.error('Erro', (e as Error).message)
    } finally {
      setUploadingSignature(false)
    }
  }

  async function removeSignaturePhoto() {
    const ok = await alerts.confirm({ title: 'Remover foto da assinatura?', text: 'A foto será apagada — você pode subir outra depois.', confirmText: 'Remover' })
    if (!ok) return
    setUploadingSignature(true)
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (trpc.user as any).updateMyProfile.mutate({ signatureImageUrl: null })
      await fetchSignatureData()
    } catch (e) {
      alerts.error('Erro', (e as Error).message)
    } finally {
      setUploadingSignature(false)
    }
  }

  const signatureIframeRef = useRef<HTMLIFrameElement>(null)
  const [downloading, setDownloading] = useState<'png' | 'jpeg' | null>(null)

  /**
   * Baixa a assinatura como imagem. Renderiza o body do iframe (same-origin,
   * srcDoc) via html-to-image e dispara download. PNG mantém transparência,
   * JPG é mais leve mas força fundo.
   */
  async function downloadSignature(format: 'png' | 'jpeg') {
    if (!signatureData) return
    const iframe = signatureIframeRef.current
    if (!iframe?.contentDocument) {
      alerts.error('Erro', 'Aguarde o preview carregar.')
      return
    }
    setDownloading(format)
    try {
      // Espera todas as imagens do iframe carregarem antes de capturar
      const imgs = Array.from(iframe.contentDocument.images)
      await Promise.all(imgs.map(img =>
        img.complete ? Promise.resolve() : new Promise(res => { img.onload = res; img.onerror = res }),
      ))
      // Mede o conteúdo real da assinatura pra cortar o whitespace ao redor
      const table = iframe.contentDocument.querySelector('table')
      const target = (table as HTMLElement) ?? iframe.contentDocument.body
      const { toPng, toJpeg } = await import('html-to-image')
      const opts = { pixelRatio: 2, cacheBust: true, backgroundColor: format === 'jpeg' ? '#ffffff' : undefined }
      const dataUrl = format === 'png'
        ? await toPng(target, opts)
        : await toJpeg(target, { ...opts, quality: 0.95 })
      const link = document.createElement('a')
      link.download = `assinatura-${signatureData.name.replace(/\s+/g, '_').toLowerCase()}.${format === 'jpeg' ? 'jpg' : 'png'}`
      link.href = dataUrl
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
    } catch (e) {
      alerts.error('Erro', 'Não consegui gerar a imagem. ' + (e as Error).message)
    } finally {
      setDownloading(null)
    }
  }

  // Carrega dados da assinatura quando entra na aba
  useEffect(() => {
    if (activeTab === 'assinatura' && !signatureData) {
      fetchSignatureData()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab])

  // ── MFA / 2FA ──

  function abrirEnableMFA() {
    setMfaPassword('')
    setMfaQrUrl(null)
    setMfaSecret(null)
    setMfaBackupCodes([])
    setMfaTotpCode('')
    setMfaStep('password')
    setMfaEnableModal(true)
  }

  async function handleEnableMFAStep1() {
    if (!mfaPassword) { alerts.error('Validação', 'Informe sua senha'); return }
    setMfaLoading(true)
    try {
      const res = await authClient.twoFactor.enable({ password: mfaPassword })
      // Better Auth retorna { totpURI, backupCodes } (ou data.totpURI conforme versao)
      const data = (res as any).data ?? res
      const totpUri = data.totpURI as string | undefined
      const codes = (data.backupCodes as string[] | undefined) ?? []
      if (!totpUri) throw new Error('Falha ao gerar QR Code do MFA')
      // Extrai secret do URI (otpauth://totp/...?secret=XXXX&...)
      const secretMatch = totpUri.match(/[?&]secret=([^&]+)/i)
      setMfaSecret(secretMatch ? decodeURIComponent(secretMatch[1]!) : null)
      setMfaQrUrl(totpUri)
      setMfaBackupCodes(codes)
      setMfaStep('qr')
    } catch (e) {
      alerts.error('Erro', (e as Error).message || 'Senha incorreta ou falha ao habilitar')
    } finally { setMfaLoading(false) }
  }

  async function handleVerifyMFASetup() {
    if (!/^\d{6}$/.test(mfaTotpCode)) { alerts.error('Validação', 'Informe o código de 6 dígitos do app'); return }
    setMfaLoading(true)
    try {
      await authClient.twoFactor.verifyTotp({ code: mfaTotpCode })
      setMfaStep('codes')
      alerts.success('MFA ativado', 'Autenticação em dois fatores habilitada com sucesso!')
      fetchProfile()
      fetchTrustedDevices()
    } catch (e) {
      alerts.error('Código inválido', 'Confira o código atual no seu app autenticador e tente novamente.')
      console.error(e)
    } finally { setMfaLoading(false) }
  }

  async function copiarBackupCodes() {
    try {
      await navigator.clipboard.writeText(mfaBackupCodes.join('\n'))
      alerts.success('Copiado', 'Códigos de backup copiados para a área de transferência')
    } catch { alerts.error('Erro', 'Falha ao copiar') }
  }

  function abrirDisableMFA() {
    setMfaPassword('')
    setMfaDisableModal(true)
  }

  async function handleDisableMFA() {
    if (!mfaPassword) { alerts.error('Validação', 'Informe sua senha'); return }
    setMfaLoading(true)
    try {
      await authClient.twoFactor.disable({ password: mfaPassword })
      setMfaDisableModal(false)
      setMfaPassword('')
      alerts.success('MFA desativado', 'Autenticação em dois fatores foi desabilitada.')
      fetchProfile()
      fetchTrustedDevices()
    } catch (e) {
      alerts.error('Erro', (e as Error).message || 'Senha incorreta')
    } finally { setMfaLoading(false) }
  }

  async function handleAvatarUpload(file: File) {
    setUploadingAvatar(true)
    try {
      const apiUrl = getApiUrl()
      const formData = new FormData()
      formData.append('file', file)
      const res = await fetch(`${apiUrl}/api/upload`, { method: 'POST', body: formData, credentials: 'include' })
      if (!res.ok) throw new Error(`Falha no upload (${res.status})`)
      const data = await res.json()
      const fileUrl = data.url && data.url.startsWith('http') ? data.url : `${apiUrl}/api/upload/${data.filename}`
      await (trpc.user as any).updateMyProfile.mutate({ image: fileUrl })
      alerts.success('Avatar atualizado', 'Sua foto de perfil foi atualizada')
      fetchProfile()
      refreshCurrentUserProfile() // dispara atualizacao em todos lugares (header global, etc)
    } catch (e) {
      alerts.error('Erro', (e as Error).message)
    } finally { setUploadingAvatar(false) }
  }

  async function handleCoverUpload(file: File) {
    setUploadingCover(true)
    try {
      const apiUrl = getApiUrl()
      const formData = new FormData()
      formData.append('file', file)
      const res = await fetch(`${apiUrl}/api/upload`, { method: 'POST', body: formData, credentials: 'include' })
      if (!res.ok) throw new Error(`Falha no upload (${res.status})`)
      const data = await res.json()
      const fileUrl = data.url && data.url.startsWith('http') ? data.url : `${apiUrl}/api/upload/${data.filename}`
      await (trpc.user as any).updateMyProfile.mutate({ coverImage: fileUrl })
      alerts.success('Capa atualizada', 'A imagem de fundo do seu perfil foi atualizada')
      fetchProfile()
    } catch (e) {
      alerts.error('Erro', (e as Error).message)
    } finally { setUploadingCover(false) }
  }

  async function handleCoverRemove() {
    const ok = await alerts.confirm({ title: 'Remover capa?', text: 'A imagem de fundo personalizada será removida e voltará ao padrão.', icon: 'warning' })
    if (!ok) return
    setUploadingCover(true)
    try {
      await (trpc.user as any).updateMyProfile.mutate({ coverImage: null })
      alerts.success('Capa removida', 'A imagem de fundo foi removida')
      fetchProfile()
    } catch (e) {
      alerts.error('Erro', (e as Error).message)
    } finally { setUploadingCover(false) }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }
  if (!profile) {
    return <div className="py-20 text-center text-muted-foreground">Perfil não encontrado</div>
  }

  const initials = (profile.name || '?').split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase()

  return (
    <div className="space-y-0 pb-12">
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-0">
      {/* Banner de fundo + Avatar/Nome + Tabs — wrapper unico (mesmo padrao /orcamentos/[id]) */}
      <div
        className="-mx-4 sm:-mx-6 -mt-4 sm:-mt-6 relative overflow-hidden group/cover"
        style={{
          background: profile.coverImage
            ? undefined
            : `linear-gradient(135deg, ${MODULE_COLOR} 0%, color-mix(in srgb, ${MODULE_COLOR} 87%, transparent) 60%, #4a8db5 100%)`,
        }}
      >
        {/* Imagem de fundo personalizada — em tamanho natural; tile (repeat) quando menor que o wrapper */}
        {profile.coverImage && (
          <div
            aria-label="Capa do perfil"
            className="absolute inset-0"
            style={{
              backgroundImage: `url('${resolveAssetUrl(profile.coverImage)}')`,
              backgroundRepeat: 'repeat',
              backgroundSize: 'auto',
              backgroundPosition: 'top left',
              opacity: 0.2,
            }}
          />
        )}
        {/* Overlay azul em gradiente: 0% na esquerda → 80% na direita (imagem revela-se a esquerda) */}
        {profile.coverImage && (
          <div
            className="absolute inset-0"
            style={{ backgroundImage: 'linear-gradient(to right, rgba(94, 163, 203, 0) 0%, rgba(94, 163, 203, 0.8) 100%)' }}
          />
        )}
        {/* Decoração: blobs sutis (apenas no modo gradiente padrao) */}
        {!profile.coverImage && (
          <div className="absolute inset-0 opacity-10" style={{
            backgroundImage: 'radial-gradient(circle at 20% 30%, white 1px, transparent 1px), radial-gradient(circle at 80% 70%, white 1px, transparent 1px)',
            backgroundSize: '40px 40px, 60px 60px',
          }} />
        )}

        {/* Botoes para gerenciar a capa — z-20 para ficar acima do conteudo (z-10) e das tabs */}
        <div className="absolute bottom-3 right-3 z-20 flex items-center gap-1.5 opacity-0 pointer-events-none group-hover/cover:opacity-100 group-hover/cover:pointer-events-auto transition-opacity">
          <button
            type="button"
            onClick={() => coverInputRef.current?.click()}
            disabled={uploadingCover}
            className="inline-flex items-center gap-1.5 rounded-md bg-white/90 hover:bg-white text-foreground px-2.5 py-1.5 text-xs font-medium shadow-sm backdrop-blur transition-colors disabled:opacity-60"
            title={profile.coverImage ? 'Trocar imagem de fundo' : 'Personalizar capa'}
          >
            {uploadingCover ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ImageIcon className="h-3.5 w-3.5" />}
            <span className="hidden sm:inline">{profile.coverImage ? 'Trocar capa' : 'Personalizar capa'}</span>
          </button>
          {profile.coverImage && (
            <button
              type="button"
              onClick={handleCoverRemove}
              disabled={uploadingCover}
              className="inline-flex items-center gap-1.5 rounded-md bg-white/90 hover:bg-white text-rose-600 px-2.5 py-1.5 text-xs font-medium shadow-sm backdrop-blur transition-colors disabled:opacity-60"
              title="Remover capa"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
          <input
            ref={coverInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={async e => {
              const file = e.target.files?.[0]
              if (file) await handleCoverUpload(file)
              e.target.value = ''
            }}
          />
        </div>

        <div className="relative z-10 px-4 sm:px-6 pt-4 sm:pt-6 pb-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex items-start gap-4">
              {/* Avatar com overlay de edicao — mesmo padrao /orcamentos/[id] (88x88, ring) */}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadingAvatar}
                className="relative shrink-0 group"
                title="Clique para alterar"
              >
                <div
                  className="flex h-[88px] w-[88px] items-center justify-center rounded-full bg-white dark:bg-gray-800 overflow-hidden shadow-lg"
                  style={{ boxShadow: 'inset 0 0 0 3px #d4d4d4' }}
                >
                  {profile.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={resolveAssetUrl(profile.image)} alt={profile.name} className="h-full w-full object-cover" />
                  ) : (
                    <span className="text-2xl font-bold" style={{ color: MODULE_COLOR }}>{initials}</span>
                  )}
                </div>
                <div className="absolute bottom-0 right-0 h-7 w-7 rounded-full flex items-center justify-center shadow-lg border-2 border-white group-hover:scale-110 transition-transform" style={{ backgroundColor: MODULE_COLOR }}>
                  {uploadingAvatar ? (
                    <Loader2 className="h-3.5 w-3.5 text-white animate-spin" />
                  ) : (
                    <Camera className="h-3.5 w-3.5 text-white" />
                  )}
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={async e => {
                    const file = e.target.files?.[0]
                    if (file) await handleAvatarUpload(file)
                    e.target.value = ''
                  }}
                />
              </button>

              {/* Nome + Cargo + Badges — mesmo padrao /orcamentos/[id] (text-xl semibold + meta muted + badge row) */}
              <div className="min-w-0">
                <h1 className="text-xl font-semibold">{profile.name}</h1>
                <p className="text-sm text-muted-foreground mt-0.5">
                  {profile.cargo?.name || (USER_ROLE_LABELS[profile.role as keyof typeof USER_ROLE_LABELS] ?? 'Não informado')}
                </p>
                <div className="flex flex-wrap gap-2 mt-2.5">
                  {profile.area?.name && (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 text-slate-700 dark:bg-slate-800/60 dark:text-slate-300 px-3 py-1 text-xs font-medium uppercase border border-slate-200 dark:border-slate-700">
                      <MapPin className="h-3 w-3" /> {profile.area.name}
                    </span>
                  )}
                  {profile.empresa && (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 text-slate-700 dark:bg-slate-800/60 dark:text-slate-300 px-3 py-1 text-xs font-medium uppercase border border-slate-200 dark:border-slate-700">
                      <Building2 className="h-3 w-3" /> {profile.empresa.nomeFantasia || profile.empresa.razaoSocial}
                    </span>
                  )}
                  {profile.isMaster && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-500 text-white px-3 py-1 text-xs font-bold uppercase shadow-md">
                      <Shield className="h-3 w-3" /> Master
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Tabs em pills — mesmo padrão de /orcamentos/[id] (cor do módulo: blue/sky) */}
        <div className="relative z-10 px-4 sm:px-6 pb-2 overflow-x-auto flex justify-center">
          <SlidingTabsList activeValue={activeTab} className="min-w-max !shadow-sm !border !border-b !border-white/80 dark:!border-white/25 gap-1.5 !p-1 !bg-white/40 dark:!bg-black/30 !rounded-full backdrop-blur-sm w-fit">
            <TabsTrigger value="overview" className="!relative !z-10 !rounded-full !border-b-0 !px-4 !py-1.5 !text-xs !font-semibold !text-foreground/70 hover:!text-foreground transition-colors data-[state=active]:!bg-transparent data-[state=active]:!shadow-none data-[state=active]:!text-sky-600 dark:data-[state=active]:!bg-transparent dark:data-[state=active]:!text-sky-400 gap-1.5">
              <UserIcon className="h-3.5 w-3.5" /> Visão Geral
            </TabsTrigger>
            <TabsTrigger value="dados" className="!relative !z-10 !rounded-full !border-b-0 !px-4 !py-1.5 !text-xs !font-semibold !text-foreground/70 hover:!text-foreground transition-colors data-[state=active]:!bg-transparent data-[state=active]:!shadow-none data-[state=active]:!text-sky-600 dark:data-[state=active]:!bg-transparent dark:data-[state=active]:!text-sky-400 gap-1.5">
              <Pencil className="h-3.5 w-3.5" /> Meus Dados
            </TabsTrigger>
            <TabsTrigger value="carteira" className="!relative !z-10 !rounded-full !border-b-0 !px-4 !py-1.5 !text-xs !font-semibold !text-foreground/70 hover:!text-foreground transition-colors data-[state=active]:!bg-transparent data-[state=active]:!shadow-none data-[state=active]:!text-sky-600 dark:data-[state=active]:!bg-transparent dark:data-[state=active]:!text-sky-400 gap-1.5">
              <Users className="h-3.5 w-3.5" /> Carteira
              {!carteiraLoading && carteira.length > 0 && (
                <span className="ml-1 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-sky-500/15 text-sky-700 dark:text-sky-300 text-[10px] font-bold tabular-nums">
                  {carteira.length}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="assinatura" className="!relative !z-10 !rounded-full !border-b-0 !px-4 !py-1.5 !text-xs !font-semibold !text-foreground/70 hover:!text-foreground transition-colors data-[state=active]:!bg-transparent data-[state=active]:!shadow-none data-[state=active]:!text-sky-600 dark:data-[state=active]:!bg-transparent dark:data-[state=active]:!text-sky-400 gap-1.5">
              <Mail className="h-3.5 w-3.5" /> Assinatura
            </TabsTrigger>
            <TabsTrigger value="seguranca" className="!relative !z-10 !rounded-full !border-b-0 !px-4 !py-1.5 !text-xs !font-semibold !text-foreground/70 hover:!text-foreground transition-colors data-[state=active]:!bg-transparent data-[state=active]:!shadow-none data-[state=active]:!text-sky-600 dark:data-[state=active]:!bg-transparent dark:data-[state=active]:!text-sky-400 gap-1.5">
              <Shield className="h-3.5 w-3.5" /> Segurança
            </TabsTrigger>
          </SlidingTabsList>
        </div>
      </div>
      {/* /wrapper banner + tabs */}

        {/* TAB: Visão Geral */}
        <TabsContent value="overview" className="space-y-6 mt-6">
          <div className="grid gap-6 lg:grid-cols-12">
            {/* Coluna esquerda: Informações */}
            <div className="lg:col-span-5 space-y-6">
              <Card>
                <CardHeader className="border-b border-border/60 px-5 py-3 flex flex-row items-center gap-2">
                  <UserIcon className="h-4 w-4" style={{ color: MODULE_COLOR }} />
                  <h3 className="text-sm font-semibold flex-1">Informações</h3>
                </CardHeader>
                <CardContent className="p-0">
                  <ProfileRow icon={<UserIcon className="h-3.5 w-3.5" />} label="Nome" value={profile.name} />
                  <ProfileRow icon={<Mail className="h-3.5 w-3.5" />} label="E-mail" value={profile.email} />
                  <ProfileRow icon={<Phone className="h-3.5 w-3.5" />} label="Telefone" value={profile.telefone} />
                  <ProfileRow icon={<Briefcase className="h-3.5 w-3.5" />} label="Cargo" value={profile.cargo?.name} />
                  <ProfileRow icon={<MapPin className="h-3.5 w-3.5" />} label="Área" value={profile.area?.name} />
                  <ProfileRow icon={<Building2 className="h-3.5 w-3.5" />} label="Empresa" value={profile.empresa?.razaoSocial} />
                  <ProfileRow icon={<Calendar className="h-3.5 w-3.5" />} label="Admissão" value={formatDate(profile.dataAdmissao)} last />
                </CardContent>
              </Card>
            </div>

            {/* Coluna direita: Status + Último Acesso */}
            <div className="lg:col-span-7 space-y-6">
              <Card>
                <CardHeader className="border-b border-border/60 px-5 py-3 flex flex-row items-center gap-2">
                  <Globe className="h-4 w-4" style={{ color: MODULE_COLOR }} />
                  <h3 className="text-sm font-semibold flex-1">Último Acesso</h3>
                </CardHeader>
                <CardContent className="p-5">
                  {profile.lastLogin ? (
                    <div className="space-y-3">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center shrink-0">
                          <Clock className="h-5 w-5 text-emerald-600" />
                        </div>
                        <div>
                          <p className="text-sm font-semibold">{formatDateTime(profile.lastLogin.createdAt)}</p>
                          <p className="text-xs text-muted-foreground">
                            {browserFromUA(profile.lastLogin.userAgent)}
                            {profile.lastLogin.ipAddress && (<> · IP <span className="font-mono">{profile.lastLogin.ipAddress}</span></>)}
                          </p>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">Nenhum acesso registrado.</p>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="border-b border-border/60 px-5 py-3 flex flex-row items-center gap-2">
                  <Shield className="h-4 w-4" style={{ color: MODULE_COLOR }} />
                  <h3 className="text-sm font-semibold flex-1">Segurança</h3>
                </CardHeader>
                <CardContent className="p-5 space-y-3">
                  <p className="text-sm text-muted-foreground">Mantenha sua senha forte e única para garantir a segurança da sua conta.</p>
                  <Button
                    size="sm"
                    style={{ backgroundColor: MODULE_COLOR }}
                    className="text-white gap-1.5"
                    onClick={() => setPwdModal(true)}
                  >
                    <Key className="h-4 w-4" /> Alterar senha
                  </Button>
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        {/* TAB: Meus Dados — Pessoal · Contato · Endereço · Sociais (grid 2 colunas) */}
        <TabsContent value="dados" className="mt-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* CARD 1: PESSOAL */}
            <Card>
              <CardHeader className="border-b border-border/60 px-5 py-3 flex flex-row items-center gap-2">
                <UserIcon className="h-4 w-4" style={{ color: MODULE_COLOR }} />
                <h3 className="text-sm font-semibold flex-1">Informações Pessoais</h3>
              </CardHeader>
              <CardContent className="p-5 space-y-3">
                <div className="grid grid-cols-12 gap-3">
                  <div className="col-span-12 sm:col-span-8 space-y-1.5">
                    <Label className="text-[13px] font-semibold">Nome <span className="text-rose-500">*</span></Label>
                    <Input value={form.name} onChange={e => setField('name', e.target.value)} className="h-9 text-sm" placeholder="Seu nome completo" />
                  </div>
                  <div className="col-span-12 sm:col-span-4 space-y-1.5">
                    <Label className="text-[13px] font-semibold">Data de nascimento</Label>
                    <Input type="date" value={form.dataNascimento} onChange={e => setField('dataNascimento', e.target.value)} className="h-9 text-sm" />
                  </div>

                  <div className="col-span-12 space-y-1.5">
                    <Label className="text-[13px] font-semibold">E-mail</Label>
                    <Input value={profile.email} disabled className="h-9 text-sm bg-muted/40" />
                    <p className="text-[10px] text-muted-foreground">Usado para login. Solicite a um administrador para alterar.</p>
                  </div>

                  <div className="col-span-12 sm:col-span-4 space-y-1.5">
                    <Label className="text-[13px] font-semibold">Sexo</Label>
                    <Select value={form.sexo || '__none__'} onValueChange={v => setField('sexo', v === '__none__' ? '' : v)}>
                      <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Selecione" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">Não informado</SelectItem>
                        <SelectItem value="MASCULINO">Masculino</SelectItem>
                        <SelectItem value="FEMININO">Feminino</SelectItem>
                        <SelectItem value="OUTRO">Outro</SelectItem>
                        <SelectItem value="PREFIRO_NAO_DIZER">Prefiro não dizer</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="col-span-12 sm:col-span-4 space-y-1.5">
                    <Label className="text-[13px] font-semibold">Estado civil</Label>
                    <Select value={form.estadoCivil || '__none__'} onValueChange={v => setField('estadoCivil', v === '__none__' ? '' : v)}>
                      <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Selecione" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">Não informado</SelectItem>
                        <SelectItem value="SOLTEIRO">Solteiro(a)</SelectItem>
                        <SelectItem value="CASADO">Casado(a)</SelectItem>
                        <SelectItem value="DIVORCIADO">Divorciado(a)</SelectItem>
                        <SelectItem value="VIUVO">Viúvo(a)</SelectItem>
                        <SelectItem value="UNIAO_ESTAVEL">União estável</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="col-span-12 sm:col-span-4 space-y-1.5">
                    <Label className="text-[13px] font-semibold">Nacionalidade</Label>
                    <Input value={form.nacionalidade} onChange={e => setField('nacionalidade', e.target.value)} className="h-9 text-sm" placeholder="Brasileira" />
                  </div>

                  <div className="col-span-12 sm:col-span-6 space-y-1.5">
                    <Label className="text-[13px] font-semibold">Naturalidade</Label>
                    <Input value={form.naturalidade} onChange={e => setField('naturalidade', e.target.value)} className="h-9 text-sm" placeholder="Cidade onde nasceu" />
                  </div>

                  <div className="col-span-12 space-y-1.5">
                    <Label className="text-[13px] font-semibold">Bio</Label>
                    <textarea
                      value={form.bio}
                      onChange={e => setField('bio', e.target.value.slice(0, 500))}
                      rows={3}
                      placeholder="Conte um pouco sobre você — área de atuação, interesses..."
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-y"
                    />
                    <p className="text-[10px] text-muted-foreground text-right">{form.bio.length}/500</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* CARD 2: CONTATO */}
            <Card>
              <CardHeader className="border-b border-border/60 px-5 py-3 flex flex-row items-center gap-2">
                <Phone className="h-4 w-4" style={{ color: MODULE_COLOR }} />
                <h3 className="text-sm font-semibold flex-1">Contato</h3>
              </CardHeader>
              <CardContent className="p-5">
                <div className="grid grid-cols-12 gap-3">
                  <div className="col-span-12 sm:col-span-6 space-y-1.5">
                    <Label className="text-[13px] font-semibold">Telefone</Label>
                    <Input value={form.telefone} onChange={e => setField('telefone', e.target.value)} className="h-9 text-sm" placeholder="(00) 0000-0000" />
                  </div>
                  <div className="col-span-12 sm:col-span-6 space-y-1.5">
                    <Label className="text-[13px] font-semibold">Celular</Label>
                    <Input value={form.celular} onChange={e => setField('celular', e.target.value)} className="h-9 text-sm" placeholder="(00) 00000-0000" />
                  </div>
                  <div className="col-span-12 sm:col-span-6 space-y-1.5">
                    <Label className="text-[13px] font-semibold flex items-center gap-1.5">
                      <MessageCircle className="h-3.5 w-3.5 text-emerald-600" /> WhatsApp
                    </Label>
                    <Input value={form.whatsapp} onChange={e => setField('whatsapp', e.target.value)} className="h-9 text-sm" placeholder="(00) 00000-0000" />
                  </div>
                  <div className="col-span-12 sm:col-span-6 space-y-1.5">
                    <Label className="text-[13px] font-semibold">Ramal interno</Label>
                    <Input value={form.ramal} onChange={e => setField('ramal', e.target.value)} className="h-9 text-sm" placeholder="1234" />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* CARD 3: ENDEREÇO */}
            <Card>
              <CardHeader className="border-b border-border/60 px-5 py-3 flex flex-row items-center gap-2">
                <MapPin className="h-4 w-4" style={{ color: MODULE_COLOR }} />
                <h3 className="text-sm font-semibold flex-1">Endereço</h3>
              </CardHeader>
              <CardContent className="p-5">
                <div className="grid grid-cols-12 gap-3">
                  <div className="col-span-12 sm:col-span-3 space-y-1.5">
                    <Label className="text-[13px] font-semibold">CEP</Label>
                    <Input value={form.cep} onChange={e => setField('cep', e.target.value)} className="h-9 text-sm" placeholder="00000-000" />
                  </div>
                  <div className="col-span-12 sm:col-span-7 space-y-1.5">
                    <Label className="text-[13px] font-semibold">Logradouro</Label>
                    <Input value={form.logradouro} onChange={e => setField('logradouro', e.target.value)} className="h-9 text-sm" placeholder="Rua / Avenida" />
                  </div>
                  <div className="col-span-12 sm:col-span-2 space-y-1.5">
                    <Label className="text-[13px] font-semibold">Número</Label>
                    <Input value={form.numero} onChange={e => setField('numero', e.target.value)} className="h-9 text-sm" placeholder="123" />
                  </div>
                  <div className="col-span-12 sm:col-span-6 space-y-1.5">
                    <Label className="text-[13px] font-semibold">Complemento</Label>
                    <Input value={form.complemento} onChange={e => setField('complemento', e.target.value)} className="h-9 text-sm" placeholder="Apto / Sala" />
                  </div>
                  <div className="col-span-12 sm:col-span-6 space-y-1.5">
                    <Label className="text-[13px] font-semibold">Bairro</Label>
                    <Input value={form.bairro} onChange={e => setField('bairro', e.target.value)} className="h-9 text-sm" />
                  </div>
                  <div className="col-span-12 sm:col-span-6 space-y-1.5">
                    <Label className="text-[13px] font-semibold">Cidade</Label>
                    <Input value={form.cidade} onChange={e => setField('cidade', e.target.value)} className="h-9 text-sm" />
                  </div>
                  <div className="col-span-6 sm:col-span-2 space-y-1.5">
                    <Label className="text-[13px] font-semibold">UF</Label>
                    <Input value={form.uf} onChange={e => setField('uf', e.target.value.toUpperCase().slice(0, 2))} className="h-9 text-sm" maxLength={2} placeholder="ES" />
                  </div>
                  <div className="col-span-6 sm:col-span-4 space-y-1.5">
                    <Label className="text-[13px] font-semibold">País</Label>
                    <Input value={form.pais} onChange={e => setField('pais', e.target.value)} className="h-9 text-sm" />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* CARD 4: SOCIAIS */}
            <Card>
              <CardHeader className="border-b border-border/60 px-5 py-3 flex flex-row items-center gap-2">
                <Globe className="h-4 w-4" style={{ color: MODULE_COLOR }} />
                <h3 className="text-sm font-semibold flex-1">Redes sociais e links</h3>
              </CardHeader>
              <CardContent className="p-5">
                <div className="grid grid-cols-12 gap-3">
                  <div className="col-span-12 sm:col-span-6 space-y-1.5">
                    <Label className="text-[13px] font-semibold flex items-center gap-1.5">
                      <Linkedin className="h-3.5 w-3.5 text-[#0a66c2]" /> LinkedIn
                    </Label>
                    <Input value={form.linkedinUrl} onChange={e => setField('linkedinUrl', e.target.value)} className="h-9 text-sm" placeholder="https://linkedin.com/in/seu-perfil" />
                  </div>
                  <div className="col-span-12 sm:col-span-6 space-y-1.5">
                    <Label className="text-[13px] font-semibold flex items-center gap-1.5">
                      <Github className="h-3.5 w-3.5" /> GitHub
                    </Label>
                    <Input value={form.githubUrl} onChange={e => setField('githubUrl', e.target.value)} className="h-9 text-sm" placeholder="https://github.com/usuario" />
                  </div>
                  <div className="col-span-12 sm:col-span-6 space-y-1.5">
                    <Label className="text-[13px] font-semibold flex items-center gap-1.5">
                      <Instagram className="h-3.5 w-3.5 text-[#e1306c]" /> Instagram
                    </Label>
                    <Input value={form.instagramUrl} onChange={e => setField('instagramUrl', e.target.value)} className="h-9 text-sm" placeholder="https://instagram.com/usuario" />
                  </div>
                  <div className="col-span-12 sm:col-span-6 space-y-1.5">
                    <Label className="text-[13px] font-semibold flex items-center gap-1.5">
                      <Facebook className="h-3.5 w-3.5 text-[#1877f2]" /> Facebook
                    </Label>
                    <Input value={form.facebookUrl} onChange={e => setField('facebookUrl', e.target.value)} className="h-9 text-sm" placeholder="https://facebook.com/usuario" />
                  </div>
                  <div className="col-span-12 space-y-1.5">
                    <Label className="text-[13px] font-semibold flex items-center gap-1.5">
                      <LinkIcon className="h-3.5 w-3.5 text-muted-foreground" /> Site pessoal / portfólio
                    </Label>
                    <Input value={form.siteUrl} onChange={e => setField('siteUrl', e.target.value)} className="h-9 text-sm" placeholder="https://meusite.com" />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Botão salvar — full-width no grid, sticky no bottom */}
            <div className="lg:col-span-2 flex justify-end sticky bottom-4 z-10">
              <Button
                size="sm"
                style={{ backgroundColor: MODULE_COLOR }}
                className="text-white gap-1.5 shadow-lg"
                onClick={handleSaveProfile}
                disabled={savingProfile}
              >
                {savingProfile ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Salvar Alterações
              </Button>
            </div>
          </div>
        </TabsContent>

        {/* TAB: Carteira */}
        <TabsContent value="carteira" className="mt-6 space-y-4">
          {/* Stats compactos */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <Card className="p-3">
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Total</div>
              <div className="mt-0.5 text-2xl font-semibold tabular-nums">{carteiraStats.total}</div>
              <div className="text-[11px] text-muted-foreground">cliente{carteiraStats.total === 1 ? '' : 's'} na carteira</div>
            </Card>
            <Card className="p-3 border-l-2 border-sky-300">
              <div className="text-[11px] uppercase tracking-wide text-sky-700">Responsável</div>
              <div className="mt-0.5 text-2xl font-semibold tabular-nums">{carteiraStats.resp}</div>
              <div className="text-[11px] text-muted-foreground">titular em pelo menos 1 área</div>
            </Card>
            <Card className="p-3 border-l-2 border-violet-300">
              <div className="text-[11px] uppercase tracking-wide text-violet-700">Substituto</div>
              <div className="mt-0.5 text-2xl font-semibold tabular-nums">{carteiraStats.subst}</div>
              <div className="text-[11px] text-muted-foreground">cobertura em pelo menos 1 área</div>
            </Card>
          </div>

          <Card>
            <CardHeader className="border-b border-border/60 px-5 py-3 flex flex-row items-center gap-2">
              <Users className="h-4 w-4" style={{ color: MODULE_COLOR }} />
              <h3 className="text-sm font-semibold flex-1">Carteira de clientes</h3>
              <div className="flex items-center gap-2">
                {/* Filtro por role */}
                <div className="flex items-center rounded border border-border/60 bg-card overflow-hidden">
                  {(['TODOS', 'RESP', 'SUBST'] as const).map((opt) => (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => setCarteiraFiltroRole(opt)}
                      className={cn(
                        'px-2.5 py-1 text-[11px] font-medium transition-colors',
                        carteiraFiltroRole === opt
                          ? 'text-white'
                          : 'text-muted-foreground hover:text-foreground',
                      )}
                      style={carteiraFiltroRole === opt ? { backgroundColor: MODULE_COLOR } : undefined}
                    >
                      {opt === 'TODOS' ? 'Todos' : opt === 'RESP' ? 'Responsável' : 'Substituto'}
                    </button>
                  ))}
                </div>
                {/* Busca */}
                <div className="relative w-[200px]">
                  <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Buscar cliente ou CNPJ..."
                    value={carteiraSearch}
                    onChange={(e) => setCarteiraSearch(e.target.value)}
                    className="h-8 pl-8 text-xs bg-card"
                  />
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {carteiraLoading ? (
                <div className="flex items-center justify-center py-10 gap-2 text-muted-foreground text-sm">
                  <Loader2 className="h-4 w-4 animate-spin" style={{ color: MODULE_COLOR }} />
                  Carregando carteira...
                </div>
              ) : carteiraFiltrada.length === 0 ? (
                <div className="py-10 text-center text-sm text-muted-foreground">
                  {carteira.length === 0
                    ? 'Você ainda não tem clientes na carteira.'
                    : 'Nenhum cliente bate com os filtros aplicados.'}
                </div>
              ) : (
                <div className="divide-y divide-border/40">
                  {carteiraFiltrada.map((c) => (
                    <a
                      key={c.clienteId}
                      href={`/clientes/${c.clienteId}`}
                      className="flex items-center gap-3 px-5 py-3 hover:bg-muted/30 transition-colors group"
                    >
                      <div className="h-9 w-9 rounded-md bg-sky-100 dark:bg-sky-900/30 flex items-center justify-center shrink-0">
                        <Building2 className="h-4 w-4 text-sky-600 dark:text-sky-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate" title={c.razaoSocial}>{c.razaoSocial}</p>
                        <p className="text-[11px] text-muted-foreground tabular-nums">{formatDocumento(c.documento)}</p>
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5 justify-end max-w-[55%]">
                        {c.areas.map((a, i) => (
                          <span
                            key={i}
                            className={cn(
                              'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium border',
                              a.role === 'Responsável'
                                ? 'bg-sky-50 border-sky-200 text-sky-700 dark:bg-sky-950/40 dark:border-sky-800 dark:text-sky-300'
                                : 'bg-violet-50 border-violet-200 text-violet-700 dark:bg-violet-950/40 dark:border-violet-800 dark:text-violet-300',
                            )}
                            title={`${a.role} · ${a.areaNome}`}
                          >
                            {a.areaNome}
                            <span className="opacity-60">·</span>
                            <span>{a.role === 'Responsável' ? 'R' : 'S'}</span>
                          </span>
                        ))}
                      </div>
                      <ExternalLink className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                    </a>
                  ))}
                </div>
              )}
            </CardContent>
            {!carteiraLoading && carteira.length > 0 && (
              <div className="flex items-center justify-between border-t border-border/40 bg-muted/20 px-5 py-2 text-[11px] text-muted-foreground">
                <span>
                  Exibindo <span className="font-medium text-foreground">{carteiraFiltrada.length}</span> de {carteira.length} clientes
                </span>
                <span className="flex items-center gap-3">
                  <span className="inline-flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-sky-500" /> R = Responsável</span>
                  <span className="inline-flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-violet-500" /> S = Substituto</span>
                </span>
              </div>
            )}
          </Card>
        </TabsContent>

        {/* TAB: Assinatura de email — upload da foto + preview + copiar HTML */}
        <TabsContent value="assinatura" className="mt-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            {/* Card: Foto da assinatura */}
            <Card>
              <CardHeader className="border-b border-border/60 px-5 py-3 flex flex-row items-center gap-2">
                <ImageIcon className="h-4 w-4" style={{ color: MODULE_COLOR }} />
                <h3 className="text-sm font-semibold flex-1">Foto da assinatura</h3>
              </CardHeader>
              <CardContent className="p-5 space-y-3">
                <div className="flex flex-col items-center gap-3">
                  <div
                    className="relative w-32 h-32 rounded-full overflow-hidden flex items-center justify-center"
                    style={{ backgroundColor: signatureData?.signatureImageUrl ? '#10b981' : 'transparent', padding: signatureData?.signatureImageUrl ? '4px' : '0' }}
                  >
                    {signatureData?.signatureImageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={resolveAssetUrl(signatureData.signatureImageUrl)}
                        alt="Foto da assinatura"
                        className="w-full h-full object-cover rounded-full"
                      />
                    ) : (
                      <div className="w-full h-full rounded-full border-2 border-dashed border-border bg-muted/40 flex items-center justify-center">
                        <UserIcon className="h-10 w-10 text-muted-foreground/40" />
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col gap-2 w-full">
                    <Button
                      size="sm"
                      className="text-white gap-1.5"
                      style={{ backgroundColor: MODULE_COLOR }}
                      onClick={() => signatureFileInputRef.current?.click()}
                      disabled={uploadingSignature}
                    >
                      {uploadingSignature ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
                      {signatureData?.signatureImageUrl ? 'Trocar foto' : 'Enviar foto'}
                    </Button>
                    {signatureData?.signatureImageUrl && (
                      <Button size="sm" variant="outline" className="gap-1.5 text-rose-600 border-rose-200 hover:bg-rose-50 dark:hover:bg-rose-950/30" onClick={removeSignaturePhoto} disabled={uploadingSignature}>
                        <Trash2 className="h-3.5 w-3.5" /> Remover
                      </Button>
                    )}
                    <input
                      ref={signatureFileInputRef}
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      className="hidden"
                      onChange={e => {
                        const f = e.target.files?.[0]
                        if (f) handleSignaturePhotoUpload(f)
                        e.target.value = ''
                      }}
                    />
                  </div>
                  <div className="text-[11px] text-muted-foreground bg-muted/40 p-3 rounded-md w-full">
                    <strong className="text-foreground">Dica:</strong> use uma foto <strong>quadrada</strong>, com fundo removido (PNG transparente) ou já tratado no tom verde. PNG/JPG/WebP até 2MB.
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Card: Preview + Download como imagem — ocupa 2 colunas em desktop */}
            <Card className="lg:col-span-2">
              <CardHeader className="border-b border-border/60 px-5 py-3 flex flex-row items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Mail className="h-4 w-4" style={{ color: MODULE_COLOR }} />
                  <h3 className="text-sm font-semibold">Sua assinatura</h3>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1.5"
                    onClick={() => downloadSignature('png')}
                    disabled={!signatureData || downloading !== null}
                  >
                    {downloading === 'png' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ImageIcon className="h-3.5 w-3.5" />}
                    Baixar PNG
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1.5"
                    onClick={() => downloadSignature('jpeg')}
                    disabled={!signatureData || downloading !== null}
                  >
                    {downloading === 'jpeg' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ImageIcon className="h-3.5 w-3.5" />}
                    Baixar JPG
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="p-5">
                {signatureData ? (
                  <>
                    {/* Preview live no iframe (same-origin via srcDoc — permite download via html-to-image). */}
                    <iframe
                      ref={signatureIframeRef}
                      title="Sua assinatura"
                      srcDoc={`<!doctype html><html><head><meta charset="utf-8"></head><body style="margin:0;padding:16px;font-family:Arial,sans-serif;">${buildSignatureHtml(signatureData, signatureTemplate, getApiUrl())}</body></html>`}
                      className="w-full border border-border rounded-md bg-white"
                      style={{ height: '230px' }}
                    />

                    <div className="mt-4 space-y-2">
                      <h4 className="text-[12px] font-semibold text-foreground">Como usar</h4>
                      <ol className="text-[11px] text-muted-foreground space-y-1 list-decimal list-inside">
                        <li>Baixe a assinatura como <strong>PNG</strong> (fundo transparente quando possível) ou <strong>JPG</strong>.</li>
                        <li>No Gmail/Outlook, abra Configurações → Assinatura.</li>
                        <li>Insira a imagem baixada como assinatura.</li>
                      </ol>
                    </div>
                  </>
                ) : (
                  <div className="flex items-center justify-center py-12 text-muted-foreground">
                    <Loader2 className="h-5 w-5 animate-spin" />
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* TAB: Segurança */}
        <TabsContent value="seguranca" className="mt-6">
          <Card className="max-w-2xl">
            <CardHeader className="border-b border-border/60 px-5 py-3 flex flex-row items-center gap-2">
              <Shield className="h-4 w-4" style={{ color: MODULE_COLOR }} />
              <h3 className="text-sm font-semibold flex-1">Segurança da Conta</h3>
            </CardHeader>
            <CardContent className="p-5 space-y-3">
              {/* Senha */}
              <div className="rounded-md border border-border/60 p-4 flex items-start gap-3">
                <div className="h-9 w-9 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center shrink-0">
                  <Key className="h-4 w-4 text-amber-600" />
                </div>
                <div className="flex-1">
                  <h4 className="text-sm font-semibold">Senha de acesso</h4>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Use uma senha forte com pelo menos 8 caracteres. Recomendamos misturar letras maiúsculas, minúsculas, números e símbolos.
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5"
                  onClick={() => setPwdModal(true)}
                >
                  <Pencil className="h-3.5 w-3.5" /> Alterar
                </Button>
              </div>

              {/* MFA / 2FA */}
              <div className={cn(
                'rounded-md border p-4 flex items-start gap-3',
                profile.twoFactorEnabled
                  ? 'border-emerald-200 bg-emerald-50/50 dark:bg-emerald-900/10 dark:border-emerald-900/30'
                  : 'border-border/60',
              )}>
                <div className={cn(
                  'h-9 w-9 rounded-full flex items-center justify-center shrink-0',
                  profile.twoFactorEnabled
                    ? 'bg-emerald-100 dark:bg-emerald-900/30'
                    : 'bg-sky-100 dark:bg-sky-900/30',
                )}>
                  <Smartphone className={cn(
                    'h-4 w-4',
                    profile.twoFactorEnabled ? 'text-emerald-600' : 'text-sky-600',
                  )} />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h4 className="text-sm font-semibold">Autenticação em dois fatores (MFA)</h4>
                    {profile.twoFactorEnabled && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500 text-white px-2 py-0.5 text-[10px] font-bold uppercase">
                        <CheckCircle2 className="h-3 w-3" /> Ativo
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {profile.twoFactorEnabled
                      ? 'A cada login, será solicitado um código gerado pelo app autenticador (Google Authenticator, Authy, 1Password, etc.).'
                      : 'Adicione uma camada extra de segurança ao seu login. Você precisará de um app autenticador (Google Authenticator, Authy, 1Password, etc.).'}
                  </p>
                </div>
                {profile.twoFactorEnabled ? (
                  <Button size="sm" variant="outline" className="gap-1.5" onClick={abrirDisableMFA}>
                    <Trash2 className="h-3.5 w-3.5" /> Desabilitar
                  </Button>
                ) : (
                  <Button size="sm" style={{ backgroundColor: MODULE_COLOR }} className="text-white gap-1.5" onClick={abrirEnableMFA}>
                    <Shield className="h-3.5 w-3.5" /> Habilitar
                  </Button>
                )}
              </div>

              {/* Dispositivos confiaveis (mostra se MFA ativo OU se ja existem registros) */}
              {(profile.twoFactorEnabled || trustedDevices.length > 0) && (
                <div className="rounded-md border border-border/60 p-4 space-y-3">
                  <div className="flex items-start gap-3">
                    <div className="h-9 w-9 rounded-full bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center shrink-0">
                      <Monitor className="h-4 w-4 text-violet-600" />
                    </div>
                    <div className="flex-1">
                      <h4 className="text-sm font-semibold flex items-center gap-2">
                        Dispositivos confiáveis
                        {trustedDevices.length > 0 && (
                          <span className="inline-flex items-center rounded-full bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300 px-2 py-0.5 text-[10px] font-medium">
                            {trustedDevices.length}
                          </span>
                        )}
                      </h4>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Dispositivos onde você marcou &quot;Confiar neste equipamento&quot;. Não pedem MFA durante 30 dias. Revogue qualquer um caso suspeite de acesso indevido.
                      </p>
                    </div>
                    {trustedDevices.length > 0 && (
                      <Button size="sm" variant="outline" className="gap-1.5" onClick={handleRevokeAllDevices}>
                        <Trash2 className="h-3.5 w-3.5" /> Revogar todos
                      </Button>
                    )}
                  </div>

                  {trustedDevices.length === 0 ? (
                    <div className="text-center py-3 text-xs text-muted-foreground italic">
                      Nenhum dispositivo confiável cadastrado.
                    </div>
                  ) : (
                    <div className="divide-y divide-border/40 -mx-4 -mb-4">
                      {trustedDevices.map(d => (
                        <div key={d.id} className="flex items-center gap-3 px-4 py-2.5">
                          <Monitor className="h-4 w-4 text-muted-foreground shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium">{d.label || 'Dispositivo desconhecido'}</p>
                            <p className="text-[10px] text-muted-foreground">
                              Adicionado em {formatDateTime(d.createdAt)}
                              {d.expiresAt && (<> · Expira em {formatDate(d.expiresAt)}</>)}
                            </p>
                          </div>
                          <Button variant="ghost" size="icon-sm" onClick={() => handleRevokeDevice(d.id)} title="Revogar">
                            <Trash2 className="h-3.5 w-3.5 text-destructive" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Modal Alterar Senha */}
      <Dialog open={pwdModal} onOpenChange={open => { if (!open) { setPwdModal(false); setPwdCurrent(''); setPwdNew(''); setPwdConfirm('') } }}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeaderIcon icon={Key} color="sky">
            <DialogTitle>Alterar senha</DialogTitle>
            <DialogDescription>
              Informe sua senha atual e a nova senha desejada (mínimo 8 caracteres).
            </DialogDescription>
          </DialogHeaderIcon>
          <DialogBody className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Senha atual <span className="text-rose-500">*</span></Label>
              <Input type="password" value={pwdCurrent} onChange={e => setPwdCurrent(e.target.value)} className="h-9 text-sm" autoComplete="current-password" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Nova senha <span className="text-rose-500">*</span></Label>
              <Input type="password" value={pwdNew} onChange={e => setPwdNew(e.target.value)} className="h-9 text-sm" autoComplete="new-password" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Confirmar nova senha <span className="text-rose-500">*</span></Label>
              <Input
                type="password"
                value={pwdConfirm}
                onChange={e => setPwdConfirm(e.target.value)}
                className={cn('h-9 text-sm', pwdConfirm && pwdNew !== pwdConfirm && 'border-rose-500')}
                autoComplete="new-password"
              />
              {pwdConfirm && pwdNew !== pwdConfirm && (
                <p className="text-[10px] text-rose-600">A confirmação não coincide com a nova senha.</p>
              )}
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setPwdModal(false)} disabled={savingPwd}>Cancelar</Button>
            <Button
              size="sm"
              style={{ backgroundColor: MODULE_COLOR }}
              className="text-white gap-1.5"
              onClick={handleChangePassword}
              disabled={savingPwd || !pwdCurrent || !pwdNew || pwdNew !== pwdConfirm}
            >
              {savingPwd ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Salvar nova senha
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal Habilitar MFA — fluxo: senha → QR + verificação → backup codes */}
      <Dialog open={mfaEnableModal} onOpenChange={open => { if (!open) setMfaEnableModal(false) }}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeaderIcon icon={Shield} color="sky">
            <DialogTitle>Habilitar autenticação em dois fatores</DialogTitle>
            <DialogDescription>
              {mfaStep === 'password' && 'Confirme sua senha para iniciar a configuração.'}
              {mfaStep === 'qr' && 'Escaneie o QR Code com seu app autenticador.'}
              {mfaStep === 'verify' && 'Digite o código de 6 dígitos exibido no app.'}
              {mfaStep === 'codes' && 'Salve estes códigos de backup em local seguro.'}
            </DialogDescription>
          </DialogHeaderIcon>
          <DialogBody className="space-y-4">
            {mfaStep === 'password' && (
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Senha atual <span className="text-rose-500">*</span></Label>
                <Input
                  type="password"
                  value={mfaPassword}
                  onChange={e => setMfaPassword(e.target.value)}
                  className="h-9 text-sm"
                  autoComplete="current-password"
                  onKeyDown={e => { if (e.key === 'Enter') handleEnableMFAStep1() }}
                />
                <p className="text-[11px] text-muted-foreground">
                  Recomendamos os apps: Google Authenticator, Microsoft Authenticator, Authy ou 1Password.
                </p>
              </div>
            )}

            {mfaStep === 'qr' && mfaQrUrl && (
              <div className="space-y-3">
                <div className="flex flex-col items-center gap-3 p-4 bg-white rounded-md border border-border/60">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(mfaQrUrl)}`}
                    alt="QR Code MFA"
                    width={200}
                    height={200}
                  />
                  {mfaSecret && (
                    <div className="text-center">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Ou digite o código manualmente:</p>
                      <p className="font-mono text-xs mt-1 select-all bg-muted px-3 py-1 rounded">{mfaSecret}</p>
                    </div>
                  )}
                </div>
                <div className="flex justify-end">
                  <Button size="sm" style={{ backgroundColor: MODULE_COLOR }} className="text-white" onClick={() => setMfaStep('verify')}>
                    Já escaneei →
                  </Button>
                </div>
              </div>
            )}

            {mfaStep === 'verify' && (
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">Código de 6 dígitos <span className="text-rose-500">*</span></Label>
                  <Input
                    type="text"
                    inputMode="numeric"
                    pattern="\d{6}"
                    maxLength={6}
                    value={mfaTotpCode}
                    onChange={e => setMfaTotpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    className="h-12 text-center text-2xl font-mono tracking-[0.5em]"
                    placeholder="000000"
                    autoComplete="one-time-code"
                    onKeyDown={e => { if (e.key === 'Enter') handleVerifyMFASetup() }}
                  />
                </div>
                <div className="flex items-center justify-between gap-2">
                  <Button variant="outline" size="sm" onClick={() => setMfaStep('qr')}>← Voltar</Button>
                  <Button
                    size="sm"
                    style={{ backgroundColor: MODULE_COLOR }}
                    className="text-white gap-1.5"
                    onClick={handleVerifyMFASetup}
                    disabled={mfaLoading || mfaTotpCode.length !== 6}
                  >
                    {mfaLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                    Verificar
                  </Button>
                </div>
              </div>
            )}

            {mfaStep === 'codes' && (
              <div className="space-y-3">
                <div className="rounded-md border border-amber-200 bg-amber-50 dark:bg-amber-900/10 p-3 flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                  <p className="text-xs text-amber-800 dark:text-amber-300">
                    Guarde estes códigos em local seguro (gerenciador de senhas, cofre etc.). Cada um pode ser usado <strong>uma única vez</strong> caso você perca acesso ao app autenticador.
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-2 font-mono text-sm bg-muted/50 p-3 rounded-md border border-border/60">
                  {mfaBackupCodes.map((code, i) => (
                    <div key={i} className="px-2 py-1 select-all">{code}</div>
                  ))}
                </div>
              </div>
            )}
          </DialogBody>
          <DialogFooter>
            {mfaStep === 'password' && (
              <>
                <Button variant="outline" size="sm" onClick={() => setMfaEnableModal(false)} disabled={mfaLoading}>Cancelar</Button>
                <Button
                  size="sm"
                  style={{ backgroundColor: MODULE_COLOR }}
                  className="text-white gap-1.5"
                  onClick={handleEnableMFAStep1}
                  disabled={mfaLoading || !mfaPassword}
                >
                  {mfaLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Shield className="h-4 w-4" />}
                  Continuar
                </Button>
              </>
            )}
            {mfaStep === 'codes' && (
              <>
                <Button variant="outline" size="sm" className="gap-1.5" onClick={copiarBackupCodes}>
                  <CopyIcon className="h-3.5 w-3.5" /> Copiar todos
                </Button>
                <Button
                  size="sm"
                  style={{ backgroundColor: MODULE_COLOR }}
                  className="text-white"
                  onClick={() => setMfaEnableModal(false)}
                >
                  Concluir
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal Desabilitar MFA */}
      <Dialog open={mfaDisableModal} onOpenChange={open => { if (!open) { setMfaDisableModal(false); setMfaPassword('') } }}>
        <DialogContent className="sm:max-w-[440px]">
          <DialogHeaderIcon icon={AlertTriangle} color="amber">
            <DialogTitle>Desabilitar autenticação em dois fatores</DialogTitle>
            <DialogDescription>
              Sua conta ficará menos protegida. Confirme sua senha para continuar.
            </DialogDescription>
          </DialogHeaderIcon>
          <DialogBody className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Senha atual <span className="text-rose-500">*</span></Label>
              <Input
                type="password"
                value={mfaPassword}
                onChange={e => setMfaPassword(e.target.value)}
                className="h-9 text-sm"
                autoComplete="current-password"
                onKeyDown={e => { if (e.key === 'Enter') handleDisableMFA() }}
              />
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setMfaDisableModal(false)} disabled={mfaLoading}>Cancelar</Button>
            <Button
              size="sm"
              variant="destructive"
              className="gap-1.5"
              onClick={handleDisableMFA}
              disabled={mfaLoading || !mfaPassword}
            >
              {mfaLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              Desabilitar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function ProfileRow({ icon, label, value, last = false }: { icon: React.ReactNode; label: string; value: string | null | undefined; last?: boolean }) {
  const has = !!value && value !== '—'
  return (
    <div className={cn('flex items-center gap-3 px-5 py-3', !last && 'border-b border-border/40')}>
      <span className="text-muted-foreground">{icon}</span>
      <span className="text-xs text-muted-foreground uppercase tracking-wider w-24">{label}</span>
      <span className={cn('text-sm flex-1', has ? 'font-medium' : 'text-muted-foreground italic')}>{has ? value : '—'}</span>
    </div>
  )
}
