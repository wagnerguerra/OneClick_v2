import dynamic from 'next/dynamic'
import type { ComponentType } from 'react'

// Componentes de artigo em código (os originais). FALLBACK da rota dinâmica
// /faq/[slug] quando NÃO há override no banco (tabela faq_artigos). Mantidos no
// repo também p/ o Tailwind detectar as classes utilitárias usadas nos blocos.
// Adicione aqui ao criar um novo .tsx de artigo de sistema.
export const faqArticleComponents: Record<string, ComponentType> = {
  "agenda-corporativa": dynamic(() => import("./agenda-corporativa")),
  "areas-cargos-lideres": dynamic(() => import("./areas-cargos-lideres")),
  "bi-categorias-balancete": dynamic(() => import("./bi-categorias-balancete")),
  "bi-faturamento": dynamic(() => import("./bi-faturamento")),
  "caixapostal-ecac": dynamic(() => import("./caixapostal-ecac")),
  "calendario-feriados": dynamic(() => import("./calendario-feriados")),
  "cliente-onboard": dynamic(() => import("./cliente-onboard")),
  "cnds-estaduais-municipais": dynamic(() => import("./cnds-estaduais-municipais")),
  "cnds-federais": dynamic(() => import("./cnds-federais")),
  "contratos": dynamic(() => import("./contratos")),
  "controle-ativos": dynamic(() => import("./controle-ativos")),
  "crm-pipeline": dynamic(() => import("./crm-pipeline")),
  "dashboard-customizado": dynamic(() => import("./dashboard-customizado")),
  "dctfweb": dynamic(() => import("./dctfweb")),
  "dte-sefaz-es": dynamic(() => import("./dte-sefaz-es")),
  "folha-pagamento": dynamic(() => import("./folha-pagamento")),
  "gestao-certificados": dynamic(() => import("./gestao-certificados")),
  "helpdesk": dynamic(() => import("./helpdesk")),
  "meus-servicos": dynamic(() => import("./meus-servicos")),
  "minhas-obrigacoes": dynamic(() => import("./minhas-obrigacoes")),
  "multi-empresa": dynamic(() => import("./multi-empresa")),
  "obrigacoes": dynamic(() => import("./obrigacoes")),
  "orcamentos": dynamic(() => import("./orcamentos")),
  "orcamentos-notificacoes-email": dynamic(() => import("./orcamentos-notificacoes-email")),
  "pesquisa-satisfacao": dynamic(() => import("./pesquisa-satisfacao")),
  "processos": dynamic(() => import("./processos")),
  "projetos": dynamic(() => import("./projetos")),
  "segmento-atacadista-lucro-real": dynamic(() => import("./segmento-atacadista-lucro-real")),
  "segmento-comercio-varejo-simples": dynamic(() => import("./segmento-comercio-varejo-simples")),
  "segmento-construcao-civil-presumido": dynamic(() => import("./segmento-construcao-civil-presumido")),
  "segmento-educacao-presumido": dynamic(() => import("./segmento-educacao-presumido")),
  "segmento-holding-presumido": dynamic(() => import("./segmento-holding-presumido")),
  "segmento-industria-lucro-real": dynamic(() => import("./segmento-industria-lucro-real")),
  "segmento-tecnologia-presumido": dynamic(() => import("./segmento-tecnologia-presumido")),
  "segmento-tecnologia-real": dynamic(() => import("./segmento-tecnologia-real")),
  "segmento-telecomunicacoes-lucro-real": dynamic(() => import("./segmento-telecomunicacoes-lucro-real")),
  "servicos-editor": dynamic(() => import("./servicos-editor")),
  "servicos-notificacoes": dynamic(() => import("./servicos-notificacoes")),
  "situacao-fiscal": dynamic(() => import("./situacao-fiscal")),
  "tabs-fixacao": dynamic(() => import("./tabs-fixacao")),
  "tenant-stripe-setup": dynamic(() => import("./tenant-stripe-setup")),
  "usuario-mfa-permissoes": dynamic(() => import("./usuario-mfa-permissoes")),
}

export const faqArticleSlugs = Object.keys(faqArticleComponents)
