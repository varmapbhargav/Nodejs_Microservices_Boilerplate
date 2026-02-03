import { 
  CircuitBreakerConfig, 
  RetryConfig, 
  TimeoutConfig, 
  BulkheadConfig,
  CircuitBreakerState,
  CircuitBreakerMetrics,
  ServiceHealth,
  ResilienceConfig 
} from '@platform/shared-contracts';

export class CircuitBreaker {
  private state: CircuitBreakerState = CircuitBreakerState.CLOSED;
  private failureCount = 0;
  private successCount = 0;
  private lastFailureTime?: number;
  private lastSuccessTime?: number;
  private nextRetryTime?: number;

  constructor(private config: CircuitBreakerConfig) {}

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    if (this.state === CircuitBreakerState.OPEN) {
      if (Date.now() >= (this.nextRetryTime || 0)) {
        this.state = CircuitBreakerState.HALF_OPEN;
      } else {
        throw new Error('Circuit breaker is OPEN');
      }
    }

    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess(): void {
    this.successCount++;
    this.lastSuccessTime = Date.now();
    
    if (this.state === CircuitBreakerState.HALF_OPEN) {
      this.state = CircuitBreakerState.CLOSED;
      this.failureCount = 0;
    }
  }

  private onFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (this.failureCount >= this.config.failureThreshold) {
      this.state = CircuitBreakerState.OPEN;
      this.nextRetryTime = Date.now() + this.config.resetTimeout;
    }
  }

  getMetrics(): CircuitBreakerMetrics {
    return {
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      lastFailureTime: this.lastFailureTime,
      lastSuccessTime: this.lastSuccessTime,
      nextRetryTime: this.nextRetryTime,
    };
  }

  reset(): void {
    this.state = CircuitBreakerState.CLOSED;
    this.failureCount = 0;
    this.successCount = 0;
    this.lastFailureTime = undefined;
    this.lastSuccessTime = undefined;
    this.nextRetryTime = undefined;
  }
}

export class RetryPolicy {
  constructor(private config: RetryConfig) {}

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    let lastError: Error;
    let delay = this.config.initialDelay;

    for (let attempt = 1; attempt <= this.config.maxAttempts; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error as Error;

        if (attempt === this.config.maxAttempts) {
          break;
        }

        if (!this.isRetryableError(lastError)) {
          break;
        }

        await this.sleep(delay);
        delay = Math.min(delay * this.config.backoffMultiplier, this.config.maxDelay);
      }
    }

    throw lastError!;
  }

  private isRetryableError(error: Error): boolean {
    return this.config.retryableErrors.some(errorPattern => 
      error.message.includes(errorPattern) || error.name.includes(errorPattern)
    );
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export class TimeoutManager {
  constructor(private config: TimeoutConfig) {}

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('Operation timeout')), this.config.response);
    });

    return Promise.race([operation(), timeoutPromise]);
  }
}

export class Bulkhead {
  private running = 0;
  private queue: Array<{ resolve: (value: any) => void; reject: (reason: any) => void }> = [];

  constructor(private config: BulkheadConfig) {}

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      if (this.running < this.config.maxConcurrent) {
        this.runOperation(operation, resolve, reject);
      } else if (this.queue.length < this.config.maxQueue) {
        this.queue.push({ resolve, reject });
      } else {
        reject(new Error('Bulkhead queue is full'));
      }
    });
  }

  private async runOperation<T>(
    operation: () => Promise<T>,
    resolve: (value: T) => void,
    reject: (reason: any) => void
  ): Promise<void> {
    this.running++;
    
    try {
      const result = await operation();
      resolve(result);
    } catch (error) {
      reject(error);
    } finally {
      this.running--;
      this.processQueue();
    }
  }

  private processQueue(): void {
    if (this.queue.length > 0 && this.running < this.config.maxConcurrent) {
      const next = this.queue.shift();
      if (next) {
        this.runOperation(() => Promise.resolve(), next.resolve, next.reject);
      }
    }
  }
}

export class ResilienceManager {
  private circuitBreakers = new Map<string, CircuitBreaker>();
  private retryPolicies = new Map<string, RetryPolicy>();
  private timeoutManagers = new Map<string, TimeoutManager>();
  private bulkheads = new Map<string, Bulkhead>();

  constructor(private configs: Map<string, ResilienceConfig>) {
    this.initializeComponents();
  }

  private initializeComponents(): void {
    for (const [service, config] of this.configs) {
      if (config.circuitBreaker) {
        this.circuitBreakers.set(service, new CircuitBreaker(config.circuitBreaker));
      }
      if (config.retry) {
        this.retryPolicies.set(service, new RetryPolicy(config.retry));
      }
      if (config.timeout) {
        this.timeoutManagers.set(service, new TimeoutManager(config.timeout));
      }
      if (config.bulkhead) {
        this.bulkheads.set(service, new Bulkhead(config.bulkhead));
      }
    }
  }

  async execute<T>(service: string, operation: () => Promise<T>): Promise<T> {
    let wrappedOperation = operation;

    const circuitBreaker = this.circuitBreakers.get(service);
    if (circuitBreaker) {
      const originalOperation = wrappedOperation;
      wrappedOperation = () => circuitBreaker.execute(originalOperation);
    }

    const retryPolicy = this.retryPolicies.get(service);
    if (retryPolicy) {
      const originalOperation = wrappedOperation;
      wrappedOperation = () => retryPolicy.execute(originalOperation);
    }

    const timeoutManager = this.timeoutManagers.get(service);
    if (timeoutManager) {
      const originalOperation = wrappedOperation;
      wrappedOperation = () => timeoutManager.execute(originalOperation);
    }

    const bulkhead = this.bulkheads.get(service);
    if (bulkhead) {
      const originalOperation = wrappedOperation;
      wrappedOperation = () => bulkhead.execute(originalOperation);
    }

    return wrappedOperation();
  }

  getServiceHealth(service: string): ServiceHealth {
    const circuitBreaker = this.circuitBreakers.get(service);
    const metrics = circuitBreaker?.getMetrics();

    return {
      service,
      status: this.determineStatus(metrics),
      lastCheck: new Date(),
      responseTime: 0,
      errorRate: this.calculateErrorRate(metrics),
      circuitBreaker: metrics,
    };
  }

  private determineStatus(metrics?: CircuitBreakerMetrics): 'healthy' | 'degraded' | 'unhealthy' {
    if (!metrics) return 'healthy';

    if (metrics.state === CircuitBreakerState.OPEN) return 'unhealthy';
    if (metrics.state === CircuitBreakerState.HALF_OPEN) return 'degraded';
    if (metrics.failureCount > 0) return 'degraded';

    return 'healthy';
  }

  private calculateErrorRate(metrics?: CircuitBreakerMetrics): number {
    if (!metrics || metrics.failureCount + metrics.successCount === 0) return 0;
    
    return (metrics.failureCount / (metrics.failureCount + metrics.successCount)) * 100;
  }

  getAllServiceHealth(): ServiceHealth[] {
    return Array.from(this.configs.keys()).map(service => this.getServiceHealth(service));
  }
}
