import { CalendarService } from '../services/calendar.service';
import HealthService from '../services/health.service';
import { pool } from '../config/database';
import { EncryptionUtil } from '../utils/encryption.utils';
import { google } from 'googleapis';

jest.mock('../config/database');
jest.mock('../utils/encryption.utils');
jest.mock('googleapis');
jest.mock('../utils/logger');
jest.mock('../queues/email.queue', () => ({
  emailQueue: {
    getJobCounts: jest.fn().mockResolvedValue({ active: 5, waiting: 10 }),
  },
}));

describe('Security and Reliability Improvements', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('CalendarService Token Encryption', () => {
    it('should encrypt tokens before storing in connectGoogleCalendar', async () => {
      const mockTokens = {
        access_token: 'raw-access',
        refresh_token: 'raw-refresh',
        expiry_date: Date.now() + 3600000,
      };

      (google.auth.OAuth2.prototype.getToken as jest.Mock).mockResolvedValue({ tokens: mockTokens });
      (EncryptionUtil.encrypt as jest.Mock).mockImplementation((val) => Promise.resolve(`enc-${val}`));
      (EncryptionUtil.getCurrentKeyVersion as jest.Mock).mockResolvedValue('v1');

      await CalendarService.connectGoogleCalendar('user-123', 'auth-code');

      expect(EncryptionUtil.encrypt).toHaveBeenCalledWith('raw-access');
      expect(EncryptionUtil.encrypt).toHaveBeenCalledWith('raw-refresh');
      
      const lastCall = (pool.query as jest.Mock).mock.calls[0];
      expect(lastCall[0]).toContain('encrypted_access_token');
      expect(lastCall[0]).toContain('encrypted_refresh_token');
      expect(lastCall[0]).toContain('pii_encryption_version');
      expect(lastCall[1]).toContain('enc-raw-access');
      expect(lastCall[1]).toContain('enc-raw-refresh');
      expect(lastCall[1]).toContain('v1');
    });

    it('should decrypt tokens when building authed client', async () => {
      (pool.query as jest.Mock).mockResolvedValue({
        rows: [{
          encrypted_access_token: 'enc-access',
          encrypted_refresh_token: 'enc-refresh',
          expiry_date: new Date(),
        }],
      });

      (EncryptionUtil.decrypt as jest.Mock).mockImplementation((val) => 
        Promise.resolve(val.replace('enc-', 'dec-'))
      );

      const client = await CalendarService._buildAuthedClient('user-123');

      expect(EncryptionUtil.decrypt).toHaveBeenCalledWith('enc-access');
      expect(EncryptionUtil.decrypt).toHaveBeenCalledWith('enc-refresh');
      expect(google.auth.OAuth2.prototype.setCredentials).toHaveBeenCalledWith(expect.objectContaining({
        access_token: 'dec-access',
        refresh_token: 'dec-refresh',
      }));
    });
  });

  describe('CalendarService SQL Injection Fix', () => {
    it('should use static column names in createGoogleCalendarEvent', async () => {
      const bookingId = 'booking-456';
      const mentorId = 'mentor-789';
      (pool.query as jest.Mock)
        .mockResolvedValueOnce({
          rows: [{
            id: bookingId,
            mentor_id: mentorId,
            learner_id: 'learner-101',
            start_time: new Date(),
            end_time: new Date(),
          }],
        })
        .mockResolvedValue({}); // for _buildAuthedClient queries

      // Mock google calendar response
      (google.calendar as jest.Mock).mockReturnValue({
        events: {
          insert: jest.fn().mockResolvedValue({ data: { id: 'event-1' } }),
        },
      });

      // Mock _buildAuthedClient to return a dummy client
      jest.spyOn(CalendarService, '_buildAuthedClient').mockResolvedValue({} as any);

      await CalendarService.createGoogleCalendarEvent(bookingId);

      // Check the update queries
      const queries = (pool.query as jest.Mock).mock.calls.map(c => c[0]);
      
      // Verify no dynamic column concatenation is used in the UPDATE query
      // The fix uses "UPDATE bookings SET google_event_id_mentor = $1 WHERE id = $2"
      const updateMentorQuery = queries.find(q => q.includes('UPDATE bookings SET google_event_id_mentor'));
      const updateLearnerQuery = queries.find(q => q.includes('UPDATE bookings SET google_event_id_learner'));

      expect(updateMentorQuery).toBeDefined();
      expect(updateLearnerQuery).toBeDefined();
      expect(updateMentorQuery).not.toContain('${'); // No string interpolation
      expect(updateLearnerQuery).not.toContain('${');
    });
  });

  describe('Health Check Improvements', () => {
    it('should return simplified health status as requested', async () => {
      // Mock sub-checks
      jest.spyOn(HealthService as any, 'checkDatabase').mockResolvedValue({ status: 'healthy' });
      jest.spyOn(HealthService as any, 'checkRedis').mockResolvedValue({ status: 'healthy' });
      jest.spyOn(HealthService as any, 'checkHorizon').mockResolvedValue({ status: 'healthy' });
      jest.spyOn(HealthService as any, 'checkBullMQ').mockResolvedValue({ 
        status: 'healthy', 
        details: { active: 42 } 
      });

      const status = await HealthService.getSimplifiedStatus();

      expect(status).toEqual({
        stellar: 'OK',
        redis: 'OK',
        queues: {
          active: 42
        }
      });
    });

    it('should report DOWN when components are unhealthy', async () => {
        jest.spyOn(HealthService as any, 'checkHorizon').mockResolvedValue({ status: 'degraded' });
        jest.spyOn(HealthService as any, 'checkRedis').mockResolvedValue({ status: 'unhealthy' });
        jest.spyOn(HealthService as any, 'checkBullMQ').mockResolvedValue({ status: 'healthy', details: { active: 0 } });
  
        const status = await HealthService.getSimplifiedStatus();
  
        expect(status.stellar).toBe('DOWN');
        expect(status.redis).toBe('DOWN');
      });
  });
});
