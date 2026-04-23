# Aba “Serviços” no cadastro de cliente — descrição e prompt para replicação

Referência principal: `frontend/cliente-detalhe.html` (painel `#tab-areas`, funções `carregarAreasContratadas`, `renderAreasContratadasTable`, `salvarAreasContratadasInterno`, modais de parâmetros e encerramento). API: `backend/src/routes/clienteRoutes.js` (prefixo `/api/clientes`).

---

## Parte 1 — Descrição detalhada da aba Serviços

### 1.1 Posição na interface

- Na tela **Cliente (detalhe)**, a navegação principal usa **Bootstrap Tabs** (`nav nav-tabs`).
- O rótulo visível é **“Serviços”** (ícone `ri-briefcase-4-line`), mas o **href do painel é `#tab-areas`** — conceito de negócio: **áreas contratadas = serviços** por cliente.
- O conteúdo está em `<div class="tab-pane" id="tab-areas">` com um **card** título **“Serviços”**.

### 1.2 Mensagem ao usuário e persistência

- Texto de ajuda: **“Use o botão Salvar no topo da página para gravar alterações nesta tabela.”**
- O **Salvar global** do cadastro (`salvarCliente`) chama `salvarAreasContratadasInterno()` após gravar dados principais; também é possível salvar **só a aba Serviços** ao mudar para outra aba (listener que chama `salvarAreasContratadas()` ao sair de `#tab-areas`).
- Ou seja: há **dois caminhos** de gravação — integrado ao salvar cliente e **explícito** ao trocar de aba.

### 1.3 Tabela principal

| Coluna | Conteúdo |
|--------|-----------|
| **Área contratada** | `form-check`: checkbox **“contratado”** + label com nome da área (`area_nome`). |
| **Responsável** | `<select class="js-responsavel">` — usuários **da mesma área**; opção vazia “Nada selecionado”; se o responsável atual **não está na lista da área**, aparece opção extra **“(fora da área)”**. |
| **Substituto(a)** | `<select class="js-substituto">` — mesma lógica de filtro por `area_id`. |
| **Ações** | Dropdown Bootstrap: **“Gerenciar Parâmetros”** e **“Rotina de Encerramento”**. |

**Estados visuais**

- Linha **não contratada**: classe `contrato-row-disabled` (opacidade reduzida).
- Ao **marcar/desmarcar** contratado: alterna a classe; habilita/desabilita selects de responsável/substituto conforme `data-pode-alterar-resp` e **contratado**; habilita/desabilita botão de ações.

### 1.4 Permissões (frontend)

Definidas a partir do JWT / `permissoes_json` (exceto ADMIN/MASTER que têm tudo):

| Variável | Chave de permissão | Efeito |
|----------|-------------------|--------|
| `__canGerenciarServicosContratados` | `clientes_gerenciar_servicos_contratados` | Checkbox **contratado** habilitado ou `disabled`. |
| `__canGerenciarResponsaveisServicos` | `clientes_gerenciar_responsaveis_servicos` | Junto com a de cima define `canGerParametros`: dropdown **Ações** (parâmetros + encerramento). |

- **Responsável/Substituto**: desabilitados se área **não contratada** OU se `pode_alterar_responsavel === false` no payload da área.
- **Ações**: desabilitadas se área **não contratada** OU sem `canGerParametros`.

### 1.5 Biblioteca Choices.js

- **CDN:** `choices.js@10.2.0` carregado sob demanda (`ensureChoicesLibrary`).
- Cada select `js-responsavel` / `js-substituto` vira instância **Choices** com busca (`searchEnabled`, textos em PT).
- **Problema de z-index** em tabela: ao abrir o dropdown (`showDropdown`), **`portalizeAreaChoiceDropdown`** move o painel para `position: fixed`, classe `areas-choices-dropdown-portal`, reposiciona com `getBoundingClientRect`, escuta `resize`/`scroll` e `input`/`keyup` no dropdown; em `hideDropdown`, **`restoreAreaChoiceDropdown`** reverte.
- CSS local: `#areasContratadasWrap` com `overflow: visible`, z-index para `.choices`.

### 1.6 Carregamento de dados

- **GET** `/:documento/areas-contratadas` (via `fetchClientes` → `/api/clientes` ou TS conforme modo).
- Resposta esperada (`sucesso`, `areas[]`, `usuarios[]`):
  - Cada **área**: `area_id`, `area_nome`, `contratado`, `responsavel_usuario_id`, `substituto_usuario_id`, `pode_alterar_responsavel`, `data_encerramento`, `observacoes`.
  - **Usuários**: `id`, `nome`, `area_id` (para filtrar opções por área).
