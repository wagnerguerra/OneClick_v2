# Prompt — Portar “Integrações” do módulo de Clientes (SERPRO2)

Copie **tudo** a partir da linha seguinte até o fim do bloco “FIM DO PROMPT” e cole no Claude Code (ou na tarefa do agente).

---

## INÍCIO DO PROMPT (copiar daqui)

### Contexto

No repositório **SERPRO2**, a lista de clientes em **`frontend/clientes.html`** expõe o botão **“Integrações”** (`#btnIntegracoesClientes`), visível apenas com a permissão **`clientes_acesso_integracoes`**. O modal é aberto por **`abrirImportacoesClientesModal()`** e contém **8 ações** agrupadas em três seções: **Cadastros**, **Importações em lote** e **Atualizações**.

Sua tarefa é **reproduzir fidelidade funcional** dessas 8 ações no **novo módulo de clientes** que você está desenvolvendo, preservando contratos de API, comportamento de jobs/SSE/polling, filtros, headers e mensagens ao usuário, salvo quando o novo stack exigir adaptação explícita (documente qualquer mudança).

**Referência de implementação atual:** `frontend/clientes.html` (grep: `abrirImportacoesClientesModal`, `impCadastrarDasConsultas`, `fetchClientes`).

### Nova UI (preencha antes de executar)

- **Caminho / stack do módulo em desenvolvimento:** `[ex.: frontend/clientes-v2.html | pasta SPA em … | componente X]`
- **Nome do arquivo ou rota de entrada da listagem de clientes:** `[preencher]`

---

### Requisitos de acesso e transporte HTTP

1. **Permissão:** manter a chave **`clientes_acesso_integracoes`** para exibir o botão/menu “Integrações” (ou equivalente na nova UI). Quem não tiver permissão não vê a entrada.
2. **Módulo base:** o usuário precisa continuar podendo acessar a área de clientes conforme as regras do novo módulo.
3. **Todas as chamadas autenticadas** devem enviar:
   - **`Authorization: Bearer <token>`** (padrão do app, ex. `localStorage.authToken`),
   - **`X-Empresa-Id`** com o ID da empresa selecionada (no legado: **`ensureEmpresaSelecionada()`** + **`fetchClientes`**).
4. **Base da API:** no legado, `fetchClientes(path)` usa:
   - **`/api/clientes`** (JS) por padrão,
   - tentativa **`/api/clientes-ts`** + fallback para JS quando o “modo TS” está ativo (`getClientesApiMode()`).
   - A **importação por arquivo/lista** usa retorno com **`apiPrefix`** apontando tipicamente para **`/api/clientes-ts`** no job (`acompanharImportacaoJob`).
5. **Replicar ou centralizar** essa estratégia no novo cliente HTTP (uma função tipo `fetchClientes` evita regressão).

---

### UI do modal “Integrações” (estrutura esperada)

Implementar um modal (SweetAlert2 corporativo ou componente equivalente) com:

- **Cabeçalho:** título **“Integrações”**, subtítulo **“Importações e atualizações para clientes”**.
- **Rodapé:** apenas **Fechar** (seguir padrão corporativo de modais do projeto: `swal-corp-footer`, ações alinhadas).
- **Ao clicar em cada cartão:** fechar o modal principal e abrir o fluxo específico (comportamento atual: `Swal.close()` antes de `await fn()`).

**Seções e cartões (IDs legados úteis para grep):**

**Cadastros**

| ID legado | Título | Descrição curta |
|-----------|--------|------------------|
| `impCadastrarDasConsultas` | Cadastrar das Consultas | Cria clientes com base em consultas já realizadas. |
| `impCadastrarPeloCnpj` | Cadastrar pelo CNPJ | Cria cliente a partir do CNPJ com auto-preenchimento. |
| `impImportarClientes` | Importar clientes | Arquivo/lista com checagem de duplicidade. |

**Importações em lote**

| ID legado | Título | Descrição |
|-----------|--------|-----------|
| `impFiscalSciLote` | Importação de dados do SCI | Tributação/regime via SCI (somente CNPJ). |
| `impOneClickImportCliente` | Importar dados do OneClick | Campos do cadastro OneClick + opções granulares. |
| `impIdSistemaSciLote` | Atualizar ID Sistema (SCI) | BDCODEMP via SCI, ligação por CNPJ. |

**Atualizações**

| ID legado | Título | Descrição |
|-----------|--------|-----------|
| `impAtualizarReceitaWs` | Atualizar ReceitaWS | Atualiza CNPJs via ReceitaWS. |
| `impAtualizarSerproCnpj` | Atualizar SERPRO CNPJ | Atualiza CNPJs via API SERPRO. |

---

### Especificação por função (comportamento + endpoints)

#### 1) `cadastrarClientesDasConsultas`

- **UX:** confirmação; loading; mensagem final com **cadastrados**, **total**, **erros**.
- **HTTP:** `POST /api/clientes/cadastrar-das-consultas`
- **Pós-sucesso:** recarregar lista de clientes.

#### 2) `cadastrarClientePeloCnpj`

