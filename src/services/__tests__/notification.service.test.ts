import { NotificationService } from '../notification.service';
import { NotificationsModel, NotificationType, NotificationChannel, NotificationPriority } from '../../models/notifications.model';
import { NotificationPreferencesModel } from '../../models/notification-preferences.model';
import { NotificationDeliveryTrackingModel, DeliveryStatus } from '../../models/notification-delivery-tracking.model';
import { NotificationAnalyticsModel } from '../../models/notification-analytics.model';

// Mock the models
jest.mock('../../models/notifications.model');
jest.mock('../../models/notification-preferences.model');
jest.mock('../../models/notification-delivery-tracking.model');
jest.mock('../../models/notification-analytics.model');

const mockNotificationsModel = NotificationsModel as jest.Mocked<typeof NotificationsModel>;
const mockPreferencesModel = NotificationPreferencesModel as jest.Mocked<typeof NotificationPreferencesModel>;
const mockDeliveryTrackingModel = NotificationDeliveryTrackingModel as jest.Mocked<typeof NotificationDeliveryTrackingModel>;
const mockAnalyticsModel = NotificationAnalyticsModel as jest.Mocked<typeof NotificationAnalyticsModel>;

describe('NotificationService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('sendNotification', () => {
    it('should send notification to all requested channels', async () => {
      const mockNotification = {
        id: 'test-id',
        user_id: 'user-123',
        type: NotificationType.BOOKING_CONFIRMED,
        channel: NotificationChannel.EMAIL,
        priority: NotificationPriority.NORMAL,
        title: 'Test Notification',
        message: 'Test message',
        template_data: {},
        data: {},
        is_read: false,
        created_at: new Date(),
        updated_at: new Date(),
      };

      const mockPreferences = {
        id: 'pref-123',
        user_id: 'user-123',
        email_enabled: true,
        in_app_enabled: true,
        push_enabled: false,
        preferences: {},
        created_at: new Date(),
        updated_at: new Date(),
      };

      mockPreferencesModel.getByUserId.mockResolvedValue(mockPreferences);
      mockNotificationsModel.create.mockResolvedValue(mockNotification);
      mockDeliveryTrackingModel.create.mockResolvedValue({
        id: 'tracking-123',
        notification_id: 'test-id',
        status: DeliveryStatus.QUEUED,
        channel: NotificationChannel.EMAIL,
        metadata: {},
        created_at: new Date(),
      });
      mockAnalyticsModel.incrementMetric.mockResolvedValue(true);

      const result = await NotificationService.sendNotification({
        userId: 'user-123',
        type: NotificationType.BOOKING_CONFIRMED,
        channels: [NotificationChannel.EMAIL, NotificationChannel.IN_APP],
        title: 'Test Notification',
        message: 'Test message',
      });

      expect(result.success).toBe(true);
      expect(result.notificationIds).toHaveLength(2);
      expect(result.errors).toHaveLength(0);
      expect(mockNotificationsModel.create).toHaveBeenCalledTimes(2);
    });

    it('should filter channels based on user preferences', async () => {
      const mockPreferences = {
        id: 'pref-123',
        user_id: 'user-123',
        email_enabled: false,
        in_app_enabled: true,
        push_enabled: false,
        preferences: {},
        created_at: new Date(),
        updated_at: new Date(),
      };

      mockPreferencesModel.getByUserId.mockResolvedValue(mockPreferences);
      mockNotificationsModel.create.mockResolvedValue({
        id: 'test-id',
        user_id: 'user-123',
        type: NotificationType.BOOKING_CONFIRMED,
        channel: NotificationChannel.IN_APP,
        priority: NotificationPriority.NORMAL,
        title: 'Test Notification',
        message: 'Test message',
        template_data: {},
        data: {},
        is_read: false,
        created_at: new Date(),
        updated_at: new Date(),
      });

      const result = await NotificationService.sendNotification({
        userId: 'user-123',
        type: NotificationType.BOOKING_CONFIRMED,
        channels: [NotificationChannel.EMAIL, NotificationChannel.IN_APP],
        title: 'Test Notification',
        message: 'Test message',
      });

      expect(mockNotificationsModel.create).toHaveBeenCalledTimes(1);
      expect(mockNotificationsModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          channel: NotificationChannel.IN_APP,
        })
      );
    });

    it('should handle errors gracefully', async () => {
      mockPreferencesModel.getByUserId.mockRejectedValue(new Error('Database error'));

      const result = await NotificationService.sendNotification({
        userId: 'user-123',
        type: NotificationType.BOOKING_CONFIRMED,
        channels: [NotificationChannel.EMAIL],
        title: 'Test Notification',
        message: 'Test message',
      });

      expect(result.success).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('Failed to send notification');
    });
  });

  describe('createInAppNotification', () => {
    it('should create in-app notification successfully', async () => {
      const mockNotification = {
        id: 'test-id',
        user_id: 'user-123',
        type: 'test_type',
        channel: NotificationChannel.IN_APP,
        priority: NotificationPriority.NORMAL,
        title: 'Test Title',
        message: 'Test Message',
        template_data: {},
        data: { key: 'value' },
        is_read: false,
        created_at: new Date(),
        updated_at: new Date(),
      };

      mockNotificationsModel.create.mockResolvedValue(mockNotification);

      const result = await NotificationService.createInAppNotification(
        'user-123',
        'test_type',
        'Test Title',
        'Test Message',
        { key: 'value' }
      );

      expect(result).toEqual(mockNotification);
      expect(mockNotificationsModel.create).toHaveBeenCalledWith({
        user_id: 'user-123',
        type: 'test_type',
        channel: NotificationChannel.IN_APP,
        priority: NotificationPriority.NORMAL,
        title: 'Test Title',
        message: 'Test Message',
        data: { key: 'value' },
      });
    });

    it('should throw error if notification creation fails', async () => {
      mockNotificationsModel.create.mockResolvedValue(null);

      await expect(
        NotificationService.createInAppNotification(
          'user-123',
          'test_type',
          'Test Title',
          'Test Message'
        )
      ).rejects.toThrow('Failed to create in-app notification');
    });
  });

  describe('getUserPreferences', () => {
    it('should return user preferences if they exist', async () => {
      const mockPreferences = {
        id: 'pref-123',
        user_id: 'user-123',
        email_enabled: true,
        in_app_enabled: true,
        push_enabled: false,
        preferences: {},
        created_at: new Date(),
        updated_at: new Date(),
      };

      mockPreferencesModel.getByUserId.mockResolvedValue(mockPreferences);

      const result = await NotificationService.getUserPreferences('user-123');

      expect(result).toEqual(mockPreferences);
      expect(mockPreferencesModel.getByUserId).toHaveBeenCalledWith('user-123');
    });

    it('should return default preferences if user preferences do not exist', async () => {
      const defaultPreferences = {
        email_enabled: true,
        in_app_enabled: true,
        push_enabled: true,
        preferences: {
          booking_confirmed: { email: true, in_app: true, push: true },
        },
      };

      mockPreferencesModel.getByUserId.mockResolvedValue(null);
      mockPreferencesModel.getDefaultPreferences.mockReturnValue(defaultPreferences);

      const result = await NotificationService.getUserPreferences('user-123');

      expect(result).toEqual(defaultPreferences);
    });
  });

  describe('filterChannelsByPreferences', () => {
    it('should filter out disabled channels', () => {
      const preferences = {
        email_enabled: false,
        in_app_enabled: true,
        push_enabled: false,
        preferences: {},
      };

      const result = NotificationService.filterChannelsByPreferences(
        [NotificationChannel.EMAIL, NotificationChannel.IN_APP, NotificationChannel.PUSH],
        preferences,
        NotificationType.BOOKING_CONFIRMED
      );

      expect(result).toEqual([NotificationChannel.IN_APP]);
    });

    it('should respect notification type specific preferences', () => {
      const preferences = {
        email_enabled: true,
        in_app_enabled: true,
        push_enabled: true,
        preferences: {
          booking_confirmed: {
            email: false,
            inapp: true,
            push: true,
          },
        },
      };

      const result = NotificationService.filterChannelsByPreferences(
        [NotificationChannel.EMAIL, NotificationChannel.IN_APP, NotificationChannel.PUSH],
        preferences,
        NotificationType.BOOKING_CONFIRMED
      );

      expect(result).toEqual([NotificationChannel.IN_APP, NotificationChannel.PUSH]);
    });
  });

  describe('getNotificationStatus', () => {
    it('should return notification status with delivery history', async () => {
      const mockNotification = {
        id: 'test-id',
        user_id: 'user-123',
        type: NotificationType.BOOKING_CONFIRMED,
        channel: NotificationChannel.EMAIL,
        priority: NotificationPriority.NORMAL,
        title: 'Test Notification',
        message: 'Test message',
        template_data: {},
        data: {},
        is_read: false,
        created_at: new Date(),
        updated_at: new Date(),
      };

      const mockDeliveryHistory = [
        {
          id: 'tracking-1',
          notification_id: 'test-id',
          status: DeliveryStatus.QUEUED,
          channel: NotificationChannel.EMAIL,
          metadata: {},
          created_at: new Date(),
        },
        {
          id: 'tracking-2',
          notification_id: 'test-id',
          status: DeliveryStatus.SENT,
          channel: NotificationChannel.EMAIL,
          metadata: {},
          created_at: new Date(),
        },
      ];

      mockNotificationsModel.getById.mockResolvedValue(mockNotification);
      mockDeliveryTrackingModel.getByNotificationId.mockResolvedValue(mockDeliveryHistory);
      mockDeliveryTrackingModel.getLatestStatus.mockResolvedValue(mockDeliveryHistory[1]);

      const result = await NotificationService.getNotificationStatus('test-id');

      expect(result).toEqual({
        id: 'test-id',
        status: DeliveryStatus.SENT,
        channel: NotificationChannel.EMAIL,
        createdAt: mockNotification.created_at,
        deliveryHistory: mockDeliveryHistory,
      });
    });

    it('should return null if notification does not exist', async () => {
      mockNotificationsModel.getById.mockResolvedValue(null);

      const result = await NotificationService.getNotificationStatus('non-existent-id');

      expect(result).toBeNull();
    });
  });

  describe('scheduleNotification', () => {
    it('should schedule notification for future delivery', async () => {
      const scheduledAt = new Date(Date.now() + 3600000); // 1 hour from now
      const mockNotification = {
        id: 'test-id',
        user_id: 'user-123',
        type: NotificationType.SESSION_REMINDER,
        channel: NotificationChannel.EMAIL,
        priority: NotificationPriority.NORMAL,
        title: 'Session Reminder',
        message: 'Your session starts in 1 hour',
        template_data: {},
        data: {},
        is_read: false,
        scheduled_at: scheduledAt,
        created_at: new Date(),
        updated_at: new Date(),
      };

      mockPreferencesModel.getByUserId.mockResolvedValue({
        id: 'pref-123',
        user_id: 'user-123',
        email_enabled: true,
        in_app_enabled: true,
        push_enabled: false,
        preferences: {},
        created_at: new Date(),
        updated_at: new Date(),
      });
      mockNotificationsModel.create.mockResolvedValue(mockNotification);
      mockDeliveryTrackingModel.create.mockResolvedValue({
        id: 'tracking-123',
        notification_id: 'test-id',
        status: DeliveryStatus.QUEUED,
        channel: NotificationChannel.EMAIL,
        metadata: {},
        created_at: new Date(),
      });

      const result = await NotificationService.scheduleNotification({
        userId: 'user-123',
        type: NotificationType.SESSION_REMINDER,
        channels: [NotificationChannel.EMAIL],
        title: 'Session Reminder',
        message: 'Your session starts in 1 hour',
        scheduledAt,
      });

      expect(result).toBe('test-id');
      expect(mockNotificationsModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          scheduled_at: scheduledAt,
        })
      );
    });
  });

  describe('retryFailedNotification', () => {
    it('should retry failed notification', async () => {
      const mockNotification = {
        id: 'test-id',
        user_id: 'user-123',
        type: NotificationType.BOOKING_CONFIRMED,
        channel: NotificationChannel.EMAIL,
        priority: NotificationPriority.NORMAL,
        title: 'Test Notification',
        message: 'Test message',
        template_data: {},
        data: {},
        is_read: false,
        created_at: new Date(),
        updated_at: new Date(),
      };

      mockNotificationsModel.getById.mockResolvedValue(mockNotification);
      mockDeliveryTrackingModel.create.mockResolvedValue({
        id: 'tracking-123',
        notification_id: 'test-id',
        status: DeliveryStatus.PROCESSING,
        channel: NotificationChannel.EMAIL,
        metadata: {},
        created_at: new Date(),
      });
      mockAnalyticsModel.incrementMetric.mockResolvedValue(true);

      const result = await NotificationService.retryFailedNotification('test-id');

      expect(result).toBe(true);
      expect(mockDeliveryTrackingModel.create).toHaveBeenCalledWith({
        notification_id: 'test-id',
        status: DeliveryStatus.PROCESSING,
        channel: NotificationChannel.EMAIL,
      });
    });

    it('should return false if notification does not exist', async () => {
      mockNotificationsModel.getById.mockResolvedValue(null);

      const result = await NotificationService.retryFailedNotification('non-existent-id');

      expect(result).toBe(false);
    });
  });

  describe('getUnreadNotifications', () => {
    it('should return unread notifications for user', async () => {
      const mockNotifications = [
        {
          id: 'test-1',
          user_id: 'user-123',
          type: NotificationType.BOOKING_CONFIRMED,
          channel: NotificationChannel.IN_APP,
          priority: NotificationPriority.NORMAL,
          title: 'Booking Confirmed',
          message: 'Your booking has been confirmed',
          template_data: {},
          data: {},
          is_read: false,
          created_at: new Date(),
          updated_at: new Date(),
        },
      ];

      mockNotificationsModel.getUnreadByUserId.mockResolvedValue(mockNotifications);

      const result = await NotificationService.getUnreadNotifications('user-123');

      expect(result).toEqual(mockNotifications);
      expect(mockNotificationsModel.getUnreadByUserId).toHaveBeenCalledWith('user-123');
    });
  });

  describe('markAsRead', () => {
    it('should mark notification as read', async () => {
      mockNotificationsModel.markAsRead.mockResolvedValue(true);

      const result = await NotificationService.markAsRead('test-id');

      expect(result).toBe(true);
      expect(mockNotificationsModel.markAsRead).toHaveBeenCalledWith('test-id');
    });
  });

  describe('markAllAsRead', () => {
    it('should mark all notifications as read for user', async () => {
      mockNotificationsModel.markAllAsReadByUserId.mockResolvedValue(5);

      const result = await NotificationService.markAllAsRead('user-123');

      expect(result).toBe(5);
      expect(mockNotificationsModel.markAllAsReadByUserId).toHaveBeenCalledWith('user-123');
    });
  });

  describe('getNotificationCounts', () => {
    it('should return notification counts for user', async () => {
      const mockCounts = { total: 10, unread: 3, read: 7 };
      mockNotificationsModel.getCountsByUserId.mockResolvedValue(mockCounts);

      const result = await NotificationService.getNotificationCounts('user-123');

      expect(result).toEqual(mockCounts);
      expect(mockNotificationsModel.getCountsByUserId).toHaveBeenCalledWith('user-123');
    });
  });
});