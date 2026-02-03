import { BaseEvent, BaseEventSchema } from './index';

export interface EventBusConfig {
  kafkaBrokers: string[];
  clientId: string;
  groupId?: string;
}

export class EventBus {
  private producers: Map<string, any> = new Map();
  private consumers: Map<string, any> = new Map();
  private config: EventBusConfig;

  constructor(config: EventBusConfig) {
    this.config = config;
  }

  async publish(event: BaseEvent): Promise<void> {
    // Validate event schema
    const validatedEvent = BaseEventSchema.parse(event);
    
    // In production, this would use Kafka producer
    console.log(`Publishing event: ${validatedEvent.eventType}`, validatedEvent);
    
    // Mock implementation
    return Promise.resolve();
  }

  async subscribe(
    eventType: string,
    handler: (event: BaseEvent) => Promise<void>
  ): Promise<void> {
    // In production, this would use Kafka consumer
    console.log(`Subscribing to event: ${eventType}`);
    
    // Mock implementation
    const mockHandler = async (event: BaseEvent) => {
      if (event.eventType === eventType) {
        await handler(event);
      }
    };
    
    this.consumers.set(eventType, mockHandler);
  }

  async unsubscribe(eventType: string): Promise<void> {
    this.consumers.delete(eventType);
    console.log(`Unsubscribed from event: ${eventType}`);
  }

  async createEvent<T extends Record<string, any>>(
    eventType: string,
    data: T,
    metadata?: Record<string, any>
  ): Promise<BaseEvent> {
    return {
      eventId: crypto.randomUUID(),
      eventType,
      eventVersion: '1.0.0',
      timestamp: new Date().toISOString(),
      source: this.config.clientId,
      correlationId: crypto.randomUUID(),
      data,
      metadata,
    };
  }

  // Utility methods for common event patterns
  async publishUserEvent(eventType: string, userId: string, data: any): Promise<void> {
    const event = await this.createEvent(eventType, data, {
      userId,
      entityType: 'user',
    });
    await this.publish(event);
  }

  async publishAuthEvent(eventType: string, userId: string, data: any): Promise<void> {
    const event = await this.createEvent(eventType, data, {
      userId,
      entityType: 'auth',
    });
    await this.publish(event);
  }

  async publishTransactionEvent(eventType: string, transactionId: string, data: any): Promise<void> {
    const event = await this.createEvent(eventType, data, {
      transactionId,
      entityType: 'transaction',
    });
    await this.publish(event);
  }

  async publishNotificationEvent(eventType: string, recipientId: string, data: any): Promise<void> {
    const event = await this.createEvent(eventType, data, {
      recipientId,
      entityType: 'notification',
    });
    await this.publish(event);
  }

  async publishAuditEvent(eventType: string, entityId: string, entityType: string, data: any): Promise<void> {
    const event = await this.createEvent(eventType, data, {
      entityId,
      entityType,
    });
    await this.publish(event);
  }

  async publishFeatureFlagEvent(eventType: string, flagKey: string, data: any): Promise<void> {
    const event = await this.createEvent(eventType, data, {
      flagKey,
      entityType: 'feature-flag',
    });
    await this.publish(event);
  }

  // Health check for event bus
  async healthCheck(): Promise<{ status: string; details: any }> {
    return {
      status: 'healthy',
      details: {
        producers: this.producers.size,
        consumers: this.consumers.size,
        kafkaBrokers: this.config.kafkaBrokers,
      },
    };
  }

  // Graceful shutdown
  async shutdown(): Promise<void> {
    console.log('Shutting down event bus...');
    
    // Close all producers
    for (const [topic, producer] of this.producers) {
      console.log(`Closing producer for topic: ${topic}`);
      // In production: await producer.disconnect();
    }
    
    // Close all consumers
    for (const [eventType, consumer] of this.consumers) {
      console.log(`Closing consumer for event type: ${eventType}`);
      // In production: await consumer.disconnect();
    }
    
    this.producers.clear();
    this.consumers.clear();
    
    console.log('Event bus shutdown complete');
  }
}

// Singleton instance for the application
let eventBusInstance: EventBus | null = null;

export function getEventBus(config?: EventBusConfig): EventBus {
  if (!eventBusInstance) {
    if (!config) {
      throw new Error('EventBus config is required for first initialization');
    }
    eventBusInstance = new EventBus(config);
  }
  return eventBusInstance;
}

export function resetEventBus(): void {
  eventBusInstance = null;
}

// Event decorator for automatic event publishing
export function EventHandler(eventType: string) {
  return function (target: any, propertyName: string, descriptor: PropertyDescriptor) {
    const method = descriptor.value;
    
    descriptor.value = async function (...args: any[]) {
      const result = await method.apply(this, args);
      
      // Auto-publish event if method returns data
      if (result && typeof result === 'object') {
        const eventBus = getEventBus();
        const event = await eventBus.createEvent(eventType, result);
        await eventBus.publish(event);
      }
      
      return result;
    };
  };
}

// Event validation middleware
export function validateEvent(eventType: string) {
  return function (target: any, propertyName: string, descriptor: PropertyDescriptor) {
    const method = descriptor.value;
    
    descriptor.value = async function (event: BaseEvent, ...args: any[]) {
      // Validate event
      const validatedEvent = BaseEventSchema.parse(event);
      
      if (validatedEvent.eventType !== eventType) {
        throw new Error(`Expected event type ${eventType}, got ${validatedEvent.eventType}`);
      }
      
      return method.call(this, validatedEvent, ...args);
    };
  };
}

export default EventBus;
