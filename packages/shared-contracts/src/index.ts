export interface ApiResponse<T = any> {
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

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

export interface HealthResponse {
  status: 'healthy' | 'unhealthy' | 'degraded';
  timestamp: string;
  version: string;
  checks: {
    database: 'pass' | 'fail' | 'warn';
    cache: 'pass' | 'fail' | 'warn';
    messaging: 'pass' | 'fail' | 'warn';
    external: 'pass' | 'fail' | 'warn';
  };
  uptime: number;
  memory: {
    used: number;
    total: number;
    percentage: number;
  };
}

export interface UserDto {
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

export interface CreateUserRequest {
  email: string;
  firstName: string;
  lastName: string;
  password: string;
  role?: string;
}

export interface UpdateUserRequest {
  firstName?: string;
  lastName?: string;
  role?: string;
  status?: 'active' | 'inactive' | 'suspended';
}

export interface AuthRequest {
  email: string;
  password: string;
  mfaCode?: string;
}

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  tokenType: string;
  expiresIn: number;
  user: UserDto;
}

export interface RefreshTokenRequest {
  refreshToken: string;
}

export interface TransactionDto {
  id: string;
  userId: string;
  type: string;
  amount: number;
  currency: string;
  status: 'pending' | 'completed' | 'failed' | 'cancelled';
  createdAt: string;
  updatedAt: string;
  metadata?: Record<string, any>;
}

export interface CreateTransactionRequest {
  userId: string;
  type: string;
  amount: number;
  currency: string;
  metadata?: Record<string, any>;
}

export interface NotificationDto {
  id: string;
  userId: string;
  type: 'email' | 'sms' | 'push';
  subject: string;
  content: string;
  status: 'pending' | 'sent' | 'failed';
  sentAt?: string;
  createdAt: string;
  metadata?: Record<string, any>;
}

export interface CreateNotificationRequest {
  userId: string;
  type: 'email' | 'sms' | 'push';
  subject: string;
  content: string;
  metadata?: Record<string, any>;
}

export interface AuditLogDto {
  id: string;
  userId?: string;
  action: string;
  resource: string;
  resourceId?: string;
  ipAddress: string;
  userAgent: string;
  timestamp: string;
  metadata?: Record<string, any>;
}

export interface FeatureFlagDto {
  id: string;
  key: string;
  name: string;
  description: string;
  enabled: boolean;
  conditions: Record<string, any>;
  createdAt: string;
  updatedAt: string;
}

export interface CreateFeatureFlagRequest {
  key: string;
  name: string;
  description: string;
  enabled?: boolean;
  conditions?: Record<string, any>;
}

export interface UpdateFeatureFlagRequest {
  name?: string;
  description?: string;
  enabled?: boolean;
  conditions?: Record<string, any>;
}

export * from './resilience';
