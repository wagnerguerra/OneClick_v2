'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useCurrentUserProfile } from '@/hooks/use-current-user-profile'
import { trpc } from '@/lib/trpc'
import { alerts } from '@/lib/alerts'
import { FaqEditor, emptyFaqForm, type FaqForm } from '../_components/faq-editor'

export default function FaqNovoPage() {
  const router = useRouter()
  const { profile } = useCurrentUserProfile()
  const isMaster = !!(profile?.isMaster || profile?.isEmpresaMaster)
  const [form, setForm] = useState<FaqForm>(emptyFaqForm())
  const [saving, setSaving] = useState(false)

  if (profile && !isMaster) {
    return <p className="text-sm text-muted-foreground py-24 text-center">Apenas o usuário master pode criar artigos do FAQ.</p>
  }

  async function salvar() {
    setSaving(true)
    try {
      await (trpc.faq as any).create.mutate({
        slug: form.slug, titulo: form.titulo, descricao: form.descricao, modulo: form.modulo,
        moduloColor: form.moduloColor, icon: form.icon, categoria: form.categoria,
        tags: form.tags.split(',').map(t => t.trim()).filter(Boolean),
        conteudoHtml: form.conteudoHtml, publicado: form.publicado, ordem: 0,
      })
      await alerts.success('Artigo criado', 'O artigo foi publicado no FAQ.')
      router.push(`/faq/${form.slug}`)
    } catch (e) {
      alerts.error('Erro ao salvar', (e as Error).message)
      setSaving(false)
    }
  }

  return <FaqEditor titulo="Novo artigo" value={form} onChange={setForm} onSave={salvar} saving={saving} slugTravado={false} />
}
