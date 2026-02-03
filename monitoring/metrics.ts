import { Request, Response, NextFunction } from 'express';

// Simple logger for monitoring
const createLogger = (config: any) => ({
  info: (message: string, ...args: any[]) => console.log(`[INFO] ${config.service}: ${message}`, ...args),
  error: (message: string, ...args: any[]) => console.error(`[ERROR] ${config.service}: ${message}`, ...args),
  warn: (message: string, ...args: any[]) => console.warn(`[WARN] ${config.service}: ${message}`, ...args),
  debug: (message: string, ...args: any[]) => console.debug(`[DEBUG] ${config.service}: ${message}`, ...args),
});

// Enterprise Metrics and Monitoring
export class MetricsService {
  private logger = createLogger({
    service: 'metrics-service',
    version: '1.0.0',
    environment: process.env.NODE_ENV || 'development',
    level: process.env.LOG_LEVEL || 'info',
  });

  // Metrics storage (in production, use Prometheus or similar)
  private metrics: Map<string, any> = new Map();

  // Counter metrics
  incrementCounter(name: string, labels: Record<string, string> = {}): void {
    const key = `counter:${name}:${JSON.stringify(labels)}`;
    const current = this.metrics.get(key) || 0;
    this.metrics.set(key, current + 1);
    
    this.logger.info('Counter incremented', {
      metric: name,
      value: current + 1,
      labels,
    });
  }

  // Gauge metrics
  setGauge(name: string, value: number, labels: Record<string, string> = {}): void {
    const key = `gauge:${name}:${JSON.stringify(labels)}`;
    this.metrics.set(key, value);
    
    this.logger.info('Gauge set', {
      metric: name,
      value,
      labels,
    });
  }

  // Histogram metrics
  recordHistogram(name: string, value: number, labels: Record<string, string> = {}): void {
    const key = `histogram:${name}:${JSON.stringify(labels)}`;
    const current = this.metrics.get(key) || [];
    current.push(value);
    
    // Keep only last 1000 values
    if (current.length > 1000) {
      current.splice(0, current.length - 1000);
    }
    
    this.metrics.set(key, current);
    
    this.logger.info('Histogram recorded', {
      metric: name,
      value,
      labels,
      count: current.length,
    });
  }

  // Get metrics for Prometheus
  getPrometheusMetrics(): string {
    let output = '';
    
    for (const [key, value] of this.metrics.entries()) {
      const [type, name, labelsStr] = key.split(':');
      const labels = JSON.parse(labelsStr);
      
      const labelStr = Object.entries(labels)
        .map(([k, v]) => `${k}="${v}"`)
        .join(',');
      
      const metricName = name.replace(/[^a-zA-Z0-9_]/g, '_');
      
      if (type === 'counter') {
        output += `# TYPE ${metricName} counter\n`;
        output += `${metricName}{${labelStr}} ${value}\n`;
      } else if (type === 'gauge') {
        output += `# TYPE ${metricName} gauge\n`;
        output += `${metricName}{${labelStr}} ${value}\n`;
      } else if (type === 'histogram') {
        output += `# TYPE ${metricName} histogram\n`;
        const values = value as number[];
        const sum = values.reduce((a, b) => a + b, 0);
        const count = values.length;
        
        output += `${metricName}_sum{${labelStr}} ${sum}\n`;
        output += `${metricName}_count{${labelStr}} ${count}\n`;
        
        // Calculate percentiles
        const sorted = [...values].sort((a, b) => a - b);
        const percentiles = [0.5, 0.9, 0.95, 0.99];
        
        for (const p of percentiles) {
          const index = Math.floor(p * (sorted.length - 1));
          const value = sorted[index];
          output += `${metricName}_bucket{${labelStr},le="${value}"} ${count}\n`;
        }
        output += `${metricName}_bucket{${labelStr},le="+Inf"} ${count}\n`;
      }
    }
    
    return output;
  }

  // Middleware for HTTP metrics
  httpMetricsMiddleware() {
    return (req: Request, res: Response, next: NextFunction) => {
      const startTime = Date.now();
      
      res.on('finish', () => {
        const duration = Date.now() - startTime;
        const route = req.route?.path || req.path || 'unknown';
        const method = req.method;
        
        // Request counter
        this.incrementCounter('http_requests_total', {
          method,
          route,
          status_code: res.statusCode.toString(),
        });
        
        // Request duration histogram
        this.recordHistogram('http_request_duration_ms', duration, {
          method,
          route,
          status_code: res.statusCode.toString(),
        });
        
        // Active connections gauge
        this.setGauge('http_active_connections', 1, {
          method,
          route,
        });
        
        // Log slow requests
        if (duration > 1000) {
          this.logger.warn('Slow request detected', {
            method,
            route,
            duration,
            status_code: res.statusCode,
          });
        }
      });
      
      next();
    };
  }

