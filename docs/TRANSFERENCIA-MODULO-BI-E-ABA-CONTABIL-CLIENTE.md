# Transferência: módulo BI (corporativo) + aba Contábil (cliente)

Documento para orientar a replicação na **nova plataforma** (ex.: Claude Code). Referência no repositório **SERPRO2**: `frontend/bi-faturamento.html`, `frontend/bi-categorias-balancete.html`, `frontend/bi-public.html`, `frontend/cliente-detalhe.html` (aba `#tab-contabil`), `backend/src/routes/biRoutes.js`, `backend/src/routes/biPublicRoutes.js`, `backend/src/controllers/biController.js`, `backend/src/services/biBalanceteService.js`, rotas BI em `backend/src/routes/clienteRoutes.js`.

---

## 1. Visão geral do módulo BI

### 1.1 Propósito

O BI integra **dados de faturamento** e **balancete contábil** (origem **SCI / Firebird** e cache em **MySQL**) para:

- Exibir **KPIs** e **gráficos** por cliente, ano e recorte de meses/trimestres.
- Exibir **Matriz de Resultados** (contas × meses) com hierarquia configurável.
- Exibir **análise vertical e horizontal** (comparações e gráficos).
- Permitir **gerenciar contas** do balancete (valores mês a mão, CRUD de linhas).
- Permitir **configurar categorias do balancete** para exibição no BI (“No BI”, ordem, pai, nomes exibidos, categorias virtuais com fórmulas).
- Oferecer **link público** (`bi_link_publico`) para o cliente ver um **subconjunto** do dashboard **sem login**.

### 1.2 Entradas na UI corporativa

| Entrada | Caminho | Observação |
|---------|---------|------------|
| Menu lateral **“BI”** | `/bi-faturamento/` | `frontend/assets/partials/navbar-nav.html` — ícone `ri-bar-chart-2-line`. |
| **Versão expandida** (contas do balancete) | `/bi-categorias-balancete/` ou `bi-categorias-balancete.html` | SPA do Express resolve `/:page/` → `bi-categorias-balancete.html`. Query `?cliente=<CNPJ/CPF só dígitos>` pré-seleciona o cliente. |
| **BI público** (cliente) | `/bi-public?token=…` | `server.js` rota dedicada; página `bi-faturamento.html` com `?public=1&token=…` esconde menu/topbar. |

**Permissões:** em `server.js`, `/api/bi` usa apenas **`authRequired`** (não há `authorizeModulo` específico na montagem da rota BI). O menu corporativo pode ser filtrado por outras regras; na lista de módulos de usuário (`usuario-detalhe.html`) o BI não aparece como chave separada “bi” — o acesso costuma ser **qualquer usuário autenticado** que tenha URL/menu. Na nova plataforma, **defina explicitamente** quem pode ver BI se quiser restringir.

---

## 2. Página principal: `bi-faturamento.html`

### 2.1 Modo público (embed)

- Script no `<head>` lê `?public=1` e `?token=…` e define `window.__biPublicMode` e `window.__biPublicToken`.
- CSS **crítico** oculta `#page-topbar`, `.app-menu`, breadcrumb da página, `#biClienteWrap`, `#biLinkPublicoWrap`; mantém **abas laterais** do BI (Visão Geral, Matriz, Análise, Gerenciar).
- O `fetch` é **patchado** para trocar `/api/bi/` por `/api/public/bi/:token/` quando em modo público (ver comentário no HTML ~linha 50 e lógica ~1220).

### 2.2 Filtros globais (barra superior)

Comportamento tipo **Power BI**: filtros em **dropdown com busca** / multiselect (Bootstrap), alinhados na classe `bi-filtros-row`:

- **Cliente** (obrigatório para a maioria das operações).
- **Categoria** (nível 4 / filtro global de categorias) — API `GET /api/bi/categorias`.
- **Ano**.
- **Mês** (checkboxes por mês).
- **Trimestre** (checkboxes T1–T4).
- Botão **“Link para o cliente”** (`#biBtnLinkPublico`) — chama `POST /api/bi/clientes/:clienteId/link-publico` e exibe URL (`APP_PUBLIC_URL` + `/bi-public?token=…`).

### 2.3 Abas verticais (4)

