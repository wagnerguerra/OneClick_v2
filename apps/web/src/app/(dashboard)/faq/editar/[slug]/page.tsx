'use client'

import { useEffect, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { useCurrentUserProfile } from '@/hooks/use-current-user-profile'
import { trpc } from '@/lib/trpc'
import { alerts } from '@/lib/alerts'
import { FaqEditor, type FaqForm } from '../../_components/faq-editor'
import { faqIconName } from '../../_components/faq-icons'
import { FAQ_ARTIGOS } from '../../_components/articles-catalog'
import { faqArticleComponents } from '../../_articles'

export default function FaqEditarPage() {
  const params = useParams()
  const slug = String(params?.slug ?? '')
  const router = useRouter()
  const { profile } = useCurrentUserProfile()
  const isMaster = !!(profile?.isMaster || profile?.isEmpresaMaster)

  const [form, setForm] = useState<FaqForm | null>(null)
  const [dbId, setDbId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [capturarCodigo, setCapturarCodigo] = useState(false)
  const captureRef = useRef<HTMLDivElement>(null)

  // Carrega: artigo do banco OU metadados do catálogo de código (+ captura HTML)
  useEffect(() => {
    let alive = true
    ;(async () => {
      const db = await (trpc.faq as any).getBySlug.query({ slug }).catch(() => null)
      if (!alive) return
      if (db) {
        setDbId(db.id)
        setForm({
          slug: db.slug, titulo: db.titulo, descricao: db.descricao, modulo: db.modulo,
          moduloColor: db.moduloColor, icon: db.icon, categoria: db.categoria,
          tags: (db.tags ?? []).join(', '), conteudoHtml: db.conteudoHtml, publicado: db.publicado,
        })
        return
      }
      const meta = FAQ_ARTIGOS.find(a => a.slug === slug)
      if (!meta) { router.replace('/faq/novo'); return }
      setForm({
        slug: meta.slug, titulo: meta.titulo, descricao: meta.descricao, modulo: meta.modulo,
        moduloColor: meta.moduloColor, icon: faqIconName(meta.icon), categoria: meta.categoria,
        tags: meta.tags.join(', '), conteudoHtml: '', publicado: true,
      })
      setCapturarCodigo(true) // dispara captura do corpo renderizado
    })()
    return () => { alive = false }
  }, [slug, router])

  // Captura o HTML do artigo de código renderizado fora da tela.
  useEffect(() => {
    if (!capturarCodigo) return
    let tries = 0
    const t = setInterval(() => {
      tries++
      const body = captureRef.current?.querySelector('[data-faq-body]')
      if (body && body.innerHTML.trim().length > 40) {
        const html = body.innerHTML
        setForm(f => (f ? { ...f, conteudoHtml: html } : f))
        setCapturarCodigo(false)
        clearInterval(t)
      } else if (tries > 50) { clearInterval(t); setCapturarCodigo(false) }
    }, 100)
    return () => clearInterval(t)
  }, [capturarCodigo])

  if (profile && !isMaster) {
    return <p className="text-sm text-muted-foreground py-24 text-center">Apenas o usuário master pode editar artigos do FAQ.</p>
  }
  if (!form) {
    return <div className="flex items-center justify-center gap-2 text-muted-foreground py-24"><Loader2 className="h-4 w-4 animate-spin" /> Carregando…</div>
  }

  async function salvar() {
    if (!form) return
    setSaving(true)
    const payload = {
      slug: form.slug, titulo: form.titulo, descricao: form.descricao, modulo: form.modulo,
      moduloColor: form.moduloColor, icon: form.icon, categoria: form.categoria,
      tags: form.tags.split(',').map(t => t.trim()).filter(Boolean),
      conteudoHtml: form.conteudoHtml, publicado: form.publicado, ordem: 0,
    }
    try {
      if (dbId) await (trpc.faq as any).update.mutate({ id: dbId, ...payload })
      else await (trpc.faq as any).upsertOverride.mutate(payload) // 1ª edição de artigo de sistema
      await alerts.success('Salvo', 'Artigo atualizado.')
      router.push(`/faq/${form.slug}`)
    } catch (e) {
      alerts.error('Erro ao salvar', (e as Error).message)
      setSaving(false)
    }
  }

  const CodeComp = faqArticleComponents[slug]
  return (
    <>
      <FaqEditor titulo="Editar artigo" value={form} onChange={(v) => setForm(v)} onSave={salvar} saving={saving} slugTravado />
      {/* render oculto p/ capturar o corpo do artigo de código na 1ª edição */}
      {capturarCodigo && CodeComp && (
        <div ref={captureRef} aria-hidden style={{ position: 'fixed', left: -99999, top: 0, width: 800, visibility: 'hidden' }}>
          <CodeComp />
        </div>
      )}
    </>
  )
}
