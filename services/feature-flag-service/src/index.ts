import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';

// Types
interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
  metadata?: {
    requestId: string;
    timestamp: string;
    version: string;
  };
}

interface FeatureFlagDto {
  id: string;
  key: string;
  description: string;
  enabled: boolean;
  conditions: any;
  createdAt: string;
  updatedAt: string;
}

// Simple logger for feature-flag service
const createLogger = (config: any) => ({
  info: (message: string, ...args: any[]) => console.log(`[INFO] ${config.service}: ${message}`, ...args),
  error: (message: string, ...args: any[]) => console.error(`[ERROR] ${config.service}: ${message}`, ...args),
  warn: (message: string, ...args: any[]) => console.warn(`[WARN] ${config.service}: ${message}`, ...args),
  debug: (message: string, ...args: any[]) => console.debug(`[DEBUG] ${config.service}: ${message}`, ...args),
});

// Simple observability stub
const Observability = {
  getInstance: () => ({
    startTracing: () => {},
    shutdown: () => Promise.resolve(),
  }),
};

const logger = createLogger({
  service: 'feature-flag-service',
  version: '1.0.0',
  environment: process.env.NODE_ENV || 'development',
  level: process.env.LOG_LEVEL || 'info',
});

const app = express();
const PORT = Number(process.env.PORT) || 3006;

Observability.getInstance().startTracing();

app.use(helmet());
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
  credentials: true,
}));
app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Mock feature flag storage
const featureFlags = new Map<string, FeatureFlagDto>();

// Helper functions
const generateId = (): string => {
  return Math.random().toString(36).substr(2, 9);
};

const createFeatureFlag = (data: Partial<FeatureFlagDto>): FeatureFlagDto => {
  const now = new Date().toISOString();
  return {
    id: generateId(),
    key: data.key || '',
    description: data.description || '',
    enabled: data.enabled || false,
    conditions: data.conditions || {},
    createdAt: now,
    updatedAt: now,
    ...data,
  };
};

// Event publishing (mock)
const publishEvent = (eventType: string, data: any): void => {
  console.log(`Event: ${eventType}`, data);
};

// Routes
app.get('/health/live', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
  });
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

// Feature flag CRUD operations
app.post('/api/v1/feature-flags', (req, res) => {
  try {
    const flagData = req.body;
    const featureFlag = createFeatureFlag(flagData);
    
    featureFlags.set(featureFlag.key, featureFlag);
    
    publishEvent('FEATURE_FLAG_CREATED', {
      flagId: featureFlag.id,
      key: featureFlag.key,
      enabled: featureFlag.enabled,
    });

    logger.info(`Feature flag created: ${featureFlag.key}`);

    res.status(201).json({
      success: true,
      data: featureFlag,
    } as ApiResponse<FeatureFlagDto>);
  } catch (error) {
    logger.error('Error creating feature flag:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Internal server error',
      },
    } as ApiResponse);
  }
});

app.get('/api/v1/feature-flags', (req, res) => {
  try {
    const flags = Array.from(featureFlags.values());
    
    res.json({
      success: true,
      data: {
        flags,
      pagination: {
        page: 1,
        limit: flags.length,
        total: flags.length,
      },
      },
    } as ApiResponse);
  } catch (error) {
    logger.error('Error fetching feature flags:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Internal server error',
      },
    } as ApiResponse);
  }
});

app.get('/api/v1/feature-flags/:key', (req, res) => {
  try {
    const { key } = req.params;
    const featureFlag = featureFlags.get(key);
    
    if (!featureFlag) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'FEATURE_FLAG_NOT_FOUND',
          message: 'Feature flag not found',
        },
      } as ApiResponse);
    }

    res.json({
      success: true,
      data: featureFlag,
    } as ApiResponse<FeatureFlagDto>);
  } catch (error) {
    logger.error('Error fetching feature flag:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Internal server error',
      },
    } as ApiResponse);
  }
});

app.patch('/api/v1/feature-flags/:key', (req, res) => {
  try {
    const { key } = req.params;
    const updateData = req.body;
    
    const featureFlag = featureFlags.get(key);
    if (!featureFlag) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'FEATURE_FLAG_NOT_FOUND',
          message: 'Feature flag not found',
        },
      } as ApiResponse);
    }

    const updatedFlag = {
      ...featureFlag,
      ...updateData,
      updatedAt: new Date().toISOString(),
    };
    
    featureFlags.set(key, updatedFlag);
    
    publishEvent('FEATURE_FLAG_UPDATED', {
      flagId: updatedFlag.id,
      key: updatedFlag.key,
      enabled: updatedFlag.enabled,
      changes: updateData,
    });

    logger.info(`Feature flag updated: ${key}`);

    res.json({
      success: true,
      data: updatedFlag,
    } as ApiResponse<FeatureFlagDto>);
  } catch (error) {
    logger.error('Error updating feature flag:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Internal server error',
      },
    } as ApiResponse);
  }
});

app.delete('/api/v1/feature-flags/:key', (req, res) => {
  try {
    const { key } = req.params;
    const featureFlag = featureFlags.get(key);
    
    if (!featureFlag) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'FEATURE_FLAG_NOT_FOUND',
          message: 'Feature flag not found',
        },
      } as ApiResponse);
    }

    featureFlags.delete(key);
    
    publishEvent('FEATURE_FLAG_DELETED', {
      flagId: featureFlag.id,
      key: featureFlag.key,
    });

    logger.info(`Feature flag deleted: ${key}`);

    res.json({
      success: true,
      data: {
        flagId: featureFlag.id,
        key: featureFlag.key,
        deleted: true,
      },
    } as ApiResponse);
  } catch (error) {
    logger.error('Error deleting feature flag:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Internal server error',
      },
    } as ApiResponse);
  }
});

// Feature evaluation
app.post('/api/v1/feature-flags/evaluate', (req, res) => {
  try {
    const { flagKey, context } = req.body;
    const featureFlag = featureFlags.get(flagKey);
    
    if (!featureFlag) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'FEATURE_FLAG_NOT_FOUND',
          message: 'Feature flag not found',
        },
      } as ApiResponse);
    }

    // Simple evaluation logic
    let enabled = featureFlag.enabled;
    
    // Check conditions (simplified)
    if (enabled && featureFlag.conditions) {
      if (featureFlag.conditions.userRoles && context.userRole) {
        enabled = featureFlag.conditions.userRoles.includes(context.userRole);
      }
    }

    const evaluation = {
      flagKey,
      enabled,
      reason: enabled ? 'enabled_by_default' : 'disabled_by_default',
      timestamp: new Date().toISOString(),
    };

    publishEvent('FEATURE_FLAG_EVALUATED', {
      flagKey,
      enabled,
      context,
      evaluation,
    });

    res.json({
      success: true,
      data: evaluation,
    } as ApiResponse);
  } catch (error) {
    logger.error('Error evaluating feature flag:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Internal server error',
      },
    } as ApiResponse);
  }
});

// Error handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  logger.error('Unhandled error:', err);
  res.status(500).json({
    success: false,
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Internal server error',
    },
  } as ApiResponse);
});

// 404 handler
app.use((req: express.Request, res: express.Response) => {
  res.status(404).json({
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: 'Endpoint not found',
    },
  } as ApiResponse);
});

// Start server
const server = app.listen(PORT, () => {
  logger.info(`Feature flag service running on port ${PORT}`);
});

// Graceful shutdown
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
