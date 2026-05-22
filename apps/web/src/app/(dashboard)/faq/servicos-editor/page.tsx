'use client'

import {
  Workflow, Info, Lightbulb, ArrowRight, MousePointer2, GitBranch, Trash2,
  Plus, LayoutGrid, Maximize2, Eye, AlertTriangle, ShieldCheck,
} from 'lucide-react'
import { Badge } from '@saas/ui'
import { ArticleShell } from '../_components/article-shell'
import { Section, Step, Callout, QuickLink, DefRow } from '../_components/article-blocks'

const MODULO_COLOR = 'var(--mod-cadastros, #10b981)'
const FAQ_COLOR = '#047857'

export default function FaqServicosEditorPage() {
  return (
    <ArticleShell
      modulo="Serviços"
      moduloColor={MODULO_COLOR}
      icon={Workflow}
      titulo="Editor de fluxograma de Serviços"
      descricao="Modele visualmente a cadeia de serviços — arraste blocos, crie ligações, defina decisões e organize com auto-layout."
    >
      <Section icon={Info} titulo="O que é" cor={FAQ_COLOR}>
        <div className="space-y-2 text-sm">
          <DefRow termo="Fluxograma" texto="Visualização gráfica dos encadeamentos de um serviço-template — qual vem antes, qual vem depois, condições, paralelismos." />
          <DefRow termo="Bloco" texto="Cada serviço-template é um bloco no canvas. Pode ser do tipo Atividade (retângulo) ou Decisão (losango)." />
          <DefRow termo="Encadeamento" texto="Seta que liga um bloco a outro — significa 'quando este serviço concluir, crie aquele'. Tem flags (iniciaAuto, obrigatorio, herdaResponsavel) e condição opcional." />
          <DefRow termo="Raiz" texto="Bloco a partir do qual o fluxo está sendo visto. Você sempre abre a aba Fluxo de algum serviço-template — esse é a raiz." />
          <DefRow termo="Ancestrais" texto="Blocos que apontam para a raiz (direta ou indiretamente). Aparecem 'apagados' à esquerda, dando contexto da cadeia." />
        </div>
      </Section>

      <h2 className="text-base font-bold pt-2">Como usar</h2>

      <Step n={1} cor={MODULO_COLOR} icon={MousePointer2} titulo="Abrir o fluxo de um serviço" rota="/servicos → clicar em qualquer serviço → aba Fluxo">
        <p>
          Em <strong>/servicos</strong>, clique em qualquer template pra entrar na página de detalhe.
          Vá para a aba <strong>Fluxo</strong>. O sistema desenha automaticamente a cadeia (BFS de ancestrais + sucessores).
        </p>
        <Callout tipo="info">
          O <strong>+/−</strong> no canto inferior direito de cada bloco abre uma prévia
          com as etapas e passos daquele serviço — útil sem precisar abrir a página.
        </Callout>
      </Step>

      <Step n={2} cor={MODULO_COLOR} icon={LayoutGrid} titulo="Reposicionar blocos">
        <p>
          Arraste qualquer bloco com o mouse pra reposicionar. As posições são <strong>salvas
          automaticamente</strong> em ~600ms (debounce) — sem precisar clicar em Salvar.
        </p>
        <ul className="list-disc list-inside space-y-1 ml-2">
          <li>Cada serviço-raiz tem seu próprio layout salvo</li>
          <li>Botão <strong>Auto-organizar</strong> reaplica o algoritmo Dagre (LR padrão), descartando o layout customizado</li>
          <li>Blocos ancestrais (apagados) não podem ser arrastados — eles seguem o auto-layout</li>
        </ul>
      </Step>

      <Step n={3} cor={MODULO_COLOR} icon={ArrowRight} titulo="Criar ligações entre blocos">
        <p>
          Cada bloco tem dois <strong>handles</strong> (pontinhos coloridos): à esquerda
          (entrada) e à direita (saída). Para conectar:
        </p>
        <ol className="list-decimal list-inside space-y-1 ml-2">
          <li>Clique e segure no handle de saída (direita) do bloco origem</li>
          <li>Arraste até o bloco destino</li>
          <li>Solte sobre o bloco — o encadeamento é criado com defaults (auto-início, obrigatório)</li>
        </ol>
        <Callout tipo="aviso">
          <AlertTriangle className="inline h-3 w-3" /> O sistema valida antes de criar:
          <ul className="list-disc list-inside ml-2 mt-1">
            <li>Não permite serviço apontar pra si mesmo</li>
            <li>Não permite duplicata (mesmos origem e destino)</li>
            <li><strong>Detecta ciclos</strong> — se a conexão criar um loop (destino já alcança a origem), bloqueia e avisa</li>
          </ul>
        </Callout>
      </Step>

      <Step n={4} cor={MODULO_COLOR} icon={Trash2} titulo="Excluir ligações">
        <p>
          Clique numa seta pra selecioná-la (fica verde-azulada e mais grossa) e pressione
          <kbd className="mx-1 rounded border bg-muted px-1 text-[10px]">Delete</kbd> ou
          <kbd className="mx-1 rounded border bg-muted px-1 text-[10px]">Backspace</kbd>.
          Há confirmação antes de remover.
        </p>
        <Callout tipo="info">
          Depois de excluir, o sucessor não é mais criado automaticamente quando o
          predecessor concluir. Tickets já em andamento não são afetados.
        </Callout>
      </Step>

      <Step n={5} cor={MODULO_COLOR} icon={GitBranch} titulo="Bloco de Decisão (losango)">
        <p>
          Quando o fluxo precisa <strong>rotear</strong> conforme uma condição (ex: cliente PJ vs PF),
          crie um bloco do tipo <strong>Decisão</strong>:
        </p>
        <ol className="list-decimal list-inside space-y-1 ml-2">
          <li>Em <strong>/servicos</strong>, clique em <strong>Novo Serviço</strong></li>
          <li>No topo do modal, escolha <strong>Decisão</strong> (em vez de Atividade)</li>
          <li>Dê um nome que faça uma pergunta (ex: &quot;Cliente é Lucro Real?&quot;)</li>
          <li>Salve — o bloco aparece como losango violeta no canvas</li>
          <li>Crie 2+ saídas dele (uma pra cada caminho)</li>
          <li>Em cada saída (encadeamento), defina a <strong>condição</strong> e o <strong>rótulo</strong> (ex: &quot;Sim&quot;, &quot;Não&quot;)</li>
        </ol>
        <Callout tipo="dica">
          O rótulo aparece numa pílula branca em cima da seta — facilita ler o fluxo.
          Quando o serviço executa, o engine avalia as condições em ordem e enfileira
          apenas o sucessor que casa.
        </Callout>
      </Step>

      <Step n={6} cor={MODULO_COLOR} icon={Maximize2} titulo="Tela cheia e minimap">
        <p>
          No canto superior direito do canvas:
        </p>
        <ul className="list-disc list-inside space-y-1 ml-2">
          <li><Eye className="inline h-3 w-3" /> Toggle do <strong>minimap</strong> (mapa de navegação)</li>
          <li><Maximize2 className="inline h-3 w-3" /> <strong>Tela cheia</strong> — útil para fluxos grandes</li>
          <li><LayoutGrid className="inline h-3 w-3" /> <strong>Auto-organizar</strong> — recalcula posições via Dagre</li>
        </ul>
        <Callout tipo="info">
          Controles de zoom (+/−), pan (arrastar canvas) e ajustar à tela ficam no canto
          inferior esquerdo. Zoom também com Ctrl+scroll.
        </Callout>
      </Step>

      <Section icon={ShieldCheck} titulo="Permissões" cor={FAQ_COLOR}>
        <div className="space-y-2 text-sm">
          <DefRow termo="servicos.canRead" texto="Ver o fluxograma (modo leitura). Sem essa permissão, a página /servicos/[id] inteira é bloqueada." />
          <DefRow termo="servicos.canWrite" texto="Arrastar blocos, criar/excluir ligações, mudar tipo, auto-organizar. Sem essa permissão, o canvas vira só visualização." />
        </div>
        <Callout tipo="aviso">
          Tentativa de mutation sem permissão é bloqueada no backend (403). O frontend
          atualmente mostra os botões mesmo para quem não pode editar — em breve serão
          ocultados conforme `servicos.canWrite`.
        </Callout>
      </Section>

      <Section icon={Lightbulb} titulo="Casos comuns" cor={FAQ_COLOR}>
        <div className="space-y-3">
          <div className="rounded-md border p-3 text-[12px]">
            <p className="text-sm font-semibold mb-1">Layout ficou bagunçado depois de eu reposicionar</p>
            <p className="text-foreground/70">
              Clique em <strong>Auto-organizar</strong> no canto superior direito. O Dagre
              regenera o layout em LR (esquerda→direita). O layout customizado anterior é
              sobrescrito após confirmação.
            </p>
          </div>
          <div className="rounded-md border p-3 text-[12px]">
            <p className="text-sm font-semibold mb-1">Quero converter uma Atividade em Decisão</p>
            <p className="text-foreground/70">
              Atualmente o tipo é definido só na criação. Para converter um Serviço existente,
              é necessário recriar como Decisão e reconectar as ligações. Em evolução futura
              o tipo poderá ser alterado in-place.
            </p>
          </div>
          <div className="rounded-md border p-3 text-[12px]">
            <p className="text-sm font-semibold mb-1">As setas estão atravessando blocos</p>
            <p className="text-foreground/70">
              Clique em <strong>Auto-organizar</strong> — em layouts muito densos o
              algoritmo Dagre recalcula evitando sobreposições. Você também pode arrastar
              blocos manualmente pra resolver casos específicos.
            </p>
          </div>
        </div>
      </Section>

      <Section icon={ArrowRight} titulo="Atalhos rápidos" cor={FAQ_COLOR}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <QuickLink href="/servicos" label="Cadastro de serviços" cor={MODULO_COLOR} />
          <QuickLink href="/processos" label="Processos em execução" cor={MODULO_COLOR} />
          <QuickLink href="/faq/processos" label="Fluxo de Processos (FAQ)" cor={MODULO_COLOR} />
          <QuickLink href="/faq/meus-servicos" label="Meus Serviços (FAQ)" cor={MODULO_COLOR} />
        </div>
      </Section>
    </ArticleShell>
  )
}
