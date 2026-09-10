import globals from 'globals';
import tseslint from 'typescript-eslint';
import base from '../../eslint.config.base.mjs';

export default tseslint.config(
  { ignores: ['dist/**', 'coverage/**', '*.config.ts', '*.config.mjs', 'eslint.config.mjs'] },
  ...base,
  {
    languageOptions: {
      globals: { ...globals.node },
      sourceType: 'module',
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // NestJS relies heavily on decorators and DI metadata.
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-extraneous-class': 'off',
      '@typescript-eslint/no-floating-promises': 'warn',
    },
  },
  {
    files: ['**/*.spec.ts', 'test/**/*.ts'],
    languageOptions: {
      globals: { ...globals.node },
    },
  },
);
