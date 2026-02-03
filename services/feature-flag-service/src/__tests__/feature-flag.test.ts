import request from 'supertest';
import { app } from '../index';

describe('Feature Flag Service', () => {
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

  describe('Feature Flag Endpoints', () => {
    it('should create a new feature flag', async () => {
      const featureFlag = {
        key: 'new-feature',
        description: 'A new feature for testing',
        enabled: true,
        conditions: {
          userRoles: ['admin', 'premium'],
          percentage: 100,
        },
      };

      const response = await request(app)
        .post('/api/v1/feature-flags')
        .send(featureFlag)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('flagId');
      expect(response.body.data).toHaveProperty('key', featureFlag.key);
      expect(response.body.data).toHaveProperty('description', featureFlag.description);
      expect(response.body.data).toHaveProperty('enabled', featureFlag.enabled);
      expect(response.body.data).toHaveProperty('createdAt');
    });

    it('should get feature flag by key', async () => {
      const flagKey = 'test-feature';
      
      const response = await request(app)
        .get(`/api/v1/feature-flags/${flagKey}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('key', flagKey);
      expect(response.body.data).toHaveProperty('enabled');
      expect(response.body.data).toHaveProperty('conditions');
    });

    it('should get all feature flags', async () => {
      const response = await request(app)
        .get('/api/v1/feature-flags')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('flags');
      expect(Array.isArray(response.body.data.flags)).toBe(true);
    });

    it('should update feature flag', async () => {
      const flagKey = 'test-feature';
      const updateData = {
        enabled: false,
        description: 'Updated description',
      };

      const response = await request(app)
        .patch(`/api/v1/feature-flags/${flagKey}`)
        .send(updateData)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('key', flagKey);
      expect(response.body.data).toHaveProperty('enabled', updateData.enabled);
      expect(response.body.data).toHaveProperty('description', updateData.description);
    });

    it('should delete feature flag', async () => {
      const flagKey = 'test-feature-to-delete';
      
      const response = await request(app)
        .delete(`/api/v1/feature-flags/${flagKey}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('key', flagKey);
      expect(response.body.data).toHaveProperty('deleted', true);
    });
  });

  describe('Feature Evaluation', () => {
    it('should evaluate feature flag for user', async () => {
      const evaluationRequest = {
        flagKey: 'test-feature',
        context: {
          userId: 'user-123',
          userRole: 'premium',
          email: 'user@example.com',
          attributes: {
            region: 'us-east-1',
            plan: 'enterprise',
          },
        },
      };

      const response = await request(app)
        .post('/api/v1/feature-flags/evaluate')
        .send(evaluationRequest)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('flagKey', evaluationRequest.flagKey);
      expect(response.body.data).toHaveProperty('enabled');
      expect(response.body.data).toHaveProperty('reason');
      expect(typeof response.body.data.enabled).toBe('boolean');
    });

    it('should evaluate multiple feature flags', async () => {
      const evaluationRequest = {
        flagKeys: ['feature-1', 'feature-2', 'feature-3'],
        context: {
          userId: 'user-123',
          userRole: 'premium',
        },
      };

      const response = await request(app)
        .post('/api/v1/feature-flags/evaluate-batch')
        .send(evaluationRequest)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('evaluations');
      expect(Array.isArray(response.body.data.evaluations)).toBe(true);
      expect(response.body.data.evaluations.length).toBe(evaluationRequest.flagKeys.length);
    });

    it('should get user feature flags', async () => {
      const userId = 'user-123';
      const context = {
        userRole: 'premium',
        email: 'user@example.com',
      };

      const response = await request(app)
        .post(`/api/v1/users/${userId}/feature-flags`)
        .send(context)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('flags');
      expect(Array.isArray(response.body.data.flags)).toBe(true);
    });
  });

  describe('Targeting Rules', () => {
    it('should create targeting rule', async () => {
      const targetingRule = {
        flagKey: 'test-feature',
        name: 'Premium Users Rule',
        conditions: {
          userRole: { $in: ['premium', 'enterprise'] },
          plan: { $ne: 'free' },
        },
        enabled: true,
        percentage: 100,
      };

      const response = await request(app)
        .post('/api/v1/feature-flags/targeting-rules')
        .send(targetingRule)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('ruleId');
      expect(response.body.data).toHaveProperty('flagKey', targetingRule.flagKey);
      expect(response.body.data).toHaveProperty('name', targetingRule.name);
    });

    it('should get targeting rules for flag', async () => {
      const flagKey = 'test-feature';
      
      const response = await request(app)
        .get(`/api/v1/feature-flags/${flagKey}/targeting-rules`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('rules');
      expect(Array.isArray(response.body.data.rules)).toBe(true);
    });

    it('should update targeting rule', async () => {
      const ruleId = 'rule-123';
      const updateData = {
        enabled: false,
        percentage: 50,
      };

      const response = await request(app)
        .patch(`/api/v1/feature-flags/targeting-rules/${ruleId}`)
        .send(updateData)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('ruleId', ruleId);
      expect(response.body.data).toHaveProperty('enabled', updateData.enabled);
      expect(response.body.data).toHaveProperty('percentage', updateData.percentage);
    });
  });

  describe('Analytics', () => {
    it('should get feature flag analytics', async () => {
      const flagKey = 'test-feature';
      
      const response = await request(app)
        .get(`/api/v1/feature-flags/${flagKey}/analytics`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('evaluations');
      expect(response.body.data).toHaveProperty('uniqueUsers');
      expect(response.body.data).toHaveProperty('enabledEvaluations');
      expect(response.body.data).toHaveProperty('disabledEvaluations');
      expect(response.body.data).toHaveProperty('timeRange');
    });

    it('should get overall analytics', async () => {
      const response = await request(app)
        .get('/api/v1/analytics')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('totalFlags');
      expect(response.body.data).toHaveProperty('enabledFlags');
      expect(response.body.data).toHaveProperty('totalEvaluations');
      expect(response.body.data).toHaveProperty('topFlags');
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid feature flag creation', async () => {
      const invalidFlag = {
        // Missing required fields
        description: 'Invalid flag',
      };

      const response = await request(app)
        .post('/api/v1/feature-flags')
        .send(invalidFlag)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toHaveProperty('code');
      expect(response.body.error).toHaveProperty('message');
    });

    it('should handle non-existent feature flag retrieval', async () => {
      const nonExistentKey = 'non-existent-flag';
      
      const response = await request(app)
        .get(`/api/v1/feature-flags/${nonExistentKey}`)
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toHaveProperty('code', 'FEATURE_FLAG_NOT_FOUND');
    });

    it('should handle invalid evaluation request', async () => {
      const invalidRequest = {
        // Missing required fields
        context: {
          userId: 'user-123',
        },
      };

      const response = await request(app)
        .post('/api/v1/feature-flags/evaluate')
        .send(invalidRequest)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toHaveProperty('code', 'VALIDATION_ERROR');
    });
  });

  describe('Rate Limiting', () => {
    it('should handle rate limiting on evaluation', async () => {
      const evaluationRequest = {
        flagKey: 'test-feature',
        context: {
          userId: 'user-123',
          userRole: 'premium',
        },
      };

      // Make multiple requests to trigger rate limiting
      const promises = Array(101).fill(null).map(() =>
        request(app)
          .post('/api/v1/feature-flags/evaluate')
          .send(evaluationRequest)
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
      const maliciousFlag = {
        key: '<script>alert("xss")</script>',
        description: '<img src="x" onerror="alert(1)">',
        enabled: true,
      };

      const response = await request(app)
        .post('/api/v1/feature-flags')
        .send(maliciousFlag)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toHaveProperty('code', 'VALIDATION_ERROR');
    });
  });

  describe('Performance', () => {
    it('should respond within acceptable time limits', async () => {
      const startTime = Date.now();
      
      await request(app)
        .get('/api/v1/feature-flags')
        .expect(200);
      
      const responseTime = Date.now() - startTime;
      expect(responseTime).toBeLessThan(1000); // Should respond within 1 second
    });

    it('should handle concurrent requests', async () => {
      const concurrentRequests = 50;
      const promises = Array(concurrentRequests).fill(null).map(() =>
        request(app).get('/api/v1/feature-flags')
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
    it('should validate feature flag keys', async () => {
      const invalidFlag = {
        key: 'invalid key with spaces',
        description: 'Invalid flag',
        enabled: true,
      };

      const response = await request(app)
        .post('/api/v1/feature-flags')
        .send(invalidFlag)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toHaveProperty('code', 'VALIDATION_ERROR');
    });

    it('should validate percentage values', async () => {
      const invalidFlag = {
        key: 'test-flag',
        description: 'Test flag',
        enabled: true,
        conditions: {
          percentage: 150, // Invalid percentage
        },
      };

      const response = await request(app)
        .post('/api/v1/feature-flags')
        .send(invalidFlag)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toHaveProperty('code', 'VALIDATION_ERROR');
    });

    it('should validate targeting rule conditions', async () => {
      const invalidRule = {
        flagKey: 'test-feature',
        name: 'Invalid Rule',
        conditions: {
          userRole: 'invalid-operator', // Should be an object with operators
        },
        enabled: true,
      };

      const response = await request(app)
        .post('/api/v1/feature-flags/targeting-rules')
        .send(invalidRule)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toHaveProperty('code', 'VALIDATION_ERROR');
    });
  });
});
