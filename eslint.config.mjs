import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

export default tseslint.config(
  { ignores: ['out/**', 'dist/**', 'node_modules/**', 'openspec/**', 'test-results/**', 'resources/**', 'site/capture/.demo/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/main/**/*.ts', 'src/preload/**/*.ts', 'src/shared/**/*.ts', 'tests/**/*.ts', 'site/capture/**/*.ts', '*.config.ts'],
    languageOptions: { globals: globals.node },
  },
  {
    files: ['src/renderer/**/*.{ts,tsx}', 'site/*.js'],
    languageOptions: { globals: globals.browser },
    plugins: { 'react-hooks': reactHooks },
    rules: reactHooks.configs.recommended.rules,
  },
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
  {
    // Clean architecture: serviços não dependem do framework. O Electron só entra pelas bordas.
    files: ['src/main/**/*.ts'],
    ignores: ['src/main/adapters/**', 'src/main/index.ts', 'src/main/window.ts', 'src/main/composition.ts'],
    rules: {
      '@typescript-eslint/no-restricted-imports': [
        'error',
        { paths: [{ name: 'electron', message: 'Use as portas de src/main/ports.ts (adaptadores em src/main/adapters).', allowTypeImports: true }] },
      ],
    },
  },
  {
    // Somente a camada de plataforma pode testar process.platform (design, seção 16).
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['src/main/platform/**'],
    rules: {
      'no-restricted-properties': [
        'error',
        { object: 'process', property: 'platform', message: 'Use o PlatformAdapter (src/main/platform).' },
      ],
    },
  },
);
