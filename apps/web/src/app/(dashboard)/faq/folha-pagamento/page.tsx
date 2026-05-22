'use client'

import {
  FileSpreadsheet, Settings2, Upload, Table2, Download,
  Lightbulb, Info, ArrowRight, AlertTriangle,
} from 'lucide-react'
import { Badge } from '@saas/ui'
import { ArticleShell } from '../_components/article-shell'
import { Section, Step, Callout, QuickLink, DefRow } from '../_components/article-blocks'

const MODULO_COLOR = 'var(--mod-trabalhista, #8b5cf6)'
const FAQ_COLOR = '#0891b2'

export default function FaqFolhaPagamentoPage() {
  return (
    <ArticleShell
      modulo="Folha de Pagamento"
      moduloColor={MODULO_COLOR}
      icon={FileSpreadsheet}
      titulo="Importação de Folha de Pagamento"
      descricao="Importar arquivos mensais de folha, mapear eventos por filial e exportar para outros sistemas."
    >
      <Section icon={Info} titulo="Conceitos importantes" cor={FAQ_COLOR}>
        <div className="space-y-2 text-sm">
          <DefRow termo="Folha mensal" texto="Conjunto de lançamentos de remuneração do mês — salários, descontos, encargos." />
          <DefRow termo="Filial" texto="Estabelecimento do cliente. Multi-filial = mesmo CNPJ raiz com múltiplos /0001, /0002, etc." />
          <DefRow termo="Evento" texto="Tipo de lançamento: salário base (1001), horas extras (1101), INSS (3001), etc. Cada evento tem código próprio no eSocial." />
          <DefRow termo="Mapeamento" texto="Cada evento da folha é vinculado a uma conta contábil para gerar lançamento automático." />
        </div>
      </Section>

      <h2 className="text-base font-bold pt-2">Setup (uma vez por cliente)</h2>

      <Step n={1} cor={MODULO_COLOR} icon={Settings2} titulo="Configurar filiais e eventos" rota="/folha-pagamento → aba Configuração">
        <p>
          Antes da primeira importação:
        </p>
        <ul className="list-disc list-inside space-y-1 ml-2">
          <li><strong>Cadastrar filiais</strong> do cliente — CNPJ raiz + sufixos (/0001, /0002...)</li>
          <li><strong>Mapear eventos</strong> — para cada código (ex: 1001 = salário), associe a conta contábil correspondente</li>
          <li><strong>Configurar leiautes</strong> — formato do arquivo que será importado (CSV, TXT, XLSX)</li>
        </ul>
        <Callout tipo="dica">
          Use <strong>mapeamento padrão</strong> que vem pré-configurado para os códigos
          eSocial mais comuns. Personalize só os específicos do cliente.
        </Callout>
      </Step>

      <h2 className="text-base font-bold pt-2">Importação mensal</h2>

      <Step n={2} cor={MODULO_COLOR} icon={Upload} titulo="Importar arquivo da folha" rota="aba Importação">
        <p>
          Para cada competência:
        </p>
        <ul className="list-disc list-inside space-y-1 ml-2">
          <li>Selecione cliente e competência (AAAA-MM)</li>
          <li>Faça upload do arquivo (formato definido na configuração)</li>
          <li>Sistema valida estrutura e mostra preview antes de confirmar</li>
          <li>Confirma → registros entram no banco vinculados a cliente + competência</li>
        </ul>
        <Callout tipo="aviso">
          Reimportar a mesma competência <strong>substitui</strong> os dados anteriores —
          confirme antes para não perder ajustes manuais.
        </Callout>
      </Step>

      <Step n={3} cor={MODULO_COLOR} icon={Table2} titulo="Conferir lançamentos" rota="aba Lançamentos">
        <p>
          Tabela com todos os registros importados, com filtros:
        </p>
        <ul className="list-disc list-inside space-y-1 ml-2">
          <li>Por <strong>filial</strong>, <strong>funcionário</strong>, <strong>evento</strong></li>
          <li>Por <strong>competência</strong> (mês/ano)</li>
          <li>Por <strong>conta contábil</strong> mapeada</li>
        </ul>
        <Callout tipo="info">
          Eventos não mapeados aparecem em destaque — significa que não vão gerar
          lançamento contábil automaticamente. Mapeie em /folha-pagamento → Configuração.
        </Callout>
      </Step>

      <Step n={4} cor={MODULO_COLOR} icon={Download} titulo="Exportar para outros sistemas" rota="aba Exportação">
        <p>
          Após conferir, exporte para alimentar:
        </p>
        <ul className="list-disc list-inside space-y-1 ml-2">
          <li><strong>Sistema contábil (SCI)</strong> — formato CSV com lançamentos contábeis</li>
          <li><strong>eSocial</strong> — leiaute oficial para envio direto</li>
          <li><strong>Excel</strong> — relatório por filial / evento / funcionário</li>
        </ul>
        <Callout tipo="aviso">
          Esta versão do módulo é <strong>simplificada</strong> — funções avançadas
          (cálculo automático, geração de DARFs, integração eSocial completa) ainda
          não estão implementadas. Para essas, ainda use sistema externo de folha.
        </Callout>
      </Step>

      <Section icon={Lightbulb} titulo="Casos comuns" cor={FAQ_COLOR}>
        <div className="space-y-3">
          <div className="rounded-md border p-3 text-[12px]">
            <p className="text-sm font-semibold mb-1">Importação rejeitou o arquivo</p>
            <p className="text-foreground/70">
              Geralmente é estrutura diferente do leiaute configurado. Compare cabeçalho
              esperado com o do arquivo. Se mudou (ex: cliente trocou ERP de folha),
              ajuste o leiaute em Configuração.
            </p>
          </div>
          <div className="rounded-md border p-3 text-[12px]">
            <p className="text-sm font-semibold mb-1">Funcionário aparece duplicado</p>
            <p className="text-foreground/70">
              Pode ser CPF formatado diferente entre arquivos (com ou sem pontuação).
              Sistema deduz por CPF normalizado mas alguns leiautes antigos podem causar
              divergências. Verifique no preview antes de confirmar.
            </p>
          </div>
          <div className="rounded-md border p-3 text-[12px]">
            <p className="text-sm font-semibold mb-1">Quero conciliar com DCTFWeb</p>
            <p className="text-foreground/70">
              Após importar a folha, vá em <a className="text-violet-600 hover:underline" href="/dctfweb">/dctfweb</a>{' '}
              e sincronize a competência. Confronte os totais — devem bater. Divergência
              indica que algo não foi enviado para eSocial.
            </p>
          </div>
        </div>
      </Section>

      <Section icon={ArrowRight} titulo="Atalhos rápidos" cor={FAQ_COLOR}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <QuickLink href="/folha-pagamento" label="Importação de folha" cor={MODULO_COLOR} />
          <QuickLink href="/faq/dctfweb" label="DCTFWeb (declaração consolidada)" cor={MODULO_COLOR} />
          <QuickLink href="/clientes" label="Cadastros de cliente" cor={MODULO_COLOR} />
        </div>
      </Section>
    </ArticleShell>
  )
}
