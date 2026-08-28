# SearXNG — busca web gratuita para o dossiê

Metabuscador de código aberto, rodando num contêiner nosso. Existe porque as
alternativas com API deixaram de servir (conferido em 28/08/2026):

- **Google Programmable Search** — fechado para novos clientes desde 2025, e com
  desligamento marcado para 01/01/2027.
- **Brave Search API** — o plano gratuito acabou em fevereiro/2026; virou US$ 5
  por mil buscas, com cartão cadastrado.

Aqui não há chave nem cota: o custo é a memória do contêiner.

## O que ele habilita

| Onde | O que muda sem ele | O que muda com ele |
|---|---|---|
| Logomarca do cliente | Só acha se descobrir o site | Procura pelo nome da empresa na web |
| Perfis dos sócios | Só link colado à mão | Botão "Procurar" sugere candidatos |

Nos dois casos o resultado é **candidato**, não verdade: a logo passa pela
validação de tamanho e tipo, e o perfil de sócio nasce marcado "a conferir" até
alguém confirmar.

## Instalação

Tudo na VPS, em `/opt/oneclick`. O `docker-compose.yml` de lá **não** é
sobrescrito pelo deploy (o deploy mexe em `/opt/oneclick-src`), então a edição
sobrevive às publicações. E o deploy só recria `api` e `web` — o SearXNG fica de
pé durante uma publicação.

**1. Crie o diretório de configuração e copie o `settings.yml`:**

```bash
mkdir -p /opt/oneclick/searxng
# copie deploy/searxng/settings.yml deste repo para /opt/oneclick/searxng/settings.yml
```

**2. Gere a chave e troque no arquivo:**

```bash
openssl rand -hex 32
# cole no lugar de TROQUE_POR_UMA_CHAVE_ALEATORIA
```

**3. Cole o trecho de `compose-trecho.yml`** em `/opt/oneclick/docker-compose.yml`,
dentro de `services:`.

**4. Suba só ele** — sem tocar em `api` e `web`:

```bash
cd /opt/oneclick && docker compose up -d searxng
```

**5. Confirme que o JSON responde**, de dentro da rede da stack:

```bash
docker exec oneclick-api sh -c \
  'wget -qO- "http://searxng:8080/search?q=teste&format=json" | head -c 200'
```

Se voltar JSON, está pronto. Se voltar HTML ou erro 403, o `formats: [json]` do
`settings.yml` não foi aplicado — confira se o arquivo está mesmo montado em
`/etc/searxng/settings.yml` dentro do contêiner.

**6. Ligue no sistema:** Configurações → Dossiê e Imagens →
**Endereço do SearXNG** = `http://searxng:8080`

Vale imediatamente, sem reiniciar a API: o salvar da tela de configurações já
aplica a variável no processo.

## O que esperar

**Memória.** ~200–350 MB com dois workers. Na medição de 28/08 a VPS tinha
5,2 GB disponíveis (de 7,9 GB), então cabe — mas o swap estava em 1,8 GB de
2 GB, e é justamente sob essa pressão que dois deploys travaram. Se a coisa
apertar, `UWSGI_WORKERS: "1"` corta quase metade.

**Resultado irregular.** SearXNG consulta os buscadores raspando as páginas
públicas deles, e IP de datacenter apanha mais que IP residencial: o Google
responde captcha com alguma frequência a partir de VPS. DuckDuckGo, Brave e
Mojeek toleram melhor. Na prática isso significa buscas que às vezes voltam
vazias — o que a tela já trata dizendo "nada encontrado", em vez de fingir.

**Manutenção.** `docker compose pull searxng && docker compose up -d searxng`
de tempos em tempos. Motor de busca que muda o HTML quebra o adaptador, e a
correção vem por atualização da imagem.
