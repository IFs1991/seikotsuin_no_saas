import { FlatCompat } from '@eslint/eslintrc';
import js from '@eslint/js';
import nextConfig from 'eslint-config-next';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
  recommendedConfig: js.configs.recommended,
});

const eslintConfig = [
  // Base JavaScript recommended rules
  js.configs.recommended,
  
  // Next.js configuration with TypeScript support
  ...compat.config({
    extends: [
      'next/core-web-vitals',
      'next/typescript',
      '@typescript-eslint/recommended',
      'plugin:react/recommended',
      'plugin:react-hooks/recommended',
      'plugin:jsx-a11y/recommended',
      'prettier'
    ],
    parser: '@typescript-eslint/parser',
    plugins: [
      '@typescript-eslint',
      'react',
      'react-hooks',
      'jsx-a11y',
      'prettier'
    ],
    rules: {
      'prettier/prettier': 'error',
      
      // TypeScript特有のルール
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/prefer-const': 'error',
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
      'jsx-a11y/alt-text': 'error',
      'jsx-a11y/aria-props': 'error',
      'jsx-a11y/aria-proptypes': 'error',
      'jsx-a11y/aria-unsupported-elements': 'error',
      'jsx-a11y/role-has-required-aria-props': 'error',
      'jsx-a11y/role-supports-aria-props': 'error',
      
      // セキュリティ関連（医療系システムのため厳格に）
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-new-func': 'error',
      'no-script-url': 'error',
      
      // コード品質
      'prefer-const': 'error',
      'no-var': 'error',
      'no-console': 'warn',
      'no-debugger': 'error',
      'no-duplicate-imports': 'error',
      'no-unused-expressions': 'error'
    },
    env: {
      browser: true,
      es2021: true,
      node: true,
      jest: true
    },
    settings: {
      react: {
        version: 'detect'
      }
    }
  }),
  
  // ファイル固有の設定
  {
    files: ['**/*.{js,jsx,ts,tsx}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: {
        ecmaFeatures: {
          jsx: true
        }
      }
    }
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
      '*.config.js',
      '*.config.mjs'
    ]
  }
];

export default eslintConfig;