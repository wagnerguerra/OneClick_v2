'use client'

import {
  Calendar, Plus, Users, Bell, Globe, RefreshCw,
  Lightbulb, Info, ArrowRight, AlertTriangle, Clock,
} from 'lucide-react'
import { Badge } from '@saas/ui'
import { ArticleShell } from '../_components/article-shell'
import { Section, Step, Callout, QuickLink, DefRow } from '../_components/article-blocks'

const MODULO_COLOR = 'var(--mod-corporativo, #0ea5e9)' // sky
const FAQ_COLOR = '#0891b2'

export default function FaqAgendaCorporativaPage() {
  return (
    <ArticleShell
      modulo="Agenda Corporativa"
      moduloColor={MODULO_COLOR}
      icon={Calendar}
      titulo="Agenda Corporativa: eventos e Google Calendar"
      descricao="Criar eventos, convidar participantes, vincular a clientes e sincronizar com Google Calendar."
    >
      <Section icon={Info} titulo="Conceitos importantes" cor={FAQ_COLOR}>
        <div className="space-y-2 text-sm">
          <DefRow termo="Evento" texto="Compromisso com data, horário, participantes e descrição. Pode estar vinculado a cliente ou processo." />
          <DefRow termo="Participantes" texto="Usuários internos (colaboradores) ou externos (clientes via e-mail). Cada um confirma presença separadamente." />
          <DefRow termo="Visibilidade" texto="Público (todos veem) · Privado (só participantes) · Departamento (apenas área específica)." />
          <DefRow termo="Sincronização Google" texto="OAuth permite ler/escrever eventos no Google Calendar do usuário — mantém os dois lados sincronizados." />
          <DefRow termo="Recorrência" texto="Diária, semanal, mensal — sistema gera ocorrências automaticamente até a data de término." />
        </div>
      </Section>

      <h2 className="text-base font-bold pt-2">Setup (uma vez por usuário)</h2>

      <Step n={1} cor={MODULO_COLOR} icon={Globe} titulo="Conectar Google Calendar (opcional)" rota="/agenda → Configurações → Conectar Google">
        <p>
          Para sincronizar eventos com Google Calendar:
        </p>
        <ul className="list-disc list-inside space-y-1 ml-2">
          <li>Clique em <strong>Conectar Google</strong> nas configurações da Agenda</li>
          <li>Faça login com sua conta Google e autorize as permissões solicitadas</li>
          <li>Sistema guarda token OAuth (refresh automático)</li>
          <li>A partir daí, eventos criados no SaaS aparecem no Google e vice-versa</li>
        </ul>
        <Callout tipo="info">
          Conexão é <strong>por usuário</strong> — cada um tem o seu próprio Google
          Calendar conectado. Master não vê eventos privados de outros usuários.
        </Callout>
      </Step>

      <h2 className="text-base font-bold pt-2">Operação diária</h2>

      <Step n={2} cor={MODULO_COLOR} icon={Plus} titulo="Criar um evento" rota="/agenda → + Novo Evento">
        <p>Campos principais:</p>
        <ul className="list-disc list-inside space-y-1 ml-2">
          <li><strong>Título</strong> e <strong>descrição</strong></li>
          <li><strong>Data e horário</strong> (início e fim) — ou marca dia inteiro</li>
          <li><strong>Local</strong> — texto livre ou link de videoconferência</li>
          <li><strong>Cliente vinculado</strong> (opcional) — aparece no histórico do cliente</li>
          <li><strong>Participantes</strong> — usuários internos por busca, externos por e-mail</li>
          <li><strong>Lembretes</strong> — 1 dia antes, 1 hora antes, 15 min antes</li>
        </ul>
        <Callout tipo="dica">
          Para reuniões com cliente, <strong>vincule o cliente</strong> — facilita
          encontrar o evento depois quando estiver olhando o histórico daquela conta.
        </Callout>
      </Step>

      <Step n={3} cor={MODULO_COLOR} icon={Users} titulo="Convidar participantes" rota="ao criar/editar evento">
        <p>Tipos de participante:</p>
        <ul className="list-disc list-inside space-y-1 ml-2">
          <li>
            <strong>Internos</strong> — busca por nome no /usuarios. Recebem o evento na sua agenda
            interna automaticamente
          </li>
          <li>
            <strong>Externos</strong> — informe e-mail. Sistema envia convite com link público
            de confirmação (Sim / Não / Talvez)
          </li>
        </ul>
        <Callout tipo="info">
          Quando Google Calendar está conectado, convites externos viram <strong>guests</strong>{' '}
          do evento Google — funcionam normalmente nos calendários do destinatário.
        </Callout>
      </Step>

      <Step n={4} cor={MODULO_COLOR} icon={Clock} titulo="Recorrência" rota="opção ao criar evento">
        <p>
          Para eventos repetitivos (reunião semanal, fechamento mensal):
        </p>
        <ul className="list-disc list-inside space-y-1 ml-2">
          <li>Marque <strong>recorrente</strong> e escolha frequência (diária, semanal, mensal)</li>
          <li>Defina data de término ou número de ocorrências</li>
          <li>Cada ocorrência pode ser editada individualmente sem afetar as outras</li>
        </ul>
        <Callout tipo="aviso">
          Cancelar uma ocorrência específica não cancela a série toda. Para cancelar
          tudo, edite o evento mestre e remova a recorrência.
        </Callout>
      </Step>

      <Step n={5} cor={MODULO_COLOR} icon={Bell} titulo="Notificações e lembretes">
        <p>
          Sistema envia automaticamente:
        </p>
        <ul className="list-disc list-inside space-y-1 ml-2">
          <li><strong>Convite</strong> — ao criar/atualizar evento</li>
          <li><strong>Lembrete prévio</strong> — conforme configurado (1d, 1h, 15min antes)</li>
          <li><strong>Cancelamento</strong> — quando evento é deletado</li>
        </ul>
        <p>
          Para participantes externos: e-mail. Para internos: sino global + e-mail (configurável).
        </p>
      </Step>

      <Step n={6} cor={MODULO_COLOR} icon={RefreshCw} titulo="Sincronização bidirecional Google" rota="automático">
        <p>Após conexão (passo 1):</p>
        <ul className="list-disc list-inside space-y-1 ml-2">
          <li>Eventos criados <strong>no SaaS</strong> são espelhados no Google</li>
          <li>Eventos criados <strong>no Google</strong> aparecem no SaaS</li>
          <li>Edição em um lado propaga ao outro (a cada poucos minutos)</li>
        </ul>
        <Callout tipo="aviso">
          Eventos do Google que não tinham vínculo com clientes/processos do SaaS são
          importados como <em>genéricos</em> (sem cliente associado). Você pode editar e
          vincular depois.
        </Callout>
      </Step>

      <Section icon={Lightbulb} titulo="Casos comuns" cor={FAQ_COLOR}>
        <div className="space-y-3">
          <div className="rounded-md border p-3 text-[12px]">
            <p className="text-sm font-semibold mb-1">Convite externo não chegou</p>
            <p className="text-foreground/70">
              Verifique pasta de spam do destinatário. Se persistir, copie o link de
              confirmação manualmente em &quot;Editar evento → Participantes&quot; e envie
              por WhatsApp/outro canal.
            </p>
          </div>
          <div className="rounded-md border p-3 text-[12px]">
            <p className="text-sm font-semibold mb-1">Token Google expirou</p>
            <p className="text-foreground/70">
              Sistema avisa via notificação. Reconecte em <strong>/agenda → Configurações</strong>{' '}
              clicando em &quot;Reconectar Google&quot;. Token novo é gerado e sincronização
              retoma normalmente.
            </p>
          </div>
          <div className="rounded-md border p-3 text-[12px]">
            <p className="text-sm font-semibold mb-1">Evento conflitante</p>
            <p className="text-foreground/70">
              Sistema avisa quando você ou um participante interno já tem outro
              compromisso no mesmo horário. Você pode prosseguir mesmo assim ou ajustar.
            </p>
          </div>
        </div>
      </Section>

      <Section icon={ArrowRight} titulo="Atalhos rápidos" cor={FAQ_COLOR}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <QuickLink href="/agenda" label="Abrir agenda" cor={MODULO_COLOR} />
          <QuickLink href="/clientes" label="Eventos por cliente" cor={MODULO_COLOR} />
          <QuickLink href="/perfil" label="Conectar Google" cor={MODULO_COLOR} />
        </div>
      </Section>
    </ArticleShell>
  )
}
