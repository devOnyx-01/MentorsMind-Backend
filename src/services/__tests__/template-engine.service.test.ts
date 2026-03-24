import { TemplateEngineService } from '../template-engine.service';
import { NotificationTemplatesModel } from '../../models/notification-templates.model';

// Mock the NotificationTemplatesModel
jest.mock('../../models/notification-templates.model');

const mockTemplatesModel = NotificationTemplatesModel as jest.Mocked<typeof NotificationTemplatesModel>;

describe('TemplateEngineService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    TemplateEngineService.clearCache();
    
    // Mock console methods
    jest.spyOn(console, 'log').mockImplementation();
    jest.spyOn(console, 'warn').mockImplementation();
    jest.spyOn(console, 'error').mockImplementation();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('renderEmail', () => {
    it('should render email template with data', async () => {
      const mockTemplate = {
        id: 'test-email',
        name: 'Test Email',
        type: 'email' as const,
        subject: 'Hello {{name}}',
        html_content: '<p>Welcome {{name}}!</p>',
        text_content: 'Welcome {{name}}!',
        variables: ['name'],
        is_active: true,
        created_at: new Date(),
        updated_at: new Date(),
      };

      mockTemplatesModel.getById.mockResolvedValue(mockTemplate);

      const result = await TemplateEngineService.renderEmail('test-email', { name: 'John' });

      expect(result.subject).toBe('Hello John');
      expect(result.htmlContent).toBe('<p>Welcome John!</p>');
      expect(result.textContent).toBe('Welcome John!');
    });

    it('should return fallback template when template not found', async () => {
      mockTemplatesModel.getById.mockResolvedValue(null);

      const result = await TemplateEngineService.renderEmail('non-existent', { name: 'John' });

      expect(result.subject).toBe('Notification from MentorMinds');
      expect(result.htmlContent).toContain('Hello John');
      expect(result.textContent).toContain('Hello John');
      expect(console.warn).toHaveBeenCalledWith('Email template non-existent not found, using fallback');
    });

    it('should return fallback template when template is not email type', async () => {
      const mockTemplate = {
        id: 'test-inapp',
        type: 'in_app' as const,
        subject: 'Test',
        html_content: '<p>Test</p>',
        text_content: 'Test',
        variables: [],
        is_active: true,
      };

      mockTemplatesModel.getById.mockResolvedValue(mockTemplate as any);

      const result = await TemplateEngineService.renderEmail('test-inapp', { name: 'John' });

      expect(result.subject).toBe('Notification from MentorMinds');
      expect(console.warn).toHaveBeenCalledWith('Email template test-inapp not found, using fallback');
    });

    it('should handle rendering errors gracefully', async () => {
      mockTemplatesModel.getById.mockRejectedValue(new Error('Database error'));

      const result = await TemplateEngineService.renderEmail('error-template', { name: 'John' });

      expect(result.subject).toBe('Notification from MentorMinds');
      expect(console.error).toHaveBeenCalledWith('Failed to render email template:', expect.any(Error));
    });
  });

  describe('renderInApp', () => {
    it('should render in-app template with data', async () => {
      const mockTemplate = {
        id: 'test-inapp',
        name: 'Test In-App',
        type: 'in_app' as const,
        subject: 'Hello {{name}}',
        html_content: '',
        text_content: 'Welcome {{name}}!',
        variables: ['name'],
        is_active: true,
        created_at: new Date(),
        updated_at: new Date(),
      };

      mockTemplatesModel.getById.mockResolvedValue(mockTemplate);

      const result = await TemplateEngineService.renderInApp('test-inapp', { name: 'John' });

      expect(result.title).toBe('Hello John');
      expect(result.message).toBe('Welcome John!');
      expect(result.data).toEqual({ name: 'John' });
    });

    it('should return fallback template when template not found', async () => {
      mockTemplatesModel.getById.mockResolvedValue(null);

      const result = await TemplateEngineService.renderInApp('non-existent', { name: 'John' });

      expect(result.title).toBe('New Notification');
      expect(result.message).toBe('You have a new notification.');
      expect(console.warn).toHaveBeenCalledWith('In-app template non-existent not found, using fallback');
    });
  });

  describe('validateTemplate', () => {
    it('should validate a correct template', async () => {
      const template = {
        id: 'test-template',
        name: 'Test Template',
        type: 'email' as const,
        subject: 'Hello {{name}}',
        htmlContent: '<p>Welcome {{name}}!</p>',
        textContent: 'Welcome {{name}}!',
        variables: ['name'],
        isActive: true,
      };

      const result = await TemplateEngineService.validateTemplate(template);

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should detect missing required fields', async () => {
      const template = {
        id: '',
        name: '',
        type: 'email' as const,
        htmlContent: '',
        textContent: '',
        variables: [],
        isActive: true,
      };

      const result = await TemplateEngineService.validateTemplate(template);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Template ID and name are required');
      expect(result.errors).toContain('Template must have either HTML or text content');
    });

    it('should detect syntax errors', async () => {
      const template = {
        id: 'test-template',
        name: 'Test Template',
        type: 'email' as const,
        htmlContent: '<p>Welcome {{name}!</p>', // Missing closing brace
        textContent: 'Welcome {{name}}!',
        variables: ['name'],
        isActive: true,
      };

      const result = await TemplateEngineService.validateTemplate(template);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Unmatched template braces {{ }}');
    });

    it('should detect undefined variables', async () => {
      const template = {
        id: 'test-template',
        name: 'Test Template',
        type: 'email' as const,
        htmlContent: '<p>Welcome {{name}} and {{age}}!</p>',
        textContent: 'Welcome {{name}}!',
        variables: ['name'], // age is not defined
        isActive: true,
      };

      const result = await TemplateEngineService.validateTemplate(template);

      expect(result.warnings).toContain('Undefined variables found: age');
    });

    it('should detect XSS vulnerabilities', async () => {
      const template = {
        id: 'test-template',
        name: 'Test Template',
        type: 'email' as const,
        htmlContent: '<script>alert("xss")</script><p onclick="alert()">Click me</p>',
        textContent: 'Safe text',
        variables: [],
        isActive: true,
      };

      const result = await TemplateEngineService.validateTemplate(template);

      expect(result.warnings).toContain('Script tags detected in HTML content');
      expect(result.warnings).toContain('Event handlers detected in HTML content');
    });
  });

  describe('interpolateTemplate', () => {
    it('should interpolate simple variables', () => {
      const template = 'Hello {{name}}, welcome to {{platform}}!';
      const data = { name: 'John', platform: 'MentorMinds' };

      const result = TemplateEngineService.interpolateTemplate(template, data);

      expect(result).toBe('Hello John, welcome to MentorMinds!');
    });

    it('should handle nested object properties', () => {
      const template = 'Hello {{user.name}}, your email is {{user.email}}';
      const data = { user: { name: 'John', email: 'john@example.com' } };

      const result = TemplateEngineService.interpolateTemplate(template, data);

      expect(result).toBe('Hello John, your email is john@example.com');
    });

    it('should leave undefined variables unchanged', () => {
      const template = 'Hello {{name}}, your age is {{age}}';
      const data = { name: 'John' };

      const result = TemplateEngineService.interpolateTemplate(template, data);

      expect(result).toBe('Hello John, your age is {{age}}');
    });

    it('should handle empty template or data', () => {
      expect(TemplateEngineService.interpolateTemplate('', { name: 'John' })).toBe('');
      expect(TemplateEngineService.interpolateTemplate('Hello {{name}}', null)).toBe('Hello {{name}}');
    });
  });

  describe('sanitizeOutput', () => {
    it('should sanitize HTML characters', () => {
      const input = '<script>alert("xss")</script>';
      const result = TemplateEngineService.sanitizeOutput(input);

      expect(result).toBe('&lt;script&gt;alert(&quot;xss&quot;)&lt;&#x2F;script&gt;');
    });

    it('should handle empty input', () => {
      expect(TemplateEngineService.sanitizeOutput('')).toBe('');
      expect(TemplateEngineService.sanitizeOutput(null as any)).toBe('');
    });
  });

  describe('sanitizeHtml', () => {
    it('should remove script tags', () => {
      const html = '<p>Safe content</p><script>alert("xss")</script>';
      const result = TemplateEngineService.sanitizeHtml(html);

      expect(result).toBe('<p>Safe content</p>');
    });

    it('should remove event handlers', () => {
      const html = '<p onclick="alert()">Click me</p>';
      const result = TemplateEngineService.sanitizeHtml(html);

      expect(result).toBe('<p>Click me</p>');
    });

    it('should remove javascript URLs', () => {
      const html = '<a href="javascript:alert()">Click me</a>';
      const result = TemplateEngineService.sanitizeHtml(html);

      expect(result).toBe('<a>Click me</a>');
    });
  });

  describe('caching', () => {
    it('should cache templates after loading', async () => {
      const mockTemplate = {
        id: 'test-template',
        type: 'email' as const,
        subject: 'Test',
        html_content: '<p>Test</p>',
        text_content: 'Test',
        variables: [],
        is_active: true,
      };

      mockTemplatesModel.getById.mockResolvedValue(mockTemplate as any);

      // First call should load from database
      await TemplateEngineService.getTemplate('test-template');
      expect(mockTemplatesModel.getById).toHaveBeenCalledTimes(1);

      // Second call should use cache
      await TemplateEngineService.getTemplate('test-template');
      expect(mockTemplatesModel.getById).toHaveBeenCalledTimes(1);
    });

    it('should manually cache templates', async () => {
      const mockTemplate = {
        id: 'test-template',
        type: 'email' as const,
        subject: 'Test',
        html_content: '<p>Test</p>',
        text_content: 'Test',
        variables: [],
        is_active: true,
      };

      mockTemplatesModel.getById.mockResolvedValue(mockTemplate as any);

      await TemplateEngineService.cacheTemplate('test-template');

      // Should be cached now
      const result = await TemplateEngineService.getTemplate('test-template');
      expect(result).toEqual(mockTemplate);
      expect(mockTemplatesModel.getById).toHaveBeenCalledTimes(1);
    });

    it('should clear cache', () => {
      TemplateEngineService.clearCache();
      const stats = TemplateEngineService.getCacheStats();
      expect(stats.size).toBe(0);
    });
  });

  describe('utility methods', () => {
    it('should get nested values correctly', () => {
      const obj = { user: { profile: { name: 'John' } } };
      
      expect(TemplateEngineService.getNestedValue(obj, 'user.profile.name')).toBe('John');
      expect(TemplateEngineService.getNestedValue(obj, 'user.age')).toBeUndefined();
      expect(TemplateEngineService.getNestedValue(obj, 'nonexistent')).toBeUndefined();
    });

    it('should generate template hash', () => {
      const template = {
        id: 'test',
        name: 'Test',
        type: 'email' as const,
        subject: 'Test Subject',
        htmlContent: '<p>Test</p>',
        textContent: 'Test',
        variables: [],
        isActive: true,
      };

      const hash1 = TemplateEngineService.generateTemplateHash(template);
      const hash2 = TemplateEngineService.generateTemplateHash(template);
      
      expect(hash1).toBe(hash2);
      expect(hash1).toHaveLength(32); // MD5 hash length
    });

    it('should preload templates', async () => {
      const mockTemplate = {
        id: 'test-template',
        type: 'email' as const,
        subject: 'Test',
        html_content: '<p>Test</p>',
        text_content: 'Test',
        variables: [],
        is_active: true,
      };

      mockTemplatesModel.getById.mockResolvedValue(mockTemplate as any);

      await TemplateEngineService.preloadTemplates(['test-template', 'another-template']);

      expect(mockTemplatesModel.getById).toHaveBeenCalledTimes(2);
    });
  });
});