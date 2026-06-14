import { FlatCompat } from '@eslint/eslintrc';
import js from '@eslint/js';
import unusedImports from 'eslint-plugin-unused-imports';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
  recommendedConfig: js.configs.recommended,
});

const restrictedUiColorPattern =
  /\b(?:bg|text|border)-\[#|\bdark:(?:bg-gray|bg-slate|text-gray)/u;

function classNameContainsRestrictedColor(value) {
  return restrictedUiColorPattern.test(value);
}

const uiStabilizationPlugin = {
  rules: {
    'no-hardcoded-ui-colors': {
      meta: {
        type: 'suggestion',
        docs: {
          description:
            'Warn when className uses hardcoded Tailwind hex utilities or gray dark-mode color pairs.',
        },
        messages: {
          restrictedColor:
            'Use design tokens instead of hardcoded UI colors or gray dark-mode color pairs.',
        },
        schema: [],
      },
      create(context) {
        function reportIfRestricted(node, value) {
          if (classNameContainsRestrictedColor(value)) {
            context.report({
              node,
              messageId: 'restrictedColor',
            });
          }
        }

        return {
          JSXAttribute(node) {
            if (node.name.name !== 'className' || node.value === null) {
              return;
            }

            if (
              node.value.type === 'Literal' &&
              typeof node.value.value === 'string'
            ) {
              reportIfRestricted(node.value, node.value.value);
              return;
            }

            if (node.value.type !== 'JSXExpressionContainer') {
              return;
            }

            const expression = node.value.expression;
            if (
              expression.type === 'Literal' &&
              typeof expression.value === 'string'
            ) {
              reportIfRestricted(expression, expression.value);
              return;
            }

            if (expression.type === 'TemplateLiteral') {
              for (const quasi of expression.quasis) {
                reportIfRestricted(quasi, quasi.value.raw);
              }
            }
          },
        };
      },
    },
  },
};

const eslintConfig = [
  // Base JavaScript recommended rules
  js.configs.recommended,

  // Next.js configuration with TypeScript support
  ...compat.config({
    extends: [
      'plugin:@next/next/core-web-vitals',
      'plugin:@typescript-eslint/recommended',
      'plugin:react/recommended',
      'plugin:react-hooks/recommended',
      'plugin:jsx-a11y/recommended',
      'prettier',
    ],
    parser: '@typescript-eslint/parser',
    plugins: [
      '@typescript-eslint',
      'react',
      'react-hooks',
      'jsx-a11y',
      'prettier',
    ],
    rules: {
      'prettier/prettier': 'error',

      // TypeScript特有のルール
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-var-requires': 'error',

      // React特有のルール
      'react/react-in-jsx-scope': 'off',
      'react/prop-types': 'off',
      'react/display-name': 'off',
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',

      // Next.js特有のルール
      '@next/next/no-img-element': 'error',
      '@next/next/no-html-link-for-pages': 'error',

      // アクセシビリティルール（医療系システムのため重要）
      // ARIA関連は error（必須）
      'jsx-a11y/alt-text': 'error',
      'jsx-a11y/aria-props': 'error',
      'jsx-a11y/aria-proptypes': 'error',
      'jsx-a11y/aria-unsupported-elements': 'error',
      'jsx-a11y/role-has-required-aria-props': 'error',
      'jsx-a11y/role-supports-aria-props': 'error',
      // フォーム/インタラクション関連は warn（段階的改善対象）
      'jsx-a11y/label-has-associated-control': 'warn',
      'jsx-a11y/no-static-element-interactions': 'warn',
      'jsx-a11y/click-events-have-key-events': 'warn',
      'jsx-a11y/heading-has-content': 'warn',
      'jsx-a11y/aria-role': 'warn',

      // セキュリティ関連（医療系システムのため厳格に）
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-new-func': 'error',
      'no-script-url': 'error',
      'no-restricted-syntax': [
        'error',
        {
          selector:
            'MemberExpression[object.object.name="process"][object.property.name="env"][property.name="SUPABASE_SERVICE_ROLE_KEY"]',
          message:
            'Do not reference SUPABASE_SERVICE_ROLE_KEY directly; use server-side helpers instead.',
        },
      ],

      // コード品質
      'prefer-const': 'error',
      'no-var': 'error',
      'no-console': 'warn',
      'no-debugger': 'error',
      'no-duplicate-imports': 'error',
      'no-unused-expressions': 'error',
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@/lib/supabase/server',
              message: "必ず '@/lib/supabase' から import してください",
            },
          ],
        },
      ],
    },
    env: {
      browser: true,
      es2021: true,
      node: true,
      jest: true,
    },
    settings: {
      react: {
        version: 'detect',
      },
    },
  }),

  // unused-imports プラグイン設定（未使用importを--fixで自動削除）
  {
    plugins: {
      'unused-imports': unusedImports,
      'ui-stabilization': uiStabilizationPlugin,
    },
    rules: {
      // 未使用 import を --fix で自動削除
      'unused-imports/no-unused-imports': 'error',

      // 未使用変数は警告、_ prefix は許可
      'unused-imports/no-unused-vars': [
        'warn',
        {
          vars: 'all',
          varsIgnorePattern: '^_',
          args: 'after-used',
          argsIgnorePattern: '^_',
        },
      ],

      // 二重報告防止（typescript-eslint側をoff）
      '@typescript-eslint/no-unused-vars': 'off',
      'ui-stabilization/no-hardcoded-ui-colors': 'warn',
    },
  },

  // ファイル固有の設定
  {
    files: ['**/*.{js,jsx,ts,tsx}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
    },
  },

  // テストファイル向けのルール緩和
  {
    files: [
      '**/*.test.ts',
      '**/*.test.tsx',
      '**/__tests__/**',
      'src/**/e2e/**',
    ],
    rules: {
      '@typescript-eslint/no-var-requires': 'off',
      'no-console': 'off',
      '@typescript-eslint/no-require-imports': 'off',
      'no-script-url': 'off',
      '@typescript-eslint/ban-ts-comment': 'off',
      // unused-imports に寄せているため off
      '@typescript-eslint/no-unused-vars': 'off',
      'unused-imports/no-unused-vars': 'off',
      // テストでは any 許容（テストの速度/記述自由度を優先）
      '@typescript-eslint/no-explicit-any': 'off',
      // テストで誤爆しやすい a11y を緩める
      'jsx-a11y/label-has-associated-control': 'off',
      'jsx-a11y/no-static-element-interactions': 'off',
      'jsx-a11y/click-events-have-key-events': 'off',
    },
  },

  // Next.js の自動生成ファイルは対象外/緩和
  {
    files: ['next-env.d.ts'],
    rules: {
      '@typescript-eslint/triple-slash-reference': 'off',
    },
  },

  // サーバーコード/APIでは console と any を許容（ログ出力と疎通優先）
  {
    files: ['src/app/api/**/*.{ts,tsx}', 'src/lib/**/*.{ts,tsx}'],
    rules: {
      'no-console': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
  // Hooks/Componentsでは any 警告を抑制（段階的改善対象）
  {
    files: ['src/hooks/**/*.{ts,tsx}', 'src/components/**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
  // Jest セットアップは console を許容
  {
    files: ['jest.setup.js'],
    rules: {
      'no-console': 'off',
    },
  },
  // 運用設定ファイルは CommonJS を許容
  {
    files: ['next.config.js'],
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
      '@typescript-eslint/no-var-requires': 'off',
      'unused-imports/no-unused-vars': 'off',
    },
  },
  // Legacy コード向けの緩和（段階的改善対象）
  {
    files: ['src/legacy/**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      'no-console': 'off',
      '@next/next/no-img-element': 'off',
      'jsx-a11y/label-has-associated-control': 'off',
      'jsx-a11y/no-static-element-interactions': 'off',
      'jsx-a11y/click-events-have-key-events': 'off',
      'no-case-declarations': 'off',
    },
  },

  // 除外設定
  {
    ignores: [
      '.next/',
      'node_modules/',
      'out/',
      'dist/',
      'build/',
      'coverage/',
      'playwright-report/',
      'test-results/',
      'test/',
      'test-utils/',
      'src/__tests__/',
      'src/legacy/',
      'src/**/e2e/',
      '**/*.test.js',
      '**/*.test.jsx',
      '**/*.test.ts',
      '**/*.test.tsx',
      '**/*.spec.js',
      '**/*.spec.jsx',
      '**/*.spec.ts',
      '**/*.spec.tsx',
      'eslint.config.mjs',
    ],
  },
];

export default eslintConfig;
