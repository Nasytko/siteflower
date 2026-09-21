import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import base from '@bouquet-one/config/eslint/base.js';

/** Flat ESLint config — keep Next plugin wiring simple for the foundation. */
export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...base,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  {
    ignores: ['.next/**', 'next-env.d.ts'],
  },
);
