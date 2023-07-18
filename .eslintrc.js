module.exports = {
  extends: ['semistandard', 'plugin:@typescript-eslint/recommended'],
  parser: '@typescript-eslint/parser',
  plugins: ['@typescript-eslint'],
  root: true,
  rules: {
    prettier: {
      'space-before-function-paren': ['error', 'never']
    }
  }
};
