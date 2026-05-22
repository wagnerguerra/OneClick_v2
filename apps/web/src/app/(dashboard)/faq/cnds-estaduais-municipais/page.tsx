'use client'

import {
  Landmark, Search, Calendar, RefreshCw, Settings,
  Lightbulb, Info, ArrowRight, AlertTriangle, Building, Shield,
} from 'lucide-react'
import { Badge } from '@saas/ui'
import { ArticleShell } from '../_components/article-shell'
import { Section, Step, Callout, QuickLink, DefRow } from '../_components/article-blocks'

const MODULO_COLOR = 'var(--mod-fiscal, #8b5cf6)' // violet (módulo CND Municipal)
const FAQ_COLOR = '#0891b2'

export default function FaqCndsEstaduaisMunicipaisPage() {
  return (
    <ArticleShell
      modulo="Certidões Estaduais, Municipais e Alvarás"
      moduloColor={MODULO_COLOR}
      icon={Landmark}
      titulo="CND Estaduais, Municipais e Alvarás"
      descricao="Consulta de certidões SEFAZ (estadual), ISS (municipal), CGU e alvarás de Bombeiros e Funcionamento."
    >
      <Section icon={Info} titulo="O que cada certidão cobre" cor={FAQ_COLOR}>
        <div className="space-y-2 text-sm">
          <DefRow termo="CND Estadual (SEFAZ)" texto="Negativa de débitos de ICMS e demais tributos estaduais. Validade 90 dias." />
          <DefRow termo="CND Municipal (ISS)" texto="Negativa de débitos de ISS junto à prefeitura. Validade varia por município (60 a 180 dias)." />
          <DefRow termo="Alvará de Funcionamento" texto="Autorização do município para o estabelecimento operar. Renovação anual ou bianual." />
          <DefRow termo="Alvará de Bombeiros (AVCB)" texto="Atestado de Vistoria do Corpo de Bombeiros. Validade variável conforme tipo de imóvel/risco." />
          <DefRow termo="CGU (Cadastro Geral)" texto="Certidão de antecedentes empresariais junto à Controladoria-Geral da União. Usada em licitações federais." />
        </div>
      </Section>

      <h2 className="text-base font-bold pt-2">Particularidades por tipo</h2>

      <Step n={1} cor={MODULO_COLOR} icon={Building} titulo="CND Estaduais (por UF)" rota="/certidoes-cnd → aba Estadual">
        <p>
          Cada SEFAZ estadual tem API própria — algumas com integração nativa,
          outras dependem de scraping ou consulta manual.
        </p>
        <ul className="list-disc list-inside space-y-1 ml-2">
          <li>UFs com integração: ES, SP, RJ, MG, RS (lista cresce — verifique no menu)</li>
          <li>Demais: o sistema gera link direto para o portal SEFAZ — usuário consulta manualmente</li>
          <li>Validade média 90 dias — agendamento recomendado: <strong>1×/mês</strong></li>
        </ul>
        <Callout tipo="aviso">
          SEFAZ-ES exige certificado A1 do contribuinte para algumas consultas avançadas.
          Cadastre certificado por cliente em <code className="text-[11px]">/gestao-certificados</code>.
        </Callout>
      </Step>

      <Step n={2} cor={MODULO_COLOR} icon={Landmark} titulo="CND Municipais (por município)" rota="/certidoes-cnd → aba Municipal">
        <p>
          Mais fragmentado: cada prefeitura tem portal próprio. O sistema oferece:
        </p>
        <ul className="list-disc list-inside space-y-1 ml-2">
          <li>Integração nativa com municípios maiores do ES (Vitória, Vila Velha, Serra, Cariacica)</li>
          <li>Outros municípios: link direto + registro manual de validade</li>
          <li>Status &quot;Validade próxima&quot; aparece no widget do dashboard</li>
        </ul>
        <Callout tipo="dica">
          Para municípios sem integração nativa, configure um <strong>lembrete</strong>{' '}
          mensal com a competência: o sistema avisa 30 dias antes do vencimento.
        </Callout>
      </Step>

      <Step n={3} cor={MODULO_COLOR} icon={Shield} titulo="Alvarás (Funcionamento e Bombeiros)" rota="/certidoes-cnd → aba Alvará">
        <p>
          Alvarás não são consultados via API — são <strong>cadastrados manualmente</strong>{' '}
          com base no documento físico. O sistema:
        </p>
        <ul className="list-disc list-inside space-y-1 ml-2">
          <li>Permite upload do PDF/JPG do alvará</li>
          <li>Registra: tipo, número, data de emissão, validade, observações</li>
          <li>Alerta automaticamente 60 dias antes do vencimento</li>
          <li>Para AVCB, registra também ocupação, metragem, capacidade (campos de Bombeiros)</li>
        </ul>
        <Callout tipo="info">
          Os campos de Bombeiros do cliente (em /clientes → aba Legalização) são
          referenciados automaticamente quando você cadastra um AVCB — facilita preenchimento.
        </Callout>
      </Step>

      <Step n={4} cor={MODULO_COLOR} icon={Search} titulo="CGU (federal, mas listado aqui por afinidade)" rota="aba CGU">
        <p>
          Certidão de antecedentes empresariais. Consulta gratuita e pública via portal CGU.
          Usada principalmente em licitações federais e processos de habilitação.
        </p>
      </Step>

      <h2 className="text-base font-bold pt-2">Operação</h2>

      <Step n={5} cor={MODULO_COLOR} icon={Settings} titulo="Configurar agendamento por tipo" rota="/certidoes-cnd/configuracoes">
        <p>
          Cada tipo de certidão pode ter cadência diferente. Configure separadamente:
        </p>
        <ul className="list-disc list-inside space-y-1 ml-2">
          <li>Estaduais com integração: semanal ou quinzenal</li>
          <li>Municipais com integração: mensal</li>
          <li>Alvarás: <strong>sem agendamento automático</strong> — apenas alertas de vencimento</li>
        </ul>
      </Step>

      <Step n={6} cor={MODULO_COLOR} icon={RefreshCw} titulo="Consulta em massa por estado/município" rota="botão Consultar selecionadas">
        <p>
          Útil em períodos críticos (fim de ano, antes de licitação coletiva). Filtre por
          UF ou município, selecione múltiplos clientes e dispare consulta em lote.
        </p>
        <Callout tipo="aviso">
          Algumas SEFAZ têm <strong>rate limit</strong> agressivo — em consultas em massa,
          o sistema entrega progressivamente para não bloquear. Acompanhe o progresso na
          aba de logs.
        </Callout>
      </Step>

      <Section icon={Lightbulb} titulo="Casos comuns" cor={FAQ_COLOR}>
        <div className="space-y-3">
          <div className="rounded-md border p-3 text-[12px]">
            <p className="text-sm font-semibold mb-1">Município sem integração nativa</p>
            <p className="text-foreground/70">
              Cadastre manualmente: na linha do cliente, clique em &quot;Registrar consulta&quot; e
              informe número da CND, data de emissão e validade. Lembrete será disparado
              automaticamente.
            </p>
          </div>
          <div className="rounded-md border p-3 text-[12px]">
            <p className="text-sm font-semibold mb-1">Alvará perdido / cliente não tem cópia</p>
            <p className="text-foreground/70">
              Solicite 2ª via à prefeitura — o número costuma estar no IPTU ou em
              consulta pública no site da prefeitura. Quando obtiver, cadastre normalmente.
            </p>
          </div>
          <div className="rounded-md border p-3 text-[12px]">
            <p className="text-sm font-semibold mb-1">Licitação amanhã — preciso de tudo agora</p>
            <p className="text-foreground/70">
              Use o filtro &quot;Cliente: X&quot; e &quot;Status: vencendo / vencida / não emitida&quot;,
              selecione tudo e dispare consulta em lote. Em paralelo, baixe os PDFs já
              válidos para o pacote de habilitação.
            </p>
          </div>
        </div>
      </Section>

      <Section icon={ArrowRight} titulo="Atalhos rápidos" cor={FAQ_COLOR}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <QuickLink href="/certidoes-cnd?aba=estadual" label="CND Estaduais" cor={MODULO_COLOR} />
          <QuickLink href="/certidoes-cnd?aba=municipal" label="CND Municipais" cor={MODULO_COLOR} />
          <QuickLink href="/certidoes-cnd?aba=alvara" label="Alvarás" cor={MODULO_COLOR} />
          <QuickLink href="/faq/cnds-federais" label="CND Federais (artigo separado)" cor={MODULO_COLOR} />
        </div>
      </Section>
    </ArticleShell>
  )
}