- **Passo 1:** input CNPJ → `GET /api/clientes/cnpj/:cnpj/dados`
- **Passo 2:** formulário editável → `POST /api/clientes/cnpj/:cnpj/cadastrar`
- **Pós-sucesso:** limpar filtros da lista, focar busca no CNPJ, recarregar lista.

#### 3) `importarClientesUI` + `acompanharImportacaoJob`

- **UX:** textarea lista/CSV; checkbox “atualizar existentes” **true e desabilitado**; checkbox **Auto preencher CNPJs via ReceitaWS**.
- **Parse:** equivalente a `parseClientesFromText` (`;` `,` TAB; cabeçalho opcional).
- **HTTP:** `POST /api/clientes-ts/importar-job` body `{ clientes, atualizarExistentes: true, preencherPorCnpj }`
- **Acompanhamento:** `EventSource` → `GET /api/clientes-ts/importar-job/:jobId/stream?token=<jwt>` (eventos `progress`, `done`, `result`); fallback `GET /api/clientes-ts/importar-job/:jobId`
- **Resumo:** totais (`totalRecebido`, `totalValidos`, `duplicadosEntrada`, `corrigidosZeroEsquerda`, `jaExistentes`, `importados`, `atualizados`, `semAlteracao`, `invalidos`, `erros` truncados).

#### 4) `atualizarFiscalSciLoteUI`

- **UI:** `limit` 1–500; modo só vazios / todos; `force`; `allowHeuristic`
- **HTTP:** `POST /api/clientes/fiscal-sci/atualizar-lote?limit=&force=&allowHeuristic=` body `{ onlyMissing }`
- **Resumo:** `processed`, `updated`, `skipped`, `failed` + amostra `resultados` (status: `updated`, `skipped_already_filled`, `skipped_no_infer`, `failed`, etc.)

#### 5) `importarClienteOneClickLoteUI` + `acompanharImportacaoOneClickJob`

- **Filtros:** mesmo conceito de **`getFiltrosClientesAtual()`** → objeto **`filtros`** no body.
- **UI:** limite 1–10000 ou “Todos”; `onlyMissing` vs `force`; switches: fiscal, comercial, grupo, status, contato, endereco, razao, socios, areas, particularidades; `includeNewFromOneclick`, `ignorarHash`; regra `onlyNewFromOneclick = includeNewFromOneclick && !any(importFlags)`.
- **HTTP:** `POST /api/clientes/oneclick/importar-job?limit=&force=` com body completo legado.
- **Acompanhamento:** SSE `GET /api/clientes/oneclick/importar-job/:jobId/stream?token=&empresaId=` + polling `GET .../oneclick/importar-job/:jobId` com Auth + `X-Empresa-Id`.

#### 6) `atualizarIdSistemaSciLoteUI`

- **UI:** limit, modo, force
- **HTTP:** `GET /api/clientes?tipo_documento=2&limit=` → filtrar vazios se aplicável → loop `POST /api/clientes/:documento/atualizar-id-sistema-sci?force=1`
- **UX:** progresso sequencial, delay ~100 ms entre chamadas, resumo com amostra.

#### 7) `atualizarClientesReceitaWsUI` + `acompanharReceitaWsJob`

- **Filtros:** equivalente a **`getFiltrosReceitaWsPayload()`**
- **Fluxo:** `POST /api/clientes/receitaws/atualizar-preview` → confirmar (ETA **20 s por CNPJ** na copy) → `POST /api/clientes/receitaws/atualizar-job` → polling `GET /api/clientes/receitaws/atualizar-job/:jobId` até `phase === 'finalizado'`.

#### 8) `atualizarClientesSerproCnpjUI` + `acompanharSerproCnpjJob`

- **Mesmos filtros** que ReceitaWS.
- **Fluxo:** `POST /api/clientes/serpro-cnpj/atualizar-preview` → confirmação com checkboxes **atualizar sócios** / **forçar QSA** → `POST /api/clientes/serpro-cnpj/atualizar-job` `{ filtros, opts: { atualizarSocios, forceSocios } }` → polling `GET /api/clientes/serpro-cnpj/atualizar-job/:jobId`.

---

### Fora do escopo (salvo pedido explícito)

- **`atualizarFiscalOneClickLoteUI`** (`POST /api/clientes/fiscal-oneclick/atualizar-lote`) existe no legado mas **não** está no modal Integrações.

---

### Critérios de aceite

- [ ] Botão Integrações respeita **`clientes_acesso_integracoes`**
- [ ] As **8** ações existem com os **mesmos endpoints** e query/body
- [ ] Jobs: **SSE** + **fallback** onde o legado usa
- [ ] OneClick / ReceitaWS / SERPRO usam os **mesmos filtros** da listagem
- [ ] Mensagens finais com os **mesmos agregados** quando a API retorna
- [ ] Lista de clientes atualiza após conclusão
- [ ] PR documenta gaps de backend e diferenças intencionais

**Instrução final:** implemente no novo módulo com o mesmo comportamento observável. Se algum endpoint faltar no branch, liste o gap e implemente o mínimo no backend reutilizando services existentes.

## FIM DO PROMPT

---

Arquivo gerado em: `docs/PROMPT-PORTAR-INTEGRACOES-CLIENTES.md`
