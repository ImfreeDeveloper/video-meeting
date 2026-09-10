import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';
import prettier from 'eslint-config-prettier';
import base from '../../eslint.config.base.mjs';

export default defineConfig([
  ...base,
  ...nextVitals,
  ...nextTs,
  // Must stay last: disables rules that conflict with Prettier.
  prettier,
  globalIgnores(['.next/**', 'out/**', 'build/**', 'next-env.d.ts']),
]);
