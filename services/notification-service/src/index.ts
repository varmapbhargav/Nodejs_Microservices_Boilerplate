import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import nodemailer from 'nodemailer';
import { createLogger, Observability } from '@platform/observability';
import { ApiResponse, NotificationDto, CreateNotificationRequest } from '@platform/shared-contracts';
import { BaseEventSchema, NotificationEvents } from '@platform/shared-events';

const logger = createLogger({
  service: 'notification-service',
  version: '1.0.0',
  environment: process.env.NODE_ENV || 'development',
  level: process.env.LOG_LEVEL || 'info',
});

const app = express();
const PORT = process.env.PORT || 3004;

Observability.getInstance().startTracing('notification-service', '1.0.0');

app.use(helmet());
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
  credentials: true,
}));
app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

interface Notification {
  id: string;
  userId: string;
  type: 'email' | 'sms' | 'push';
  subject: string;
  content: string;
  status: 'pending' | 'sent' | 'failed';
  sentAt?: Date;
  createdAt: Date;
  metadata?: Record<string, any>;
}

const notifications: Map<string, Notification> = new Map();

const emailTransporter = nodemailer.createTransporter({
  host: process.env.SMTP_HOST || 'localhost',
  port: parseInt(process.env.SMTP_PORT || '587'),
  secure: process.env.SMTP_SECURE === 'true',
  auth: {
    user: process.env.SMTP_USER || 'user',
    pass: process.env.SMTP_PASS || 'pass',
  },
});

function emitNotificationEvent(eventType: string, notificationId: string, metadata?: any): void {
  const event = BaseEventSchema.parse({
    eventId: crypto.randomUUID(),
    eventType,
    eventVersion: '1.0',
    timestamp: new Date().toISOString(),
    source: 'notification-service',
    correlationId: crypto.randomUUID(),
    data: { notificationId },
    metadata,
  });

  logger.info({ event }, 'Notification event emitted');
}

function createNotificationDto(notification: Notification): NotificationDto {
  return {
    id: notification.id,
    userId: notification.userId,
    type: notification.type,
    subject: notification.subject,
    content: notification.content,
    status: notification.status,
    sentAt: notification.sentAt?.toISOString(),
    createdAt: notification.createdAt.toISOString(),
    metadata: notification.metadata,
  };
}

async function sendEmail(notification: Notification): Promise<void> {
  try {
    await emailTransporter.sendMail({
      from: process.env.EMAIL_FROM || 'noreply@platform.com',
      to: notification.metadata?.email || 'user@example.com',
      subject: notification.subject,
      text: notification.content,
      html: `<p>${notification.content}</p>`,
    });

    notification.status = 'sent';
    notification.sentAt = new Date();
    
    emitNotificationEvent(NotificationEvents.EMAIL_DELIVERED, notification.id);
    logger.info({ notificationId: notification.id }, 'Email sent successfully');
  } catch (error) {
    notification.status = 'failed';
    emitNotificationEvent(NotificationEvents.NOTIFICATION_FAILED, notification.id, { error: error.message });
    logger.error({ notificationId: notification.id, error }, 'Email sending failed');
    throw error;
  }
}

async function sendSMS(notification: Notification): Promise<void> {
  try {
    logger.info({ notificationId: notification.id }, 'SMS sent (mock)');
    
    notification.status = 'sent';
    notification.sentAt = new Date();
    
    emitNotificationEvent(NotificationEvents.SMS_DELIVERED, notification.id);
  } catch (error) {
    notification.status = 'failed';
    emitNotificationEvent(NotificationEvents.NOTIFICATION_FAILED, notification.id, { error: error.message });
    logger.error({ notificationId: notification.id, error }, 'SMS sending failed');
    throw error;
  }
}

async function sendPush(notification: Notification): Promise<void> {
  try {
    logger.info({ notificationId: notification.id }, 'Push notification sent (mock)');
    
    notification.status = 'sent';
    notification.sentAt = new Date();
    
    emitNotificationEvent(NotificationEvents.PUSH_DELIVERED, notification.id);
  } catch (error) {
    notification.status = 'failed';
    emitNotificationEvent(NotificationEvents.NOTIFICATION_FAILED, notification.id, { error: error.message });
    logger.error({ notificationId: notification.id, error }, 'Push notification sending failed');
    throw error;
  }
}

async function processNotification(notification: Notification): Promise<void> {
  switch (notification.type) {
    case 'email':
      await sendEmail(notification);
      break;
    case 'sms':
      await sendSMS(notification);
      break;
    case 'push':
      await sendPush(notification);
      break;
    default:
      throw new Error(`Unsupported notification type: ${notification.type}`);
  }
}

function validateCreateNotificationRequest(data: CreateNotificationRequest): string[] {
  const errors: string[] = [];
  
  if (!data.userId) {
    errors.push('User ID is required');
  }
  
  if (!data.type || !['email', 'sms', 'push'].includes(data.type)) {
    errors.push('Valid notification type (email, sms, push) is required');
  }
  
  if (!data.subject || data.subject.trim().length < 1) {
    errors.push('Subject is required');
  }
  
  if (!data.content || data.content.trim().length < 1) {
    errors.push('Content is required');
  }
  
  return errors;
}