- Se **nenhuma área**: mensagem *“Nenhuma área cadastrada para esta empresa.”*
- Após render: `updateSidebarAreasFromPayload` (texto tipo “X de Y áreas contratadas” se existir elemento sidebar).
- A aba dispara **`carregarAreasContratadas()`** ao ser mostrada (listener `shown.bs.tab` em `#tab-areas`).

### 1.7 Gravação da tabela (contratos por área)

- **PUT** `/:documento/areas-contratadas` com body `{ contratos: [...] }`.
- Cada item: `area_id`, `contratado`, `responsavel_usuario_id`, `substituto_usuario_id`, `data_encerramento`, `observacoes` (observações vêm dos `data-*` da linha, `observacoes` em `encodeURIComponent` no DOM).
- Resposta pode incluir **`erros[]`** por `area_id`; UI mostra aviso com lista truncada ou sucesso “Serviços atualizados com sucesso.”
- Depois: **recarrega** `carregarAreasContratadas()`.

### 1.8 Modal “Gerenciar Parâmetros” (complexidade / peso)

- Abre só se área **contratada**; senão, alerta *“Marque a área como contratada…”*.
- **GET** `/:documento/areas-contratadas/:areaId/parametros` — lista `parametros`, `media`.
- **GET** `/:documento/areas-contratadas/:areaId/parametros/clientes-disponiveis` — select “Copiar estrutura de outro cliente”.
- **POST** `.../parametros/copiar-estrutura` body `{ cliente_origem_id }` — substitui lista local de parâmetros após confirmação Swal.
- **PUT** `.../parametros` body `{ parametros: [{ codigo, tipo, nome, descricao, valor }] }`:
  - `valor` numérico **0–5**, passos **0,5**; rótulos de importância (Irrelevante, Baixa, Média, Alta, Muito importante).
  - Tipos editáveis (painel “Gerenciar tipos”), padrões iniciais: Gerencial, Operacional, Geral.
  - Tabela agrupada por **tipo**; adicionar/remover parâmetros; range para valor; descrição opcional.
- Footer corporativo: **Cancelar** | **Salvar** (`swal-corp-header`, `swal-corp-body`, `swal-corp-footer`).

### 1.9 Modal “Rotina de Encerramento”

- **Somente cliente-side** até fechar: lê `data-encerramento` (data ISO `YYYY-MM-DD`) e `data-observacoes` (URL-encoded) da `<tr>`.
- Campos: **data** (`input type="date"`), **observações** (textarea, max 1000).
- **Salvar** atualiza atributos `data-encerramento` e `data-observacoes` na linha — **persistência real** ocorre no **PUT** de `areas-contratadas` junto com o restante do contrato.

### 1.10 Integração com o botão Salvar do topo

- `salvarCliente` após PUT do cliente chama `salvarAreasContratadasInterno()`; se falhar, avisa que cliente foi salvo mas serviços não; se sucesso com `erros` parciais, Swal “Salvo com avisos” com lista de áreas.

### 1.11 Dependências técnicas

- **Bootstrap 5** (tabs, dropdown, forms).
- **SweetAlert2** + `swal-corp-modal.css`.
- **Choices.js** (CDN) + scripts de portal do dropdown.
- **JWT** + **`X-Empresa-Id`** em todas as chamadas (`fetchClientes`).
- **Documento do cliente** na URL (`getDocumentoFromUrl()`).

### 1.12 Rotas de backend (referência)

```
GET    /api/clientes/:documento/areas-contratadas
PUT    /api/clientes/:documento/areas-contratadas
GET    /api/clientes/:documento/areas-contratadas/:areaId/parametros
PUT    /api/clientes/:documento/areas-contratadas/:areaId/parametros
GET    /api/clientes/:documento/areas-contratadas/:areaId/parametros/clientes-disponiveis
POST   /api/clientes/:documento/areas-contratadas/:areaId/parametros/copiar-estrutura
```

(Implementação: `clienteController` + services associados.)

---

## Parte 2 — Prompt para o Claude Code (copiar daqui até FIM)

### INÍCIO DO PROMPT

Você está implementando o **novo módulo de cadastro de clientes**. Replique a aba **“Serviços”** com o mesmo comportamento da referência **SERPRO2** (`frontend/cliente-detalhe.html`, painel `#tab-areas`).

#### Contexto de produto

- A aba chama-se **“Serviços”** na UI; no DOM legado o id é **`tab-areas`**. Representa **áreas contratadas** do cliente na empresa atual: contratação (checkbox), **responsável** e **substituto** (usuários vinculados à área), e ações avançadas.

