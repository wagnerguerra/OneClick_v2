# Integração Google Drive — Sincronização de XMLs por cliente

Este módulo permite vincular uma pasta do Google Drive a cada cliente do sistema.
Quando o cliente sobe um XML de NFe nessa pasta, o sistema importa automaticamente
no módulo DANFE (cron a cada 15 minutos), gerando o PDF e indexando a chave.

---

## Visão geral

- **Estratégia:** polling incremental via `files.list` com filtro `modifiedTime`.
- **Autenticação:** 2 modos suportados — **OAuth de usuário** (reaproveita app OAuth
  existente, sistema age como conta Google humana) **ou Service Account** (identidade
  fixa do sistema; cada pasta precisa ser explicitamente compartilhada com a SA).
- **Vinculação:** cola a URL/ID da pasta no detalhe do cliente, aba Fiscal → Drive.
- **Deduplicação:** pelo campo `Danfe.chave` (44 dígitos, unique no banco).
  Mesmo se o XML for movido/renomeado/duplicado na pasta, só é importado 1×.

---

## Setup A — Reaproveitar OAuth existente (RECOMENDADO se já tem)

Se já existe um app OAuth do Google Cloud com `credentials.json` + `token.pickle`
(gerado por algum script Python anterior, ex: backup do escritório), o caminho é:

1. Copie os arquivos para `<raiz-do-monorepo>/google/`:
   - `credentials.json` (do OAuth Client, tipo Desktop/installed)
   - `token.pickle` (com refresh_token de uma conta Google que tem acesso ao Drive)

2. Rode o script de extração (requer Python instalado):
   ```bash
   python scripts/extract-google-refresh-token.py
   ```
   Vai imprimir as 2 linhas prontas pra colar no `.env`:
   ```env
   GOOGLE_DRIVE_OAUTH_CREDENTIALS_FILE=./google/credentials.json
   GOOGLE_DRIVE_OAUTH_REFRESH_TOKEN=1//0Gxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
   ```

3. Ligue o cron:
   ```env
   GOOGLE_DRIVE_SYNC_ENABLED=true
   ```

4. Reinicie a API. O sistema agora age em nome da conta Google que autorizou o app
   originalmente. Na UI do cliente aparece "Conectado como: x@gmail.com".

**Importante:** ao usar OAuth, o sistema enxerga **tudo que a conta autorizada
enxerga no Drive** — pastas próprias dela e pastas compartilhadas com ela. Não
precisa compartilhar nada de novo se essa conta já é a "dona" das pastas.

---

## Setup B — Service Account do zero

### 1. Criar a Service Account no Google Cloud

1. Acesse https://console.cloud.google.com/iam-admin/serviceaccounts
2. Crie um projeto novo (ou use um existente) — ex: "OneClick Drive Sync"
3. **IAM → Service Accounts → Create service account**
   - Nome: `oneclick-drive-sync`
   - Conceda papel: nenhum (não precisa de papel no projeto)
4. Após criar, clique na SA → aba **Keys → Add Key → Create new key → JSON**
5. Salve o arquivo `.json` baixado em local seguro.

### 2. Habilitar a Google Drive API

1. **APIs & Services → Library**
2. Busque "Google Drive API" → **Enable**

### 3. Configurar a variável de ambiente

Você tem 3 opções (`GOOGLE_DRIVE_SA_JSON_FILE` tem precedência sobre `GOOGLE_DRIVE_SA_JSON`):

**Opção A — Arquivo no disco (RECOMENDADO em dev):**

Coloque o JSON baixado em `<raiz-do-monorepo>/google/service-account.json` e setе:
```env
GOOGLE_DRIVE_SA_JSON_FILE=./google/service-account.json
```
O caminho é resolvido contra o cwd da API e, em fallback, contra a raiz do monorepo
(`../..` a partir de `apps/api`). A pasta `google/` está no `.gitignore`.

**Opção B — JSON cru (inline):**
```env
GOOGLE_DRIVE_SA_JSON={"type":"service_account","project_id":"...","private_key":"-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n","client_email":"...@projeto.iam.gserviceaccount.com",...}
```
Atenção: a `\n` dentro de `private_key` PRECISA estar literal (não escapada).

**Opção C — Base64 (produção em containers):**
```bash
# Linux/macOS
base64 -w0 chave-sa.json
# Windows PowerShell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("chave-sa.json"))
```
```env
GOOGLE_DRIVE_SA_JSON=eyJ0eXBlIjoic2VydmljZV9hY2NvdW50Iiwi...
```

