'use client'

import {
  LayoutGrid, Plus, Move, Maximize2, Edit, Save, RotateCcw,
  Lightbulb, Info, ArrowRight, AlertTriangle,
} from 'lucide-react'
import { Badge } from '@saas/ui'
import { ArticleShell } from '../_components/article-shell'
import { Section, Step, Callout, QuickLink, DefRow } from '../_components/article-blocks'

const MODULO_COLOR = 'var(--mod-corporativo, #0ea5e9)'
const FAQ_COLOR = '#0891b2'

export default function FaqDashboardCustomizadoPage() {
  return (
    <ArticleShell
      modulo="Dashboard"
      moduloColor={MODULO_COLOR}
      icon={LayoutGrid}
      titulo="Dashboard customizado: widgets e layout"
      descricao="Adicionar/remover widgets, personalizar título, expandir em modal e salvar layout por empresa."
    >
      <Section icon={Info} titulo="Conceitos importantes" cor={FAQ_COLOR}>
        <div className="space-y-2 text-sm">
          <DefRow termo="Widget" texto="Card individual no dashboard com KPIs ou listas (Caixa Postal, CND, Certificados, Serviços, Calendário, Ramais, etc)." />
          <DefRow termo="Layout" texto="Posição e tamanho de cada widget no grid. Salvo por empresa — todos os usuários da empresa veem o mesmo padrão." />
          <DefRow termo="Modo de edição" texto="Estado em que widgets podem ser arrastados, redimensionados, removidos ou renomeados." />
          <DefRow termo="Compact mode (1×1)" texto="Widget reduzido a um botão. Click expande em modal sobreposto, sem alterar o layout principal." />
          <DefRow termo="Container queries" texto="Widgets se adaptam ao próprio tamanho — texto e indicadores reorganizam quando o widget é redimensionado." />
        </div>
      </Section>

      <h2 className="text-base font-bold pt-2">Modo de edição</h2>

      <Step n={1} cor={MODULO_COLOR} icon={Edit} titulo="Entrar no modo de edição" rota="Dashboard → botão Editar">
        <p>
          No canto superior do dashboard, clique em <strong>Editar layout</strong>.
          Indicadores visuais ativam-se:
        </p>
        <ul className="list-disc list-inside space-y-1 ml-2">
          <li>Bordas tracejadas em todos os widgets</li>
          <li>Handles de redimensionamento (cantos)</li>
          <li>Ícone de drag para arrastar</li>
          <li>Botão &quot;X&quot; para remover</li>
          <li>Ícone de lápis para renomear</li>
        </ul>
      </Step>

      <Step n={2} cor={MODULO_COLOR} icon={Plus} titulo="Adicionar widgets" rota="modo edição → + Adicionar widget">
        <p>
          Botão flutuante mostra catálogo de widgets disponíveis. Cada um:
        </p>
        <ul className="list-disc list-inside space-y-1 ml-2">
          <li>Tem tamanho padrão (algumas larguras × alturas pré-definidas)</li>
          <li>Pode ser adicionado múltiplas vezes (ex: 2 widgets de Caixa Postal — um por filial)</li>
          <li>Cor própria do módulo de origem</li>
        </ul>
        <Callout tipo="info">
          Widgets dependem de <strong>permissão de leitura</strong> no módulo de origem.
          Usuário sem acesso ao módulo X não vê o widget X mesmo que esteja no layout.
        </Callout>
      </Step>

      <Step n={3} cor={MODULO_COLOR} icon={Move} titulo="Arrastar e redimensionar" rota="modo edição">
        <p>Operações disponíveis:</p>
        <ul className="list-disc list-inside space-y-1 ml-2">
          <li><strong>Arrastar pelo header</strong> — move widget no grid</li>
          <li><strong>Arrastar canto inferior-direito</strong> — redimensiona</li>
          <li>Grid responsivo: largura mínima 1 col, máxima 12 cols (largura total)</li>
          <li>Altura em &quot;rows&quot; (~30px cada)</li>
        </ul>
        <Callout tipo="dica">
          Use <strong>1×1</strong> ou <strong>1×2</strong> para widgets que você quer
          como atalho — clique vira modal expandido com a versão completa.
        </Callout>
      </Step>

      <Step n={4} cor={MODULO_COLOR} icon={Maximize2} titulo="Modal expandido (compact mode)" rota="click em widget 1×1">
        <p>
          Widgets em tamanho mínimo (1×1, 1×2) viram <strong>botões compactos</strong> que ao
          clicar abrem modal sobreposto com a versão completa. Útil para:
        </p>
        <ul className="list-disc list-inside space-y-1 ml-2">
          <li>Manter o dashboard limpo com 8-10 atalhos visuais</li>
          <li>Acessar dados completos sob demanda sem perder o layout</li>
          <li>Indicadores secundários que não precisam estar sempre visíveis</li>
        </ul>
      </Step>

      <Step n={5} cor={MODULO_COLOR} icon={Edit} titulo="Renomear widget" rota="modo edição → ícone lápis">
        <p>
          Clique no lápis no header do widget para customizar o título. Útil quando:
        </p>
        <ul className="list-disc list-inside space-y-1 ml-2">
          <li>Há múltiplos widgets do mesmo tipo (ex: &quot;Caixa Postal — Matriz&quot; vs &quot;Caixa Postal — Filial RJ&quot;)</li>
          <li>O título padrão é genérico e quer especificar (ex: &quot;CND Vencendo — TOP 10 clientes&quot;)</li>
        </ul>
      </Step>

      <Step n={6} cor={MODULO_COLOR} icon={Save} titulo="Salvar layout" rota="botão Salvar (modo edição)">
        <p>
          Após ajustar tudo, clique em <strong>Salvar</strong>. O layout fica:
        </p>
        <ul className="list-disc list-inside space-y-1 ml-2">
          <li>Persistido por <strong>empresa</strong> — todos os usuários da empresa veem o mesmo padrão</li>
          <li>Versionado — alterações sobrescrevem a versão anterior</li>
          <li>Disponível imediatamente para todos os usuários (próximo refresh)</li>
        </ul>
        <Callout tipo="aviso">
          Apenas <strong>master / diretor / coordenador</strong> podem editar o layout
          da empresa — operadores veem mas não alteram.
        </Callout>
      </Step>

      <Step n={7} cor={MODULO_COLOR} icon={RotateCcw} titulo="Resetar para padrão" rota="modo edição → Resetar">
        <p>
          Se quiser voltar ao layout default do sistema:
        </p>
        <ul className="list-disc list-inside space-y-1 ml-2">
          <li>Clique em <strong>Resetar para padrão</strong> no modo de edição</li>
          <li>Confirme — sistema substitui pelo layout original (com todos os widgets em tamanhos padrão)</li>
        </ul>
        <Callout tipo="info">
          Operação não-destrutiva: você pode salvar customizações novamente se mudar
          de ideia. Não há &quot;desfazer&quot; — mas cada save cria nova versão.
        </Callout>
      </Step>

      <Section icon={Lightbulb} titulo="Casos comuns" cor={FAQ_COLOR}>
        <div className="space-y-3">
          <div className="rounded-md border p-3 text-[12px]">
            <p className="text-sm font-semibold mb-1">Widget mostra &quot;Carregando...&quot; permanentemente</p>
            <p className="text-foreground/70">
              1. Confira se você tem permissão de leitura no módulo de origem.
              2. Veja se há erro no Network do navegador (F12). 3. Em alguns widgets,
              dados pesados levam segundos — aguarde 5-10s antes de presumir falha.
            </p>
          </div>
          <div className="rounded-md border p-3 text-[12px]">
            <p className="text-sm font-semibold mb-1">Outro usuário mudou meu layout</p>
            <p className="text-foreground/70">
              Layouts são por <strong>empresa</strong>, não por usuário. Mestre/Diretor
              que salvar afeta todos. Para diferenciar, considere multi-empresa (vide
              FAQ correspondente).
            </p>
          </div>
          <div className="rounded-md border p-3 text-[12px]">
            <p className="text-sm font-semibold mb-1">Quero widget que não existe</p>
            <p className="text-foreground/70">
              Lista de widgets é fixa nesta versão (Caixa Postal, CND, Certificados,
              Calendário, Ramais, Serviços). Novos widgets exigem desenvolvimento — abra
              um pedido com o time técnico.
            </p>
          </div>
        </div>
      </Section>

      <Section icon={ArrowRight} titulo="Atalhos rápidos" cor={FAQ_COLOR}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <QuickLink href="/dashboard" label="Abrir dashboard" cor={MODULO_COLOR} />
          <QuickLink href="/faq/multi-empresa" label="Layout por empresa" cor={MODULO_COLOR} />
          <QuickLink href="/faq/usuario-mfa-permissoes" label="Permissões dos widgets" cor={MODULO_COLOR} />
        </div>
      </Section>
    </ArticleShell>
  )
}