  // Business metrics
  recordUserAction(action: string, userId?: string): void {
    this.incrementCounter('user_actions_total', {
      action,
      user_id: userId || 'anonymous',
    });
  }

  recordBusinessEvent(event: string, data: any): void {
    this.incrementCounter('business_events_total', {
      event,
      service: data.service || 'unknown',
    });
    
    // Record additional event data as metrics
    if (data.value) {
      this.recordHistogram('business_event_value', data.value, {
        event,
        service: data.service || 'unknown',
      });
    }
  }

  // System metrics
  recordSystemMetrics(): void {
    const memUsage = process.memoryUsage();
    const cpuUsage = process.cpuUsage();
    
    // Memory metrics
    this.setGauge('nodejs_memory_heap_used_bytes', memUsage.heapUsed);
    this.setGauge('nodejs_memory_heap_total_bytes', memUsage.heapTotal);
    this.setGauge('nodejs_memory_external_bytes', memUsage.external);
    this.setGauge('nodejs_memory_rss_bytes', memUsage.rss);
    
    // CPU metrics
    this.setGauge('nodejs_cpu_user_seconds_total', cpuUsage.user / 1000000);
    this.setGauge('nodejs_cpu_system_seconds_total', cpuUsage.system / 1000000);
    
    // Process metrics
    this.setGauge('nodejs_process_uptime_seconds', process.uptime());
    this.setGauge('nodejs_process_pid', process.pid);
  }

  // Error metrics
  recordError(error: Error, context: any = {}): void {
    this.incrementCounter('errors_total', {
      error_type: error.constructor.name,
      service: context.service || 'unknown',
      endpoint: context.endpoint || 'unknown',
    });
    
    this.logger.error('Error recorded', {
      error: error.message,
      stack: error.stack,
      context,
    });
  }

  // Security metrics
  recordSecurityEvent(event: string, context: any = {}): void {
    this.incrementCounter('security_events_total', {
      event,
      ip_address: context.ip || 'unknown',
      user_agent: context.userAgent || 'unknown',
    });
    
    this.logger.warn('Security event recorded', {
      event,
      context,
    });
  }

  // Database metrics
  recordDatabaseQuery(operation: string, duration: number, success: boolean): void {
    this.recordHistogram('database_query_duration_ms', duration, {
      operation,
      success: success.toString(),
    });
    
    this.incrementCounter('database_queries_total', {
      operation,
      success: success.toString(),
    });
  }

  // Cache metrics
  recordCacheOperation(operation: 'hit' | 'miss' | 'set', key: string): void {
    this.incrementCounter('cache_operations_total', {
      operation,
      key_prefix: key.split(':')[0] || 'unknown',
    });
  }

  // External API metrics
  recordExternalAPICall(api: string, method: string, statusCode: number, duration: number): void {
    this.recordHistogram('external_api_duration_ms', duration, {
      api,
      method,
      status_code: statusCode.toString(),
    });
    
    this.incrementCounter('external_api_calls_total', {
      api,
      method,
      status_code: statusCode.toString(),
    });
  }

  // Health check metrics
  recordHealthCheck(service: string, status: 'healthy' | 'unhealthy'): void {
    this.setGauge('health_check_status', status === 'healthy' ? 1 : 0, {
      service,
    });
  }

  // Custom metrics
  recordCustomMetric(name: string, value: number, labels: Record<string, string> = {}): void {
    this.setGauge(name, value, labels);
  }

  // Get all metrics
  getAllMetrics(): Record<string, any> {
    const result: Record<string, any> = {};
    
    for (const [key, value] of this.metrics.entries()) {
      const [type, name, labelsStr] = key.split(':');
      const labels = JSON.parse(labelsStr);
      
      if (!result[name]) {
        result[name] = {
          type,
          values: {},
        };
      }
      
      const labelKey = JSON.stringify(labels);
      result[name].values[labelKey] = value;
    }
    
    return result;
  }

  // Reset metrics (for testing)
  resetMetrics(): void {
    this.metrics.clear();
  }
}

export default MetricsService;
