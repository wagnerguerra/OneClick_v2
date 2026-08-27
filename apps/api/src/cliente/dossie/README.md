# Dossiê do Cliente

Enriquece o cadastro a partir do CNPJ, usando fontes públicas, sem tocar no que
o time preencheu à mão.

## O princípio

Dado de fonte oficial é **fato**; dado de busca web seria **inferência**. Todo
fato é gravado com procedência — fonte, URL, data e confiança — e a tela mostra
isso. Quando a fonte discorda do cadastro, vira **sugestão**: alguém aprova na
aba Dossiê. A única exceção é o CNAE, aplicado direto, porque tem resposta única
e objetiva (ver `CAMPOS_AUTOMATICOS` em `divergencias.ts`).

## Como se encaixa no que já existia

Não criamos `empresas_socios` nem `empresas_estabelecimentos`: `Socio` e
`cliente_cnaes` já são isso no projeto, e são cadastro editável. Duplicá-los
criaria duas verdades sobre o mesmo cliente. O dossiê grava em tabelas próprias
(`cliente_dossie_*`) e espelha os CNAEs em `cliente_cnaes`, que é de onde sai a
descrição da atividade usada, por exemplo, na sugestão de capa do cliente.

## Provedores

| Ordem | Fonte | Custo | Por que nessa posição |
|---|---|---|---|
| 1 | **OpenCNPJ** | grátis, sem token | Único que traz CNAE **com descrição**, Simples/MEI com datas, motivo da situação e código IBGE. Responde em ~0,2s |
| 2 | **BrasilAPI** | grátis, sem token | Cobertura equivalente nos cadastrais, sem SLA melhor; reserva natural |
| 3 | **SERPRO** | pago por consulta | Só quando as públicas falham. Reaproveita o `CnpjService` que já existe |

Resiliência: timeout de 5s, três tentativas com espera crescente **só** em 429 e
5xx (404 não melhora com insistência), e disjuntor por provedor — cinco falhas
seguidas tiram o provedor da fila por cinco minutos.

## Variáveis de ambiente

```env
# Ordem da cadeia. Vazio usa o padrão opencnpj,brasilapi,serpro.
DOSSIE_PROVEDORES=

# O SERPRO só entra na cadeia se estas duas existirem (já usadas pelo CnpjService).
SERPRO_CONSUMER_KEY=
SERPRO_CONSUMER_SECRET=
```

O job diário é desligado por padrão. Para ligar, em `system_config`:
`DOSSIE_SITUACAO_ENABLED=true` e, opcionalmente, `DOSSIE_SITUACAO_CRON`
(padrão `0 6 * * *`).

## Cache

Dados cadastrais mudam pouco: **TTL de 60 dias**. Consultar de novo dentro
disso responde do que já está gravado — e é isso que torna a varredura
idempotente e retomável, sem precisar guardar cursor.

A exceção é a **situação cadastral dos clientes ativos**, revalidada
diariamente pelo `dossie.scheduler.ts`: é o único dado que gera alerta de
negócio (cliente baixado, suspenso ou inapto muda o que o escritório precisa
fazer, e ninguém avisa o contador). A mudança entra na linha do tempo do
cliente como evento `dossie_situacao`.

## CNPJ alfanumérico

O formato entra em vigor em 2026 e **nenhuma fonte pública aceita ainda**. Por
isso `prepararCnpjParaConsulta` recusa explicitamente, em vez de limpar com
`/\D/g` — que apagaria as letras e faria a consulta responder sobre outra
empresa, calada. A varredura separa esses clientes antes de gastar rede e os
relata como "fora do alcance da consulta", não como erro.

## LGPD

Dado de pessoa jurídica é público. O QSA não é: o documento do sócio é
**mascarado antes de ser gravado** (`mascararDocumento`), o acesso ao dossiê
fica registrado em `cliente_dossie_acessos`, e nada aqui alimenta prospecção.

## Varredura da base

`/clientes` → ⋮ → **Varredura do dossiê** (master). Abre em simulação: quantos
serão consultados, quantos ficam de fora e por quê, e a estimativa de tempo.
Só depois disso é possível rodar, com limite por rodada e interrupção a
qualquer momento.

## Testes

`npx jest src/cliente/dossie` — validação de CNPJ, normalização de cada
provedor, backoff, disjuntor e detecção de divergência. Nenhum bate em API real:
o `fetch` global é sempre trocado por mock.
