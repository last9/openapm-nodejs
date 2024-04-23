module.exports = {
  extends: ['semistandard', 'plugin:@typescript-eslint/recommended'],
  parser: '@typescript-eslint/parser',
  plugins: ['@typescript-eslint'],
  root: true,
  rules: {
    'func-call-spacing': 'off',
    'space-before-function-paren': 'off',
    '@typescript-eslint/no-var-requires': 'off'
  }
};
