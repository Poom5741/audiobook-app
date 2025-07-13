const js = require('@eslint/js');
const jest = require('eslint-plugin-jest');

module.exports = [
  js.configs.recommended,
  {
    files: ['src/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        console: 'readonly',
        process: 'readonly',
        Buffer: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        exports: 'writable',
        module: 'writable',
        require: 'readonly',
        global: 'readonly'
      }
    },
    rules: {
      // Code quality
      'no-console': 'warn',
      'no-debugger': 'error',
      'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'prefer-const': 'error',
      'no-var': 'error',
      
      // Security
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-new-func': 'error',
      
      // Best practices
      'eqeqeq': 'error',
      'curly': 'error',
      'no-alert': 'error',
      'no-caller': 'error',
      'no-eq-null': 'error',
      'no-new-wrappers': 'error',
      'no-throw-literal': 'error',
      'no-undef-init': 'error',
      'no-with': 'error'
    }
  },
  {
    files: ['src/**/*.test.js', 'src/**/*.spec.js', 'src/**/__tests__/**/*.js'],
    plugins: {
      jest
    },
    languageOptions: {
      globals: {
        ...jest.environments.globals.globals,
        global: 'writable'
      }
    },
    rules: {
      ...jest.configs.recommended.rules,
      'no-console': 'off', // Allow console in tests
      'jest/expect-expect': 'error',
      'jest/no-disabled-tests': 'warn',
      'jest/no-focused-tests': 'error',
      'jest/no-identical-title': 'error',
      'jest/prefer-to-have-length': 'warn',
      'jest/valid-expect': 'error'
    }
  },
  {
    ignores: [
      'node_modules/',
      'coverage/',
      '*.log',
      '.env*',
      'dist/',
      'build/',
      '*.min.js'
    ]
  }
];