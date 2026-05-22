'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { CheckCircle2, Loader2, Star, ThumbsUp, ThumbsDown, MessageSquare } from 'lucide-react'
import { trpc } from '@/lib/trpc'
import { resolveAssetUrl } from '@/lib/api-url'

const MODULE_COLOR = 'var(--mod-comercial, #fb7185)'

interface Pesquisa {
  id: string
  token: string
  respondidaEm: string | null
  cliente: { razaoSocial: string; nomeFantasia: string | null; email: string | null } | null
  orcamento: { id: string; numero: number; contatos: string | null } | null
  empresa: { razaoSocial: string; nomeFantasia: string | null; logoUrl: string | null } | null
}

export default function PesquisaPublicaPage() {
  const params = useParams<{ token: string }>()
  const token = params?.token as string

  const [pesquisa, setPesquisa] = useState<Pesquisa | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [enviado, setEnviado] = useState(false)

  // Form
  const [nome, setNome] = useState('')
  const [area, setArea] = useState('')
  const [email, setEmail] = useState('')
  const [q1, setQ1] = useState<boolean | null>(null)
  const [q2, setQ2] = useState<number | null>(null)
  const [q3, setQ3] = useState<boolean | null>(null)
  const [nota, setNota] = useState<number | null>(null)
  const [comentario, setComentario] = useState('')
  const [enviando, setEnviando] = useState(false)

  useEffect(() => {
    (async () => {
      try {
        const data = await (trpc.pesquisa as any).getByToken.query({ token })
        if (!data) { setError('Pesquisa nao encontrada'); return }
        setPesquisa(data)
        if (data.respondidaEm) setEnviado(true)
        // Preencher nome do contato se disponivel
        if (data.orcamento?.contatos) setNome(data.orcamento.contatos)
        if (data.cliente?.email) setEmail(data.cliente.email)
      } catch {
        setError('Link invalido ou expirado')
      } finally {
        setLoading(false)
      }
    })()
  }, [token])

  const handleSubmit = async () => {
    if (!nome.trim()) { alert('Informe seu nome'); return }
    setEnviando(true)
    try {
      await (trpc.pesquisa as any).responder.mutate({
        token,
        respondenteNome: nome.trim(),
        respondenteArea: area.trim() || undefined,
        respondenteEmail: email.trim() || undefined,
        q1Atendeu: q1,
        q2Qualidade: q2 ?? undefined,
        q3Recomendaria: q3,
        nota: nota ?? undefined,
        comentario: comentario.trim() || undefined,
      })
      setEnviado(true)
    } catch (e) {
      alert((e as Error).message)
    } finally {
      setEnviando(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-rose-400" />
      </div>
    )
  }

  if (error || !pesquisa) {
    return (
      <div className="flex items-center justify-center min-h-screen px-4">
        <div className="max-w-md text-center bg-white dark:bg-slate-800 rounded-lg shadow-xl p-8">
          <h2 className="text-lg font-semibold mb-2">Nao foi possivel carregar</h2>
          <p className="text-sm text-muted-foreground">{error || 'Link invalido'}</p>
        </div>
      </div>
    )
  }

  const empresaNome = pesquisa.empresa?.nomeFantasia || pesquisa.empresa?.razaoSocial || 'Empresa'

  if (enviado) {
    return (
      <div className="flex items-center justify-center min-h-screen px-4">
        <div className="max-w-lg text-center bg-white dark:bg-slate-800 rounded-lg shadow-xl p-10">
          {pesquisa.empresa?.logoUrl && (
            <img src={resolveAssetUrl(pesquisa.empresa.logoUrl)} alt={empresaNome} className="h-14 w-auto object-contain mx-auto mb-6" />
          )}
          <div className="h-16 w-16 rounded-full mx-auto mb-4 flex items-center justify-center" style={{ backgroundColor: `color-mix(in srgb, ${MODULE_COLOR} 8%, transparent)` }}>
            <CheckCircle2 className="h-9 w-9" style={{ color: MODULE_COLOR }} />
          </div>
          <h2 className="text-xl font-bold mb-2">Obrigado pela sua resposta!</h2>
          <p className="text-sm text-muted-foreground">Sua opiniao e muito importante para a <strong>{empresaNome}</strong>. Continuaremos trabalhando para oferecer o melhor servico.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto p-4 sm:p-8">
      {/* Header */}
      <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm p-6 mb-4 text-center">
        {pesquisa.empresa?.logoUrl ? (
          <img src={resolveAssetUrl(pesquisa.empresa.logoUrl)} alt={empresaNome} className="h-12 w-auto object-contain mx-auto mb-3" />
        ) : (
          <div className="h-14 w-14 rounded-lg mx-auto mb-3 flex items-center justify-center text-white text-xl font-bold" style={{ background: `linear-gradient(135deg, ${MODULE_COLOR}, color-mix(in srgb, ${MODULE_COLOR} 87%, transparent))` }}>
            {empresaNome[0]?.toUpperCase()}
          </div>
        )}
        <h1 className="text-xl font-bold">Pesquisa de Satisfacao</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Sua opiniao sobre {pesquisa.orcamento ? `a proposta #${String(pesquisa.orcamento.numero).padStart(4, '0')}` : 'nosso servico'} e fundamental para melhorarmos.
        </p>
      </div>

      <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm p-6 space-y-6">
        {/* Identificacao */}
        <div className="space-y-3 pb-5 border-b border-slate-100 dark:border-slate-700">
          <h3 className="text-sm font-semibold">1. Identificacao</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium block mb-1">Nome <span className="text-rose-500">*</span></label>
              <input
                type="text"
                value={nome}
                onChange={e => setNome(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-md bg-white dark:bg-slate-900"
                placeholder="Seu nome completo"
                required
              />
            </div>
            <div>
              <label className="text-xs font-medium block mb-1">Area / Cargo</label>
              <input
                type="text"
                value={area}
                onChange={e => setArea(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-md bg-white dark:bg-slate-900"
                placeholder="Ex.: Diretor, Financeiro"
              />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium block mb-1">E-mail (opcional)</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-md bg-white dark:bg-slate-900"
              placeholder="seu@email.com"
            />
          </div>
        </div>

        {/* Q1 — Sim/Nao */}
        <div className="pb-5 border-b border-slate-100 dark:border-slate-700">
          <h3 className="text-sm font-semibold mb-3">2. O servico atendeu suas expectativas?</h3>
          <div className="flex gap-3">
            <BotaoSimNao label="Sim" icon={ThumbsUp} ativo={q1 === true} onClick={() => setQ1(true)} cor="#10b981" />
            <BotaoSimNao label="Nao" icon={ThumbsDown} ativo={q1 === false} onClick={() => setQ1(false)} cor="#ef4444" />
          </div>
        </div>

        {/* Q2 — Estrelas */}
        <div className="pb-5 border-b border-slate-100 dark:border-slate-700">
          <h3 className="text-sm font-semibold mb-3">3. Como voce avalia a qualidade do nosso atendimento?</h3>
          <div className="flex items-center gap-2">
            {[1, 2, 3, 4, 5].map(n => (
              <button
                key={n}
                type="button"
                onClick={() => setQ2(n)}
                className="transition-transform hover:scale-110"
                title={['Pessima', 'Ruim', 'Regular', 'Boa', 'Excelente'][n - 1]}
              >
                <Star className={`h-9 w-9 ${q2 != null && n <= q2 ? 'fill-amber-400 text-amber-400' : 'text-slate-300 dark:text-slate-600'}`} />
              </button>
            ))}
            {q2 != null && (
              <span className="ml-3 text-sm font-medium text-muted-foreground">
                {['Pessima', 'Ruim', 'Regular', 'Boa', 'Excelente'][q2 - 1]}
              </span>
            )}
          </div>
        </div>

        {/* Q3 — Recomendaria */}
        <div className="pb-5 border-b border-slate-100 dark:border-slate-700">
          <h3 className="text-sm font-semibold mb-3">4. Voce recomendaria nossos servicos?</h3>
          <div className="flex gap-3">
            <BotaoSimNao label="Recomendaria" icon={ThumbsUp} ativo={q3 === true} onClick={() => setQ3(true)} cor="#10b981" />
            <BotaoSimNao label="Nao recomendaria" icon={ThumbsDown} ativo={q3 === false} onClick={() => setQ3(false)} cor="#ef4444" />
          </div>
        </div>

        {/* NPS */}
        <div className="pb-5 border-b border-slate-100 dark:border-slate-700">
          <h3 className="text-sm font-semibold mb-3">5. De 0 a 10, quanto voce nos recomendaria?</h3>
          <div className="flex flex-wrap gap-1.5">
            {Array.from({ length: 11 }, (_, i) => i).map(n => {
              const isActive = nota === n
              const cor = n <= 6 ? '#ef4444' : n <= 8 ? '#f59e0b' : '#10b981'
              return (
                <button
                  key={n}
                  type="button"
                  onClick={() => setNota(n)}
                  className={`h-10 w-10 rounded-md text-sm font-semibold border-2 transition-all ${isActive ? 'text-white' : 'text-slate-700 dark:text-slate-300 hover:opacity-80'}`}
                  style={{
                    backgroundColor: isActive ? cor : 'transparent',
                    borderColor: isActive ? cor : '#cbd5e1',
                  }}
                >
                  {n}
                </button>
              )
            })}
          </div>
          <div className="flex justify-between text-[10px] text-muted-foreground mt-2 px-1">
            <span>Nada provavel</span>
            <span>Extremamente provavel</span>
          </div>
        </div>

        {/* Comentario */}
        <div>
          <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
            <MessageSquare className="h-4 w-4" /> 6. Comentarios e sugestoes (opcional)
          </h3>
          <textarea
            value={comentario}
            onChange={e => setComentario(e.target.value)}
            rows={4}
            placeholder="Conte-nos o que podemos melhorar ou destacar..."
            className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-md bg-white dark:bg-slate-900"
          />
        </div>

        {/* Submit */}
        <div className="pt-4">
          <button
            onClick={handleSubmit}
            disabled={enviando || !nome.trim()}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 text-white rounded-md font-semibold transition-colors disabled:opacity-50"
            style={{ backgroundColor: MODULE_COLOR }}
          >
            {enviando ? <Loader2 className="h-5 w-5 animate-spin" /> : <CheckCircle2 className="h-5 w-5" />}
            Enviar Resposta
          </button>
        </div>
      </div>

      <p className="text-center text-xs text-muted-foreground mt-6">
        {empresaNome} &middot; {new Date().getFullYear()}
      </p>
    </div>
  )
}

function BotaoSimNao({ label, icon: Icon, ativo, onClick, cor }: { label: string; icon: any; ativo: boolean; onClick: () => void; cor: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-md font-medium border-2 transition-all text-sm ${ativo ? 'text-white' : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700'}`}
      style={{
        backgroundColor: ativo ? cor : 'transparent',
        borderColor: ativo ? cor : '#cbd5e1',
      }}
    >
      <Icon className="h-4 w-4" /> {label}
    </button>
  )
}
