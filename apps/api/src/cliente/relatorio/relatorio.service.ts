import { Injectable, Inject } from '@nestjs/common'
import * as XLSX from 'xlsx'
import { prisma, type Prisma } from '@saas/db'
import { ClienteService } from '../cliente.service'
import { CAMPOS_POR_CHAVE, camposPermitidos, type CampoRelatorio } from './campos'

/** O que o usuário montou: campos, na ordem, e os filtros da listagem. */
export interface DefinicaoRelatorio {
  campos: string[]
  filtros?: Record<string, unknown>
  ordenacao?: { campo: string; direcao: 'asc' | 'desc' }
}

/**
 * Teto de linhas por execução.
 *
 * Sem ele, um relatório sem filtro em uma base grande carrega tudo em memória
 * e derruba a API para todo mundo. 20 mil cobre com folga a maior carteira que
 * temos hoje (1.6 mil) e ainda deixa espaço para o crescimento de anos.
 */
const TETO_LINHAS = 20_000

@Injectable()
export class ClienteRelatorioService {
  constructor(@Inject(ClienteService) private readonly clienteService: ClienteService) {}

  /**
   * Valida a definição contra o catálogo e a permissão de quem executa.
   *
   * Chave desconhecida é DESCARTADA, não recusada: um relatório salvo continua
   * abrindo depois que um campo deixa de existir, só que sem aquela coluna.
   * Recusar o relatório inteiro faria uma remoção nossa quebrar o trabalho
   * salvo de quem não teve nada a ver com ela.
   */
  private resolverCampos(chaves: string[], podeSub: (sub: string) => boolean): CampoRelatorio[] {
    const permitidos = new Set(camposPermitidos(podeSub).map(c => c.chave))
    const vistos = new Set<string>()
    const saida: CampoRelatorio[] = []
    for (const chave of chaves) {
      if (vistos.has(chave)) continue          // a mesma coluna duas vezes não ajuda ninguém
      vistos.add(chave)
      const campo = CAMPOS_POR_CHAVE.get(chave)
      if (campo && permitidos.has(chave)) saida.push(campo)
    }
    return saida
  }

  /**
   * Monta o `select` do Prisma a partir dos campos pedidos.
   *
   * Só o que foi pedido entra: um relatório de três colunas não deve arrastar
   * as cento e tantas do `Cliente`, nem as relações que ninguém escolheu.
   */
  private montarSelect(campos: CampoRelatorio[]): Prisma.ClienteSelect {
    const select: Record<string, unknown> = { id: true }
    for (const campo of campos) {
      const o = campo.origem
      if (o.tipo === 'campo') {
        select[o.campo] = true
      } else if (o.tipo === 'derivado') {
        for (const dep of o.depende) select[dep] = true
      } else {
        // Relação: acumula os campos pedidos dela em um único `select`, para
        // que dois campos da mesma relação não virem dois includes.
        const atual = (select[o.relacao] as { select: Record<string, unknown>; where?: unknown } | undefined)
          ?? { select: { id: true }, ...(o.onde ? { where: o.onde } : {}) }
        if (o.campo !== '__count') {
          const [raiz, folha] = o.campo.split('.')
          if (folha) {
            const aninhado = (atual.select[raiz!] as { select: Record<string, unknown> } | undefined)
              ?? { select: {} }
            aninhado.select[folha] = true
            atual.select[raiz!] = aninhado
          } else {
            atual.select[raiz!] = true
          }
        }
        select[o.relacao] = atual
      }
    }
    return select as Prisma.ClienteSelect
  }

  /** Extrai o valor de um campo já com a linha carregada. */
  private valorDe(campo: CampoRelatorio, linha: Record<string, unknown>): unknown {
    const o = campo.origem
    if (o.tipo === 'campo') return linha[o.campo]
    if (o.tipo === 'derivado') return null                 // o formatar() usa a linha inteira
    const itens = linha[o.relacao]
    if (o.campo === '__count') return Array.isArray(itens) ? itens.length : (itens ? 1 : 0)
    // Relação 1:1 (contratoParams é única por empresa) chega como array de um.
    const lista = Array.isArray(itens) ? itens : itens ? [itens] : []
    const [raiz, folha] = o.campo.split('.')
    const valores = lista
      .map(i => {
        const item = i as Record<string, unknown>
        const bruto = folha ? (item[raiz!] as Record<string, unknown> | null)?.[folha] : item[raiz!]
        return bruto == null ? '' : String(bruto)
      })
      .filter(Boolean)
    if (!valores.length) return null
    // Uma linha por cliente, com a relação achatada numa célula (decisão do
    // Wagner). Multiplicar linhas repetiria os dados do cliente e enganaria
    // quem somasse a planilha.
    return o.juntar ? valores.join(o.juntar) : valores[0]
  }

