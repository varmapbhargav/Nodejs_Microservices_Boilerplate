import { z } from 'zod';

export const BaseEventSchema = z.object({
  eventId: z.string().uuid(),
  eventType: z.string(),
  eventVersion: z.string(),
  timestamp: z.string().datetime(),
  source: z.string(),
  correlationId: z.string().uuid().optional(),
  data: z.any(),
  metadata: z.record(z.any()).optional(),
});

export type BaseEvent = z.infer<typeof BaseEventSchema>;

export const UserEvents = {
  USER_CREATED: 'user.created',
  USER_UPDATED: 'user.updated',
  USER_DELETED: 'user.deleted',
  USER_SUSPENDED: 'user.suspended',
  USER_ACTIVATED: 'user.activated',
} as const;

export const AuthEvents = {
  LOGIN_SUCCESS: 'auth.login.success',
  LOGIN_FAILED: 'auth.login.failed',
  LOGOUT: 'auth.logout',
  TOKEN_REFRESHED: 'auth.token.refreshed',
  PASSWORD_CHANGED: 'auth.password.changed',
  MFA_ENABLED: 'auth.mfa.enabled',
  MFA_DISABLED: 'auth.mfa.disabled',
  ACCOUNT_LOCKED: 'auth.account.locked',
  ACCOUNT_UNLOCKED: 'auth.account.unlocked',
} as const;

export const TransactionEvents = {
  TRANSACTION_CREATED: 'transaction.created',
  TRANSACTION_UPDATED: 'transaction.updated',
  TRANSACTION_COMPLETED: 'transaction.completed',
  TRANSACTION_FAILED: 'transaction.failed',
  TRANSACTION_CANCELLED: 'transaction.cancelled',
  TRANSACTION_APPROVED: 'transaction.approved',
  TRANSACTION_REJECTED: 'transaction.rejected',
} as const;

export const NotificationEvents = {
  NOTIFICATION_SENT: 'notification.sent',
  NOTIFICATION_FAILED: 'notification.failed',
  NOTIFICATION_DELIVERED: 'notification.delivered',
  NOTIFICATION_READ: 'notification.read',
  EMAIL_SENT: 'notification.email.sent',
  SMS_SENT: 'notification.sms.sent',
  PUSH_SENT: 'notification.push.sent',
} as const;

export const AuditEvents = {
  AUDIT_LOG_CREATED: 'audit.log.created',
  USER_ACTION_LOGGED: 'audit.user.action',
  SYSTEM_EVENT_LOGGED: 'audit.system.event',
  SECURITY_EVENT_LOGGED: 'audit.security.event',
  DATA_ACCESS_LOGGED: 'audit.data.access',
  CONFIGURATION_CHANGED: 'audit.configuration.changed',
} as const;

export const FeatureFlagEvents = {
  FEATURE_FLAG_CREATED: 'feature-flag.created',
  FEATURE_FLAG_UPDATED: 'feature-flag.updated',
  FEATURE_FLAG_DELETED: 'feature-flag.deleted',
  FEATURE_FLAG_ENABLED: 'feature-flag.enabled',
  FEATURE_FLAG_DISABLED: 'feature-flag.disabled',
  FEATURE_FLAG_EVALUATED: 'feature-flag.evaluated',
} as const;

export const CoreBusinessEvents = {
  TRANSACTION_INITIATED: 'business.transaction.initiated',
  TRANSACTION_COMPLETED: 'business.transaction.completed',
  TRANSACTION_FAILED: 'business.transaction.failed',
  ASSET_TOKENIZED: 'business.asset.tokenized',
  COMPLIANCE_CHECK_REQUIRED: 'business.compliance.required',
  RISK_ASSESSMENT_COMPLETED: 'business.risk.completed',
} as const;

// Event schemas for specific event types
export const UserCreatedEventSchema = BaseEventSchema.extend({
  eventType: z.literal(UserEvents.USER_CREATED),
  data: z.object({
    userId: z.string().uuid(),
    email: z.string().email(),
    firstName: z.string(),
    lastName: z.string(),
    role: z.string(),
  }),
});

export const UserUpdatedEventSchema = BaseEventSchema.extend({
  eventType: z.literal(UserEvents.USER_UPDATED),
  data: z.object({
    userId: z.string().uuid(),
    changes: z.record(z.any()),
  }),
});

export const AuthLoginSuccessEventSchema = BaseEventSchema.extend({
  eventType: z.literal(AuthEvents.LOGIN_SUCCESS),
  data: z.object({
    userId: z.string().uuid(),
    email: z.string().email(),
    ipAddress: z.string(),
    userAgent: z.string(),
  }),
});

export const AuthLoginFailedEventSchema = BaseEventSchema.extend({
  eventType: z.literal(AuthEvents.LOGIN_FAILED),
  data: z.object({
    email: z.string().email(),
    reason: z.string(),
    ipAddress: z.string(),
    userAgent: z.string(),
  }),
});