| Aba | ID painel | Função resumida |
|-----|-----------|-----------------|
| **Visão Geral** | `#bi-tab-geral` | KPIs (Receita, Custos Fixos, Despesas, Lucro Líquido), alerta de filtro por mês, gráficos Chart.js (resultado vs ano anterior, donut custos/despesas, etc.), seletor de indicador do gráfico principal. |
| **Matriz de Resultados** | `#bi-tab-matriz` | Tabela hierárquica mês a mês; busca por conta; progresso; destaque de célula/seleção; dados de `GET …/balancete/.../matriz`. |
| **Análise Vertical e Horizontal** | `#bi-tab-analise` | Gráficos de análise vertical e horizontal; comparações multi-ano; `GET …/balancete/.../analise`. |
| **Gerenciar Contas** | `#bi-tab-gerenciar` | Árvore/tabela de **linhas do balancete** por cliente/ano: adicionar, editar, remover valores; busca; `GET/POST/DELETE …/clientes/:documento/bi/balancete-linhas`. |

### 2.4 Fluxos principais (corporativo autenticado)

**Faturamento (cache SCI / SP_BI_FAT com fallback)**

- Disponibilidade: `GET /api/bi/faturamento/clientes/:clienteId/disponivel`
- Série mensal: `GET /api/bi/faturamento/clientes/:clienteId/serie?ano=…&fonte=sci&meses=…`
- Atualizar cache: `POST /api/bi/faturamento/clientes/:clienteId/refresh?ano=…&quadro=…&consolidar=…`
- Status do job: `GET /api/bi/faturamento/clientes/:clienteId/refresh-status?ano=…`  
- UI: modal Bootstrap **`#modalProgressoFaturamento`** com log em `#modalProgressoFaturamentoDetalhes`.

**Balancete (cache, matriz, KPIs, análise)**

- Categorias nível 4 (filtros): `GET /api/bi/balancete/clientes/:clienteId/categorias-nivel4`
- Matriz: `GET /api/bi/balancete/clientes/:clienteId/matriz?ano=…&use_parent=0|1`
- KPIs: `GET /api/bi/balancete/clientes/:clienteId/kpis?ano=…&meses=…` (+ query string de categorias selecionadas quando aplicável)
- Análise: `GET /api/bi/balancete/clientes/:clienteId/analise?ano=…&meses=…`
- Atualizar balancete: `POST /api/bi/balancete/clientes/:clienteId/refresh?ano=…&force=…`
- Status: `GET /api/bi/balancete/clientes/:clienteId/refresh-status?ano=…`
- Excluir período: `DELETE /api/bi/balancete/clientes/:clienteId/excluir-periodo?…`
- Simulação SCI (request/response): `GET|POST /api/bi/balancete/clientes/:clienteId/simular?ref=…`
- Diagnóstico: `GET /api/bi/balancete/clientes/:clienteId/diagnostico-resultado-natureza` → `diagnosticoResultadoPorNatureza`.

**KPIs personalizados**

- Contas ignoradas: `GET/POST /api/bi/kpi/clientes/:clienteId/contas-ignoradas?tipo=…`
- Regras de cálculo: `GET/POST /api/bi/kpi/clientes/:clienteId/regras-calculo?tipo=…`

**Cópia de categorias entre clientes (BI)**

- `POST /api/bi/balancete/categorias/copiar` (payload conforme `biController.copiarCategoriasBalancete`)

### 2.5 Dependências de front (BI principal)

- **Bootstrap 5**, **jQuery**, **SweetAlert2**, **Chart.js 4.4**
- **`assets/js/empresa-context.js`** (patch de `fetch` com `Authorization` + `X-Empresa-Id`)
- **`assets/js/utils.js`**, layout, menu global, header global
- **`dropdown-busca-modelo.css`** para filtros estilo campo com busca
- Estilos extensos **inline** no HTML para matriz, análise, KPIs, modais corporativos

### 2.6 Dependências de backend

- **`biController.js`**: orquestra SCI, cache, agregações, EBITDA, filtros de categorias, jobs de refresh.
- **`biBalanceteService.js`**: `ensureBalanceteCacheAno`, `syncCategoriasFromLinhas`, `monthRange`, exclusão de período, etc.
- **SCI** (variáveis de ambiente, DSN, stored procedures `SP_BI_FAT`, leitura de balancete) — falhas podem acionar **fallback** para dados já em cache (comportamento documentado em comentários do `relatorioFaturamentoController` / `biController`).
- Tabelas MySQL para cache BI, link público, categorias por cliente (ver `createTables` / migrations relacionadas a BI).

---

## 3. Versão expandida: `bi-categorias-balancete.html` (`/bi-categorias-balancete/`)

### 3.1 Objetivo

Tela **dedicada** à gestão de **contas/categorias do balancete** para o BI (a mesma capacidade ampliada que na aba Contábil do cliente, com **mais ações** e espaço de tela).

### 3.2 Abertura a partir do cadastro de cliente

