'use client'

import {
  Layers, Pin, X, ArrowRight as ArrowRightIcon, ChevronsRight,
  Lightbulb, Info, ArrowRight, AlertTriangle, MousePointer,
} from 'lucide-react'
import { Badge } from '@saas/ui'
import { ArticleShell } from '../_components/article-shell'
import { Section, Step, Callout, QuickLink, DefRow } from '../_components/article-blocks'

const MODULO_COLOR = 'var(--mod-cadastros, #10b981)'
const FAQ_COLOR = '#0891b2'

export default function FaqTabsFixacaoPage() {
  return (
    <ArticleShell
      modulo="Sistema de Abas"
      moduloColor={MODULO_COLOR}
      icon={Layers}
      titulo="Sistema de Abas: navegação rápida e fixação"
      descricao="Como o sistema mantém múltiplas páginas abertas em abas, fixar as importantes e fechar em massa."
    >
      <Section icon={Info} titulo="Conceitos importantes" cor={FAQ_COLOR}>
        <div className="space-y-2 text-sm">
          <DefRow termo="Aba" texto="Página aberta no sistema. Cada navegação para uma nova rota cria/foca uma aba." />
          <DefRow termo="Aba fixada (pinned)" texto="Aba que não fecha em ações em massa (Fechar Outras, Fechar Todas). Visualmente sem botão X." />
          <DefRow termo="Aba ativa" texto="Aba atualmente em foco (página renderizada). Apenas uma por vez." />
          <DefRow termo="Persistência" texto="Lista de abas + ordem + fixação são salvas no servidor — aparecem após fechar e reabrir o navegador." />
        </div>
      </Section>

      <h2 className="text-base font-bold pt-2">Operação básica</h2>

      <Step n={1} cor={MODULO_COLOR} icon={MousePointer} titulo="Abrir e alternar entre abas" rota="—">
        <p>Comportamento padrão:</p>
        <ul className="list-disc list-inside space-y-1 ml-2">
          <li>Click em link da sidebar → abre nova aba (ou foca se já existe)</li>
          <li>Click em aba na barra superior → alterna foco</li>
          <li>Click no &quot;X&quot; da aba → fecha (não funciona em fixadas)</li>
          <li>Atalhos de teclado: <code className="text-[11px]">Ctrl + Tab</code> próxima aba; <code className="text-[11px]">Ctrl + W</code> fecha atual</li>
        </ul>
        <Callout tipo="info">
          Diferente do navegador, abas <strong>não duplicam</strong>: abrir o mesmo
          link várias vezes apenas foca a aba existente.
        </Callout>
      </Step>

      <Step n={2} cor={MODULO_COLOR} icon={Pin} titulo="Fixar abas importantes" rota="botão direito → Fixar">
        <p>
          Para abas que você sempre quer disponíveis:
        </p>
        <ul className="list-disc list-inside space-y-1 ml-2">
          <li>Botão direito na aba → <strong>Fixar</strong></li>
          <li>Aba migra para a esquerda da barra (ordenação automática)</li>
          <li>Visualmente identificável: ícone de pin, sem botão de fechar</li>
          <li>Para desafixar: botão direito → <strong>Desafixar</strong></li>
        </ul>
        <Callout tipo="dica">
          Padrão recomendado: fixe <strong>Dashboard</strong>, <strong>Meus Serviços</strong>,
          <strong> Caixa Postal</strong> e <strong>CND&apos;s</strong> — telas de uso diário que
          você não quer fechar acidentalmente.
        </Callout>
      </Step>

      <Step n={3} cor={MODULO_COLOR} icon={X} titulo="Ações em massa" rota="botão direito na aba">
        <p>Menu de contexto oferece:</p>
        <ul className="list-disc list-inside space-y-1 ml-2">
          <li>
            <strong>Fechar</strong> — apenas a aba atual (não funciona em fixada)
          </li>
          <li>
            <strong>Fechar Outras</strong> — mantém só a atual + todas as fixadas
          </li>
          <li>
            <strong>Fechar à Direita</strong> — fecha todas as abas após a atual (preserva fixadas)
          </li>
          <li>
            <strong>Fechar Todas</strong> — fecha tudo exceto fixadas; navega para Dashboard ou primeira fixada
          </li>
        </ul>
        <Callout tipo="info">
          Fixadas são <strong>imunes</strong> a todas as ações em massa — única forma de fechar
          uma fixada é desafixar primeiro.
        </Callout>
      </Step>

      <Step n={4} cor={MODULO_COLOR} icon={Layers} titulo="Reordenar abas" rota="drag-and-drop">
        <p>
          Arraste a aba para a posição desejada na barra. Restrições:
        </p>
        <ul className="list-disc list-inside space-y-1 ml-2">
          <li>Fixadas só trocam de posição entre si (não saem da zona à esquerda)</li>
          <li>Não-fixadas idem (zona à direita)</li>
          <li>Para mover uma aba entre as zonas, use Fixar/Desafixar</li>
        </ul>
      </Step>

      <Section icon={Lightbulb} titulo="Casos comuns" cor={FAQ_COLOR}>
        <div className="space-y-3">
          <div className="rounded-md border p-3 text-[12px]">
            <p className="text-sm font-semibold mb-1">Limite de abas abertas</p>
            <p className="text-foreground/70">
              Não há limite formal, mas performance pode degradar acima de ~20 abas.
              Use <strong>Fechar Outras</strong> periodicamente para limpar — fixadas
              sobrevivem.
            </p>
          </div>
          <div className="rounded-md border p-3 text-[12px]">
            <p className="text-sm font-semibold mb-1">Abas sumiram após login</p>
            <p className="text-foreground/70">
              Persistência depende de cookie de sessão válido. Logout completo limpa
              o estado. Após próximo login, comece com Dashboard e refixe os essenciais.
            </p>
          </div>
          <div className="rounded-md border p-3 text-[12px]">
            <p className="text-sm font-semibold mb-1">Mesma página em duas abas</p>
            <p className="text-foreground/70">
              Por design, sistema impede duplicação. Se precisar comparar duas instâncias
              de algo, abra em <strong>nova janela</strong> do navegador (Ctrl + N) — cada
              janela tem sistema de abas próprio.
            </p>
          </div>
          <div className="rounded-md border p-3 text-[12px]">
            <p className="text-sm font-semibold mb-1">Quero exportar / sincronizar abas entre dispositivos</p>
            <p className="text-foreground/70">
              Não suportado nesta versão. Cada dispositivo / navegador mantém seu próprio
              estado de abas. Considere fixar as 4-5 essenciais — assim refazer é rápido.
            </p>
          </div>
        </div>
      </Section>

      <Section icon={ArrowRight} titulo="Atalhos rápidos" cor={FAQ_COLOR}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <QuickLink href="/dashboard" label="Dashboard (recomendado fixar)" cor={MODULO_COLOR} />
          <QuickLink href="/meus-servicos" label="Meus Serviços (recomendado fixar)" cor={MODULO_COLOR} />
          <QuickLink href="/caixapostal" label="Caixa Postal (recomendado fixar)" cor={MODULO_COLOR} />
        </div>
      </Section>
    </ArticleShell>
  )
}
