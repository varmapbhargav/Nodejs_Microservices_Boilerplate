// Jest setup file
// This file runs once before all tests

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'error';

// Mock console methods in tests to reduce noise
global.console = {
  ...console,
  // Uncomment to disable console.log in tests
  // log: jest.fn(),
  // debug: jest.fn(),
  // info: jest.fn(),
  // warn: jest.fn(),
  // error: jest.fn(),
};

// Global test utilities
global.testUtils = {
  // Helper to create mock request objects
  createMockRequest: (overrides = {}) => ({
    headers: {},
    query: {},
    params: {},
    body: {},
    ip: '127.0.0.1',
    get: jest.fn(),
    ...overrides,
  }),
  
  // Helper to create mock response objects
  createMockResponse: () => {
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      cookie: jest.fn().mockReturnThis(),
      clearCookie: jest.fn().mockReturnThis(),
      redirect: jest.fn().mockReturnThis(),
      end: jest.fn().mockReturnThis(),
    };
    return res;
  },
  
  // Helper to create mock next function
  createMockNext: () => jest.fn(),
  
  // Helper to wait for async operations
  waitFor: (ms = 0) => new Promise(resolve => setTimeout(resolve, ms)),
  
  // Helper to generate test data
  generateUUID: () => 'test-uuid-' + Math.random().toString(36).substr(2, 9),
  
  // Helper to create test dates
  createDate: (offset = 0) => {
    const date = new Date();
    date.setDate(date.getDate() + offset);
    return date;
  },
};

// Extend Jest matchers
expect.extend({
  // Custom matcher for API responses
  toBeValidApiResponse(received) {
    const pass = received && 
      typeof received === 'object' &&
      typeof received.success === 'boolean' &&
      (received.success ? received.data !== undefined : received.error !== undefined);
    
    if (pass) {
      return {
        message: () => `expected ${received} not to be a valid API response`,
        pass: true,
      };
    } else {
      return {
        message: () => `expected ${received} to be a valid API response with success property and either data or error`,
        pass: false,
      };
    }
  },
  
  // Custom matcher for health responses
  toBeHealthyResponse(received) {
    const pass = received &&
      typeof received === 'object' &&
      received.status === 'healthy' &&
      typeof received.timestamp === 'string' &&
      typeof received.uptime === 'number';
    
    if (pass) {
      return {
        message: () => `expected ${received} not to be a healthy response`,
        pass: true,
      };
    } else {
      return {
        message: () => `expected ${received} to be a healthy response with status 'healthy'`,
        pass: false,
      };
    }
  },
});

// Global test cleanup
afterEach(() => {
  jest.clearAllMocks();
});

// Increase timeout for integration tests
jest.setTimeout(30000);
