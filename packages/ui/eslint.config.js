import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import base from '@bouquet-one/config/eslint/base.js';

export default tseslint.config(js.configs.recommended, ...tseslint.configs.recommended, ...base);