  /**
   * Executa o relatório.
   *
   * O `where` vem de `montarWhereClientes` — o MESMO da listagem. É o que
   * impede o arquivo de contar uma população diferente da que a tela mostra.
   */
  async executar(
    definicao: DefinicaoRelatorio,
    ctx: { isMaster?: boolean; empresaId?: string; podeSub: (sub: string) => boolean },
    opcoes?: { limite?: number },
  ): Promise<{
    colunas: Array<{ chave: string; rotulo: string; tipo: string }>
    linhas: Array<Array<string | number | null>>
    total: number
    truncado: boolean
  }> {
    const campos = this.resolverCampos(definicao.campos, ctx.podeSub)
    if (!campos.length) return { colunas: [], linhas: [], total: 0, truncado: false }

    const where = await this.clienteService.montarWhereClientes(
      (definicao.filtros ?? {}) as never, ctx.isMaster, ctx.empresaId,
    )

    const total = await prisma.cliente.count({ where })
    const take = Math.min(opcoes?.limite ?? TETO_LINHAS, TETO_LINHAS)

    // Ordena só por campo direto: ordenar por relação exigiria um join que o
    // catálogo não descreve, e a alternativa (ordenar em memória) mentiria
    // quando o resultado fosse truncado pelo teto.
    const campoOrdem = definicao.ordenacao?.campo
      ? CAMPOS_POR_CHAVE.get(definicao.ordenacao.campo)
      : undefined
    const orderBy = campoOrdem && campoOrdem.origem.tipo === 'campo'
      ? { [campoOrdem.origem.campo]: definicao.ordenacao!.direcao }
      : { code: 'asc' as const }

    const dados = await prisma.cliente.findMany({
      where,
      select: this.montarSelect(campos),
      orderBy: orderBy as Prisma.ClienteOrderByWithRelationInput,
      take,
    })

    const linhas = dados.map(d => {
      const linha = d as unknown as Record<string, unknown>
      return campos.map(campo => {
        const bruto = this.valorDe(campo, linha)
        if (campo.formatar) return campo.formatar(bruto, linha)
        return bruto == null ? '' : (typeof bruto === 'number' ? bruto : String(bruto))
      })
    })

    return {
      colunas: campos.map(c => ({ chave: c.chave, rotulo: c.rotulo, tipo: c.tipo })),
      linhas,
      total,
      truncado: total > take,
    }
  }

  /** O catálogo que este usuário pode usar, agrupado como a tela desenha. */
  catalogo(podeSub: (sub: string) => boolean) {
    const campos = camposPermitidos(podeSub)
    const grupos = [...new Set(campos.map(c => c.grupo))]
    return grupos.map(grupo => ({
      grupo,
      campos: campos
        .filter(c => c.grupo === grupo)
        .map(c => ({ chave: c.chave, rotulo: c.rotulo, tipo: c.tipo, padrao: !!c.padrao })),
    }))
  }

