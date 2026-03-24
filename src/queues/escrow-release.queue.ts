import { Queue } from 'bullmq';
import {
  redisConnection,
  defaultJobOptions,
  QUEUE_NAMES,
} from './queue.config';

export interface EscrowReleaseJobData {
  escrowId: string;
  mentorId: string;
  learnerId: string;
  sessionCompletedAt: Date | string;
}

const FORTY_EIGHT_HOURS_MS = 48 * 60 * 60 * 1000;

export const escrowReleaseQueue = new Queue<EscrowReleaseJobData>(
  QUEUE_NAMES.ESCROW_RELEASE,
  {
    connection: redisConnection,
    defaultJobOptions,
  },
);

/**
 * Schedule an escrow auto-release 48 hours after session completion.
 * Uses jobId deduplication so re-scheduling is idempotent.
 */
export async function scheduleEscrowRelease(
  data: EscrowReleaseJobData,
): Promise<void> {
  await escrowReleaseQueue.add('auto-release-escrow', data, {
    jobId: `escrow-release:${data.escrowId}`,
    delay: FORTY_EIGHT_HOURS_MS,
  });
}

/**
 * Cancel a pending escrow auto-release (e.g. dispute raised).
 */
export async function cancelEscrowRelease(escrowId: string): Promise<void> {
  const job = await escrowReleaseQueue.getJob(`escrow-release:${escrowId}`);
  if (job) {
    await job.remove();
  }
}
