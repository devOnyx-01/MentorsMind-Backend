import { Queue } from 'bullmq';
import { redisConnection, defaultJobOptions } from './queue.config';

export const NOTIFICATION_CLEANUP_QUEUE = 'notification-cleanup-queue';

export interface NotificationCleanupJobData {
  jobType: 'notification-cleanup';
}

export const notificationCleanupQueue = new Queue<NotificationCleanupJobData>(
  NOTIFICATION_CLEANUP_QUEUE,
  { connection: redisConnection, defaultJobOptions },
);
