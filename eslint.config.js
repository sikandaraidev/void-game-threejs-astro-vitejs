import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist', 'node_modules', '.wrangler'] },
  js.configs.recommended,
  ...tseslint.configs.strict,
  {
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
    rules: {
      // House rule: no inline styles. Live values go through src/ui/cssVar.ts only.
      'no-restricted-syntax': [
        'error',
        {
          selector: "MemberExpression[property.name='style']",
          message:
            'Inline styles are banned. Use CSS Modules, data attributes, or setCssVar() from src/ui/cssVar.ts.',
        },
        {
          selector: "MemberExpression[property.name='innerHTML']",
          message: 'innerHTML is banned (XSS). Build DOM nodes or use textContent.',
        },
      ],
      'no-console': ['warn', { allow: ['warn', 'error', 'info'] }],
    },
  },
);
