import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { Request, Response, NextFunction } from 'express';

// Enterprise Security Configuration
export const securityConfig = {
  // Helmet configuration for security headers
  helmet: helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", "data:", "https:"],
        connectSrc: ["'self'"],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        mediaSrc: ["'self'"],
        frameSrc: ["'none'"],
        childSrc: ["'none'"],
        workerSrc: ["'self'"],
        manifestSrc: ["'self'"],
        upgradeInsecureRequests: [],
      },
    },
    crossOriginEmbedderPolicy: false,
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true,
    },
    noSniff: true,
    frameguard: { action: 'deny' },
    xssFilter: true,
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    permittedCrossDomainPolicies: false,
    ieNoOpen: true,
    dnsPrefetchControl: { allow: false },
  }),

  // Rate limiting configuration
  rateLimit: rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Limit each IP to 100 requests per windowMs
    message: {
      error: 'Too many requests from this IP, please try again later.',
    },
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req: Request) => {
      // Skip rate limiting for health checks
      return req.path.startsWith('/health');
    },
  }),

  // Strict rate limiting for authentication endpoints
  authRateLimit: rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // Limit each IP to 5 auth requests per windowMs
    message: {
      error: 'Too many authentication attempts, please try again later.',
    },
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: true,
  }),

  // API key validation middleware
  validateApiKey: (req: Request, res: Response, next: NextFunction) => {
    const apiKey = req.headers['x-api-key'] as string;
    const validApiKeys = process.env.VALID_API_KEYS?.split(',') || [];
    
    if (validApiKeys.length > 0 && !validApiKeys.includes(apiKey)) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'INVALID_API_KEY',
          message: 'Invalid or missing API key',
        },
      });
    }
    
    next();
  },

  // CORS configuration for enterprise
  cors: {
    origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
      const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') || [];
      
      // Allow requests with no origin (mobile apps, curl, etc.)
      if (!origin) return callback(null, true);
      
      if (allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'), false);
      }
    },
    credentials: true,
    optionsSuccessStatus: 200,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: [
      'Origin',
      'X-Requested-With',
      'Content-Type',
      'Accept',
      'Authorization',
      'X-API-Key',
      'X-Request-ID',
    ],
    exposedHeaders: ['X-Total-Count', 'X-Request-ID'],
  },

  // Request size limits
  requestSizeLimit: {
    json: { limit: '10mb' },
    urlencoded: { limit: '10mb', extended: true },
    text: { limit: '10mb' },
  },

  // Security headers middleware
  securityHeaders: (req: Request, res: Response, next: NextFunction) => {
    // Custom security headers
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
    
    // Request ID for tracing
    const requestId = req.headers['x-request-id'] as string || 
                     `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    res.setHeader('X-Request-ID', requestId);
    req.headers['x-request-id'] = requestId;
    
    next();
  },

  // Input validation middleware
  validateInput: (schema: any) => {
    return (req: Request, res: Response, next: NextFunction) => {
      const { error } = schema.validate(req.body);
      if (error) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid input data',
            details: error.details.map((detail: any) => ({
              field: detail.path.join('.'),
              message: detail.message,
            })),
          },
        });
      }
      next();
    };
  },

  // IP whitelist middleware
  ipWhitelist: (req: Request, res: Response, next: NextFunction) => {
    const allowedIPs = process.env.ALLOWED_IPS?.split(',') || [];
    const clientIP = req.ip || req.connection.remoteAddress || 
                     req.headers['x-forwarded-for'] as string;
    
    if (allowedIPs.length > 0 && !allowedIPs.includes(clientIP)) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'IP_NOT_ALLOWED',
          message: 'Access denied from this IP address',
        },
      });
    }
    
    next();
  },

  // Audit logging middleware
  auditLog: (req: Request, res: Response, next: NextFunction) => {
    const startTime = Date.now();
    
    // Log request
    console.log(JSON.stringify({
      timestamp: new Date().toISOString(),
      type: 'REQUEST',
      method: req.method,
      url: req.url,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
      requestId: req.headers['x-request-id'],
    }));
    
    // Override res.json to log response
    const originalJson = res.json;
    res.json = function(data: any) {
      const duration = Date.now() - startTime;
      
      console.log(JSON.stringify({
        timestamp: new Date().toISOString(),
        type: 'RESPONSE',
        method: req.method,
        url: req.url,
        statusCode: res.statusCode,
        duration: `${duration}ms`,
        requestId: req.headers['x-request-id'],
        success: data?.success || false,
      }));
      
      return originalJson.call(this, data);
    };
    
    next();
  },
};

export default securityConfig;
