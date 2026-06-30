import { resolveAssetUrl } from '@/lib/api-url'

export type ConflitoModo = 'DESLIGADO' | 'AVISAR' | 'BLOQUEAR'

export interface ConflitoAgenda {
  tipo: string
  nome: string
  evento: string
  horario: string
  image?: string | null
}

/**
 * Renderiza HTML formatado da lista de conflitos de agenda pra mostrar no
 * SweetAlert. Agrupa por tipo (participante / sala), cada item vira um
 * card com avatar/ícone, badge do tipo, nome, evento conflitante e horário.
 * Compartilhado entre a agenda completa e o balão de "Novo evento" (FAB).
 */
export function renderConflitosHtml(conflitos: ConflitoAgenda[], bloqueado: boolean): string {
  const esc = (s: string) => String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;')

  const initials = (n: string) => (n || '?').split(' ').map(p => p[0]).slice(0, 2).join('').toUpperCase()

  const avatar = (nome: string, color: string, imageUrl?: string | null) => {
    if (imageUrl) {
      return `<img src="${esc(resolveAssetUrl(imageUrl))}" alt="${esc(nome)}" style="flex-shrink:0;width:32px;height:32px;border-radius:50%;object-fit:cover;border:1px solid #e2e8f0" />`
    }
    return `<div style="flex-shrink:0;width:32px;height:32px;border-radius:50%;background:${color};color:#fff;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700">${esc(initials(nome))}</div>`
  }

  const iconBox = (icon: string, color: string) => `
    <div style="flex-shrink:0;width:32px;height:32px;border-radius:8px;background:${color}1a;color:${color};display:flex;align-items:center;justify-content:center;font-size:16px">${icon}</div>`

  const participantes = conflitos.filter(c => c.tipo === 'participante')
  const salas = conflitos.filter(c => c.tipo === 'sala')

  const card = (visual: string, color: string, badge: string, nome: string, evento: string, horario: string) => `
    <div style="display:flex;align-items:flex-start;gap:10px;padding:10px 12px;border:1px solid #e2e8f0;border-radius:8px;background:#fff;text-align:left">
      ${visual}
      <div style="flex:1;min-width:0">
        <div style="display:flex;align-items:center;gap:6px;margin-bottom:2px;flex-wrap:wrap">
          <span style="display:inline-block;padding:1px 7px;border-radius:999px;background:${color}1a;color:${color};font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.4px">${badge}</span>
          <span style="font-weight:600;color:#0f172a;font-size:13px">${esc(nome)}</span>
        </div>
        <div style="font-size:12px;color:#64748b">
          Em <span style="color:#0f172a;font-weight:500">"${esc(evento)}"</span>
        </div>
        <div style="font-size:11px;color:#94a3b8;margin-top:2px;font-variant-numeric:tabular-nums">⏰ ${esc(horario)}</div>
      </div>
    </div>
  `

  const sections: string[] = []
  if (participantes.length > 0) {
    sections.push(`
      <div style="margin-top:8px">
        <div style="font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.6px;margin-bottom:6px">Participantes ocupados (${participantes.length})</div>
        <div style="display:flex;flex-direction:column;gap:6px">
          ${participantes.map(c => card(avatar(c.nome, '#0ea5e9', c.image), '#0ea5e9', 'Participante', c.nome, c.evento, c.horario)).join('')}
        </div>
      </div>`)
  }
  if (salas.length > 0) {
    sections.push(`
      <div style="margin-top:8px">
        <div style="font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.6px;margin-bottom:6px">Salas ocupadas (${salas.length})</div>
        <div style="display:flex;flex-direction:column;gap:6px">
          ${salas.map(c => card(iconBox('🚪', '#a855f7'), '#a855f7', 'Sala', c.nome, c.evento, c.horario)).join('')}
        </div>
      </div>`)
  }

  const intro = bloqueado
    ? '<p style="font-size:13px;color:#475569;margin:0 0 4px 0">As regras da empresa <strong style="color:#dc2626">bloqueiam o salvamento</strong> enquanto houver estes conflitos:</p>'
    : '<p style="font-size:13px;color:#475569;margin:0 0 4px 0">Detectamos sobreposições com outros eventos. Você pode salvar mesmo assim ou revisar:</p>'

  return `<div style="text-align:left">${intro}${sections.join('')}</div>`
}