### 4. Ligar o cron automático

```env
GOOGLE_DRIVE_SYNC_ENABLED=true
GOOGLE_DRIVE_SYNC_CRON=*/15 * * * *
```

Reinicie a API. Veja o log de inicialização — deve aparecer:
```
[DriveSync Scheduler] Iniciado: */15 * * * *
```

---

## Vinculação de pasta por cliente (cada cliente, 1×)

1. No escritório, abra a pasta do cliente no Google Drive e clique em **Compartilhar**.
2. Cole o **email da Service Account** (mostrado na UI em `Cliente → Drive → "Compartilhe a pasta com este email"`).
3. Permissão: **Leitor** (sistema só lê, não escreve).
4. Copie a URL da pasta (`drive.google.com/drive/folders/<ID>`).
5. No sistema, abra `Clientes → [cliente] → aba Drive`, cole a URL e clique em **Vincular**.

A partir daí, qualquer XML colocado nessa pasta será importado no próximo ciclo
de sync (até 15 min, ou imediatamente se você clicar em **Sincronizar agora**).

---

## Endpoints tRPC

| Endpoint                          | Permissão     | Descrição                                         |
|-----------------------------------|---------------|---------------------------------------------------|
| `drive.info`                      | cliente.read  | Email da SA + flag de configuração                |
| `drive.vincularPasta`             | cliente.write | Valida acesso e salva folderId no cliente         |
| `drive.desvincularPasta`          | cliente.write | Remove vínculo                                    |
| `drive.sincronizarCliente`        | cliente.write | Sync manual de 1 cliente                          |
| `drive.sincronizarTodos`          | cliente.write | Sync manual de todos os clientes com pasta        |
| `drive.listarLogs`                | cliente.read  | Logs de execução de um cliente (últimos 20)       |
| `drive.getLog`                    | cliente.read  | Detalhe de um log (com lista de arquivos)         |

---

## Troubleshooting

### "Pasta não encontrada ou Service Account sem acesso"
A SA não foi adicionada à pasta. Compartilhe a pasta com o email da SA mostrado
em `drive.info.serviceAccountEmail`.

### "GOOGLE_DRIVE_SA_JSON não configurado"
A env não está setada. Veja seção "Setup inicial" acima.

### Cron não roda automaticamente
- `GOOGLE_DRIVE_SYNC_ENABLED` precisa ser exatamente `true` (string).
- Verifique no log de boot da API se apareceu `[DriveSync Scheduler] Iniciado`.
- Reinicie a API após alterar a env.

### Vejo XMLs novos mas não importam
- Verifique o log do cliente: `Cliente → Drive → Logs` mostra o que aconteceu.
- Se o XML não for de NFe autorizada (modelo 55), pode falhar no parser — veja
  o erro no log do item.

---

## Limites e custos

- **Quotas do Drive API:** 10.000 requests/100s por projeto. Cada sync de cliente
  consome ~1 request (list) + N requests (download dos XMLs novos). Com 100
  clientes a cada 15 min, fica em ~6.700 requests/dia — bem abaixo do limite.
- **Custos:** Service Account é gratuita. Drive API é gratuita para esse volume.
- **Latência:** atraso máximo entre upload do cliente e importação = `cron interval`
  (15 min por default). Para reduzir, ajuste `GOOGLE_DRIVE_SYNC_CRON`.

---

## Arquitetura

```
[Cliente] → coloca XML.xml em Drive/Pasta-X
                 ↓
[Cron 15min] → DriveSyncScheduler.run()
                 ↓
[Para cada cliente com driveFolderId]
                 ↓
DriveSyncService.sincronizarCliente()
   ├─ drive.files.list({ q: "in parents AND modifiedTime > syncedAt - 5min" })
   ├─ Para cada XML novo:
   │   ├─ drive.files.get({ alt: "media" }) → string
   │   └─ DanfeService.processarXml(content, { uploadedById, empresaId })
   │       ├─ Parse → valida chave/modelo/numero/CNPJ
   │       ├─ Dedup por chave (unique constraint)
   │       ├─ Save XML no S3
   │       ├─ Gera PDF via nfe-danfe-pdf
   │       └─ Persiste Danfe
   ├─ Atualiza cliente.driveSyncedAt = NOW()
   └─ Cria DriveSyncLog com itens processados
```
