module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/packages', '<rootDir>/services'],
  testMatch: [
    '**/__tests__/**/*.ts',
    '**/?(*.)+(spec|test).ts'
  ],
  transform: {
    '^.+\\.ts$': 'ts-jest',
  },
  collectCoverageFrom: [
    'packages/*/src/**/*.ts',
    'services/*/src/**/*.ts',
    '!**/*.d.ts',
    '!**/node_modules/**',
    '!**/dist/**',
    '!**/coverage/**',
  ],
  coverageDirectory: 'coverage',
  coverageReporters: [
    'text',
    'lcov',
    'html'
  ],
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80
    }
  },
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  moduleNameMapping: {
    '^@platform/shared-contracts(.*)$': '<rootDir>/packages/shared-contracts/src$1',
    '^@platform/shared-events(.*)$': '<rootDir>/packages/shared-events/src$1',
    '^@platform/observability(.*)$': '<rootDir>/packages/observability/src$1',
  },
  testTimeout: 10000,
  verbose: true,
  projects: [
    {
      displayName: 'packages',
      testMatch: ['<rootDir>/packages/**/__tests__/**/*.ts', '<rootDir>/packages/**/?(*.)+(spec|test).ts'],
      moduleNameMapping: {
        '^@platform/(.*)$': '<rootDir>/packages/$1/src',
      },
    },
    {
      displayName: 'services',
      testMatch: ['<rootDir>/services/**/__tests__/**/*.ts', '<rootDir>/services/**/?(*.)+(spec|test).ts'],
      moduleNameMapping: {
        '^@platform/(.*)$': '<rootDir>/packages/$1/src',
      },
    }
  ]
};
