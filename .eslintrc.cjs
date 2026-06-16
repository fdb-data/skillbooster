/* eslint 配置：TS + React Hooks，最小可用 */
module.exports = {
  root: true,
  env: { browser: true, node: true, es2022: true },
  parser: '@typescript-eslint/parser',
  parserOptions: { ecmaVersion: 'latest', sourceType: 'module', ecmaFeatures: { jsx: true } },
  plugins: ['@typescript-eslint', 'react-hooks'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:react-hooks/recommended'
  ],
  ignorePatterns: ['out/', 'dist/', 'release/', 'node_modules/', '*.config.*', '*.cjs'],
  rules: {
    '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    '@typescript-eslint/no-explicit-any': 'warn',
    'no-empty': ['error', { allowEmptyCatch: true }]
  },
  overrides: [
    {
      // 测试用 any 做 mock 是常规手段，豁免该规则
      files: ['tests/**'],
      rules: { '@typescript-eslint/no-explicit-any': 'off' }
    }
  ]
}
