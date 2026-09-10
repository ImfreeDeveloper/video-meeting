// Root ESLint config: lints repo-level files (config scripts, tooling).
// Apps have their own eslint.config.mjs that also extend eslint.config.base.mjs.
import base from './eslint.config.base.mjs';

export default [
  ...base,
  {
    ignores: ['apps/**', 'packages/**'],
  },
];
