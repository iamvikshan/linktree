import tseslint from 'typescript-eslint'

export default tseslint.config(
  {
    ignores: ['node_modules/', 'dist/']
  },
  ...tseslint.configs.recommended,
  {
    files: ['**/*.ts'],
    languageOptions: {
      parserOptions: {
        project: true,
        tsconfigRootDir: import.meta.dirname
      }
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'warn'
    }
  }
)