export const TransactionCreatedEventSchema = BaseEventSchema.extend({
  eventType: z.literal(TransactionEvents.TRANSACTION_CREATED),
  data: z.object({
    transactionId: z.string().uuid(),
    userId: z.string().uuid(),
    amount: z.number(),
    currency: z.string(),
    type: z.string(),
  }),
});

export const NotificationSentEventSchema = BaseEventSchema.extend({
  eventType: z.literal(NotificationEvents.NOTIFICATION_SENT),
  data: z.object({
    notificationId: z.string().uuid(),
    recipientId: z.string().uuid(),
    type: z.string(),
    channel: z.string(),
    subject: z.string(),
  }),
});

export const AuditLogCreatedEventSchema = BaseEventSchema.extend({
  eventType: z.literal(AuditEvents.AUDIT_LOG_CREATED),
  data: z.object({
    auditId: z.string().uuid(),
    userId: z.string().uuid().optional(),
    action: z.string(),
    resource: z.string(),
    timestamp: z.string().datetime(),
    metadata: z.record(z.any()).optional(),
  }),
});

export const FeatureFlagCreatedEventSchema = BaseEventSchema.extend({
  eventType: z.literal(FeatureFlagEvents.FEATURE_FLAG_CREATED),
  data: z.object({
    flagKey: z.string(),
    description: z.string(),
    enabled: z.boolean(),
    conditions: z.record(z.any()),
  }),
});

// Export all event types
export type UserCreatedEvent = z.infer<typeof UserCreatedEventSchema>;
export type UserUpdatedEvent = z.infer<typeof UserUpdatedEventSchema>;
export type AuthLoginSuccessEvent = z.infer<typeof AuthLoginSuccessEventSchema>;
export type AuthLoginFailedEvent = z.infer<typeof AuthLoginFailedEventSchema>;
export type TransactionCreatedEvent = z.infer<typeof TransactionCreatedEventSchema>;
export type NotificationSentEvent = z.infer<typeof NotificationSentEventSchema>;
export type AuditLogCreatedEvent = z.infer<typeof AuditLogCreatedEventSchema>;
export type FeatureFlagCreatedEvent = z.infer<typeof FeatureFlagCreatedEventSchema>;

// Event factory functions
export function createUserCreatedEvent(data: UserCreatedEvent['data'], source: string): UserCreatedEvent {
  return {
    eventId: crypto.randomUUID(),
    eventType: UserEvents.USER_CREATED,
    eventVersion: '1.0.0',
    timestamp: new Date().toISOString(),
    source,
    correlationId: crypto.randomUUID(),
    data,
  };
}

export function createAuthLoginSuccessEvent(data: AuthLoginSuccessEvent['data'], source: string): AuthLoginSuccessEvent {
  return {
    eventId: crypto.randomUUID(),
    eventType: AuthEvents.LOGIN_SUCCESS,
    eventVersion: '1.0.0',
    timestamp: new Date().toISOString(),
    source,
    correlationId: crypto.randomUUID(),
    data,
  };
}

export function createTransactionCreatedEvent(data: TransactionCreatedEvent['data'], source: string): TransactionCreatedEvent {
  return {
    eventId: crypto.randomUUID(),
    eventType: TransactionEvents.TRANSACTION_CREATED,
    eventVersion: '1.0.0',
    timestamp: new Date().toISOString(),
    source,
    correlationId: crypto.randomUUID(),
    data,
  };
}

export function createNotificationSentEvent(data: NotificationSentEvent['data'], source: string): NotificationSentEvent {
  return {
    eventId: crypto.randomUUID(),
    eventType: NotificationEvents.NOTIFICATION_SENT,
    eventVersion: '1.0.0',
    timestamp: new Date().toISOString(),
    source,
    correlationId: crypto.randomUUID(),
    data,
  };
}

export function createAuditLogCreatedEvent(data: AuditLogCreatedEvent['data'], source: string): AuditLogCreatedEvent {
  return {
    eventId: crypto.randomUUID(),
    eventType: AuditEvents.AUDIT_LOG_CREATED,
    eventVersion: '1.0.0',
    timestamp: new Date().toISOString(),
    source,
    correlationId: crypto.randomUUID(),
    data,
  };
}

export function createFeatureFlagCreatedEvent(data: FeatureFlagCreatedEvent['data'], source: string): FeatureFlagCreatedEvent {
  return {
    eventId: crypto.randomUUID(),
    eventType: FeatureFlagEvents.FEATURE_FLAG_CREATED,
    eventVersion: '1.0.0',
    timestamp: new Date().toISOString(),
    source,
    correlationId: crypto.randomUUID(),
    data,
  };
}

// Re-export event bus
export { EventBus, getEventBus, EventHandler, validateEvent } from './event-bus';
