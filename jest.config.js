const nextJest = require('next/jest');

const createJestConfig = nextJest({
  // Next.jsアプリのパスを指定
  dir: './',
});

// Jestのカスタム設定
const customJestConfig = {
  // テスト環境の設定
  testEnvironment: 'jsdom',

  // セットアップファイル
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],

  // モジュールパスマッピング（tsconfig.jsonのpathsと合わせる）
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@/components/(.*)$': '<rootDir>/src/components/$1',
    '^@/lib/(.*)$': '<rootDir>/src/lib/$1',
    '^@/hooks/(.*)$': '<rootDir>/src/hooks/$1',
    '^@/types/(.*)$': '<rootDir>/src/types/$1',
    '^@/api/(.*)$': '<rootDir>/src/api/$1',
    '^@/app/(.*)$': '<rootDir>/src/app/$1',
  },

  // テストファイルのパターン
  testMatch: [
    '**/__tests__/**/*.(ts|tsx|js)',
    '**/*.(test|spec).(ts|tsx|js)',
  ],

  // 除外するファイル
  testPathIgnorePatterns: [
    '<rootDir>/.next/',
    '<rootDir>/node_modules/',
    '<rootDir>/coverage/',
    '<rootDir>/dist/',
    '<rootDir>/src/__tests__/session-management/penetration-test-prep.ts',
  ],

  // 変換対象外のモジュール
  transformIgnorePatterns: [
    '/node_modules/',
    '^.+\\.module\\.(css|sass|scss)$',
  ],

  // カバレッジの設定
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/**/*.d.ts',
    '!src/types/**',
    '!src/**/*.stories.{ts,tsx}',
    '!src/**/index.{ts,tsx}',
  ],

  // カバレッジの閾値設定（TDDのため高めに設定）
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80,
    },
  },

  // テスト結果の表示設定
  verbose: true,
  
  // モック設定
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],

  // テスト実行時の環境変数
  testEnvironmentOptions: {
    url: 'http://localhost:3000',
  },

  // グローバルなモック設定
  globals: {
    'ts-jest': {
      tsconfig: {
        jsx: 'react-jsx',
      },
    },
  },
};

// Next.jsの設定と組み合わせてエクスポート
module.exports = createJestConfig(customJestConfig);
