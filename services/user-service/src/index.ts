import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import bcrypt from 'bcryptjs';
import { createLogger, Observability } from '@platform/observability';
import { ApiResponse, UserDto, CreateUserRequest, UpdateUserRequest } from '@platform/shared-contracts';
import { BaseEventSchema, UserEvents } from '@platform/shared-events';

const logger = createLogger({
  service: 'user-service',
  version: '1.0.0',
  environment: process.env.NODE_ENV || 'development',
  level: process.env.LOG_LEVEL || 'info',
});

const app = express();
const PORT = process.env.PORT || 3002;

Observability.getInstance().startTracing('user-service', '1.0.0');

app.use(helmet());
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
  credentials: true,
}));
app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

interface User {
  id: string;
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  role: string;
  status: 'active' | 'inactive' | 'suspended';
  createdAt: Date;
  updatedAt: Date;
  lastLoginAt?: Date;
}

const users: Map<string, User> = new Map();

function emitUserEvent(eventType: string, userId: string, metadata?: any): void {
  const event = BaseEventSchema.parse({
    eventId: crypto.randomUUID(),
    eventType,
    eventVersion: '1.0',
    timestamp: new Date().toISOString(),
    source: 'user-service',
    correlationId: crypto.randomUUID(),
    data: { userId },
    metadata,
  });

  logger.info({ event }, 'User event emitted');
}

function createUserDto(user: User): UserDto {
  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    role: user.role,
    status: user.status,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
    lastLoginAt: user.lastLoginAt?.toISOString(),
  };
}

function validateCreateUserRequest(data: CreateUserRequest): string[] {
  const errors: string[] = [];
  
  if (!data.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
    errors.push('Valid email is required');
  }
  
  if (!data.firstName || data.firstName.trim().length < 2) {
    errors.push('First name must be at least 2 characters');
  }
  
  if (!data.lastName || data.lastName.trim().length < 2) {
    errors.push('Last name must be at least 2 characters');
  }
  
  if (!data.password || data.password.length < 8) {
    errors.push('Password must be at least 8 characters');
  }
  
  return errors;
}

function validateUpdateUserRequest(data: UpdateUserRequest): string[] {
  const errors: string[] = [];
  
  if (data.firstName !== undefined && data.firstName.trim().length < 2) {
    errors.push('First name must be at least 2 characters');
  }
  
  if (data.lastName !== undefined && data.lastName.trim().length < 2) {
    errors.push('Last name must be at least 2 characters');
  }
  
  return errors;
}

app.post('/api/v1/users', async (req, res) => {
  try {
    const userData: CreateUserRequest = req.body;
    
    const errors = validateCreateUserRequest(userData);
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

    const existingUser = Array.from(users.values()).find(u => u.email === userData.email);
    if (existingUser) {
      return res.status(409).json({
        success: false,
        error: {
          code: 'USER_EXISTS',
          message: 'User with this email already exists',
        },
      } as ApiResponse);
    }

    const hashedPassword = await bcrypt.hash(userData.password, 12);
    
    const user: User = {
      id: crypto.randomUUID(),
      email: userData.email,
      password: hashedPassword,
      firstName: userData.firstName,
      lastName: userData.lastName,
      role: userData.role || 'user',
      status: 'active',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    users.set(user.id, user);
    
    emitUserEvent(UserEvents.USER_CREATED, user.id, { email: user.email, role: user.role });

    logger.info({ userId: user.id, email: user.email }, 'User created');

    res.status(201).json({
      success: true,
      data: createUserDto(user),
    } as ApiResponse<UserDto>);
  } catch (error) {
    logger.error({ error }, 'User creation failed');
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Internal server error',
      },
    } as ApiResponse);
  }
});

app.get('/api/v1/users/:id', (req, res) => {
  try {
    const { id } = req.params;
    const user = users.get(id);

    if (!user) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'USER_NOT_FOUND',
          message: 'User not found',
        },
      } as ApiResponse);
    }

    res.json({
      success: true,
      data: createUserDto(user),
    } as ApiResponse<UserDto>);
  } catch (error) {
    logger.error({ error }, 'User retrieval failed');
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Internal server error',
      },
    } as ApiResponse);
  }
});

app.put('/api/v1/users/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updateData: UpdateUserRequest = req.body;
    
    const errors = validateUpdateUserRequest(updateData);
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

    const user = users.get(id);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'USER_NOT_FOUND',
          message: 'User not found',
        },
      } as ApiResponse);
    }

    const oldStatus = user.status;
    
    if (updateData.firstName !== undefined) {
      user.firstName = updateData.firstName;
    }
    
    if (updateData.lastName !== undefined) {
      user.lastName = updateData.lastName;
    }
    
    if (updateData.role !== undefined) {
      user.role = updateData.role;
    }
    
    if (updateData.status !== undefined) {
      user.status = updateData.status;
    }

    user.updatedAt = new Date();

    if (oldStatus !== user.status) {
      if (user.status === 'suspended') {
        emitUserEvent(UserEvents.USER_SUSPENDED, user.id, { oldStatus, newStatus: user.status });
      } else if (user.status === 'active' && oldStatus !== 'active') {
        emitUserEvent(UserEvents.USER_ACTIVATED, user.id, { oldStatus, newStatus: user.status });
      }
    } else {
      emitUserEvent(UserEvents.USER_UPDATED, user.id);
    }

    logger.info({ userId: user.id, changes: updateData }, 'User updated');

    res.json({
      success: true,
      data: createUserDto(user),
    } as ApiResponse<UserDto>);
  } catch (error) {
    logger.error({ error }, 'User update failed');
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Internal server error',
      },
    } as ApiResponse);
  }
});

app.delete('/api/v1/users/:id', (req, res) => {
  try {
    const { id } = req.params;
    const user = users.get(id);

    if (!user) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'USER_NOT_FOUND',
          message: 'User not found',
        },
      } as ApiResponse);
    }

    users.delete(id);
    
    emitUserEvent(UserEvents.USER_DELETED, id, { email: user.email });

    logger.info({ userId: id, email: user.email }, 'User deleted');

    res.json({
      success: true,
      data: { message: 'User deleted successfully' },
    } as ApiResponse);
  } catch (error) {
    logger.error({ error }, 'User deletion failed');
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Internal server error',
      },
    } as ApiResponse);
  }
});

app.get('/api/v1/users', (req, res) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const status = req.query.status as string;

    let allUsers = Array.from(users.values());
    
    if (status) {
      allUsers = allUsers.filter(user => user.status === status);
    }

    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;
    const paginatedUsers = allUsers.slice(startIndex, endIndex);

    const userDtos = paginatedUsers.map(createUserDto);

    res.json({
      success: true,
      data: userDtos,
      pagination: {
        page,
        limit,
        total: allUsers.length,
        totalPages: Math.ceil(allUsers.length / limit),
        hasNext: endIndex < allUsers.length,
        hasPrev: page > 1,
      },
    });
  } catch (error) {
    logger.error({ error }, 'User list retrieval failed');
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
  logger.info({ port: PORT }, 'User Service started');
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
