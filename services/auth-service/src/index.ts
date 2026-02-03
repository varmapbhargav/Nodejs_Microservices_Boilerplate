import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';

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

interface AuthRequest {
  email: string;
  password: string;
  mfaCode?: string;
}

interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  tokenType: string;
  expiresIn: number;
  user: UserDto;
}

interface UserDto {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  status: 'active' | 'inactive' | 'suspended';
  createdAt: string;
  updatedAt: string;
  lastLoginAt?: string;
}

// Simple logger implementation
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
  service: 'auth-service',
  version: '1.0.0',
  environment: process.env.NODE_ENV || 'development',
  level: process.env.LOG_LEVEL || 'info',
});

const app = express();
const PORT = Number(process.env.PORT) || 3001;
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '1h';
const REFRESH_TOKEN_EXPIRES_IN = process.env.REFRESH_TOKEN_EXPIRES_IN || '7d';

Observability.getInstance().startTracing();

app.use(helmet());
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
  credentials: true,
}));
app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Mock user database
const users = new Map<string, UserDto>();
users.set('1', {
  id: '1',
  email: 'admin@example.com',
  firstName: 'Admin',
  lastName: 'User',
  role: 'admin',
  status: 'active',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
});

// Mock refresh token storage
const refreshTokens = new Map<string, { userId: string; expiresAt: Date }>();

// Helper functions
const generateTokens = (user: UserDto) => {
  const accessToken = jwt.sign(
    { userId: user.id, email: user.email, role: user.role },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
  
  const refreshToken = jwt.sign(
    { userId: user.id, type: 'refresh' },
    JWT_SECRET,
    { expiresIn: REFRESH_TOKEN_EXPIRES_IN }
  );
  
  return { accessToken, refreshToken };
};

const verifyToken = (token: string) => {
  try {
    return jwt.verify(token, JWT_SECRET) as any;
  } catch (error) {
    throw new Error('Invalid token');
  }
};

// Routes
app.post('/api/v1/login', async (req, res) => {
  try {
    const { email, password } = req.body as AuthRequest;
    
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_CREDENTIALS',
          message: 'Email and password are required',
        },
      } as ApiResponse);
    }

    // Find user (mock implementation)
    const user = Array.from(users.values()).find(u => u.email === email);
    if (!user) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'INVALID_CREDENTIALS',
          message: 'Invalid email or password',
        },
      } as ApiResponse);
    }

    // Verify password (mock implementation - in production, use bcrypt.compare)
    if (password !== 'password') {
      return res.status(401).json({
        success: false,
        error: {
          code: 'INVALID_CREDENTIALS',
          message: 'Invalid email or password',
        },
      } as ApiResponse);
    }

    // Generate tokens
    const { accessToken, refreshToken } = generateTokens(user);
    
    // Store refresh token
    refreshTokens.set(refreshToken, {
      userId: user.id,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
    });

    // Update user last login
    user.lastLoginAt = new Date().toISOString();
    user.updatedAt = new Date().toISOString();

    logger.info(`User logged in: ${email}`);

    res.json({
      success: true,
      data: {
        accessToken,
        refreshToken,
        tokenType: 'Bearer',
        expiresIn: 3600, // 1 hour in seconds
        user,
      },
    } as ApiResponse<AuthResponse>);
  } catch (error) {
    logger.error('Login error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Internal server error',
      },
    } as ApiResponse);
  }
});

app.post('/api/v1/refresh', async (req, res) => {
  try {
    const { refreshToken } = req.body;
    
    if (!refreshToken) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'INVALID_REFRESH_TOKEN',
          message: 'Refresh token is required',
        },
      } as ApiResponse);
    }

    // Verify refresh token
    const decoded = verifyToken(refreshToken);
    if (decoded.type !== 'refresh') {
      return res.status(401).json({
        success: false,
        error: {
          code: 'INVALID_REFRESH_TOKEN',
          message: 'Invalid refresh token',
        },
      } as ApiResponse);
    }

    // Check if refresh token exists and is not expired
    const tokenData = refreshTokens.get(refreshToken);
    if (!tokenData || tokenData.expiresAt < new Date()) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'INVALID_REFRESH_TOKEN',
          message: 'Refresh token expired or invalid',
        },
      } as ApiResponse);
    }

    // Find user
    const user = users.get(decoded.userId);
    if (!user) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'INVALID_REFRESH_TOKEN',
          message: 'User not found',
        },
      } as ApiResponse);
    }

    // Generate new tokens
    const { accessToken, refreshToken: newRefreshToken } = generateTokens(user);
    
    // Remove old refresh token and store new one
    refreshTokens.delete(refreshToken);
    refreshTokens.set(newRefreshToken, {
      userId: user.id,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });

    logger.info(`Token refreshed for user: ${user.email}`);

    res.json({
      success: true,
      data: {
        accessToken,
        refreshToken: newRefreshToken,
        tokenType: 'Bearer',
        expiresIn: 3600,
        user,
      },
    } as ApiResponse<AuthResponse>);
  } catch (error) {
    logger.error('Token refresh error:', error);
    res.status(401).json({
      success: false,
      error: {
        code: 'INVALID_REFRESH_TOKEN',
        message: 'Invalid refresh token',
      },
    } as ApiResponse);
  }
});

app.post('/api/v1/logout', async (req, res) => {
  try {
    const { refreshToken } = req.body;
    
    if (refreshToken) {
      // Remove refresh token
      refreshTokens.delete(refreshToken);
    }

    logger.info('User logged out');

    res.json({
      success: true,
      data: {
        message: 'Logged out successfully',
      },
    } as ApiResponse);
  } catch (error) {
    logger.error('Logout error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Internal server error',
      },
    } as ApiResponse);
  }
});

app.get('/api/v1/verify', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'MISSING_TOKEN',
          message: 'Authorization token is required',
        },
      } as ApiResponse);
    }

    const token = authHeader.substring(7);
    const decoded = verifyToken(token);
    
    const user = users.get(decoded.userId);
    if (!user) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'INVALID_TOKEN',
          message: 'Invalid token',
        },
      } as ApiResponse);
    }

    res.json({
      success: true,
      data: {
        userId: user.id,
        email: user.email,
        role: user.role,
      },
    } as ApiResponse);
  } catch (error) {
    res.status(401).json({
      success: false,
      error: {
        code: 'INVALID_TOKEN',
        message: 'Invalid token',
      },
    } as ApiResponse);
  }
});

// Health endpoints
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

// Error handler
app.use((err: any, req: any, res: any, next: any) => {
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
app.use((req: any, res: any) => {
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
  logger.info(`Auth service running on port ${PORT}`);
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
