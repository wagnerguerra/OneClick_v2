# Concepção inicial — Tratamento de Lançamentos → SCI

> ⚠️ **DOCUMENTO HISTÓRICO / ARQUIVO.** Este é o **plano de concepção original** do
> módulo, escrito **antes do acesso ao codebase**. Serve para conferir se a **visão
> inicial** está sendo atingida — **não** reflete, necessariamente, o estado atual
> do módulo. Para o estado atual (feito/pendente, decisões, arquitetura), veja
> [`../VISAO-GERAL.md`](../VISAO-GERAL.md). Congelado propositalmente; não atualizar.

---

### 1. O usuário seleciona o arquivo de lançamentos enviado pelo cliente

- Internamente, o sistema faz extração dos dados para uma estrutura de dados padrão, legível por ele. Devem ser entendidos como uma tabela, isto é, múltiplas linhas (onde cada uma é um lançamento), separadas por colunas, e cada coluna tem um nome (cabeçalho).
- No caso de dados já tabelados de forma editável (.xls, .xlsx, .csv, etc), extrair normalmente
- No caso de documento não editável (PDF, fotos, etc):
  - Extração dos dados via IA (por ex. Gemini, ou o que fizer mais sentido)

### 2. O usuário seleciona um "Modelo de tratamento" para o plano de contas

- Caso ainda não exista o Modelo desejado, o usuário pode iniciar um fluxo para criação de um novo Modelo.

### 3. Aplicando o Modelo selecionado ao arquivo selecionado, o sistema realiza o processamento dos dados para o novo formato e disponibiliza em arquivo para download.

- Essa etapa deve ser referida como "Exportação para o SCI" e apresentada como tal para o usuário.
- Caso todos os lançamentos sejam tratados com sucesso, exibir que foi um sucesso e disponibilizar o download.
- Caso o sistema detecte que houveram lançamentos que não puderam ser interpretados pelo modelo, listá-los em tabela, exibir aviso, mostrar os porquês (tanto uma lista de erros, quanto destacar em vermelho os campos causadores na tabela - Ao clicar em um erro da lista, ele leva até o campo causador - Ao passar o mouse sobre um campo causador, um tooltip com o erro aparece), e com botão que redireciona o usuário para editar o modelo e corrigir as pendências, que ficarão destacadas em vermelho na tela de edição do modelo.
  - As possíveis pendências serão especificadas mais adiante.

---

## MODELOS DE TRATAMENTO

- Consiste em um template de mapeamento de determinadas informações dos dados extraídos para o novo formato que será gerado.
- A criação ou edição de um modelo de tratamento ocorre a partir da especificação de um arquivo de lançamentos que servirá de "exemplo". Caso o usuário tenha chegado aqui após enviar um arquivo durante o fluxo principal, esse arquivo será aproveitado.
- O usuário pode ou atrelar o modelo a um cliente, ou informar um nome personalizado para ele (caso seja mais generalizável).
- O usuário deve informar os mapeamentos dos dados de entrada especificados nos pontos a seguir.

### De/Para de colunas:

- O sistema precisa saber quais colunas/cabeçalhos dos dados extraídos do arquivo de entrada correspondem a quais colunas usadas na criação do novo formato.
- O sistema apresenta pro usuário os campos:
  - Coluna com as "descrições" dos lançamentos;
  - Coluna com os nomes dos "participantes" do lançamento;
  - Coluna de valores;
  - Coluna de data;
  - [Opcional] Coluna com números de NF;
  - [Opcional] Coluna de CNPJ/CPF (se houver uma coluna com nome contendo "CNPJ", pré-selecionar automaticamente; o mesmo não precisa ser feito com as que contém "CPF").
- Para cada um desses campos, o usuário deve escolher a coluna correspondente dos dados de entrada.
- Para facilitar na escolha, o sistema pode exibir uma prévia de 2 ou 3 linhas de dados da coluna, enquanto o usuário passa pela seleção de cada opção.

