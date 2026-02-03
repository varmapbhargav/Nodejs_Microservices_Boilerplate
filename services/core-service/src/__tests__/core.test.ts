import request from 'supertest';
import { app } from '../index';

describe('Core Service', () => {
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

  describe('Transaction Endpoints', () => {
    it('should create a new transaction', async () => {
      const transaction = {
        userId: 'user-123',
        amount: 1000,
        currency: 'USD',
        type: 'PAYMENT',
        description: 'Test transaction',
      };

      const response = await request(app)
        .post('/api/v1/transactions')
        .send(transaction)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('transactionId');
      expect(response.body.data).toHaveProperty('userId', transaction.userId);
      expect(response.body.data).toHaveProperty('amount', transaction.amount);
      expect(response.body.data).toHaveProperty('currency', transaction.currency);
      expect(response.body.data).toHaveProperty('type', transaction.type);
      expect(response.body.data).toHaveProperty('status', 'PENDING');
      expect(response.body.data).toHaveProperty('createdAt');
    });

    it('should get transaction by ID', async () => {
      const transactionId = 'transaction-123';
      
      const response = await request(app)
        .get(`/api/v1/transactions/${transactionId}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('transactionId', transactionId);
      expect(response.body.data).toHaveProperty('status');
      expect(response.body.data).toHaveProperty('amount');
    });

    it('should get user transactions', async () => {
      const userId = 'user-123';
      
      const response = await request(app)
        .get(`/api/v1/users/${userId}/transactions`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('transactions');
      expect(response.body.data).toHaveProperty('pagination');
      expect(Array.isArray(response.body.data.transactions)).toBe(true);
    });

    it('should update transaction status', async () => {
      const transactionId = 'transaction-123';
      const updateData = {
        status: 'COMPLETED',
        metadata: {
          processedAt: new Date().toISOString(),
        },
      };

      const response = await request(app)
        .patch(`/api/v1/transactions/${transactionId}/status`)
        .send(updateData)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('transactionId', transactionId);
      expect(response.body.data).toHaveProperty('status', updateData.status);
    });
  });

  describe('Business Logic Endpoints', () => {
    it('should calculate transaction fees', async () => {
      const feeRequest = {
        amount: 1000,
        currency: 'USD',
        type: 'PAYMENT',
        userId: 'user-123',
      };

      const response = await request(app)
        .post('/api/v1/transactions/calculate-fee')
        .send(feeRequest)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('fee');
      expect(response.body.data).toHaveProperty('totalAmount');
      expect(typeof response.body.data.fee).toBe('number');
      expect(response.body.data.fee).toBeGreaterThanOrEqual(0);
    });

    it('should validate transaction limits', async () => {
      const validationRequest = {
        userId: 'user-123',
        amount: 50000,
        currency: 'USD',
        type: 'PAYMENT',
      };

      const response = await request(app)
        .post('/api/v1/transactions/validate-limits')
        .send(validationRequest)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('isValid');
      expect(response.body.data).toHaveProperty('limits');
      expect(typeof response.body.data.isValid).toBe('boolean');
    });

    it('should get transaction statistics', async () => {
      const response = await request(app)
        .get('/api/v1/transactions/statistics')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('totalTransactions');
      expect(response.body.data).toHaveProperty('totalVolume');
      expect(response.body.data).toHaveProperty('averageAmount');
      expect(response.body.data).toHaveProperty('successRate');
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid transaction creation', async () => {
      const invalidTransaction = {
        // Missing required fields
        amount: 1000,
        currency: 'USD',
      };

      const response = await request(app)
        .post('/api/v1/transactions')
        .send(invalidTransaction)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toHaveProperty('code');
      expect(response.body.error).toHaveProperty('message');
    });

    it('should handle non-existent transaction retrieval', async () => {
      const nonExistentId = 'non-existent-id';
      
      const response = await request(app)
        .get(`/api/v1/transactions/${nonExistentId}`)
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toHaveProperty('code', 'TRANSACTION_NOT_FOUND');
    });

    it('should handle invalid transaction status update', async () => {
      const transactionId = 'transaction-123';
      const invalidUpdate = {
        status: 'INVALID_STATUS',
      };

      const response = await request(app)
        .patch(`/api/v1/transactions/${transactionId}/status`)
        .send(invalidUpdate)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toHaveProperty('code', 'VALIDATION_ERROR');
    });
  });

  describe('Rate Limiting', () => {
    it('should handle rate limiting on transaction creation', async () => {
      const transaction = {
        userId: 'user-123',
        amount: 100,
        currency: 'USD',
        type: 'PAYMENT',
        description: 'Test transaction',
      };

      // Make multiple requests to trigger rate limiting
      const promises = Array(101).fill(null).map(() =>
        request(app)
          .post('/api/v1/transactions')
          .send(transaction)
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

    it('should sanitize input data', async () => {
      const maliciousTransaction = {
        userId: '<script>alert("xss")</script>',
        amount: 1000,
        currency: 'USD',
        type: 'PAYMENT',
        description: '<img src="x" onerror="alert(1)">',
      };

      const response = await request(app)
        .post('/api/v1/transactions')
        .send(maliciousTransaction)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toHaveProperty('code', 'VALIDATION_ERROR');
    });
  });

  describe('Performance', () => {
    it('should respond within acceptable time limits', async () => {
      const startTime = Date.now();
      
      await request(app)
        .get('/api/v1/transactions')
        .expect(200);
      
      const responseTime = Date.now() - startTime;
      expect(responseTime).toBeLessThan(1000); // Should respond within 1 second
    });

    it('should handle concurrent requests', async () => {
      const concurrentRequests = 50;
      const promises = Array(concurrentRequests).fill(null).map(() =>
        request(app).get('/api/v1/transactions')
      );

      const responses = await Promise.allSettled(promises);
      
      // All requests should succeed
      const successfulResponses = responses.filter(
        (result) => result.status === 'fulfilled' && result.value.status === 200
      );
      
      expect(successfulResponses.length).toBe(concurrentRequests);
    });
  });

  describe('Data Validation', () => {
    it('should validate positive amounts', async () => {
      const invalidTransaction = {
        userId: 'user-123',
        amount: -100,
        currency: 'USD',
        type: 'PAYMENT',
        description: 'Invalid negative amount',
      };

      const response = await request(app)
        .post('/api/v1/transactions')
        .send(invalidTransaction)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toHaveProperty('code', 'VALIDATION_ERROR');
    });

    it('should validate currency codes', async () => {
      const invalidTransaction = {
        userId: 'user-123',
        amount: 1000,
        currency: 'INVALID',
        type: 'PAYMENT',
        description: 'Invalid currency',
      };

      const response = await request(app)
        .post('/api/v1/transactions')
        .send(invalidTransaction)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toHaveProperty('code', 'VALIDATION_ERROR');
    });

    it('should validate transaction types', async () => {
      const invalidTransaction = {
        userId: 'user-123',
        amount: 1000,
        currency: 'USD',
        type: 'INVALID_TYPE',
        description: 'Invalid transaction type',
      };

      const response = await request(app)
        .post('/api/v1/transactions')
        .send(invalidTransaction)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toHaveProperty('code', 'VALIDATION_ERROR');
    });
  });
});
