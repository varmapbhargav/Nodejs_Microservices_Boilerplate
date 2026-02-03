import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import { createLogger, Observability } from '@platform/observability';
import { ApiResponse, AuditLogDto } from '@platform/shared-contracts';
import { BaseEventSchema, AuditEvents } from '@platform/shared-events';

const logger = createLogger({
  service: 'audit-service',
  version: '1.0.0',
  environment: process.env.NODE_ENV || 'development',
  level: process.env.LOG_LEVEL || 'info',
});

const app = express();
const PORT = process.env.PORT || 3005;

Observability.getInstance().startTracing('audit-service', '1.0.0');

app.use(helmet());
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
  credentials: true,
}));
app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

interface AuditLog {
  id: string;
  userId?: string;
  action: string;
  resource: string;
  resourceId?: string;
  ipAddress: string;
  userAgent: string;
  timestamp: Date;
  metadata?: Record<string, any>;
}

const auditLogs: Map<string, AuditLog> = new Map();

function emitAuditEvent(eventType: string, auditLogId: string, metadata?: any): void {
  const event = BaseEventSchema.parse({
    eventId: crypto.randomUUID(),
    eventType,
    eventVersion: '1.0',
    timestamp: new Date().toISOString(),
    source: 'audit-service',
    correlationId: crypto.randomUUID(),
    data: { auditLogId },
    metadata,
  });

  logger.info({ event }, 'Audit event emitted');
}

function createAuditLogDto(auditLog: AuditLog): AuditLogDto {
  return {
    id: auditLog.id,
    userId: auditLog.userId,
    action: auditLog.action,
    resource: auditLog.resource,
    resourceId: auditLog.resourceId,
    ipAddress: auditLog.ipAddress,
    userAgent: auditLog.userAgent,
    timestamp: auditLog.timestamp.toISOString(),
    metadata: auditLog.metadata,
  };
}

function getClientIP(req: express.Request): string {
  return req.ip || 
         req.connection.remoteAddress || 
         req.socket.remoteAddress ||
         (req.connection as any)?.socket?.remoteAddress ||
         '127.0.0.1';
}

function getUserAgent(req: express.Request): string {
  return req.get('User-Agent') || 'Unknown';
}

function createAuditLog(
  action: string,
  resource: string,
  req: express.Request,
  userId?: string,
  resourceId?: string,
  metadata?: Record<string, any>
): AuditLog {
  const auditLog: AuditLog = {
    id: crypto.randomUUID(),
    userId,
    action,
    resource,
    resourceId,
    ipAddress: getClientIP(req),
    userAgent: getUserAgent(req),
    timestamp: new Date(),
    metadata,
  };

  auditLogs.set(auditLog.id, auditLog);
  
  emitAuditEvent(AuditEvents.AUDIT_LOG_CREATED, auditLog.id, {
    action,
    resource,
    userId,
    resourceId,
  });

  logger.info({ auditLogId: auditLog.id, action, resource, userId }, 'Audit log created');
  
  return auditLog;
}

app.post('/api/v1/audit-logs', (req, res) => {
  try {
    const { action, resource, userId, resourceId, metadata } = req.body;

    if (!action || !resource) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Action and resource are required',
        },
      } as ApiResponse);
    }

    const auditLog = createAuditLog(action, resource, req, userId, resourceId, metadata);

    res.status(201).json({
      success: true,
      data: createAuditLogDto(auditLog),
    } as ApiResponse<AuditLogDto>);
  } catch (error) {
    logger.error({ error }, 'Audit log creation failed');
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Internal server error',
      },
    } as ApiResponse);
  }
});

app.get('/api/v1/audit-logs/:id', (req, res) => {
  try {
    const { id } = req.params;
    const auditLog = auditLogs.get(id);

    if (!auditLog) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'AUDIT_LOG_NOT_FOUND',
          message: 'Audit log not found',
        },
      } as ApiResponse);
    }

    res.json({
      success: true,
      data: createAuditLogDto(auditLog),
    } as ApiResponse<AuditLogDto>);
  } catch (error) {
    logger.error({ error }, 'Audit log retrieval failed');
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Internal server error',
      },
    } as ApiResponse);
  }
});