### O que define se um lançamento é entrada ou saída? O usuário deve escolher entre um desses dois:

- Coluna: `<usuário seleciona o nome da coluna>`. Após selecionada, sistema faz algo parecido com um "SELECT DISTINCT" nos dados dessa coluna e exibe o resultado para o usuário. Para cada um dos valores, o usuário especifica se corresponde a Entrada ou a Saída;
- Descrição do lançamento. Esta opção será explicada mais adiante.

### Conta corrente:

- O usuário digita o número da conta corrente do cliente.

### Mapeamento de Contas de Contrapartida:

- Nessa etapa, o sistema deve perguntar se o usuário deseja ou 1. Definir contas de contrapartida por palavras-chave, ou 2. Definir contas de contrapartida para todas as descrições de lançamento.
- Opção 1: usuário adiciona palavras-chave e, para cada uma, especifica um número de conta. Todo lançamento contendo a palavra-chave na descrição será atribuído à conta de contrapartida correspondente. Se houver mais de uma palavra-chave na descrição, deve ser considerada a primeira encontrada na string da esquerda para direita.
- Opção 2: O sistema faz algo parecido com um "SELECT DISTINCT" nas descrições dos lançamentos e exibe o resultado para o usuário. Para cada um dos valores, o usuário especifica um número de conta. Todos os lançamentos com aquela descrição serão atribuídos à conta de contrapartida correspondente.
- Para ambas as opções, em cada item de mapeamento: o usuário pode, opcionalmente, especificar um "Histórico fixo". Corresponde a uma string que será usada no campo "Histórico" do novo formato, caso preenchida.
- Para ambas as opções, em cada item de mapeamento: se usuário escolheu anteriormente que entrada/saída é definido pela descrição, também deve marcar se aquela palavra-chave ou descrição corresponde a entrada ou saída (radio button); se escolheu que é definido por uma coluna, não haverá esse radio button, apenas um balão de informação indicando que isso será determinado pela coluna especificada anteriormente.

### Pendências

- Com base nisso, podem haver pendências ao aplicar um modelo a um arquivo de entrada. São possíveis pendências:
  - Conta de contrapartida não mapeada;
  - Valor da coluna de Entrada/Saída não mapeado;
  - Campo vazio (qualquer coluna que tenha sido selecionada na seção "De/Para" precisa ter valor);
  - Data inválida;
  - Valor não numérico.

---

## ARMAZENAMENTO DOS MODELOS DE TRATAMENTO

- Os Modelos de Tratamento são persistidos em banco de dados.
  - O corpo do Modelo (de/para de colunas, mapeamentos de contrapartida, definição de entrada/saída, conta corrente, etc.) é um documento de estrutura variável e aninhada. Por isso, é armazenado como um único documento JSON, e não distribuído em várias tabelas.
  - Os dados de identificação e controle do Modelo ficam em colunas próprias, para permitir busca e listagem (ex.: localizar quais Modelos usam determinada conta ou palavra-chave).

### Estrutura de armazenamento (duas entidades):

- Modelo: id, nome, número da conta corrente, cliente (opcional), data de criação, data de última atualização, e referência à versão atual.
- Versão do Modelo: id, referência ao Modelo, número da versão, definição completa (documento JSON), autor da alteração, data de criação e uma nota opcional descrevendo o que mudou.

### Versionamento:

- A cada alteração salva, é gerada uma nova Versão do Modelo contendo um snapshot COMPLETO da definição (não apenas as diferenças).
- Num primeiro momento, a própria lista de versões — com data, autor e nota — já cumpre o papel de "log de alterações".
- Como cada versão guarda a definição inteira, a futura visualização de diff entre duas versões poderá ser feita comparando os dois documentos JSON, sem necessidade de alterar a forma de armazenamento.

---

## ESPECIFICAÇÃO DO "NOVO FORMATO"

