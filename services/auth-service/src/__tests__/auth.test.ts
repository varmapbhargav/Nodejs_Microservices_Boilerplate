import request from 'supertest';
import { app } from '../index';
import { ApiResponse, AuthRequest, AuthResponse } from '@platform/shared-contracts';

describe('Auth Service', () => {
  describe('POST /api/v1/login', () => {
    it('should login successfully with valid credentials', async () => {
      const loginData: AuthRequest = {
        email: 'admin@example.com',
        password: 'password',
      };

      const response = await request(app)
        .post('/api/v1/login')
        .send(loginData)
        .expect(200);

      const body = response.body as ApiResponse<AuthResponse>;
      
      expect(body).toBeValidApiResponse();
      expect(body.success).toBe(true);
      expect(body.data).toBeDefined();
      expect(body.data?.accessToken).toBeDefined();
      expect(body.data?.refreshToken).toBeDefined();
      expect(body.data?.user).toBeDefined();
      expect(body.data?.user.email).toBe('admin@example.com');
    });

    it('should reject login with invalid credentials', async () => {
      const loginData: AuthRequest = {
        email: 'admin@example.com',
        password: 'wrong-password',
      };

      const response = await request(app)
        .post('/api/v1/login')
        .send(loginData)
        .expect(401);

      const body = response.body as ApiResponse;
      
      expect(body).toBeValidApiResponse();
      expect(body.success).toBe(false);
      expect(body.error?.code).toBe('INVALID_CREDENTIALS');
    });

    it('should reject login with missing email', async () => {
      const loginData = {
        password: 'password',
      };

      const response = await request(app)
        .post('/api/v1/login')
        .send(loginData)
        .expect(400);

      const body = response.body as ApiResponse;
      
      expect(body).toBeValidApiResponse();
      expect(body.success).toBe(false);
      expect(body.error?.code).toBe('INVALID_CREDENTIALS');
    });

    it('should reject login with missing password', async () => {
      const loginData = {
        email: 'admin@example.com',
      };

      const response = await request(app)
        .post('/api/v1/login')
        .send(loginData)
        .expect(400);

      const body = response.body as ApiResponse;
      
      expect(body).toBeValidApiResponse();
      expect(body.success).toBe(false);
      expect(body.error?.code).toBe('INVALID_CREDENTIALS');
    });
  });

  describe('POST /api/v1/refresh', () => {
    let refreshToken: string;

    beforeEach(async () => {
      // Login to get refresh token
      const loginResponse = await request(app)
        .post('/api/v1/login')
        .send({
          email: 'admin@example.com',
          password: 'password',
        });

      const loginBody = loginResponse.body as ApiResponse<AuthResponse>;
      refreshToken = loginBody.data?.refreshToken || '';
    });

    it('should refresh token successfully', async () => {
      const response = await request(app)
        .post('/api/v1/refresh')
        .send({ refreshToken })
        .expect(200);

      const body = response.body as ApiResponse<AuthResponse>;
      
      expect(body).toBeValidApiResponse();
      expect(body.success).toBe(true);
      expect(body.data?.accessToken).toBeDefined();
      expect(body.data?.refreshToken).toBeDefined();
    });

    it('should reject refresh with invalid token', async () => {
      const response = await request(app)
        .post('/api/v1/refresh')
        .send({ refreshToken: 'invalid-token' })
        .expect(401);

      const body = response.body as ApiResponse;
      
      expect(body).toBeValidApiResponse();
      expect(body.success).toBe(false);
      expect(body.error?.code).toBe('INVALID_REFRESH_TOKEN');
    });

    it('should reject refresh with missing token', async () => {
      const response = await request(app)
        .post('/api/v1/refresh')
        .send({})
        .expect(401);

      const body = response.body as ApiResponse;
      
      expect(body).toBeValidApiResponse();
      expect(body.success).toBe(false);
      expect(body.error?.code).toBe('INVALID_REFRESH_TOKEN');
    });
  });

  describe('POST /api/v1/logout', () => {
    let accessToken: string;

    beforeEach(async () => {
      // Login to get access token
      const loginResponse = await request(app)
        .post('/api/v1/login')
        .send({
          email: 'admin@example.com',
          password: 'password',
        });

      const loginBody = loginResponse.body as ApiResponse<AuthResponse>;
      accessToken = loginBody.data?.accessToken || '';
    });

    it('should logout successfully', async () => {
      const response = await request(app)
        .post('/api/v1/logout')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({})
        .expect(200);

      const body = response.body as ApiResponse;
      
      expect(body).toBeValidApiResponse();
      expect(body.success).toBe(true);
      expect(body.data?.message).toBe('Logged out successfully');
    });

    it('should logout without token', async () => {
      const response = await request(app)
        .post('/api/v1/logout')
        .send({})
        .expect(200);

      const body = response.body as ApiResponse;
      
      expect(body).toBeValidApiResponse();
      expect(body.success).toBe(true);
    });
  });

  describe('GET /api/v1/verify', () => {
    let accessToken: string;

    beforeEach(async () => {
      // Login to get access token
      const loginResponse = await request(app)
        .post('/api/v1/login')
        .send({
          email: 'admin@example.com',
          password: 'password',
        });

      const loginBody = loginResponse.body as ApiResponse<AuthResponse>;
      accessToken = loginBody.data?.accessToken || '';
    });

    it('should verify token successfully', async () => {
      const response = await request(app)
        .get('/api/v1/verify')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      const body = response.body as ApiResponse;
      
      expect(body).toBeValidApiResponse();
      expect(body.success).toBe(true);
      expect(body.data).toBeDefined();
      expect(body.data?.userId).toBeDefined();
      expect(body.data?.email).toBe('admin@example.com');
      expect(body.data?.role).toBeDefined();
    });

    it('should reject verification with missing token', async () => {
      const response = await request(app)
        .get('/api/v1/verify')
        .expect(401);

      const body = response.body as ApiResponse;
      
      expect(body).toBeValidApiResponse();
      expect(body.success).toBe(false);
      expect(body.error?.code).toBe('MISSING_TOKEN');
    });

    it('should reject verification with invalid token', async () => {
      const response = await request(app)
        .get('/api/v1/verify')
        .set('Authorization', 'Bearer invalid-token')
        .expect(401);

      const body = response.body as ApiResponse;
      
      expect(body).toBeValidApiResponse();
      expect(body.success).toBe(false);
      expect(body.error?.code).toBe('INVALID_TOKEN');
    });
  });

  describe('Health Endpoints', () => {
    describe('GET /health/live', () => {
      it('should return healthy status', async () => {
        const response = await request(app)
          .get('/health/live')
          .expect(200);

        expect(response.body).toHaveProperty('status', 'healthy');
        expect(response.body).toHaveProperty('timestamp');
      });
    });

    describe('GET /health/ready', () => {
      it('should return ready status with checks', async () => {
        const response = await request(app)
          .get('/health/ready')
          .expect(200);

        const body = response.body;
        
        expect(body).toBeHealthyResponse();
        expect(body.checks).toBeDefined();
        expect(body.checks.database).toBe('pass');
        expect(body.checks.cache).toBe('pass');
        expect(body.checks.messaging).toBe('pass');
        expect(body.checks.external).toBe('pass');
        expect(body.uptime).toBeDefined();
        expect(body.memory).toBeDefined();
      });
    });
  });

  describe('Error Handling', () => {
    it('should return 404 for unknown endpoints', async () => {
      const response = await request(app)
        .get('/unknown-endpoint')
        .expect(404);

      const body = response.body as ApiResponse;
      
      expect(body).toBeValidApiResponse();
      expect(body.success).toBe(false);
      expect(body.error?.code).toBe('NOT_FOUND');
    });

    it('should handle malformed JSON', async () => {
      const response = await request(app)
        .post('/api/v1/login')
        .set('Content-Type', 'application/json')
        .send('{"invalid": json}')
        .expect(400);

      expect(response.body).toBeDefined();
    });
  });
});