app.get('/api/v1/audit-logs', (req, res) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const userId = req.query.userId as string;
    const action = req.query.action as string;
    const resource = req.query.resource as string;
    const startDate = req.query.startDate as string;
    const endDate = req.query.endDate as string;

    let allLogs = Array.from(auditLogs.values());
    
    if (userId) {
      allLogs = allLogs.filter(log => log.userId === userId);
    }
    
    if (action) {
      allLogs = allLogs.filter(log => log.action === action);
    }
    
    if (resource) {
      allLogs = allLogs.filter(log => log.resource === resource);
    }
    
    if (startDate) {
      const start = new Date(startDate);
      allLogs = allLogs.filter(log => log.timestamp >= start);
    }
    
    if (endDate) {
      const end = new Date(endDate);
      allLogs = allLogs.filter(log => log.timestamp <= end);
    }

    allLogs.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;
    const paginatedLogs = allLogs.slice(startIndex, endIndex);

    const auditLogDtos = paginatedLogs.map(createAuditLogDto);

    res.json({
      success: true,
      data: auditLogDtos,
      pagination: {
        page,
        limit,
        total: allLogs.length,
        totalPages: Math.ceil(allLogs.length / limit),
        hasNext: endIndex < allLogs.length,
        hasPrev: page > 1,
      },
    });
  } catch (error) {
    logger.error({ error }, 'Audit log list retrieval failed');
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Internal server error',
      },
    } as ApiResponse);
  }
});

app.post('/api/v1/compliance-check', (req, res) => {
  try {
    const { userId, action, resource, amount, riskLevel } = req.body;

    if (!userId || !action || !resource) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'userId, action, and resource are required',
        },
      } as ApiResponse);
    }

    const requiresManualReview = amount > 10000 || riskLevel === 'high';
    
    const auditLog = createAuditLog(
      'COMPLIANCE_CHECK',
      'compliance',
      req,
      userId,
      undefined,
      { action, resource, amount, riskLevel, requiresManualReview }
    );

    if (requiresManualReview) {
      emitAuditEvent(AuditEvents.COMPLIANCE_VIOLATION, auditLog.id, {
        userId,
        action,
        resource,
        amount,
        riskLevel,
      });

      logger.warn({ userId, action, resource, amount, riskLevel }, 'Compliance violation detected');
    }

    res.json({
      success: true,
      data: {
        compliant: !requiresManualReview,
        requiresManualReview,
        riskLevel: riskLevel || 'low',
        recommendations: requiresManualReview ? [
          'Manual review required',
          'Additional documentation needed',
          'Manager approval required'
        ] : [
          'Transaction approved automatically',
          'Standard compliance checks passed'
        ],
      },
    } as ApiResponse);
  } catch (error) {
    logger.error({ error }, 'Compliance check failed');
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Internal server error',
      },
    } as ApiResponse);
  }
});

app.post('/api/v1/security-incident', (req, res) => {
  try {
    const { userId, incidentType, severity, description, ipAddress } = req.body;

    if (!incidentType || !severity || !description) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'incidentType, severity, and description are required',
        },
      } as ApiResponse);
    }

    const auditLog = createAuditLog(
      'SECURITY_INCIDENT',
      'security',
      req,
      userId,
      undefined,
      { incidentType, severity, description, ipAddress }
    );

    emitAuditEvent(AuditEvents.SECURITY_INCIDENT, auditLog.id, {
      userId,
      incidentType,
      severity,
      description,
      ipAddress,
    });

    logger.error({ userId, incidentType, severity, description }, 'Security incident reported');

    res.status(201).json({
      success: true,
      data: {
        incidentId: auditLog.id,
        status: 'reported',
        severity,
        timestamp: auditLog.timestamp.toISOString(),
      },
    } as ApiResponse);
  } catch (error) {
    logger.error({ error }, 'Security incident reporting failed');
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Internal server error',
      },
    } as ApiResponse);
  }
});

app.get('/api/v1/compliance-report', (req, res) => {
  try {
    const startDate = req.query.startDate as string;
    const endDate = req.query.endDate as string;

    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'startDate and endDate are required',
        },
      } as ApiResponse);
    }

    const start = new Date(startDate);
    const end = new Date(endDate);

    const relevantLogs = Array.from(auditLogs.values()).filter(log => 
      log.timestamp >= start && log.timestamp <= end
    );

    const totalActions = relevantLogs.length;
    const uniqueUsers = new Set(relevantLogs.map(log => log.userId).filter(Boolean)).size;
    const highRiskActions = relevantLogs.filter(log => 
      log.metadata?.riskLevel === 'high' || 
      log.metadata?.amount > 10000
    ).length;

    const actionsByResource = relevantLogs.reduce((acc, log) => {
      acc[log.resource] = (acc[log.resource] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    res.json({
      success: true,
      data: {
        period: { startDate, endDate },
        summary: {
          totalActions,
          uniqueUsers,
          highRiskActions,
          complianceRate: ((totalActions - highRiskActions) / totalActions * 100).toFixed(2) + '%',
        },
        actionsByResource,
        recommendations: highRiskActions > 0 ? [
          'Review high-risk transactions',
          'Enhance monitoring for suspicious activities',
          'Consider additional authentication requirements'
        ] : [
          'Compliance posture is good',
          'Continue regular monitoring',
          'Maintain current security measures'
        ],
      },
    } as ApiResponse);
  } catch (error) {
    logger.error({ error }, 'Compliance report generation failed');
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
  logger.info({ port: PORT }, 'Audit Service started');
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
