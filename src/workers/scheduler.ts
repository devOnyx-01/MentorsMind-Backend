import { reportQueue } from '../queues/report.queue';
import { logger } from '../utils/logger.utils';

/**
 * Register repeatable jobs.
 * BullMQ v5+ handles delayed/repeatable jobs natively — no QueueScheduler needed.
 * Call once at server startup.
 */
export async function startScheduler(): Promise<void> {
  // Weekly earnings report — every Monday at 08:00 UTC
  await reportQueue.add(
    'weekly-earnings-scheduled',
    {
      reportType: 'weekly-earnings',
      periodStart: '', // worker computes dynamically from current date
      periodEnd: '',
    },
    {
      repeat: { pattern: '0 8 * * 1' }, // cron: Monday 08:00 UTC
      jobId: 'weekly-earnings-recurring',
    },
  );

  logger.info('Job scheduler started — weekly earnings report registered');
}

export async function stopScheduler(): Promise<void> {
  // Remove repeatable jobs on shutdown (optional — comment out to persist across restarts)
  // await reportQueue.removeRepeatable('weekly-earnings-scheduled', { pattern: '0 8 * * 1' });
  logger.info('Job scheduler stopped');
}
