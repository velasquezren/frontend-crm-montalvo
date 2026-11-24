// Lint con tipos: solo reglas que atrapan errores reales, no estilo (de eso se
// ocupan `tsc` estricto, las plantillas estrictas de Angular, `check:skills` y
// `verificar-ui`). Corre dentro de `npm run lint`, que es parte de
// `npm run build` y por tanto de la CI.
import tseslint from 'typescript-eslint';

export default tseslint.config({
  files: ['src/**/*.ts'],
  ignores: ['src/app/core/build/**'],
  languageOptions: {
    parser: tseslint.parser,
    parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
  },
  linterOptions: { reportUnusedDisableDirectives: 'error' },
  plugins: { '@typescript-eslint': tseslint.plugin },
  rules: {
    // Una promesa sin esperar pierde su error en silencio. `router.navigate`
    // solo resuelve (false si se cancela): es una llamada segura conocida.
    '@typescript-eslint/no-floating-promises': ['error', {
      allowForKnownSafeCalls: [{ from: 'package', package: '@angular/router', name: ['navigate', 'navigateByUrl'] }],
    }],
    '@typescript-eslint/no-misused-promises': 'error',
    '@typescript-eslint/await-thenable': 'error',
    // Un enum de db-enums.ts que gana un valor debe romper el `switch` que no lo trata.
    '@typescript-eslint/switch-exhaustiveness-check': ['error', { considerDefaultExhaustiveForUnions: true }],
    '@typescript-eslint/no-explicit-any': 'error',
    // HttpErrorResponse no extiende Error, pero es lo que lanza HttpClient.
    '@typescript-eslint/only-throw-error': ['error', {
      allow: [{ from: 'package', package: '@angular/common', name: 'HttpErrorResponse' }],
    }],
    '@typescript-eslint/no-unnecessary-type-assertion': 'error',
    eqeqeq: ['error', 'always', { null: 'ignore' }],
    'no-console': ['error', { allow: ['warn', 'error'] }],
  },
});
