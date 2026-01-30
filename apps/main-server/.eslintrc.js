module.exports = {
  parser: '@typescript-eslint/parser',
  extends: [
    'eslint:recommended',
    '@typescript-eslint/recommended',
  ],
  plugins: ['@typescript-eslint'],
  parserOptions: {
    ecmaVersion: 2020,
    sourceType: 'module',
  },
  env: {
    node: true,
    es6: true,
  },
  rules: {
    // 基础检查 - 警告级别
    '@typescript-eslint/no-unused-vars': 'warn',
    'no-console': 'warn',
    'no-undef': 'warn',
    
    // 关闭复杂类型检查
    '@typescript-eslint/explicit-function-return-type': 'off',
    '@typescript-eslint/explicit-module-boundary-types': 'off',
    '@typescript-eslint/no-explicit-any': 'off',
    '@typescript-eslint/ban-ts-comment': 'off',
    '@typescript-eslint/no-non-null-asserted-optional-chain': 'off',
    'no-useless-escape': 'off',
    'no-case-declarations': 'off',
  },
  ignorePatterns: [
    'dist/',
    'node_modules/',
    '*.js',
  ],
};