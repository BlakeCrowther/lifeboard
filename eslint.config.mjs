import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**', 'models/**', '!models/shared/tools/*.ts', 'evals/out/**', '**/*.js', '**/*.cjs', '**/*.mjs'] },
  eslint.configs.recommended,
  tseslint.configs.strictTypeChecked,
  {
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      // `const { id, ...rest } = doc` is how a doc drops its id before a write
      '@typescript-eslint/no-unused-vars': ['error', { ignoreRestSiblings: true }],
    },
  },
  {
    // Domain packages are pure, and db reaches the artifact db only through its DbAdapter (layering:
    // .dependency-cruiser.cjs); this covers the DOM and window, which aren't imports.
    files: ['src/packages/{dates,recurrence,tasks,habits,game,db}/**/*.ts'],
    rules: {
      'no-restricted-globals': ['error', 'window', 'document', 'navigator', 'location', 'localStorage', 'sessionStorage', 'fetch', 'requestAnimationFrame'],
    },
  },
);
