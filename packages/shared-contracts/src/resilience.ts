export interface CircuitBreakerConfig {
  failureThreshold: number;
  resetTimeout: number;
  monitoringPeriod: number;
}

export interface RetryConfig {
  maxAttempts: number;
  initialDelay: number;
  maxDelay: number;
  backoffMultiplier: number;
  retryableErrors: string[];
}

export interface TimeoutConfig {
  connection: number;
  response: number;
}

export interface BulkheadConfig {
  maxConcurrent: number;
  maxQueue: number;
}

export interface ResilienceConfig {
  circuitBreaker?: CircuitBreakerConfig;
  retry?: RetryConfig;
  timeout?: TimeoutConfig;
  bulkhead?: BulkheadConfig;
}

export enum CircuitBreakerState {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN',
  HALF_OPEN = 'HALF_OPEN'
}

export interface CircuitBreakerMetrics {
  state: CircuitBreakerState;
  failureCount: number;
  successCount: number;
  lastFailureTime?: number;
  lastSuccessTime?: number;
  nextRetryTime?: number;
}

export interface ServiceHealth {
  service: string;
  status: 'healthy' | 'degraded' | 'unhealthy';
  lastCheck: Date;
  responseTime: number;
  errorRate: number;
  circuitBreaker?: CircuitBreakerMetrics;
}
