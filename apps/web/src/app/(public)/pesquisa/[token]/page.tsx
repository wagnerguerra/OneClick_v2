'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { CheckCircle2, Loader2, Star, ThumbsUp, ThumbsDown } from 'lucide-react'
import { trpc } from '@/lib/trpc'
import { resolveAssetUrl } from '@/lib/api-url'

const MODULE_COLOR = 'var(--mod-comercial, #fb7185)'

interface Pergunta { id: string; ordem: number; tipo: string; enunciado: string; obrigatoria: boolean }
interface Envio {
  token: string
  titulo: string
  respondida: boolean
  perguntas: Pergunta[]
  cliente: { razaoSocial: string; nomeFantasia: string | null } | null
  empresa: { razaoSocial: string; nomeFantasia: string | null; logoUrl: string | null } | null
}
type Resposta = { valorNumero?: number | null; valorBooleano?: boolean | null; valorTexto?: string | null }

export default function PesquisaPublicaPage() {
  const params = useParams<{ token: string }>()
  const token = params?.token as string

  const [envio, setEnvio] = useState<Envio | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [enviado, setEnviado] = useState(false)

  const [nome, setNome] = useState('')
  const [email, setEmail] = useState('')
  const [respostas, setRespostas] = useState<Record<string, Resposta>>({})
  const [enviando, setEnviando] = useState(false)

  useEffect(() => {
    (async () => {
      try {
        const data = await (trpc.pesquisa as any).getEnvioPorToken.query({ token })
        if (!data) { setError('Pesquisa não encontrada'); return }
        setEnvio(data)
        if (data.respondida) setEnviado(true)
      } catch {
        setError('Link inválido ou expirado')
      } finally {
        setLoading(false)
      }
    })()
  }, [token])

  const setResp = (id: string, patch: Resposta) => setRespostas(r => ({ ...r, [id]: { ...r[id], ...patch } }))

  const handleSubmit = async () => {
    if (!envio) return
    if (!nome.trim()) { alert('Informe seu nome'); return }
    // valida obrigatórias
    for (const p of envio.perguntas) {
      if (!p.obrigatoria) continue
      const r = respostas[p.id]
      const ok = r && (r.valorNumero != null || r.valorBooleano != null || (r.valorTexto != null && r.valorTexto.trim() !== ''))
      if (!ok) { alert(`Responda: "${p.enunciado}"`); return }
    }
    setEnviando(true)
    try {
      await (trpc.pesquisa as any).responderEnvio.mutate({
        token,
        respondenteNome: nome.trim(),
        respondenteEmail: email.trim() || undefined,
        respostas: envio.perguntas.map(p => ({
          perguntaId: p.id,
          valorNumero: respostas[p.id]?.valorNumero ?? undefined,
          valorBooleano: respostas[p.id]?.valorBooleano ?? undefined,
          valorTexto: respostas[p.id]?.valorTexto ?? undefined,
        })),
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

  if (error || !envio) {
    return (
      <div className="flex items-center justify-center min-h-screen px-4">
        <div className="max-w-md text-center bg-white dark:bg-slate-800 rounded-lg shadow-xl p-8">
          <h2 className="text-lg font-semibold mb-2">Não foi possível carregar</h2>
          <p className="text-sm text-muted-foreground">{error || 'Link inválido'}</p>
        </div>
      </div>
    )
  }

  const empresaNome = envio.empresa?.nomeFantasia || envio.empresa?.razaoSocial || 'Empresa'

  if (enviado) {
    return (
      <div className="flex items-center justify-center min-h-screen px-4">
        <div className="max-w-lg text-center bg-white dark:bg-slate-800 rounded-lg shadow-xl p-10">
          {envio.empresa?.logoUrl && (
            <img src={resolveAssetUrl(envio.empresa.logoUrl)} alt={empresaNome} className="h-14 w-auto object-contain mx-auto mb-6" />
          )}
          <div className="h-16 w-16 rounded-full mx-auto mb-4 flex items-center justify-center" style={{ backgroundColor: `color-mix(in srgb, ${MODULE_COLOR} 8%, transparent)` }}>
            <CheckCircle2 className="h-9 w-9" style={{ color: MODULE_COLOR }} />
          </div>
          <h2 className="text-xl font-bold mb-2">Obrigado pela sua resposta!</h2>
          <p className="text-sm text-muted-foreground">Sua opinião é muito importante para a <strong>{empresaNome}</strong>. Continuaremos trabalhando para oferecer o melhor serviço.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto p-4 sm:p-8">
      {/* Header */}
      <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm p-6 mb-4 text-center">
        {envio.empresa?.logoUrl ? (
          <img src={resolveAssetUrl(envio.empresa.logoUrl)} alt={empresaNome} className="h-12 w-auto object-contain mx-auto mb-3" />
        ) : (
          <div className="h-14 w-14 rounded-lg mx-auto mb-3 flex items-center justify-center text-white text-xl font-bold" style={{ background: `linear-gradient(135deg, ${MODULE_COLOR}, color-mix(in srgb, ${MODULE_COLOR} 87%, transparent))` }}>
            {empresaNome[0]?.toUpperCase()}
          </div>
        )}
        <h1 className="text-xl font-bold">{envio.titulo || 'Pesquisa de Satisfação'}</h1>
        <p className="text-sm text-muted-foreground mt-1">Sua opinião é fundamental para melhorarmos nossos serviços.</p>
      </div>

      <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm p-6 space-y-6">
        {/* Identificação */}
        <div className="space-y-3 pb-5 border-b border-slate-100 dark:border-slate-700">
          <h3 className="text-sm font-semibold">Identificação</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium block mb-1">Nome <span className="text-rose-500">*</span></label>
              <input type="text" value={nome} onChange={e => setNome(e.target.value)} className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-md bg-white dark:bg-slate-900" placeholder="Seu nome completo" required />
            </div>
            <div>
              <label className="text-xs font-medium block mb-1">E-mail (opcional)</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-md bg-white dark:bg-slate-900" placeholder="seu@email.com" />
            </div>
          </div>
        </div>

        {/* Perguntas dinâmicas */}
        {envio.perguntas.map((p, idx) => {
          const r = respostas[p.id] || {}
          const last = idx === envio.perguntas.length - 1
          return (
            <div key={p.id} className={last ? '' : 'pb-5 border-b border-slate-100 dark:border-slate-700'}>
              <h3 className="text-sm font-semibold mb-3">
                {idx + 1}. {p.enunciado} {p.obrigatoria && <span className="text-rose-500">*</span>}
              </h3>

              {p.tipo === 'SIM_NAO' && (
                <div className="flex gap-3">
                  <BotaoSimNao label="Sim" icon={ThumbsUp} ativo={r.valorBooleano === true} onClick={() => setResp(p.id, { valorBooleano: true })} cor="#10b981" />
                  <BotaoSimNao label="Não" icon={ThumbsDown} ativo={r.valorBooleano === false} onClick={() => setResp(p.id, { valorBooleano: false })} cor="#ef4444" />
                </div>
              )}

              {p.tipo === 'ESTRELAS' && (
                <div className="flex items-center gap-2">
                  {[1, 2, 3, 4, 5].map(n => (
                    <button key={n} type="button" onClick={() => setResp(p.id, { valorNumero: n })} className="transition-transform hover:scale-110" title={['Péssima', 'Ruim', 'Regular', 'Boa', 'Excelente'][n - 1]}>
                      <Star className={`h-9 w-9 ${r.valorNumero != null && n <= r.valorNumero ? 'fill-amber-400 text-amber-400' : 'text-slate-300 dark:text-slate-600'}`} />
                    </button>
                  ))}
                  {r.valorNumero != null && <span className="ml-3 text-sm font-medium text-muted-foreground">{['Péssima', 'Ruim', 'Regular', 'Boa', 'Excelente'][r.valorNumero - 1]}</span>}
                </div>
              )}

              {p.tipo === 'NPS' && (
                <>
                  <div className="flex flex-wrap gap-1.5">
                    {Array.from({ length: 11 }, (_, i) => i).map(n => {
                      const isActive = r.valorNumero === n
                      const cor = n <= 6 ? '#ef4444' : n <= 8 ? '#f59e0b' : '#10b981'
                      return (
                        <button key={n} type="button" onClick={() => setResp(p.id, { valorNumero: n })}
                          className={`h-10 w-10 rounded-md text-sm font-semibold border-2 transition-all ${isActive ? 'text-white' : 'text-slate-700 dark:text-slate-300 hover:opacity-80'}`}
                          style={{ backgroundColor: isActive ? cor : 'transparent', borderColor: isActive ? cor : '#cbd5e1' }}>
                          {n}
                        </button>
                      )
                    })}
                  </div>
                  <div className="flex justify-between text-[10px] text-muted-foreground mt-2 px-1">
                    <span>Nada provável</span><span>Extremamente provável</span>
                  </div>
                </>
              )}

              {p.tipo === 'TEXTO' && (
                <textarea value={r.valorTexto ?? ''} onChange={e => setResp(p.id, { valorTexto: e.target.value })} rows={4} placeholder="Escreva aqui..." className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-md bg-white dark:bg-slate-900" />
              )}
            </div>
          )
        })}

        {/* Submit */}
        <div className="pt-2">
          <button onClick={handleSubmit} disabled={enviando || !nome.trim()} className="w-full flex items-center justify-center gap-2 px-4 py-3 text-white rounded-md font-semibold transition-colors disabled:opacity-50" style={{ backgroundColor: MODULE_COLOR }}>
            {enviando ? <Loader2 className="h-5 w-5 animate-spin" /> : <CheckCircle2 className="h-5 w-5" />}
            Enviar resposta
          </button>
        </div>
      </div>

      <p className="text-center text-xs text-muted-foreground mt-6">{empresaNome} &middot; {new Date().getFullYear()}</p>
    </div>
  )
}

function BotaoSimNao({ label, icon: Icon, ativo, onClick, cor }: { label: string; icon: any; ativo: boolean; onClick: () => void; cor: string }) {
  return (
    <button type="button" onClick={onClick}
      className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-md font-medium border-2 transition-all text-sm ${ativo ? 'text-white' : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700'}`}
      style={{ backgroundColor: ativo ? cor : 'transparent', borderColor: ativo ? cor : '#cbd5e1' }}>
      <Icon className="h-4 w-4" /> {label}
    </button>
  )
}
