// Enterprise Circuit Breaker Pattern
export interface CircuitBreakerOptions {
  failureThreshold?: number;
  resetTimeout?: number;
  monitoringPeriod?: number;
  expectedRecoveryTime?: number;
}

export enum CircuitState {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN',
  HALF_OPEN = 'HALF_OPEN',
}

export class CircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED;
  private failureCount: number = 0;
  private lastFailureTime: number = 0;
  private successCount: number = 0;
  
  private readonly failureThreshold: number;
  private readonly resetTimeout: number;
  private readonly monitoringPeriod: number;
  private readonly expectedRecoveryTime: number;

  constructor(
    private readonly name: string,
    private readonly operation: (...args: any[]) => Promise<any>,
    options: CircuitBreakerOptions = {}
  ) {
    this.failureThreshold = options.failureThreshold || 5;
    this.resetTimeout = options.resetTimeout || 60000; // 1 minute
    this.monitoringPeriod = options.monitoringPeriod || 10000; // 10 seconds
    this.expectedRecoveryTime = options.expectedRecoveryTime || 30000; // 30 seconds
  }

  async execute(...args: any[]): Promise<any> {
    if (this.state === CircuitState.OPEN) {
      if (this.shouldAttemptReset()) {
        this.state = CircuitState.HALF_OPEN;
        this.successCount = 0;
      } else {
        throw new Error(`Circuit breaker '${this.name}' is OPEN`);
      }
    }

    try {
      const result = await this.operation(...args);
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess(): void {
    this.failureCount = 0;
    
    if (this.state === CircuitState.HALF_OPEN) {
      this.successCount++;
      if (this.successCount >= 3) { // Require 3 successes to close
        this.state = CircuitState.CLOSED;
        console.log(`Circuit breaker '${this.name}' CLOSED after recovery`);
      }
    }
  }

  private onFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();
    
    if (this.state === CircuitState.HALF_OPEN) {
      this.state = CircuitState.OPEN;
      console.log(`Circuit breaker '${this.name}' OPEN again after half-open failure`);
    } else if (this.failureCount >= this.failureThreshold) {
      this.state = CircuitState.OPEN;
      console.log(`Circuit breaker '${this.name}' OPEN after ${this.failureCount} failures`);
    }
  }

  private shouldAttemptReset(): boolean {
    return Date.now() - this.lastFailureTime >= this.resetTimeout;
  }

  getState(): CircuitState {
    return this.state;
  }

  getStats(): {
    state: CircuitState;
    failureCount: number;
    successCount: number;
    lastFailureTime: number;
  } {
    return {
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      lastFailureTime: this.lastFailureTime,
    };
  }

  reset(): void {
    this.state = CircuitState.CLOSED;
    this.failureCount = 0;
    this.successCount = 0;
    this.lastFailureTime = 0;
  }
}

// Retry Pattern with Exponential Backoff
export class RetryPolicy {
  constructor(
    private readonly maxAttempts: number = 3,
    private readonly baseDelay: number = 1000,
    private readonly maxDelay: number = 30000,
    private readonly backoffMultiplier: number = 2
  ) {}

  async execute<T>(
    operation: () => Promise<T>,
    shouldRetry: (error: any) => boolean = () => true
  ): Promise<T> {
    let lastError: any;
    
    for (let attempt = 1; attempt <= this.maxAttempts; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;
        
        if (attempt === this.maxAttempts || !shouldRetry(error)) {
          throw error;
        }
        
        const delay = Math.min(
          this.baseDelay * Math.pow(this.backoffMultiplier, attempt - 1),
          this.maxDelay
        );
        
        // Add jitter to prevent thundering herd
        const jitter = delay * 0.1 * Math.random();
        const totalDelay = delay + jitter;
        
        console.warn(`Attempt ${attempt} failed, retrying in ${totalDelay}ms:`, error.message);
        await this.sleep(totalDelay);
      }
    }
    
    throw lastError;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Bulkhead Pattern
export class Bulkhead {
  private readonly semaphore: number;
  private readonly queue: Array<{
    resolve: (value: any) => void;
    reject: (error: any) => void;
    operation: () => Promise<any>;
  }> = [];
  private running: number = 0;

  constructor(private readonly maxConcurrent: number = 10) {
    this.semaphore = maxConcurrent;
  }

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      this.queue.push({ resolve, reject, operation });
      this.process();
    });
  }

  private async process(): Promise<void> {
    if (this.running >= this.semaphore || this.queue.length === 0) {
      return;
    }

    this.running++;
    const { resolve, reject, operation } = this.queue.shift()!;

    try {
      const result = await operation();
      resolve(result);
    } catch (error) {
      reject(error);
    } finally {
      this.running--;
      this.process(); // Process next item in queue
    }
  }

  getStats(): {
    running: number;
    queued: number;
    maxConcurrent: number;
  } {
    return {
      running: this.running,
      queued: this.queue.length,
      maxConcurrent: this.semaphore,
    };
  }
}

