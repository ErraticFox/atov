export default [
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        chrome: 'readonly',
        window: 'readonly',
        document: 'readonly',
        console: 'readonly'
      }
    },
    rules: {
      'quotes': ['error', 'single'],
      'semi': ['error', 'always'],
      'indent': ['error', 2],
      'no-unused-vars': 'warn',
      'no-console': 'off'
    }
  }
];
