import { EmailService, EmailRequest } from '../email.service';
import { NotificationPriority } from '../../models/notifications.model';
import { DeliveryStatus } from '../../models/notification-delivery-tracking.model';

// Mock nodemailer
jest.mock('nodemailer', () => ({
  createTransporter: jest.fn(() => ({
    sendMail: jest.fn(),
    verify: jest.fn(),
  })),
}));

describe('EmailService', () => {
  const mockEmailRequest: EmailRequest = {
    to: ['test@example.com'],
    subject: 'Test Email',
    htmlContent: '<p>Test content</p>',
    textContent: 'Test content',
    priority: NotificationPriority.NORMAL,
    trackingId: 'test-tracking-id',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    // Reset console methods
    jest.spyOn(console, 'log').mockImplementation();
    jest.spyOn(console, 'warn').mockImplementation();
    jest.spyOn(console, 'error').mockImplementation();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('sendEmail', () => {
    it('should send email successfully with first provider', async () => {
      // Mock provider health check
      jest.spyOn(EmailService.providers[0], 'isHealthy').mockResolvedValue(true);
      jest.spyOn(EmailService.providers[0], 'sendEmail').mockResolvedValue({
        success: true,
        messageId: 'test-message-id',
        deliveryStatus: DeliveryStatus.SENT,
        provider: 'SendGrid',
      });

      const result = await EmailService.sendEmail(mockEmailRequest);

      expect(result.success).toBe(true);
      expect(result.messageId).toBe('test-message-id');
      expect(result.provider).toBe('SendGrid');
    });

    it('should failover to second provider when first fails', async () => {
      // Mock first provider as unhealthy
      jest.spyOn(EmailService.providers[0], 'isHealthy').mockResolvedValue(false);
      
      // Mock second provider as healthy and successful
      jest.spyOn(EmailService.providers[1], 'isHealthy').mockResolvedValue(true);
      jest.spyOn(EmailService.providers[1], 'sendEmail').mockResolvedValue({
        success: true,
        messageId: 'nodemailer-message-id',
        deliveryStatus: DeliveryStatus.SENT,
        provider: 'Nodemailer',
      });

      const result = await EmailService.sendEmail(mockEmailRequest);

      expect(result.success).toBe(true);
      expect(result.provider).toBe('Nodemailer');
      expect(console.warn).toHaveBeenCalledWith('Provider SendGrid is not healthy, skipping...');
    });

    it('should return failure when all providers fail', async () => {
      // Mock all providers as unhealthy
      jest.spyOn(EmailService.providers[0], 'isHealthy').mockResolvedValue(false);
      jest.spyOn(EmailService.providers[1], 'isHealthy').mockResolvedValue(false);

      const result = await EmailService.sendEmail(mockEmailRequest);

      expect(result.success).toBe(false);
      expect(result.error).toContain('All email providers failed');
      expect(result.deliveryStatus).toBe(DeliveryStatus.FAILED);
    });
  });

  describe('sendWithRetry', () => {
    it('should retry on retryable errors', async () => {
      const mockProvider = {
        name: 'TestProvider',
        sendEmail: jest.fn(),
        isHealthy: jest.fn().mockResolvedValue(true),
      };

      // First two attempts fail with retryable error, third succeeds
      mockProvider.sendEmail
        .mockResolvedValueOnce({
          success: false,
          error: 'TIMEOUT error',
          deliveryStatus: DeliveryStatus.FAILED,
        })
        .mockResolvedValueOnce({
          success: false,
          error: 'RATE_LIMIT exceeded',
          deliveryStatus: DeliveryStatus.FAILED,
        })
        .mockResolvedValueOnce({
          success: true,
          messageId: 'success-id',
          deliveryStatus: DeliveryStatus.SENT,
        });

      // Mock sleep to avoid actual delays in tests
      jest.spyOn(EmailService, 'sleep').mockResolvedValue();

      const result = await EmailService.sendWithRetry(mockProvider, mockEmailRequest);

      expect(result.success).toBe(true);
      expect(mockProvider.sendEmail).toHaveBeenCalledTimes(3);
      expect(EmailService.sleep).toHaveBeenCalledTimes(2);
    });

    it('should not retry on non-retryable errors', async () => {
      const mockProvider = {
        name: 'TestProvider',
        sendEmail: jest.fn().mockResolvedValue({
          success: false,
          error: 'INVALID_EMAIL format',
          deliveryStatus: DeliveryStatus.FAILED,
        }),
        isHealthy: jest.fn().mockResolvedValue(true),
      };

      const result = await EmailService.sendWithRetry(mockProvider, mockEmailRequest);

      expect(result.success).toBe(false);
      expect(mockProvider.sendEmail).toHaveBeenCalledTimes(1);
    });

    it('should respect maximum retry attempts', async () => {
      const mockProvider = {
        name: 'TestProvider',
        sendEmail: jest.fn().mockResolvedValue({
          success: false,
          error: 'TIMEOUT error',
          deliveryStatus: DeliveryStatus.FAILED,
        }),
        isHealthy: jest.fn().mockResolvedValue(true),
      };

      jest.spyOn(EmailService, 'sleep').mockResolvedValue();

      const result = await EmailService.sendWithRetry(mockProvider, mockEmailRequest);

      expect(result.success).toBe(false);
      expect(mockProvider.sendEmail).toHaveBeenCalledTimes(EmailService.retryConfig.maxAttempts);
    });
  });

  describe('isRetryableError', () => {
    it('should identify retryable errors correctly', () => {
      expect(EmailService.isRetryableError('TIMEOUT occurred')).toBe(true);
      expect(EmailService.isRetryableError('RATE_LIMIT exceeded')).toBe(true);
      expect(EmailService.isRetryableError('TEMPORARY_FAILURE')).toBe(true);
      expect(EmailService.isRetryableError('ECONNRESET')).toBe(true);
      expect(EmailService.isRetryableError('ENOTFOUND')).toBe(true);
    });

    it('should identify non-retryable errors correctly', () => {
      expect(EmailService.isRetryableError('INVALID_EMAIL')).toBe(false);
      expect(EmailService.isRetryableError('AUTHENTICATION_FAILED')).toBe(false);
      expect(EmailService.isRetryableError('PERMISSION_DENIED')).toBe(false);
    });
  });

  describe('calculateBackoffDelay', () => {
    it('should calculate exponential backoff correctly', () => {
      const delay1 = EmailService.calculateBackoffDelay(1);
      const delay2 = EmailService.calculateBackoffDelay(2);
      const delay3 = EmailService.calculateBackoffDelay(3);

      expect(delay1).toBe(1000); // 1000 * 2^0
      expect(delay2).toBe(2000); // 1000 * 2^1
      expect(delay3).toBe(4000); // 1000 * 2^2
    });

    it('should respect maximum delay limit', () => {
      const delay = EmailService.calculateBackoffDelay(10); // Would be very large
      expect(delay).toBeLessThanOrEqual(EmailService.retryConfig.maxDelay);
    });
  });

  describe('validateTemplate', () => {
    it('should validate template successfully', async () => {
      const result = await EmailService.validateTemplate('test-template', { name: 'John' });
      expect(result).toBe(true);
    });

    it('should handle validation errors gracefully', async () => {
      // Mock console.error to avoid noise in test output
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      // Force an error by mocking console.log to throw
      jest.spyOn(console, 'log').mockImplementation(() => {
        throw new Error('Validation error');
      });

      const result = await EmailService.validateTemplate('invalid-template', {});
      
      expect(result).toBe(false);
      expect(consoleSpy).toHaveBeenCalledWith('Template validation failed:', expect.any(Error));
    });
  });

  describe('renderTemplate', () => {
    it('should render template with provided data', async () => {
      const result = await EmailService.renderTemplate('test-template', { name: 'John' });

      expect(result.subject).toContain('test-template');
      expect(result.htmlContent).toContain('John');
      expect(result.textContent).toContain('John');
    });

    it('should return fallback template on rendering error', async () => {
      // Mock console.log to throw an error during rendering
      jest.spyOn(console, 'log').mockImplementation(() => {
        throw new Error('Rendering error');
      });

      const result = await EmailService.renderTemplate('invalid-template', {});

      expect(result.subject).toBe('Notification');
      expect(result.htmlContent).toBe('<p>You have a new notification.</p>');
      expect(result.textContent).toBe('You have a new notification.');
    });
  });

  describe('getProviderHealth', () => {
    it('should return health status for all providers', async () => {
      jest.spyOn(EmailService.providers[0], 'isHealthy').mockResolvedValue(true);
      jest.spyOn(EmailService.providers[1], 'isHealthy').mockResolvedValue(false);

      const health = await EmailService.getProviderHealth();

      expect(health).toHaveLength(2);
      expect(health[0]).toEqual({ name: 'SendGrid', healthy: true });
      expect(health[1]).toEqual({ name: 'Nodemailer', healthy: false });
    });
  });

  describe('getServiceStats', () => {
    it('should return service statistics', () => {
      const stats = EmailService.getServiceStats();

      expect(stats.providersCount).toBe(2);
      expect(stats.retryConfig).toEqual(EmailService.retryConfig);
      expect(stats.providerNames).toEqual(['SendGrid', 'Nodemailer']);
    });
  });

  describe('sleep', () => {
    it('should resolve after specified delay', async () => {
      const start = Date.now();
      await EmailService.sleep(100);
      const end = Date.now();

      expect(end - start).toBeGreaterThanOrEqual(90); // Allow some tolerance
    });
  });
});