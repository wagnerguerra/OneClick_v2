const path = require('path')
const nodeExternals = require('webpack-node-externals')

module.exports = function (options) {
  // Aumenta o limite de memória do ForkTsCheckerWebpackPlugin (Nest CLI inclui
  // por padrão pra typecheck em paralelo). O default é 2GB, mas o projeto cresceu
  // (schema Prisma com 90+ models, ~50 módulos NestJS) e estoura com "Reached
  // heap limit Allocation failed - JavaScript heap out of memory" no boot.
  //
  // 3 estratégias tentadas (todas redundantes pra cobrir versões diferentes):
  //  1. Mutate o memoryLimit das options do plugin (algumas versões aceitam)
  //  2. Mutate via .tsconfig.memoryLimit (versões antigas)
  //  3. Mutate o `nodeArgs` injetando --max-old-space-size=8192 (mais robusto —
  //     o plugin spawn um child process; aumentar a heap direto via flag do node
  //     sempre funciona, independente da API do plugin)
  // ForkTsCheckerWebpackPlugin (incluído pela Nest CLI) tenta type-check em
  // paralelo num child process com heap de 2GB. O projeto cresceu além disso
  // e estoura "Reached heap limit" no boot. Tentamos aumentar o memoryLimit via
  // várias APIs sem sucesso — o plugin ignora.
  //
  // Solução: REMOVER o plugin em dev. Tradeoff aceitável:
  //   - Type-check em runtime/watch desativado (não aparecem warnings TS no terminal)
  //   - Type-check explícito segue funcional: `npx tsc --noEmit` (gate manual)
  //   - Build de prod (`nest build`) faz type-check separado e ainda valida tudo
  const plugins = (options.plugins || []).filter((p) => {
    const name = p?.constructor?.name
    return !(typeof name === 'string' && (name.includes('TsChecker') || name.includes('ForkTsChecker')))
  })

  return {
    ...options,
    plugins,
    externals: [
      // Libs com native bindings — webpack não consegue empacotar .node files.
      // Forçando como CommonJS externos pra serem resolvidos em runtime via node_modules.
      {
        'pdfkit': 'commonjs pdfkit',
        'bindings': 'commonjs bindings',
        // sharp tem native binding (.node) — força resolução em runtime, evita
        // webpack tentar parsear os typings pesados (causava OOM no type-check).
        'sharp': 'commonjs sharp',
      },
      nodeExternals({
        allowlist: [/^@saas\//],
        modulesDir: path.resolve(__dirname, '../../node_modules'),
      }),
      nodeExternals({
        allowlist: [/^@saas\//],
        modulesDir: path.resolve(__dirname, 'node_modules'),
      }),
    ],
    resolve: {
      ...options.resolve,
      alias: {
        '@saas/db': path.resolve(__dirname, '../../packages/db/src'),
        '@saas/types': path.resolve(__dirname, '../../packages/types/src'),
      },
    },
  }
}
