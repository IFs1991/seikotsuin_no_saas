const nextJest = require('next/jest');

const createJestConfig = nextJest({ dir: './' });

const sharedConfig = {
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  transformIgnorePatterns: [
    '/node_modules/',
    '^.+\\.module\\.(css|sass|scss)$',
  ],
  testPathIgnorePatterns: [
    '<rootDir>/.next/',
    '<rootDir>/node_modules/',
    '<rootDir>/coverage/',
    '<rootDir>/dist/',
    '<rootDir>/src/__tests__/session-management/penetration-test-prep.ts',
    '<rootDir>/src/__tests__/.*/mocks/.*',
  ],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  globals: {
    'ts-jest': {
      tsconfig: {
        jsx: 'react-jsx',
      },
    },
  },
  verbose: true,
};

const coverageConfig = {
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/**/*.d.ts',
    '!src/types/**',
    '!src/**/*.stories.{ts,tsx}',
    '!src/**/index.{ts,tsx}',
  ],
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80,
    },
  },
};

const createClientConfig = createJestConfig({
  ...sharedConfig,
  displayName: 'client',
  testEnvironment: 'jsdom',
  testMatch: [
    '<rootDir>/src/__tests__/**/*.test.tsx',
    '<rootDir>/src/__tests__/pages/**/*.test.tsx',
  ],
});

const createServerConfig = createJestConfig({
  ...sharedConfig,
  displayName: 'server',
  testEnvironment: 'node',
  testMatch: [
    '<rootDir>/src/__tests__/**/*.test.ts',
    '<rootDir>/src/__tests__/**/*.test.js',
  ],
  testPathIgnorePatterns: [
    ...sharedConfig.testPathIgnorePatterns,
    '\\.test\\.tsx$',
  ],
});

module.exports = async () => {
  const [client, server] = await Promise.all([
    createClientConfig(),
    createServerConfig(),
  ]);

  return {
    ...coverageConfig,
    projects: [client, server],
  };
};
