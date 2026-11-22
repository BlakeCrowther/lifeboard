import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**', 'models/**', 'evals/**', '**/*.js', '**/*.cjs', '**/*.mjs'] },
  eslint.configs.recommended,
  tseslint.configs.strictTypeChecked,
  {
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: { '@typescript-eslint/no-explicit-any': 'error' },
  },
  {
    // Domain packages are pure (layering: .dependency-cruiser.cjs); this covers the DOM, which isn't an import.
    files: ['src/packages/{dates,recurrence,tasks,habits,game}/**/*.ts'],
    rules: {
      'no-restricted-globals': ['error', 'window', 'document', 'navigator', 'location', 'localStorage', 'sessionStorage', 'fetch', 'requestAnimationFrame'],
    },
  },
);