// Timeout Pattern
export class Timeout {
  constructor(private readonly timeoutMs: number) {}

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    return Promise.race([
      operation(),
      new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(new Error(`Operation timed out after ${this.timeoutMs}ms`));
        }, this.timeoutMs);
      }),
    ]);
  }
}

// Cache Aside Pattern
export class CacheAside {
  private cache = new Map<string, { data: any; expiry: number }>();

  constructor(
    private readonly ttlMs: number = 300000, // 5 minutes default
    private readonly maxSize: number = 1000
  ) {}

  async get<T>(
    key: string,
    fetchFunction: () => Promise<T>
  ): Promise<T> {
    // Check cache first
    const cached = this.cache.get(key);
    if (cached && cached.expiry > Date.now()) {
      return cached.data;
    }

    // Fetch from source
    const data = await fetchFunction();
    
    // Store in cache
    this.set(key, data);
    
    return data;
  }

  private set(key: string, data: any): void {
    // Evict if cache is full
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) {
        this.cache.delete(firstKey);
      }
    }

    this.cache.set(key, {
      data,
      expiry: Date.now() + this.ttlMs,
    });
  }

  invalidate(key: string): void {
    this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
  }

  getStats(): {
    size: number;
    maxSize: number;
    hitRate: number;
  } {
    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      hitRate: 0, // Would need to track hits/misses for accurate rate
    };
  }
}

// Rate Limiter Pattern
export class RateLimiter {
  private requests: number[] = [];

  constructor(
    private readonly maxRequests: number,
    private readonly windowMs: number
  ) {}

  async acquire(): Promise<void> {
    const now = Date.now();
    
    // Remove old requests outside the window
    this.requests = this.requests.filter(time => now - time < this.windowMs);
    
    if (this.requests.length >= this.maxRequests) {
      const oldestRequest = this.requests[0];
      const waitTime = this.windowMs - (now - oldestRequest);
      
      throw new Error(`Rate limit exceeded. Wait ${waitTime}ms before retrying.`);
    }
    
    this.requests.push(now);
  }

  getStats(): {
    currentRequests: number;
    maxRequests: number;
    windowMs: number;
  } {
    const now = Date.now();
    const currentRequests = this.requests.filter(time => now - time < this.windowMs).length;
    
    return {
      currentRequests,
      maxRequests: this.maxRequests,
      windowMs: this.windowMs,
    };
  }
}

// Resilience Manager - Combines all patterns
export class ResilienceManager {
  private circuitBreakers = new Map<string, CircuitBreaker>();
  private bulkheads = new Map<string, Bulkhead>();
  private rateLimiters = new Map<string, RateLimiter>();
  private caches = new Map<string, CacheAside>();

  createCircuitBreaker(
    name: string,
    operation: () => Promise<any>,
    options?: CircuitBreakerOptions
  ): CircuitBreaker {
    const breaker = new CircuitBreaker(name, operation, options);
    this.circuitBreakers.set(name, breaker);
    return breaker;
  }

  createBulkhead(name: string, maxConcurrent: number = 10): Bulkhead {
    const bulkhead = new Bulkhead(maxConcurrent);
    this.bulkheads.set(name, bulkhead);
    return bulkhead;
  }

  createRateLimiter(
    name: string,
    maxRequests: number,
    windowMs: number
  ): RateLimiter {
    const rateLimiter = new RateLimiter(maxRequests, windowMs);
    this.rateLimiters.set(name, rateLimiter);
    return rateLimiter;
  }

  createCache(name: string, ttlMs?: number, maxSize?: number): CacheAside {
    const cache = new CacheAside(ttlMs, maxSize);
    this.caches.set(name, cache);
    return cache;
  }

  getCircuitBreaker(name: string): CircuitBreaker | undefined {
    return this.circuitBreakers.get(name);
  }

  getBulkhead(name: string): Bulkhead | undefined {
    return this.bulkheads.get(name);
  }

  getRateLimiter(name: string): RateLimiter | undefined {
    return this.rateLimiters.get(name);
  }

  getCache(name: string): CacheAside | undefined {
    return this.caches.get(name);
  }

  getAllStats(): Record<string, any> {
    const stats: Record<string, any> = {};

    for (const [name, breaker] of this.circuitBreakers) {
      stats[`circuit_breaker_${name}`] = breaker.getStats();
    }

    for (const [name, bulkhead] of this.bulkheads) {
      stats[`bulkhead_${name}`] = bulkhead.getStats();
    }

    for (const [name, rateLimiter] of this.rateLimiters) {
      stats[`rate_limiter_${name}`] = rateLimiter.getStats();
    }

    for (const [name, cache] of this.caches) {
      stats[`cache_${name}`] = cache.getStats();
    }

    return stats;
  }
}

export default {
  CircuitBreaker,
  RetryPolicy,
  Bulkhead,
  Timeout,
  CacheAside,
  RateLimiter,
  ResilienceManager,
};
