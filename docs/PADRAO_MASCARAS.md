# Padrão de Máscaras e Formatação de Campos

## Referência Rápida

| Campo | Formato | Máscara | Exemplo |
|-------|---------|---------|---------|
| CPF | `000.000.000-00` | `masks.cpf` | 123.456.789-00 |
| CNPJ | `00.000.000/0000-00` | `masks.cnpj` | 12.345.678/0001-99 |
| CPF/CNPJ (auto) | detecta pelo tamanho | `masks.cpfCnpj` | — |
| Telefone | `(00) 00000-0000` | `masks.telefone` | (27) 99999-1234 |
| Telefone fixo | `(00) 0000-0000` | `masks.telefone` | (27) 3333-1234 |
| CEP | `00000-000` | `masks.cep` | 29165-130 |
| Data | `00/00/0000` | `masks.data` | 20/01/2025 |
| Moeda (R$) | `000.000,00` | `masks.moeda` | 3.932,00 |
| RG | `00.000.000-0` | `masks.rg` | 12.345.678-9 |
| IE | Apenas números | `masks.ie` | 12345678901234 |
| Placa | `ABC-1234` | `masks.placa` | ABC-1D23 |
| Apenas números | Remove não-dígitos | `masks.numero` | 12345 |

---

## Uso nos Componentes

### Máscara simples com `register` do React Hook Form

```tsx
import { masks } from '@/lib/masks'

<Input
  {...register('cnpj')}
  onChange={e => {
    e.target.value = masks.cnpj(e.target.value)
    register('cnpj').onChange(e)
  }}
  placeholder="00.000.000/0000-00"
/>
```

### Campo monetário (R$)

```tsx
import { masks, moedaParaNumero, numeroParaMoeda } from '@/lib/masks'

// No defaultValues:
salario: numeroParaMoeda(data.salario)

// No Input:
<Input
  {...register('salario')}
  onChange={e => {
    e.target.value = masks.moeda(e.target.value)
    register('salario').onChange(e)
  }}
/>

// Antes de enviar ao backend:
salario: moedaParaNumero(data.salario)
```

### Campo de data (dd/mm/yyyy)

```tsx
import { masks, dataParaISO, isoParaData } from '@/lib/masks'

// No defaultValues (convertendo ISO → brasileiro):
dataAdmissao: isoParaData(data.dataAdmissao)

// No Input:
<Input
  {...register('dataAdmissao')}
  onChange={e => {
    e.target.value = masks.data(e.target.value)
    register('dataAdmissao').onChange(e)
  }}
  placeholder="00/00/0000"
/>

// Antes de enviar ao backend (convertendo brasileiro → ISO):
dataAdmissao: dataParaISO(data.dataAdmissao)
```

---

## Conversores

| Função | Entrada | Saída | Uso |
|--------|---------|-------|-----|
| `dataParaISO(v)` | `"20/01/2025"` | `"2025-01-20"` | Antes de enviar ao backend |
| `isoParaData(v)` | `"2025-01-20"` | `"20/01/2025"` | Ao carregar dados do backend |
| `moedaParaNumero(v)` | `"3.932,00"` | `3932.00` | Antes de enviar ao backend |
| `numeroParaMoeda(v)` | `3932.00` | `"3.932,00"` | Ao carregar dados do backend |

---

## Regras de Validação Associadas

| Campo | Validação Zod |
|-------|--------------|
| CPF | `z.string().length(14)` (com máscara) ou `.length(11)` (só dígitos) |
| CNPJ | `z.string().min(14).max(18)` |
| Telefone | `z.string().min(14)` (com máscara) |
| CEP | `z.string().min(9)` (com máscara) |
| Data | `z.string().length(10)` formato dd/mm/yyyy |
| Moeda | `z.string()` → converter com `moedaParaNumero()` |
| Email | `z.string().email()` |

---

## Padrões Brasileiros de Referência

### Documentos
- **CPF**: 3 grupos de 3 dígitos + 2 verificadores: `000.000.000-00`
- **CNPJ**: `00.000.000/0000-00` (14 dígitos)
- **RG**: Varia por estado, padrão geral: `00.000.000-0`
- **PIS/PASEP**: `000.00000.00-0`
- **CNH**: 11 dígitos sem formatação
- **Título de Eleitor**: 12 dígitos sem formatação

### Endereço
- **CEP**: `00000-000` (8 dígitos)
- **UF**: 2 letras maiúsculas (AC, AL, ..., TO)

### Contato
- **Telefone fixo**: `(00) 0000-0000` (10 dígitos)
- **Celular**: `(00) 00000-0000` (11 dígitos)
- **DDI + celular**: `+55 (00) 00000-0000`

### Financeiro
- **Moeda BRL**: `R$ 0,00` → `R$ 1.234.567,89`
- **Separador decimal**: vírgula (`,`)
- **Separador de milhar**: ponto (`.`)
- **Porcentagem**: `0,00%`

### Data e Hora
- **Data**: `dd/mm/aaaa` (padrão brasileiro)
- **Hora**: `HH:mm` (24h) ou `HH:mm:ss`
- **Data e hora**: `dd/mm/aaaa HH:mm`
- **ISO (backend)**: `yyyy-mm-dd` ou `yyyy-mm-ddTHH:mm:ss`

### Veículos
- **Placa antiga**: `ABC-1234`
- **Placa Mercosul**: `ABC1D23`

### Bancário
- **Agência**: `0000` ou `0000-0`
- **Conta corrente**: Varia por banco, geralmente `00000-0`
- **Código de barras**: 47 ou 48 dígitos
- **Linha digitável**: `00000.00000 00000.000000 00000.000000 0 00000000000000`