  /**
   * O relatorio como arquivo.
   *
   * Tres formatos, um motor: o `executar` acima ja devolveu colunas e linhas
   * prontas: aqui so muda o empacotamento. Copiado do relatorio de orcamentos,
   * que ja resolveu esse caminho — inclusive o download por navegacao, que e o
   * que sobrevive ao bloqueio de download por JavaScript do navegador.
   */
  async gerarArquivo(
    definicao: DefinicaoRelatorio,
    ctx: { isMaster?: boolean; empresaId?: string; podeSub: (sub: string) => boolean },
    formato: 'xlsx' | 'csv' | 'pdf',
    titulo = 'Relatorio de clientes',
  ): Promise<{ buffer: Buffer; filename: string; contentType: string }> {
    const { colunas, linhas, total, truncado } = await this.executar(definicao, ctx)
    const cabecalho = colunas.map(c => c.rotulo)
    const geradoEm = new Date().toLocaleString('pt-BR')
    const base = `clientes-${new Date().toISOString().slice(0, 10)}`
    // O aviso viaja DENTRO do arquivo. Quem recebe a planilha por e-mail nao
    // viu a tela que avisou do corte — e uma planilha truncada em silencio e
    // pior que um relatorio que nao saiu.
    const aviso = truncado ? `Mostrando as primeiras ${linhas.length} de ${total} linhas.` : ''

    if (formato === 'csv') {
      const esc = (v: string | number | null) => {
        const t = String(v ?? '')
        return /[";\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t
      }
      const out: string[] = [esc(titulo), esc(`Gerado em ${geradoEm}`)]
      if (aviso) out.push(esc(aviso))
      out.push('', cabecalho.map(esc).join(';'))
      for (const l of linhas) out.push(l.map(esc).join(';'))
      // BOM na frente: sem ele o Excel abre o acento como caractere estranho.
      return {
        buffer: Buffer.from('\ufeff' + out.join('\r\n'), 'utf-8'),
        filename: `${base}.csv`,
        contentType: 'text/csv; charset=utf-8',
      }
    }

    if (formato === 'pdf') {
      const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(titulo)}</title><style>
        *{box-sizing:border-box} body{font-family:system-ui,Segoe UI,Roboto,Arial,sans-serif;color:#0f172a;font-size:11px}
        h1{font-size:17px;margin:0} .sub{color:#64748b;font-size:10px;margin:3px 0 14px}
        table{border-collapse:collapse;width:100%}
        th,td{border-bottom:1px solid #e5e8ee;padding:4px 6px;text-align:left;font-size:9.5px}
        th{background:#f1f5f9;text-transform:uppercase;letter-spacing:.04em;font-size:8.5px;color:#64748b}
      </style></head><body>
      <h1>${esc(titulo)}</h1>
      <div class="sub">Gerado em ${esc(geradoEm)} &middot; ${total} cliente(s)${aviso ? ' &middot; ' + esc(aviso) : ''}</div>
      <table><thead><tr>${cabecalho.map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead>
      <tbody>${linhas.map(l => `<tr>${l.map(c => `<td>${esc(String(c ?? ''))}</td>`).join('')}</tr>`).join('')}</tbody></table>
      </body></html>`
      const puppeteer = (await import('puppeteer')).default
      const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] })
      try {
        const page = await browser.newPage()
        await page.setContent(html, { waitUntil: 'load' })
        const buffer = Buffer.from(await page.pdf({
          format: 'A4', printBackground: true,
          // Muitas colunas em retrato viram uma coluna de letras espremidas.
          landscape: cabecalho.length > 6,
          margin: { top: '12mm', right: '10mm', bottom: '12mm', left: '10mm' },
        }))
        await page.close()
        return { buffer, filename: `${base}.pdf`, contentType: 'application/pdf' }
      } finally {
        await browser.close()
      }
    }

    const aoa: (string | number | null)[][] = [[titulo], [`Gerado em ${geradoEm}`]]
    if (aviso) aoa.push([aviso])
    aoa.push([], cabecalho)
    for (const l of linhas) aoa.push(l)
    const ws = XLSX.utils.aoa_to_sheet(aoa)
    ws['!cols'] = cabecalho.map((h, i) => ({
      wch: Math.max(h.length + 2, ...linhas.slice(0, 200).map(l => String(l[i] ?? '').length), 10),
    }))
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Clientes')
    return {
      buffer: XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer,
      filename: `${base}.xlsx`,
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }
  }

  // ══════════════════════════════════════════════════════════════════
  // Relatorios salvos
  // ══════════════════════════════════════════════════════════════════

  /**
   * Os relatorios que ESTE usuario enxerga.
   *
   * Tres origens numa lista so, na ordem em que fazem sentido para quem abre a
   * tela: os favoritos dele no topo, depois os proprios, depois os da empresa e
   * os do sistema. Quem nunca montou nada ainda ve os padrao — e e por isso que
   * eles nao exigem `build_reports`.
   */
  async listarSalvos(ctx: { userId: string; empresaId?: string; isMaster?: boolean }) {
    const definicoes = await prisma.relatorioDefinicao.findMany({
      where: {
        modulo: 'clientes',
        OR: [
          { origem: 'SISTEMA' },
          { criadoPor: ctx.userId },
          { visibilidade: 'EMPRESA', ...(ctx.isMaster ? {} : { empresaId: ctx.empresaId ?? null }) },
        ],
      },
      orderBy: [{ origem: 'asc' }, { nome: 'asc' }],
    })
    return definicoes
      .map(d => ({
        id: d.id,
        nome: d.nome,
        descricao: d.descricao,
        campos: d.campos,
        filtros: d.filtros as Record<string, unknown>,
        ordenacao: d.ordenacao as { campo: string; direcao: 'asc' | 'desc' } | null,
        origem: d.origem,
        visibilidade: d.visibilidade,
        meu: d.criadoPor === ctx.userId,
        favorito: d.favoritoDe.includes(ctx.userId),
      }))
      // Favorito primeiro, depois os meus, depois o resto — a ordem em que a
      // pessoa procura, nao a ordem em que o banco devolve.
      .sort((a, b) =>
        Number(b.favorito) - Number(a.favorito)
        || Number(b.meu) - Number(a.meu)
        || a.nome.localeCompare(b.nome, 'pt-BR'))
  }

  /** Cria ou atualiza um relatorio do usuario. */
  async salvar(
    entrada: {
      id?: string
      nome: string
      descricao?: string
      campos: string[]
      filtros?: Record<string, unknown>
      ordenacao?: { campo: string; direcao: 'asc' | 'desc' }
      visibilidade: 'PRIVADO' | 'EMPRESA'
    },
    ctx: { userId: string; empresaId?: string; isMaster?: boolean },
  ): Promise<{ id: string; nome: string }> {
    // So chaves do catalogo entram no banco. Sem isso, uma chave invalida
    // ficaria salva para sempre, falhando silenciosamente a cada execucao.
    const campos = entrada.campos.filter(c => CAMPOS_POR_CHAVE.has(c))
    if (!campos.length) throw new Error('Escolha ao menos um campo válido.')

    if (entrada.id) {
      const atual = await prisma.relatorioDefinicao.findUnique({ where: { id: entrada.id } })
      if (!atual) throw new Error('Relatório não encontrado.')
      // Um relatorio do sistema nao se edita: "editar" vira copia. Assim o
      // padrao continua igual para todo mundo, e quem ajustou fica com o seu.
      if (atual.origem === 'SISTEMA') {
        return this.salvar({ ...entrada, id: undefined, nome: `${entrada.nome} (minha versão)` }, ctx)
      }
      if (atual.criadoPor !== ctx.userId && !ctx.isMaster) {
        throw new Error('Só quem criou o relatório pode alterá-lo.')
      }
      return prisma.relatorioDefinicao.update({
        where: { id: entrada.id },
        data: {
          nome: entrada.nome.trim(),
          descricao: entrada.descricao?.trim() || null,
          campos,
          filtros: (entrada.filtros ?? {}) as never,
          ordenacao: (entrada.ordenacao ?? null) as never,
          visibilidade: entrada.visibilidade,
        },
      })
    }

    return prisma.relatorioDefinicao.create({
      data: {
        modulo: 'clientes',
        empresaId: ctx.empresaId ?? null,
        nome: entrada.nome.trim(),
        descricao: entrada.descricao?.trim() || null,
        campos,
        filtros: (entrada.filtros ?? {}) as never,
        ordenacao: (entrada.ordenacao ?? null) as never,
        origem: 'USUARIO',
        visibilidade: entrada.visibilidade,
        criadoPor: ctx.userId,
        favoritoDe: [],
      },
    })
  }

  async excluir(id: string, ctx: { userId: string; isMaster?: boolean }) {
    const atual = await prisma.relatorioDefinicao.findUnique({ where: { id } })
    if (!atual) return { ok: true }
    if (atual.origem === 'SISTEMA') throw new Error('Relatório do sistema não pode ser excluído.')
    if (atual.criadoPor !== ctx.userId && !ctx.isMaster) {
      throw new Error('Só quem criou o relatório pode excluí-lo.')
    }
    await prisma.relatorioDefinicao.delete({ where: { id } })
    return { ok: true }
  }

  /**
   * Fixa ou solta um relatorio no topo da lista de quem clicou.
   *
   * O favorito e por PESSOA, nao por relatorio: um array de ids em vez de um
   * booleano. Um booleano faria o gosto de um usuario mudar a lista de todos.
   */
  async alternarFavorito(id: string, userId: string) {
    const atual = await prisma.relatorioDefinicao.findUnique({ where: { id } })
    if (!atual) throw new Error('Relatório não encontrado.')
    const tem = atual.favoritoDe.includes(userId)
    await prisma.relatorioDefinicao.update({
      where: { id },
      data: { favoritoDe: tem ? atual.favoritoDe.filter(u => u !== userId) : [...atual.favoritoDe, userId] },
    })
    return { favorito: !tem }
  }
}
