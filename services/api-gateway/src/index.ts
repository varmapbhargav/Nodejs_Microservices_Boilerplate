import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import { createProxyMiddleware } from 'http-proxy-middleware';
import { createLogger, Observability } from '@platform/observability';
import { ApiResponse } from '@platform/shared-contracts';

const logger = createLogger({
  service: 'api-gateway',
  version: '1.0.0',
  environment: process.env.NODE_ENV || 'development',
  level: process.env.LOG_LEVEL || 'info',
});

const app = express();
const PORT = process.env.PORT || 3000;

Observability.getInstance().startTracing('api-gateway', '1.0.0');

app.use(helmet());
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
  credentials: true,
}));
app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: {
    success: false,
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many requests from this IP',
    },
  },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/api', limiter);

const serviceProxies = {
  '/api/v1/auth': {
    target: process.env.AUTH_SERVICE_URL || 'http://localhost:3001',
    changeOrigin: true,
    pathRewrite: { '^/api/v1/auth': '/api/v1' },
  },
  '/api/v1/users': {
    target: process.env.USER_SERVICE_URL || 'http://localhost:3002',
    changeOrigin: true,
    pathRewrite: { '^/api/v1/users': '/api/v1' },
  },
  '/api/v1/core': {
    target: process.env.CORE_SERVICE_URL || 'http://localhost:3003',
    changeOrigin: true,
    pathRewrite: { '^/api/v1/core': '/api/v1' },
  },
  '/api/v1/notifications': {
    target: process.env.NOTIFICATION_SERVICE_URL || 'http://localhost:3004',
    changeOrigin: true,
    pathRewrite: { '^/api/v1/notifications': '/api/v1' },
  },
  '/api/v1/audit': {
    target: process.env.AUDIT_SERVICE_URL || 'http://localhost:3005',
    changeOrigin: true,
    pathRewrite: { '^/api/v1/audit': '/api/v1' },
  },
  '/api/v1/feature-flags': {
    target: process.env.FEATURE_FLAG_SERVICE_URL || 'http://localhost:3006',
    changeOrigin: true,
    pathRewrite: { '^/api/v1/feature-flags': '/api/v1' },
  },
};

Object.entries(serviceProxies).forEach(([path, options]) => {
  app.use(path, createProxyMiddleware({
    ...options,
    onError: (err, req, res) => {
      logger.error({ err, path }, 'Proxy error');
      res.status(502).json({
        success: false,
        error: {
          code: 'SERVICE_UNAVAILABLE',
          message: 'Service temporarily unavailable',
        },
      } as ApiResponse);
    },
    onProxyReq: (proxyReq, req) => {
      const correlationId = req.headers['x-correlation-id'] as string;
      if (correlationId) {
        proxyReq.setHeader('x-correlation-id', correlationId);
      }
      
      const authHeader = req.headers.authorization;
      if (authHeader) {
        proxyReq.setHeader('authorization', authHeader);
      }
    },
    onProxyRes: (proxyRes, req, res) => {
      proxyRes.headers['x-proxy-service'] = path.split('/')[2];
    },
  }));
});

app.get('/health/live', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

app.get('/health/ready', async (req, res) => {
  const checks = await Promise.allSettled([
    checkServiceHealth(process.env.AUTH_SERVICE_URL || 'http://localhost:3001'),
    checkServiceHealth(process.env.USER_SERVICE_URL || 'http://localhost:3002'),
    checkServiceHealth(process.env.CORE_SERVICE_URL || 'http://localhost:3003'),
    checkServiceHealth(process.env.NOTIFICATION_SERVICE_URL || 'http://localhost:3004'),
    checkServiceHealth(process.env.AUDIT_SERVICE_URL || 'http://localhost:3005'),
    checkServiceHealth(process.env.FEATURE_FLAG_SERVICE_URL || 'http://localhost:3006'),
  ]);

  const allHealthy = checks.every(check => check.status === 'fulfilled');
  
  res.json({
    status: allHealthy ? 'healthy' : 'degraded',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    checks: checks.map((check, index) => ({
      service: Object.keys(serviceProxies)[index],
      status: check.status === 'fulfilled' ? 'pass' : 'fail',
    })),
  });
});

async function checkServiceHealth(url: string): Promise<void> {
  const response = await fetch(`${url}/health/live`, {
    timeout: 5000,
  });
  if (!response.ok) {
    throw new Error(`Service health check failed: ${url}`);
  }
}

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
  logger.info({ port: PORT }, 'API Gateway started');
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
