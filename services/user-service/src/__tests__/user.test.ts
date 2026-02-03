import request from 'supertest';
import { app } from '../index';
import { ApiResponse, CreateUserRequest, UpdateUserRequest, UserDto } from '@platform/shared-contracts';

describe('User Service', () => {
  describe('POST /api/v1/users', () => {
    it('should create user successfully', async () => {
      const userData: CreateUserRequest = {
        email: 'test@example.com',
        firstName: 'Test',
        lastName: 'User',
        password: 'password123',
        role: 'user',
      };

      const response = await request(app)
        .post('/api/v1/users')
        .send(userData)
        .expect(201);

      const body = response.body as ApiResponse<UserDto>;
      
      expect(body).toBeValidApiResponse();
      expect(body.success).toBe(true);
      expect(body.data).toBeDefined();
      expect(body.data?.email).toBe('test@example.com');
      expect(body.data?.firstName).toBe('Test');
      expect(body.data?.lastName).toBe('User');
      expect(body.data?.role).toBe('user');
      expect(body.data?.status).toBe('active');
    });

    it('should reject user creation with invalid email', async () => {
      const userData = {
        email: 'invalid-email',
        firstName: 'Test',
        lastName: 'User',
        password: 'password123',
      };

      const response = await request(app)
        .post('/api/v1/users')
        .send(userData)
        .expect(400);

      const body = response.body as ApiResponse;
      
      expect(body).toBeValidApiResponse();
      expect(body.success).toBe(false);
      expect(body.error?.code).toBe('VALIDATION_ERROR');
    });

    it('should reject user creation with short password', async () => {
      const userData = {
        email: 'test@example.com',
        firstName: 'Test',
        lastName: 'User',
        password: '123',
      };

      const response = await request(app)
        .post('/api/v1/users')
        .send(userData)
        .expect(400);

      const body = response.body as ApiResponse;
      
      expect(body).toBeValidApiResponse();
      expect(body.success).toBe(false);
      expect(body.error?.code).toBe('VALIDATION_ERROR');
    });

    it('should reject duplicate user creation', async () => {
      const userData: CreateUserRequest = {
        email: 'admin@example.com',
        firstName: 'Test',
        lastName: 'User',
        password: 'password123',
      };

      const response = await request(app)
        .post('/api/v1/users')
        .send(userData)
        .expect(409);

      const body = response.body as ApiResponse;
      
      expect(body).toBeValidApiResponse();
      expect(body.success).toBe(false);
      expect(body.error?.code).toBe('USER_EXISTS');
    });
  });

  describe('GET /api/v1/users/:id', () => {
    it('should get user by ID successfully', async () => {
      const response = await request(app)
        .get('/api/v1/users/1')
        .expect(200);

      const body = response.body as ApiResponse<UserDto>;
      
      expect(body).toBeValidApiResponse();
      expect(body.success).toBe(true);
      expect(body.data).toBeDefined();
      expect(body.data?.id).toBe('1');
      expect(body.data?.email).toBe('admin@example.com');
    });

    it('should return 404 for non-existent user', async () => {
      const response = await request(app)
        .get('/api/v1/users/non-existent-id')
        .expect(404);

      const body = response.body as ApiResponse;
      
      expect(body).toBeValidApiResponse();
      expect(body.success).toBe(false);
      expect(body.error?.code).toBe('USER_NOT_FOUND');
    });
  });

  describe('PUT /api/v1/users/:id', () => {
    it('should update user successfully', async () => {
      const updateData: UpdateUserRequest = {
        firstName: 'Updated',
        lastName: 'Name',
      };

      const response = await request(app)
        .put('/api/v1/users/1')
        .send(updateData)
        .expect(200);

      const body = response.body as ApiResponse<UserDto>;
      
      expect(body).toBeValidApiResponse();
      expect(body.success).toBe(true);
      expect(body.data).toBeDefined();
      expect(body.data?.firstName).toBe('Updated');
      expect(body.data?.lastName).toBe('Name');
    });

    it('should return 404 for non-existent user update', async () => {
      const updateData: UpdateUserRequest = {
        firstName: 'Updated',
      };

      const response = await request(app)
        .put('/api/v1/users/non-existent-id')
        .send(updateData)
        .expect(404);

      const body = response.body as ApiResponse;
      
      expect(body).toBeValidApiResponse();
      expect(body.success).toBe(false);
      expect(body.error?.code).toBe('USER_NOT_FOUND');
    });

    it('should reject update with invalid first name', async () => {
      const updateData: UpdateUserRequest = {
        firstName: 'A',
      };

      const response = await request(app)
        .put('/api/v1/users/1')
        .send(updateData)
        .expect(400);

      const body = response.body as ApiResponse;
      
      expect(body).toBeValidApiResponse();
      expect(body.success).toBe(false);
      expect(body.error?.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('DELETE /api/v1/users/:id', () => {
    it('should delete user successfully', async () => {
      const response = await request(app)
        .delete('/api/v1/users/1')
        .expect(200);

      const body = response.body as ApiResponse;
      
      expect(body).toBeValidApiResponse();
      expect(body.success).toBe(true);
      expect(body.data?.message).toBe('User deleted successfully');
    });

    it('should return 404 for non-existent user deletion', async () => {
      const response = await request(app)
        .delete('/api/v1/users/non-existent-id')
        .expect(404);

      const body = response.body as ApiResponse;
      
      expect(body).toBeValidApiResponse();
      expect(body.success).toBe(false);
      expect(body.error?.code).toBe('USER_NOT_FOUND');
    });
  });

  describe('GET /api/v1/users', () => {
    it('should get paginated users list', async () => {
      const response = await request(app)
        .get('/api/v1/users')
        .expect(200);

      const body = response.body;
      
      expect(body.success).toBe(true);
      expect(body.data).toBeDefined();
      expect(Array.isArray(body.data)).toBe(true);
      expect(body.pagination).toBeDefined();
      expect(body.pagination.page).toBeDefined();
      expect(body.pagination.limit).toBeDefined();
      expect(body.pagination.total).toBeDefined();
      expect(body.pagination.totalPages).toBeDefined();
      expect(body.pagination.hasNext).toBeDefined();
      expect(body.pagination.hasPrev).toBeDefined();
    });

    it('should filter users by status', async () => {
      const response = await request(app)
        .get('/api/v1/users?status=active')
        .expect(200);

      const body = response.body;
      
      expect(body.success).toBe(true);
      expect(body.data).toBeDefined();
      expect(Array.isArray(body.data)).toBe(true);
    });

    it('should paginate users correctly', async () => {
      const response = await request(app)
        .get('/api/v1/users?page=1&limit=5')
        .expect(200);

      const body = response.body;
      
      expect(body.success).toBe(true);
      expect(body.pagination.page).toBe(1);
      expect(body.pagination.limit).toBe(5);
      expect(body.data.length).toBeLessThanOrEqual(5);
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
        .post('/api/v1/users')
        .set('Content-Type', 'application/json')
        .send('{"invalid": json}')
        .expect(400);

      expect(response.body).toBeDefined();
    });
  });
});
