import request from 'supertest';
import { app } from '../index';

describe('Audit Service', () => {
  describe('Health Endpoints', () => {
    it('should return healthy status for live endpoint', async () => {
      const response = await request(app)
        .get('/health/live')
        .expect(200);

      expect(response.body).toHaveProperty('status', 'healthy');
      expect(response.body).toHaveProperty('timestamp');
    });

    it('should return healthy status for ready endpoint', async () => {
      const response = await request(app)
        .get('/health/ready')
        .expect(200);

      expect(response.body).toHaveProperty('status', 'healthy');
      expect(response.body).toHaveProperty('timestamp');
      expect(response.body).toHaveProperty('checks');
      expect(response.body).toHaveProperty('uptime');
      expect(response.body).toHaveProperty('memory');
    });
  });

  describe('Audit Endpoints', () => {
    it('should create audit log', async () => {
      const auditLog = {
        userId: 'user-123',
        action: 'USER_LOGIN',
        resource: '/api/v1/auth/login',
        metadata: {
          ipAddress: '192.168.1.1',
          userAgent: 'Mozilla/5.0',
        },
      };

      const response = await request(app)
        .post('/api/v1/audit/logs')
        .send(auditLog)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('auditId');
      expect(response.body.data).toHaveProperty('userId', auditLog.userId);
      expect(response.body.data).toHaveProperty('action', auditLog.action);
      expect(response.body.data).toHaveProperty('resource', auditLog.resource);
      expect(response.body.data).toHaveProperty('timestamp');
    });

    it('should get audit logs', async () => {
      const response = await request(app)
        .get('/api/v1/audit/logs')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('logs');
      expect(response.body.data).toHaveProperty('pagination');
      expect(Array.isArray(response.body.data.logs)).toBe(true);
    });

    it('should get audit log by ID', async () => {
      const auditId = 'audit-123';
      
      const response = await request(app)
        .get(`/api/v1/audit/logs/${auditId}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('auditId', auditId);
    });

    it('should search audit logs', async () => {
      const searchCriteria = {
        userId: 'user-123',
        action: 'USER_LOGIN',
        startDate: '2023-01-01T00:00:00.000Z',
        endDate: '2023-12-31T23:59:59.999Z',
      };

      const response = await request(app)
        .post('/api/v1/audit/logs/search')
        .send(searchCriteria)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('logs');
      expect(response.body.data).toHaveProperty('pagination');
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid audit log creation', async () => {
      const invalidAuditLog = {
        // Missing required fields
        action: 'USER_LOGIN',
      };

      const response = await request(app)
        .post('/api/v1/audit/logs')
        .send(invalidAuditLog)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toHaveProperty('code');
      expect(response.body.error).toHaveProperty('message');
    });

    it('should handle non-existent audit log retrieval', async () => {
      const nonExistentId = 'non-existent-id';
      
      const response = await request(app)
        .get(`/api/v1/audit/logs/${nonExistentId}`)
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toHaveProperty('code', 'AUDIT_LOG_NOT_FOUND');
    });

    it('should handle invalid search criteria', async () => {
      const invalidSearchCriteria = {
        userId: 123, // Should be string
        action: 'USER_LOGIN',
      };

      const response = await request(app)
        .post('/api/v1/audit/logs/search')
        .send(invalidSearchCriteria)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toHaveProperty('code', 'VALIDATION_ERROR');
    });
  });

  describe('Rate Limiting', () => {
    it('should handle rate limiting', async () => {
      // Make multiple requests to trigger rate limiting
      const promises = Array(101).fill(null).map(() =>
        request(app).get('/api/v1/audit/logs')
      );

      const responses = await Promise.allSettled(promises);
      
      // Some requests should be rate limited
      const rateLimitedResponses = responses.filter(
        (result) => result.status === 'fulfilled' && result.value.status === 429
      );
      
      expect(rateLimitedResponses.length).toBeGreaterThan(0);
    });
  });

  describe('Security', () => {
    it('should handle CORS headers', async () => {
      const response = await request(app)
        .get('/health/live')
        .set('Origin', 'http://localhost:3000')
        .expect(200);

      expect(response.headers).toHaveProperty('access-control-allow-origin');
    });

    it('should have security headers', async () => {
      const response = await request(app)
        .get('/health/live')
        .expect(200);

      expect(response.headers).toHaveProperty('x-content-type-options');
      expect(response.headers).toHaveProperty('x-frame-options');
      expect(response.headers).toHaveProperty('x-xss-protection');
    });
  });

  describe('Performance', () => {
    it('should respond within acceptable time limits', async () => {
      const startTime = Date.now();
      
      await request(app)
        .get('/api/v1/audit/logs')
        .expect(200);
      
      const responseTime = Date.now() - startTime;
      expect(responseTime).toBeLessThan(1000); // Should respond within 1 second
    });

    it('should handle concurrent requests', async () => {
      const concurrentRequests = 50;
      const promises = Array(concurrentRequests).fill(null).map(() =>
        request(app).get('/api/v1/audit/logs')
      );

      const responses = await Promise.allSettled(promises);
      
      // All requests should succeed
      const successfulResponses = responses.filter(
        (result) => result.status === 'fulfilled' && result.value.status === 200
      );
      
      expect(successfulResponses.length).toBe(concurrentRequests);
    });
  });
});
