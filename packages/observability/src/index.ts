import pino from 'pino';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { Resource } from '@opentelemetry/resources';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';
import { v4 as uuidv4 } from 'uuid';

export interface LoggerConfig {
  service: string;
  version: string;
  environment: string;
  level?: string;
}

export class Observability {
  private static instance: Observability;
  private logger: pino.Logger;
  private sdk?: NodeSDK;

  private constructor(config: LoggerConfig) {
    this.logger = pino({
      name: config.service,
      version: config.version,
      level: config.level || 'info',
      base: {
        service: config.service,
        version: config.version,
        environment: config.environment,
      },
      timestamp: pino.stdTimeFunctions.isoTime,
      formatters: {
        level: (label) => ({ level: label }),
        log: (object: any) => {
          const log = { ...object };
          if (log.time) {
            log.timestamp = log.time;
            delete log.time;
          }
          return log;
        },
      },
    });
  }

  static initialize(config: LoggerConfig): Observability {
    if (!Observability.instance) {
      Observability.instance = new Observability(config);
    }
    return Observability.instance;
  }

  static getInstance(): Observability {
    if (!Observability.instance) {
      throw new Error('Observability not initialized');
    }
    return Observability.instance;
  }

  getLogger(): pino.Logger {
    return this.logger;
  }

  startTracing(serviceName: string, serviceVersion: string): void {
    this.sdk = new NodeSDK({
      resource: new Resource({
        [SemanticResourceAttributes.SERVICE_NAME]: serviceName,
        [SemanticResourceAttributes.SERVICE_VERSION]: serviceVersion,
      }),
    });
    this.sdk.start();
  }

  async shutdown(): Promise<void> {
    if (this.sdk) {
      await this.sdk.shutdown();
    }
  }

  static createCorrelationId(): string {
    return uuidv4();
  }

  static withCorrelationId(correlationId: string, logger: pino.Logger): pino.Logger {
    return logger.child({ correlationId });
  }
}

export const createLogger = (config: LoggerConfig): pino.Logger => {
  return Observability.initialize(config).getLogger();
};

export const getLogger = (): pino.Logger => {
  return Observability.getInstance().getLogger();
};

export const createChildLogger = (parent: pino.Logger, context: Record<string, any>): pino.Logger => {
  return parent.child(context);
};

export * from './resilience';
