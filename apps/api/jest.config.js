/** Jest config — apps/api (NestJS + ts-jest).
 *  Specs: arquivos *.spec.ts ao lado do código (em src/). Excluídos do build via tsconfig.build.json.
 */
module.exports = {
  rootDir: '.',
  testEnvironment: 'node',
  testRegex: '.*\\.spec\\.ts$',
  moduleFileExtensions: ['ts', 'js', 'json'],
  roots: ['<rootDir>/src'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@saas/db$': '<rootDir>/../../packages/db/src/index.ts',
    '^@saas/db/(.*)$': '<rootDir>/../../packages/db/src/$1',
    '^@saas/types$': '<rootDir>/../../packages/types/src/index.ts',
    '^@saas/types/(.*)$': '<rootDir>/../../packages/types/src/$1',
  },
  transform: {
    '^.+\\.ts$': [
      'ts-jest',
      { tsconfig: '<rootDir>/tsconfig.json' },
    ],
  },
  clearMocks: true,
}
