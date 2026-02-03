import request from 'supertest';
import { app } from '../index';

describe('Notification Service', () => {
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

  describe('Notification Endpoints', () => {
    it('should send email notification', async () => {
      const emailNotification = {
        recipientId: 'user-123',
        type: 'EMAIL',
        subject: 'Test Email',
        content: 'This is a test email',
        metadata: {
          template: 'welcome',
          variables: {
            userName: 'John Doe',
          },
        },
      };

      const response = await request(app)
        .post('/api/v1/notifications/send')
        .send(emailNotification)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('notificationId');
      expect(response.body.data).toHaveProperty('recipientId', emailNotification.recipientId);
      expect(response.body.data).toHaveProperty('type', emailNotification.type);
      expect(response.body.data).toHaveProperty('status', 'SENT');
      expect(response.body.data).toHaveProperty('sentAt');
    });

    it('should send SMS notification', async () => {
      const smsNotification = {
        recipientId: 'user-123',
        type: 'SMS',
        phoneNumber: '+1234567890',
        content: 'This is a test SMS',
        metadata: {
          countryCode: 'US',
        },
      };

      const response = await request(app)
        .post('/api/v1/notifications/send')
        .send(smsNotification)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('notificationId');
      expect(response.body.data).toHaveProperty('type', smsNotification.type);
      expect(response.body.data).toHaveProperty('status', 'SENT');
    });

    it('should send push notification', async () => {
      const pushNotification = {
        recipientId: 'user-123',
        type: 'PUSH',
        title: 'Test Push',
        content: 'This is a test push notification',
        metadata: {
          deviceToken: 'device-token-123',
          platform: 'ios',
        },
      };

      const response = await request(app)
        .post('/api/v1/notifications/send')
        .send(pushNotification)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('notificationId');
      expect(response.body.data).toHaveProperty('type', pushNotification.type);
      expect(response.body.data).toHaveProperty('status', 'SENT');
    });

    it('should get notification by ID', async () => {
      const notificationId = 'notification-123';
      
      const response = await request(app)
        .get(`/api/v1/notifications/${notificationId}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('notificationId', notificationId);
      expect(response.body.data).toHaveProperty('status');
      expect(response.body.data).toHaveProperty('type');
    });

    it('should get user notifications', async () => {
      const userId = 'user-123';
      
      const response = await request(app)
        .get(`/api/v1/users/${userId}/notifications`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('notifications');
      expect(response.body.data).toHaveProperty('pagination');
      expect(Array.isArray(response.body.data.notifications)).toBe(true);
    });

    it('should mark notification as read', async () => {
      const notificationId = 'notification-123';
      
      const response = await request(app)
        .patch(`/api/v1/notifications/${notificationId}/read`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('notificationId', notificationId);
      expect(response.body.data).toHaveProperty('status', 'READ');
      expect(response.body.data).toHaveProperty('readAt');
    });
  });

  describe('Template Management', () => {
    it('should create notification template', async () => {
      const template = {
        name: 'welcome-email',
        type: 'EMAIL',
        subject: 'Welcome to Our Platform',
        content: 'Hello {{userName}}, welcome to our platform!',
        variables: ['userName'],
      };

      const response = await request(app)
        .post('/api/v1/templates')
        .send(template)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('templateId');
      expect(response.body.data).toHaveProperty('name', template.name);
      expect(response.body.data).toHaveProperty('type', template.type);
    });

    it('should get notification templates', async () => {
      const response = await request(app)
        .get('/api/v1/templates')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('templates');
      expect(Array.isArray(response.body.data.templates)).toBe(true);
    });

    it('should render template with variables', async () => {
      const renderRequest = {
        templateId: 'template-123',
        variables: {
          userName: 'John Doe',
          platformName: 'Our Platform',
        },
      };

      const response = await request(app)
        .post('/api/v1/templates/render')
        .send(renderRequest)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('renderedContent');
      expect(typeof response.body.data.renderedContent).toBe('string');
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid notification creation', async () => {
      const invalidNotification = {
        // Missing required fields
        type: 'EMAIL',
        content: 'Test content',
      };

      const response = await request(app)
        .post('/api/v1/notifications/send')
        .send(invalidNotification)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toHaveProperty('code');
      expect(response.body.error).toHaveProperty('message');
    });

    it('should handle non-existent notification retrieval', async () => {
      const nonExistentId = 'non-existent-id';
      
      const response = await request(app)
        .get(`/api/v1/notifications/${nonExistentId}`)
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toHaveProperty('code', 'NOTIFICATION_NOT_FOUND');
    });

    it('should handle invalid template creation', async () => {
      const invalidTemplate = {
        name: 'invalid-template',
        // Missing required fields
      };

      const response = await request(app)
        .post('/api/v1/templates')
        .send(invalidTemplate)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toHaveProperty('code', 'VALIDATION_ERROR');
    });
  });

  describe('Rate Limiting', () => {
    it('should handle rate limiting on notification sending', async () => {
      const notification = {
        recipientId: 'user-123',
        type: 'EMAIL',
        subject: 'Test',
        content: 'Test content',
      };

      // Make multiple requests to trigger rate limiting
      const promises = Array(101).fill(null).map(() =>
        request(app)
          .post('/api/v1/notifications/send')
          .send(notification)
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
      const maliciousNotification = {
        recipientId: '<script>alert("xss")</script>',
        type: 'EMAIL',
        subject: '<img src="x" onerror="alert(1)">',
        content: 'Malicious content',
      };

      const response = await request(app)
        .post('/api/v1/notifications/send')
        .send(maliciousNotification)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toHaveProperty('code', 'VALIDATION_ERROR');
    });
  });

  describe('Performance', () => {
    it('should respond within acceptable time limits', async () => {
      const startTime = Date.now();
      
      await request(app)
        .get('/api/v1/notifications')
        .expect(200);
      
      const responseTime = Date.now() - startTime;
      expect(responseTime).toBeLessThan(1000); // Should respond within 1 second
    });

    it('should handle concurrent requests', async () => {
      const concurrentRequests = 50;
      const promises = Array(concurrentRequests).fill(null).map(() =>
        request(app).get('/api/v1/notifications')
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
    it('should validate email addresses', async () => {
      const invalidNotification = {
        recipientId: 'user-123',
        type: 'EMAIL',
        emailAddress: 'invalid-email',
        subject: 'Test',
        content: 'Test content',
      };

      const response = await request(app)
        .post('/api/v1/notifications/send')
        .send(invalidNotification)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toHaveProperty('code', 'VALIDATION_ERROR');
    });

    it('should validate phone numbers', async () => {
      const invalidNotification = {
        recipientId: 'user-123',
        type: 'SMS',
        phoneNumber: 'invalid-phone',
        content: 'Test content',
      };

      const response = await request(app)
        .post('/api/v1/notifications/send')
        .send(invalidNotification)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toHaveProperty('code', 'VALIDATION_ERROR');
    });

    it('should validate notification types', async () => {
      const invalidNotification = {
        recipientId: 'user-123',
        type: 'INVALID_TYPE',
        subject: 'Test',
        content: 'Test content',
      };

      const response = await request(app)
        .post('/api/v1/notifications/send')
        .send(invalidNotification)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toHaveProperty('code', 'VALIDATION_ERROR');
    });
  });
});