Em `cliente-detalhe.html`, botão **“Versão expandida”**:

```javascript
window.open(`/bi-categorias-balancete.html?cliente=${doc}`, '_blank');
```

Onde `doc` é o documento **somente dígitos**.

**Na nova plataforma:** suportar **ambas** as formas de URL que o Express já resolve:

- `https://host/bi-categorias-balancete/?cliente=…` (preferencial, consistente com outras rotas limpas)
- `https://host/bi-categorias-balancete.html?cliente=…` (legado explícito no `window.open` atual)

A página expandida deve **ler `cliente` da query**, localizar o cliente na lista e carregar `GET /api/clientes/:documento/bi/balancete-categorias`.

### 3.3 Diferenciais em relação ao bloco embutido em `cliente-detalhe.html`

| Recurso | Versão expandida (`bi-categorias-balancete.html`) |
|---------|-----------------------------------------------------|
| Seletor de cliente | Dropdown com busca **no próprio arquivo** (`dropdown-busca-modelo`), não depende do cliente já aberto no detalhe. |
| Ano espelho | Controle de ano para exibição alinhada à matriz (`#biCatAnoEspelho*`). |
| Menu “Ações” | Dropdown com: criar categoria, expandir/recolher, **excluir selecionadas**, **copiar para outro cliente**, **limpar personalizações**, **exportar/importar backup**, **importar balancete**, **excluir balancete**, recarregar, **simulador SCI**. |
| Seleção em massa | Coluna checkbox + “Selecionar todas” (`#chkSelecionarTodas`). |
| Modais | Ex.: **Editar fórmula** (`#modalFormulaCategoria`) para categorias calculadas — padrão corporativo Bootstrap. |

### 3.4 APIs usadas (além das da aba Contábil)

- `POST /api/bi/balancete/clientes/:id/refresh?…` — importar/atualizar balancete (com polling `refresh-status` como em `bi-faturamento`).
- `DELETE /api/bi/balancete/clientes/:id/excluir-periodo?…`
- `GET /api/bi/balancete/clientes/:id/simular?ref=…`
- `POST /api/bi/balancete/categorias/copiar`
- `POST /api/clientes/:documento/bi/balancete-categorias/limpar`
- `GET/POST /api/clientes/:documento/bi/balancete-backup` e `…/restaurar`
- `POST /api/clientes/bi/balancete/limpar-tudo` (rota global em `clienteRoutes` — uso administrativo)

Replicar **ordem de confirmação**, textos de `form-text` sobre importação não sobrescrever personalizações, e **polling** de jobs onde o arquivo já implementa.

---

## 4. BI público (`bi-public.html` + `biPublicRoutes`)

- **Prefixo:** `GET /api/public/bi/:token/...` (sem JWT; token resolve `clienteId` e empresa).
- **Rotas** (somente leitura): contexto, faturamento disponível/série, balancete categorias-nivel4, matriz, kpis, análise, kpi regras e contas ignoradas.
- **Página:** `bi-public.html`; produção de URL em `gerarLinkPublicoBI` com `APP_PUBLIC_URL`.

---

## 5. Rotas REST consolidadas

### 5.1 `/api/bi/*` (`backend/src/routes/biRoutes.js`)

| Método | Caminho | Descrição |
|--------|---------|-----------|
| GET | `/categorias` | Catálogo de categorias (filtro global). |
| GET | `/faturamento/clientes/:clienteId/disponivel` | Metadados/disponibilidade. |
| GET | `/faturamento/clientes/:clienteId/serie` | Série mensal. |
| POST | `/faturamento/clientes/:clienteId/refresh` | Inicia atualização cache faturamento. |
| GET | `/faturamento/clientes/:clienteId/refresh-status` | Status do job. |
| GET | `/balancete/clientes/:clienteId/categorias-nivel4` | Categorias nível 4. |
| GET | `/balancete/clientes/:clienteId/matriz` | Matriz de resultados. |
| GET | `/balancete/clientes/:clienteId/kpis` | KPIs. |
| GET | `/balancete/clientes/:clienteId/analise` | Análise vertical/horizontal. |
| GET | `/balancete/clientes/:clienteId/diagnostico-resultado-natureza` | Diagnóstico resultado por natureza. |
| POST | `/balancete/clientes/:clienteId/refresh` | Atualiza cache balancete. |
| GET | `/balancete/clientes/:clienteId/refresh-status` | Status refresh balancete. |
| DELETE | `/balancete/clientes/:clienteId/excluir-periodo` | Remove dados importados do período. |
| GET/POST | `/balancete/clientes/:clienteId/simular` | Simula consulta SCI. |
| POST | `/balancete/categorias/copiar` | Copiar configuração de categorias. |
| GET/POST | `/kpi/clientes/:clienteId/contas-ignoradas` | Contas ignoradas nos KPIs. |
| GET/POST | `/kpi/clientes/:clienteId/regras-calculo` | Regras de cálculo customizadas. |
| POST | `/clientes/:clienteId/link-publico` | Gera/recupera token e URL pública. |