#### Obrigatório — UI

1. Card “Serviços” com texto: usar **Salvar no topo** para gravar a tabela (e/ou salvar ao trocar de aba, como no legado).
2. Tabela responsiva com colunas: **Área contratada** | **Responsável** | **Substituto(a)** | **Ações**.
3. Checkbox **contratado** + nome da área; linha não contratada com estilo atenuado (equivalente a `.contrato-row-disabled`).
4. Ao alternar contratado: habilitar/desabilitar selects e botão de ações conforme regras abaixo.
5. Selects de usuário: lista filtrada por **`area_id`**; opção vazia; se ID selecionado não está na lista da área, mostrar opção **“(fora da área)”** com nome resolvido.
6. Dropdown **Ações**: itens **Gerenciar Parâmetros** e **Rotina de Encerramento**; exigir área contratada antes de abrir (mensagem informativa se não contratada).
7. **Choices.js** (ou equivalente) com **busca** nos selects; se usar Choices, implementar **portal/fixo** do dropdown para não ser cortado dentro de `table-responsive` (ver funções `portalizeAreaChoiceDropdown` / `restoreAreaChoiceDropdown` no legado).
8. Modais SweetAlert2 no **padrão corporativo** (`swal-corp-header`, `swal-corp-body`, `swal-corp-footer`; cancelar à esquerda, primário à direita).

#### Obrigatório — Permissões

- **`clientes_gerenciar_servicos_contratados`**: controla se o checkbox **contratado** é editável.
- **`clientes_gerenciar_responsaveis_servicos`**: junto com a anterior, habilita o dropdown **Ações** (parâmetros + encerramento).
- **ADMIN** e **MASTER**: tratamento como permitido (espelhar lógica do legado).
- Campo backend **`pode_alterar_responsavel`**: se `false`, manter selects de responsável/substituto desabilitados mesmo com área contratada.

#### Obrigatório — API (contratos)

- **GET** `/:documento/areas-contratadas` → renderizar tabela a partir de `areas` + `usuarios`.
- **PUT** `/:documento/areas-contratadas` com `{ contratos: [{ area_id, contratado, responsavel_usuario_id, substituto_usuario_id, data_encerramento, observacoes }] }`.
- Tratar **`erros[]`** na resposta com aviso parcial; sucesso com toast/modal curto “Serviços atualizados com sucesso.”
- Recarregar lista após salvar.

#### Obrigatório — API (parâmetros de área)

- **GET** `/:documento/areas-contratadas/:areaId/parametros`
- **GET** `/:documento/areas-contratadas/:areaId/parametros/clientes-disponiveis`
- **POST** `/:documento/areas-contratadas/:areaId/parametros/copiar-estrutura` com `{ cliente_origem_id }`
- **PUT** `/:documento/areas-contratadas/:areaId/parametros` com `{ parametros: [{ codigo?, tipo, nome, descricao, valor }] }` onde `valor` ∈ [0,5] step 0,5.
- UI do modal: média dos valores; agrupamento por tipo; adicionar/remover parâmetros; gerenciar tipos customizados; copiar estrutura de outro cliente com confirmação.

#### Obrigatório — Rotina de encerramento

- Modal com **data** (ISO) e **observações** (max 1000); ao salvar, atualizar estado da linha até o **PUT** global de `areas-contratadas` persistir `data_encerramento` e `observacoes`.

#### Obrigatório — Integração com salvar cliente

- Ao salvar o cadastro geral do cliente, **também** executar o fluxo de gravação de áreas contratadas (ou equivalente), com tratamento de erro parcial (“cliente salvo, serviços não”) se a API de áreas falhar.

#### Obrigatório — Transporte

- Todas as requisições: **`Authorization: Bearer …`** e **`X-Empresa-Id`** alinhados ao restante do app.
- `:documento` = CPF/CNPJ do cliente na rota (mesmo padrão atual).

#### Critérios de aceite

- [ ] Paridade visual e funcional com a descrição acima.
- [ ] Permissões e `pode_alterar_responsavel` respeitados.
- [ ] Endpoints listados funcionando sem alterar contratos sem necessidade.
- [ ] Dropdown de usuários utilizável dentro de tabela (portal/z-index).
- [ ] Documentar no PR qualquer desvio justificado.

**Preencha:** stack/caminho do novo módulo: `[…]`

### FIM DO PROMPT

---

*Arquivo gerado para documentação interna e uso com Claude Code / agentes.*
