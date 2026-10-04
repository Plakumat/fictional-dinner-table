import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';

const LOCAL_CLOCK = 'The server clock is not the browser clock. Read time from core/clock/serverClock.';

export default tseslint.config(
  { ignores: ['dist', 'playwright-report', 'test-results'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // Node scripts that also run code inside the Playwright browser.
    files: ['tools/**/*.mjs'],
    languageOptions: { globals: { console: 'readonly', process: 'readonly', URL: 'readonly', window: 'readonly', document: 'readonly' } },
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    extends: [reactHooks.configs.flat.recommended],
    rules: {
      // Expiry, "2 days ago" and "today" are all relative to the server.
      'no-restricted-properties': ['error', { object: 'Date', property: 'now', message: LOCAL_CLOCK }],
      'no-restricted-syntax': ['error', { selector: "NewExpression[callee.name='Date'][arguments.length=0]", message: LOCAL_CLOCK }],
    },
  },
  {
    // The decisions that affect money and security live in core/. Keeping it
    // free of React and of the store means they can be tested without a DOM
    // and cannot be changed by editing a component.
    files: ['src/core/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['react', 'react-dom', 'react/*', 'react-dom/*', 'zustand', 'zustand/*', '@tanstack/*', '**/ui/**', '**/state/**', '**/api/**'],
              message: 'core/ is framework-free: no React, no store, no network layer.',
            },
          ],
        },
      ],
    },
  },
);