- Consiste em um arquivo .txt num formato que é importável pelo programa contábil SCI. Formatação ANSI. Quebra de linha conforme Windows.
- Cada linha do arquivo corresponde a um conjunto de informações separadas por vírgula, referentes a um dos lançamentos do arquivo de entrada, conforme as regras do Modelo de Tratamento selecionado.
  - Deve haver uma dessas linhas para cada um dos lançamentos do arquivo de entrada.
- A estrutura de cada linha é a seguinte: `"<1>,<2>,<3>,<4>,<5>,<VAZIO>,<6>,<7>,<VAZIO>,<8>"`
  - `<VAZIO>`: O campo deve ficar vazio, ou seja, com valor "".
  - `<1>`: Número da linha, com 5 dígitos. Sempre começa com 00001 na primeira linha e cada linha subsequente incrementa 1.
  - `<2>`: Data do lançamento. Formato: "YYYYMMDD"
  - `<3>`: Se o lançamento é de Entrada, será o número da conta corrente; se é de Saída, será o número da conta de contrapartida.
  - `<4>`: Se o lançamento é de Entrada, será o número da conta de contrapartida; se é de Saída, será o número da conta corrente.
  - `<5>`: Valor do lançamento. Sempre sem sinal. O único separador usado deve ser o de casas decimais: ".".
  - `<6>`: Histórico do lançamento. String.
    - Se houver "Histórico fixo" definido, esse será o valor.
    - Senão, a string é montada com as seguinte estrutura (valores entre `<>` são variáveis):

      ```
      "VR REF <Se entrada = 'RECEB'; Se saída = 'PGTO'><Se houver número de NF = ' NF Nº <Número da NF>'> - <Nome do participante em uppercase>"
      ```
  - `<7>`: Se houver número de NF, será string com estrutura `"DCTO<Número da NF>"`. Senão, fica vazio.
  - `<8>`: Se houver CNPJ/CPF, será esse o valor, apenas em números, ou seja, com caracteres como ".", "-", "/" e " " removidos. Senão, fica vazio.

---

## EXTRAÇÃO DINÂMICA DE ARQUIVOS TABELADOS

- Para arquivos já tabelados (.xls, .xlsx, .csv, etc.), a localização da tabela de lançamentos é automática. O usuário NÃO deve precisar informar a aba a ser usada, nem quantas linhas de cabeçalho ignorar.
  - Assume-se como garantido que o arquivo de entrada sempre contém dados tabelados.

### Seleção da aba (para arquivos com múltiplas abas):

- O sistema avalia cada aba pelo tamanho do maior bloco contíguo de células preenchidas e seleciona a de maior pontuação.

### Localização da região da tabela:

- Linhas de topo que não fazem parte da tabela (título, nome do banco, período do extrato, etc.) costumam ser esparsas — poucas colunas preenchidas, por vezes com células mescladas — e são descartadas.
- A tabela de lançamentos é identificada como o maior conjunto de linhas consecutivas com o mesmo "footprint" de colunas preenchidas (mesmo conjunto de colunas preenchidas, repetido por muitas linhas).
- Linhas finais de totalização (ex.: "SALDO", "TOTAL") quebram esse padrão (geralmente apenas uma ou duas células preenchidas) e são removidas.

### Identificação da linha de cabeçalho:

- Dentro do bloco identificado, o cabeçalho é a primeira linha majoritariamente textual, seguida por linhas cujos valores já apresentam tipos de dado consistentes por coluna (números na coluna de valores, datas na coluna de data).

### Confirmação implícita:

- A prévia de 2 ou 3 linhas exibida na etapa de de/para de colunas serve também como conferência visual de que a detecção foi correta. Caso o cabeçalho exibido esteja errado, o usuário percebe nessa etapa, sem precisar configurar manualmente a aba ou o número de linhas a pular.

### Caso de baixa confiança (exceção):

- Se nenhuma região tabular consistente for identificada com clareza, o sistema pode, como exceção, enviar as primeiras linhas do arquivo para extração via IA, perguntando qual é a linha de cabeçalho. Esse caminho é exceção, e não o fluxo principal.