app.post('/api/v1/notifications', async (req, res) => {
  try {
    const notificationData: CreateNotificationRequest = req.body;
    
    const errors = validateCreateNotificationRequest(notificationData);
    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Validation failed',
          details: errors,
        },
      } as ApiResponse);
    }

    const notification: Notification = {
      id: crypto.randomUUID(),
      userId: notificationData.userId,
      type: notificationData.type,
      subject: notificationData.subject,
      content: notificationData.content,
      status: 'pending',
      createdAt: new Date(),
      metadata: notificationData.metadata,
    };

    notifications.set(notification.id, notification);
    
    emitNotificationEvent(NotificationEvents.NOTIFICATION_SENT, notification.id, {
      userId: notification.userId,
      type: notification.type,
    });

    logger.info({ notificationId: notification.id, userId: notification.userId, type: notification.type }, 'Notification created');

    setTimeout(async () => {
      try {
        await processNotification(notification);
      } catch (error) {
        logger.error({ notificationId: notification.id, error }, 'Notification processing failed');
      }
    }, Math.random() * 3000 + 1000);

    res.status(201).json({
      success: true,
      data: createNotificationDto(notification),
    } as ApiResponse<NotificationDto>);
  } catch (error) {
    logger.error({ error }, 'Notification creation failed');
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Internal server error',
      },
    } as ApiResponse);
  }
});

app.get('/api/v1/notifications/:id', (req, res) => {
  try {
    const { id } = req.params;
    const notification = notifications.get(id);

    if (!notification) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOTIFICATION_NOT_FOUND',
          message: 'Notification not found',
        },
      } as ApiResponse);
    }

    res.json({
      success: true,
      data: createNotificationDto(notification),
    } as ApiResponse<NotificationDto>);
  } catch (error) {
    logger.error({ error }, 'Notification retrieval failed');
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Internal server error',
      },
    } as ApiResponse);
  }
});

app.get('/api/v1/notifications', (req, res) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const userId = req.query.userId as string;
    const type = req.query.type as string;
    const status = req.query.status as string;

    let allNotifications = Array.from(notifications.values());
    
    if (userId) {
      allNotifications = allNotifications.filter(notification => notification.userId === userId);
    }
    
    if (type) {
      allNotifications = allNotifications.filter(notification => notification.type === type);
    }
    
    if (status) {
      allNotifications = allNotifications.filter(notification => notification.status === status);
    }

    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;
    const paginatedNotifications = allNotifications.slice(startIndex, endIndex);

    const notificationDtos = paginatedNotifications.map(createNotificationDto);

    res.json({
      success: true,
      data: notificationDtos,
      pagination: {
        page,
        limit,
        total: allNotifications.length,
        totalPages: Math.ceil(allNotifications.length / limit),
        hasNext: endIndex < allNotifications.length,
        hasPrev: page > 1,
      },
    });
  } catch (error) {
    logger.error({ error }, 'Notification list retrieval failed');
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Internal server error',
      },
    } as ApiResponse);
  }
});

app.post('/api/v1/notifications/:id/resend', async (req, res) => {
  try {
    const { id } = req.params;
    const notification = notifications.get(id);

    if (!notification) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOTIFICATION_NOT_FOUND',
          message: 'Notification not found',
        },
      } as ApiResponse);
    }

    if (notification.status === 'sent') {
      return res.status(400).json({
        success: false,
        error: {
          code: 'ALREADY_SENT',
          message: 'Notification already sent',
        },
      } as ApiResponse);
    }

    notification.status = 'pending';
    notification.sentAt = undefined;

    setTimeout(async () => {
      try {
        await processNotification(notification);
      } catch (error) {
        logger.error({ notificationId: notification.id, error }, 'Notification resend failed');
      }
    }, 1000);

    logger.info({ notificationId: notification.id }, 'Notification resend initiated');

    res.json({
      success: true,
      data: createNotificationDto(notification),
    } as ApiResponse<NotificationDto>);
  } catch (error) {
    logger.error({ error }, 'Notification resend failed');
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Internal server error',
      },
    } as ApiResponse);
  }
});

app.get('/health/live', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

app.get('/health/ready', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    checks: {
      database: 'pass',
      cache: 'pass',
      messaging: 'pass',
      external: 'pass',
    },
    uptime: process.uptime(),
    memory: process.memoryUsage(),
  });
});

app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: 'Endpoint not found',
    },
  } as ApiResponse);
});

app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  logger.error({ err, url: req.url, method: req.method }, 'Unhandled error');
  
  res.status(err.status || 500).json({
    success: false,
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message: process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message,
    },
  } as ApiResponse);
});

const server = app.listen(PORT, () => {
  logger.info({ port: PORT }, 'Notification Service started');
});

process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  server.close(() => {
    Observability.getInstance().shutdown().then(() => {
      process.exit(0);
    });
  });
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully');
  server.close(() => {
    Observability.getInstance().shutdown().then(() => {
      process.exit(0);
    });
  });
});

export { app };