### 5.2 `/api/clientes/:documento/bi/*` (trecho `clienteRoutes.js`)

| Método | Caminho | Descrição |
|--------|---------|-----------|
| POST | `/bi/balancete/limpar-tudo` | Limpeza ampla (administrativo). |
| GET | `/:documento/bi/balancete-categorias` | Lista categorias/config do cliente. |
| PUT | `/:documento/bi/balancete-categorias` | Salva árvore/config. |
| DELETE | `/:documento/bi/balancete-categorias` | Excluir conforme implementação. |
| POST | `/:documento/bi/balancete-categorias/limpar` | Limpar personalizações. |
| GET | `/:documento/bi/balancete-backup` | Exportar backup. |
| POST | `/:documento/bi/balancete-backup/restaurar` | Restaurar backup. |
| GET/POST/DELETE | `/:documento/bi/balancete-linhas` | CRUD linhas do balancete (valores mensais). |

**Autenticação:** `authorizeModulo("clientes")` no mount de `clienteRoutes`.

---

## 6. Aba **Contábil** no cadastro de cliente (`cliente-detalhe.html` → `#tab-contabil`)

### 6.1 Estrutura da aba

1. **Card introdutório** “Contábil”  
   - Texto: *“Gerencie configurações contábeis e a estrutura do balancete para o BI.”*

2. **Card principal** `#sec-bi-balancete-cat` — **“BI • Contas do Balancete”**  
   - Subtítulo: organizar ordem/pai e nome exibido na **Matriz de Resultados** para este cliente.

### 6.2 Controles do card

| Controle | Comportamento |
|----------|----------------|
| **Arrastar muda Pai** (`#swDragMudaPai`) | Com Sortable.js: soltar à **esquerda** de uma linha = reordenar **como filho**; à **direita** = só reordenar. |
| **Mostrar apenas marcadas** (`#swMostrarApenasMarcadas`) | Filtra renderização às contas com “No BI” ativo. |
| **Versão expandida** | Nova aba/janela com URL na seção 3. |
| **Link BI** | `POST /api/bi/clientes/:id/link-publico` com headers Auth + `X-Empresa-Id`; Swal com campo copiável. |
| **Criar categoria** | Categoria virtual (modal/Swal) — função `criarNovaCategoriaVirtual`. |
| **Expandir tudo / Recolher tudo** | Árvore de contas (`expandirTudoCats` / `recolherTudoCats`). |
| **Recarregar** | `GET …/bi/balancete-categorias`. |
| **Salvar** | `PUT …/bi/balancete-categorias` com payload montado a partir de `__balCats` + DOM (`syncCatsFromDom`). |

### 6.3 Tabela

Colunas: ícone expansão, **Conta** (`conta_longa`), **Nome (SCI)**, **Nome exibido**, **Pai (exibição)**, **Ordem**, **Tipo**, **No BI** (checkbox; master `#chkNoBiAll` propaga para todos e desce descendentes ao desmarcar), **Ações** (ex.: fórmula para categoria calculada).

- **Busca:** `#biCatSearch` + botão Buscar + Enter + limpar (Escape). Função `buscarCategoriasBalancete` — realça/match na árvore.
- Estado global **`__balCats`**: array de categorias com `conta_longa`, `parent_conta_longa`, `ordem`, `nome_exibido`, `ativo` (No BI), `tipo`, fórmula quando aplicável, etc. (espelhar estrutura retornada pela API).
- **Sortable.js** na primeira coluna para drag-and-drop (árvore colapsável `__balCatsExpanded`).

### 6.4 Carregamento ao exibir a aba

- Listener `shown.bs.tab` em `a[href="#tab-contabil"]` chama `carregarCategoriasBalanceteCliente()` (garantir cliente carregado).

### 6.5 Dependências extras na aba Contábil

- **Sortable.js** (`cdn.sortablejs`)
- **Quill** não é obrigatório nesta aba (é usado em outras); o foco é tabela + modais.
- Estilos em `<style>` do `cliente-detalhe.html` para `#areasContratadasWrap` são da aba Serviços; para BI categorias há classes `bi-cat-*`.

---

