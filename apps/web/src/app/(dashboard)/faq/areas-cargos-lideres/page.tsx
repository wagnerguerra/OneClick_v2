'use client'

import {
  Users, LayoutGrid, Briefcase, UserCheck, Eye,
  Lightbulb, Info, ArrowRight, AlertTriangle,
} from 'lucide-react'
import { Badge } from '@saas/ui'
import { ArticleShell } from '../_components/article-shell'
import { Section, Step, Callout, QuickLink, DefRow } from '../_components/article-blocks'

const MODULO_COLOR = 'var(--mod-cadastros, #10b981)' // emerald
const FAQ_COLOR = '#0891b2'

export default function FaqAreasCargosLideresPage() {
  return (
    <ArticleShell
      modulo="Áreas, Cargos e Líderes"
      moduloColor={MODULO_COLOR}
      icon={Users}
      titulo="Áreas, Cargos e Líderes: hierarquia organizacional"
      descricao="Como áreas, cargos e líderes definem visibilidade de execuções, contratações por cliente e responsabilidade técnica."
    >
      <Section icon={Info} titulo="Conceitos importantes" cor={FAQ_COLOR}>
        <div className="space-y-2 text-sm">
          <DefRow termo="Área" texto="Departamento do escritório (Contábil, Fiscal, Trabalhista, Societário, Legalização). Cliente contrata uma ou mais áreas." />
          <DefRow termo="Cargo" texto="Função organizacional (Analista Sênior, Coordenador Fiscal, Sócio-Diretor). Define responsabilidades e nível hierárquico." />
          <DefRow termo="Líder de área" texto="Usuário responsável por uma área inteira. Vê todas as execuções dos colaboradores que ele lidera." />
          <DefRow termo="Responsável pelo cliente" texto="Em cada par cliente+área, há 1 responsável direto. Vê execuções desse cliente naquela área." />
          <DefRow termo="Hierarquia de visibilidade" texto="Master/Diretor/Coordenador → tudo · Líder → área dele · Responsável → cliente+área dele · Operador → próprias execuções." />
        </div>
      </Section>

      <h2 className="text-base font-bold pt-2">Cadastro</h2>

      <Step n={1} cor={MODULO_COLOR} icon={LayoutGrid} titulo="Cadastrar áreas" rota="/areas → + Nova Área">
        <p>Para cada área do escritório:</p>
        <ul className="list-disc list-inside space-y-1 ml-2">
          <li><strong>Nome</strong> — Contábil, Fiscal, Trabalhista, etc</li>
          <li><strong>Code</strong> — abreviação (CONT, FIS, TRAB) usada em relatórios</li>
          <li><strong>Líder</strong> — usuário responsável pela área inteira (opcional, mas recomendado)</li>
          <li><strong>Descrição</strong> — escopo da área para evitar dúvidas</li>
        </ul>
        <Callout tipo="dica">
          Comece com poucas áreas largas e divida só quando o time crescer. Áreas demais
          fragmentam relatórios e complicam atribuições.
        </Callout>
      </Step>

      <Step n={2} cor={MODULO_COLOR} icon={Briefcase} titulo="Cadastrar cargos" rota="/cargos → + Novo Cargo">
        <p>Cargos definem a função do colaborador. Sugestão de hierarquia:</p>
        <ul className="list-disc list-inside space-y-1 ml-2">
          <li><strong>Estagiário / Trainee</strong> — execução supervisionada</li>
          <li><strong>Analista (Júnior, Pleno, Sênior)</strong> — execução direta</li>
          <li><strong>Coordenador / Líder</strong> — gestão de área</li>
          <li><strong>Gerente / Diretor</strong> — gestão executiva</li>
          <li><strong>Sócio</strong> — propriedade</li>
        </ul>
      </Step>

      <Step n={3} cor={MODULO_COLOR} icon={UserCheck} titulo="Vincular usuários a área e cargo" rota="/usuarios/[id]/editar">
        <p>
          Em cada usuário, defina:
        </p>
        <ul className="list-disc list-inside space-y-1 ml-2">
          <li><strong>Área</strong> (1) — onde o colaborador atua principalmente</li>
          <li><strong>Cargo</strong> — função organizacional</li>
          <li><strong>Role</strong> — categoria sistêmica (DIRETOR, COORDENADOR, GESTOR, COLABORADOR_INTERNO, etc)</li>
        </ul>
        <Callout tipo="aviso">
          O <strong>Role</strong> é diferente do <strong>Cargo</strong>. Role afeta visibilidade
          (Diretor vê tudo); Cargo é só descritivo. Mantenha os dois alinhados.
        </Callout>
      </Step>

      <Step n={4} cor={MODULO_COLOR} icon={Users} titulo="Definir responsáveis por cliente+área" rota="/clientes/[id] → aba Serviços">
        <p>
          No cadastro de cada cliente, em <strong>Áreas Contratadas</strong>:
        </p>
        <ul className="list-disc list-inside space-y-1 ml-2">
          <li>Marque as áreas que o cliente contrata</li>
          <li>Para cada uma, defina o <strong>responsável</strong> (usuário daquela área)</li>
        </ul>
        <Callout tipo="info">
          Esse vínculo cria a regra: o responsável vê em <code className="text-[11px]">/meus-servicos</code>{' '}
          tudo do cliente naquela área. Sem vínculo, o painel fica vazio.
        </Callout>
      </Step>

      <Step n={5} cor={MODULO_COLOR} icon={Eye} titulo="Validar visibilidade" rota="/meus-servicos com cada usuário">
        <p>
          Faça login com diferentes usuários e abra Meus Serviços. Verifique:
        </p>
        <ul className="list-disc list-inside space-y-1 ml-2">
          <li>Master/Diretor: vê tudo</li>
          <li>Coordenador: vê tudo da empresa dele</li>
          <li>Líder de área: vê execuções dos colaboradores que lidera</li>
          <li>Operador: vê só as próprias (responsavelId = userId)</li>
          <li>Responsável por cliente+área: vê execuções desses pares específicos</li>
        </ul>
        <Callout tipo="dica">
          Veja <a className="text-emerald-600 hover:underline" href="/faq/meus-servicos">FAQ Meus Serviços</a>{' '}
          para a regra completa de visibilidade.
        </Callout>
      </Step>

      <Section icon={Lightbulb} titulo="Casos comuns" cor={FAQ_COLOR}>
        <div className="space-y-3">
          <div className="rounded-md border p-3 text-[12px]">
            <p className="text-sm font-semibold mb-1">Colaborador atua em múltiplas áreas</p>
            <p className="text-foreground/70">
              Hoje, cada usuário tem <strong>1 área principal</strong>. Para visibilidade
              em outras áreas, marque-o como <strong>responsável</strong> em clientes
              específicos daquelas áreas (passo 4) — não precisa duplicar usuário.
            </p>
          </div>
          <div className="rounded-md border p-3 text-[12px]">
            <p className="text-sm font-semibold mb-1">Mudança de líder de área</p>
            <p className="text-foreground/70">
              Edite a área e mude o campo <strong>Líder</strong>. Não há histórico —
              a partir do próximo login do antigo líder, ele perde a visão de área
              (mas mantém clientes onde é responsável direto).
            </p>
          </div>
          <div className="rounded-md border p-3 text-[12px]">
            <p className="text-sm font-semibold mb-1">Gestor quer ver tudo de um cliente</p>
            <p className="text-foreground/70">
              Para visão consolidada por cliente (todas as áreas), use papel{' '}
              <strong>Coordenador</strong> ou <strong>isMaster</strong>. Ou peça acesso
              via watcher em execuções específicas (vide FAQ Meus Serviços).
            </p>
          </div>
        </div>
      </Section>

      <Section icon={ArrowRight} titulo="Atalhos rápidos" cor={FAQ_COLOR}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <QuickLink href="/areas" label="Cadastrar áreas" cor={MODULO_COLOR} />
          <QuickLink href="/cargos" label="Cadastrar cargos" cor={MODULO_COLOR} />
          <QuickLink href="/usuarios" label="Vincular usuários" cor={MODULO_COLOR} />
          <QuickLink href="/faq/meus-servicos" label="Regras de visibilidade" cor={MODULO_COLOR} />
        </div>
      </Section>
    </ArticleShell>
  )
}