## 7. Instruções para o desenvolvimento na nova plataforma

### 7.1 Ordem sugerida de implementação

1. **Modelo de dados e APIs**  
   Portar ou recriar contratos das rotas da seção 5 + tabelas equivalentes (cache balancete, categorias por cliente, link público, linhas).

2. **Serviços de integração SCI**  
   Replicar `biBalanceteService` + chamadas Firebird/SPs ou adaptar ao novo conector; manter semântica de **refresh assíncrono**, **status**, **exclusão por período**, **simulação**.

3. **`bi-faturamento`**  
   Filtros → Visão Geral (KPIs + gráficos) → Matriz → Análise → Gerenciar Contas; modais de progresso; patch de fetch para modo público.

4. **`bi-categorias-balancete` (versão expandida)**  
   Seletor cliente + ano + tabela completa + menu Ações + backup/import/export + simulador.

5. **`bi-public`**  
   Resolver token, contexto mínimo, mesmas leituras que `biPublicRoutes`.

6. **Aba Contábil no cadastro de cliente**  
   Subconjunto da versão expandida + botões Link BI e Versão expandida; reutilizar o mesmo serviço de categorias.

### 7.2 Requisitos não funcionais

- **Headers:** `Authorization: Bearer` + `X-Empresa-Id` em todas as chamadas autenticadas (padrão `empresa-context.js`).
- **IDs:** O BI principal usa **`clienteId`** (numérico) nas rotas `/api/bi/...`; a configuração de categorias no cliente usa **`documento`** (string CPF/CNPJ) em `/api/clientes/:documento/bi/...`. Na nova plataforma, **documente e normalize** (ex.: sempre derivar `clienteId` do documento no front).
- **Jobs longos:** usar o mesmo padrão **POST + polling GET refresh-status** e modais com log rolável.
- **Acessibilidade / UX:** manter textos de alerta sobre **filtro por mês** e sobre **cache vazio** (“atualize o balancete no BI…”).

### 7.3 Checklist de paridade

- [ ] Menu **BI** → `/bi-faturamento/` com as 4 abas e filtros.
- [ ] Faturamento: disponível, série, refresh com modal de progresso.
- [ ] Balancete: matriz, KPIs, análise, refresh, exclusão período, simulador.
- [ ] KPI: contas ignoradas + regras de cálculo por tipo.
- [ ] Link público: POST link + página pública + fetch patch.
- [ ] **Versão expandida** `/bi-categorias-balancete/?cliente=` com paridade de ações da página atual.
- [ ] Aba **Contábil** no cliente com tabela, drag, No BI, busca, salvar, link BI, versão expandida.
- [ ] Categorias: cópia entre clientes, limpar, backup, alinhamento com Matriz (`use_parent` / hierarquia).

### 7.4 Prompt curto para colar no Claude Code

```
Implemente o módulo BI e a aba Contábil do cliente conforme o documento do repositório:
docs/TRANSFERENCIA-MODULO-BI-E-ABA-CONTABIL-CLIENTE.md

Requisitos obrigatórios:
- Paridade de rotas /api/bi e /api/clientes/:documento/bi/* descritas no doc.
- Páginas: bi-faturamento (4 abas + modo público), bi-categorias-balancete (versão expandida com ?cliente=), bi-public.
- Aba Contábil em cadastro de cliente: mesma tabela de categorias + botões Versão expandida e Link BI.
- Jobs: POST refresh + GET refresh-status com UI de progresso.
- Headers JWT + X-Empresa-Id.

Preencha o caminho da nova stack: […]
```

---

## 8. Referências de arquivo (grep rápido)

| Tema | Arquivo |
|------|---------|
| Rotas BI API | `backend/src/routes/biRoutes.js` |
| BI público | `backend/src/routes/biPublicRoutes.js`, `frontend/bi-public.html` |
| Controller | `backend/src/controllers/biController.js` |
| Serviço balancete | `backend/src/services/biBalanceteService.js` |
| Rotas cliente BI | `backend/src/routes/clienteRoutes.js` (trecho `bi/`) |
| UI BI principal | `frontend/bi-faturamento.html` |
| UI categorias expandida | `frontend/bi-categorias-balancete.html` |
| Aba Contábil | `frontend/cliente-detalhe.html` (`#tab-contabil`, `__balCats`, `carregarCategoriasBalanceteCliente`) |
| Menu BI | `frontend/assets/partials/navbar-nav.html` |
| Montagem Express BI | `backend/server.js` (`/api/bi`, `/api/public/bi`) |

---

*Documento gerado para transferência de conhecimento e replicação funcional na nova plataforma.*
